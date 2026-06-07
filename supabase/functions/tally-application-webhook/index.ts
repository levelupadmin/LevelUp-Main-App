import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const tallySigningSecret = Deno.env.get("TALLY_SIGNING_SECRET") || "";

async function verifyTallySignature(body: string, signature: string | null): Promise<boolean> {
  if (!tallySigningSecret) {
    console.error("TALLY_SIGNING_SECRET is not configured — rejecting webhook");
    return false;
  }
  if (!signature) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(tallySigningSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  // Constant-time compare (signature is non-null here — guarded above).
  if (computed.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function extractField(fields: any[], label: string): string {
  const field = fields.find(
    (f: any) => f.label?.toLowerCase().includes(label.toLowerCase())
  );
  if (!field) return "";
  if (field.value) return String(field.value);
  if (field.options) return field.options.map((o: any) => o.text || o.value).join(", ");
  return "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const rawBody = await req.text();

    // Verify Tally webhook signature
    const signature = req.headers.get("tally-signature");
    const isValid = await verifyTallySignature(rawBody, signature);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    if (payload.eventType !== "FORM_RESPONSE") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const fields = payload.data?.fields || [];
    const formId = payload.data?.formId || "";
    const responseId = payload.data?.responseId || "";

    const fullName = extractField(fields, "name") || extractField(fields, "full name");
    const email = extractField(fields, "email");
    const phone = extractField(fields, "phone") || extractField(fields, "mobile") || extractField(fields, "whatsapp");
    const city = extractField(fields, "city") || extractField(fields, "location");
    const occupation = extractField(fields, "occupation") || extractField(fields, "profession") || extractField(fields, "work");
    const bio = extractField(fields, "about") || extractField(fields, "bio") || extractField(fields, "tell us");

    if (!email) {
      return new Response(JSON.stringify({ error: "No email found in submission" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Find matching offering by tally_form_url containing the formId
    const { data: offerings } = await supabase
      .from("offerings")
      .select("id, title, payment_mode, tally_form_url")
      .eq("payment_mode", "staged")
      .not("tally_form_url", "is", null);

    const offering = (offerings || []).find(
      (o: any) => o.tally_form_url && o.tally_form_url.includes(formId)
    );

    if (!offering) {
      return new Response(JSON.stringify({ error: "No matching offering found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Existing user by email (optional — used to link + enrich the profile).
    // .maybeSingle() so "no such user" is a clean null, not a thrown error.
    const { data: existingUser, error: userLookupErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (userLookupErr) {
      console.error("[tally-webhook] user lookup failed:", userLookupErr.message);
    }

    // Re-submission by the same email updates the existing application. A retry
    // of the SAME Tally response is absorbed by the unique index on
    // tally_response_id (handled in the insert catch below).
    const { data: existingApp, error: appLookupErr } = await supabase
      .from("cohort_applications")
      .select("id")
      .eq("offering_id", offering.id)
      .eq("email", email)
      .maybeSingle();
    if (appLookupErr) {
      console.error("[tally-webhook] application lookup failed:", appLookupErr.message);
      return new Response(JSON.stringify({ error: "Application lookup failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (existingApp) {
      const { error: updErr } = await supabase
        .from("cohort_applications")
        .update({
          full_name: fullName || undefined,
          phone: phone || undefined,
          city: city || undefined,
          occupation: occupation || undefined,
          bio: bio || undefined,
          tally_response_id: responseId,
          tally_data: payload.data,
        })
        .eq("id", existingApp.id);

      if (updErr) {
        console.error("[tally-webhook] application update failed:", updErr.message);
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, updated: true, application_id: existingApp.id }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create new application
    const { data: newApp, error: appError } = await supabase
      .from("cohort_applications")
      .insert({
        offering_id: offering.id,
        user_id: existingUser?.id || null,
        full_name: fullName || email.split("@")[0],
        email,
        phone: phone || null,
        city: city || null,
        occupation: occupation || null,
        bio: bio || null,
        status: "submitted",
        tally_response_id: responseId,
        tally_data: payload.data,
      })
      .select("id")
      .single();

    if (appError) {
      // 23505 = unique_violation on tally_response_id: a concurrent retry of
      // the same response already created the row. Idempotent success.
      if ((appError as { code?: string }).code === "23505") {
        const { data: dup } = await supabase
          .from("cohort_applications")
          .select("id")
          .eq("tally_response_id", responseId)
          .maybeSingle();
        return new Response(JSON.stringify({ ok: true, deduped: true, application_id: dup?.id ?? null }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      console.error("[tally-webhook] application insert failed:", appError.message);
      return new Response(JSON.stringify({ error: appError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Enrich user profile if email matches existing user
    if (existingUser?.id) {
      const updates: any = {};
      if (phone) updates.phone = phone;
      if (city) updates.city = city;
      if (occupation) updates.occupation = occupation;
      if (bio) updates.bio = bio;
      if (Object.keys(updates).length > 0) {
        await supabase.from("users").update(updates).eq("id", existingUser.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, application_id: newApp.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
