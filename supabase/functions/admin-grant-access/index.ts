// admin-grant-access — admin/owner only. One call = "make sure this person can
// watch this offering", whether or not they have an account yet.
//
// For each student {full_name?, email?, phone?} it:
//   1. finds an existing profile by phone (+cc form) then email;
//   2. failing that, finds an auth-only ("half-provisioned") account via the
//      service-role RPC admin_find_auth_user and repairs its empty profile;
//   3. failing that, CREATES the account (phone_confirm/email_confirm true, so
//      phone-OTP login lands them straight in this account — the same
//      pre-provisioning pattern used for cohort students);
//   4. grants an enrolment (idempotent: reactivates or no-ops on duplicates —
//      the table has NO unique (user_id, offering_id) constraint, so we check
//      before inserting);
//   5. writes an admin_audit_logs row.
//
// This never touches legacy_enrolments and never interferes with
// claim_purchases_for_user — a pre-created confirmed-phone account is exactly
// what the claim flow expects to attach legacy purchases to at first sign-in.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

function corsFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed =
    !!origin &&
    (origin.endsWith("leveluplearning.in") ||
      origin.startsWith("capacitor://") ||
      origin.startsWith("http://localhost") ||
      origin.startsWith("https://localhost"));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://app.leveluplearning.in",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

interface StudentInput {
  full_name?: string;
  email?: string;
  phone?: string;
}

interface RowResult {
  input: StudentInput;
  status:
    | "enrolled"            // existing account, new enrolment
    | "created_and_enrolled" // account created, then enrolled
    | "repaired_and_enrolled" // half-provisioned profile fixed, then enrolled
    | "already_enrolled"
    | "reactivated"
    | "error";
  user_id?: string;
  detail?: string;
}

/** "98765 43210" / "+91 98765-43210" / "9198765432 10" → "919876543210".
 *  10 digits are assumed Indian; longer numbers must already carry their
 *  country code. Returns null when it can't be a real phone. */
function toAuthPhone(raw?: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // ── Gate: signed-in admin/owner only ─────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: actor } } = await sb.auth.getUser();
    if (!actor) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: actorRow } = await admin.from("users").select("role").eq("id", actor.id).single();
    if (actorRow?.role !== "admin" && actorRow?.role !== "owner") {
      return json({ error: "Forbidden — admins only" }, 403);
    }

    // ── Input ────────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null) as {
      offering_id?: string;
      students?: StudentInput[];
      source?: string;
    } | null;
    const offeringId = body?.offering_id;
    const students = Array.isArray(body?.students) ? body!.students! : [];
    if (!offeringId) return json({ error: "offering_id required" }, 400);
    if (!students.length) return json({ error: "students[] required" }, 400);
    if (students.length > 300) return json({ error: "Max 300 students per call — split the CSV" }, 400);

    const { data: offering } = await admin
      .from("offerings").select("id, title").eq("id", offeringId).maybeSingle();
    if (!offering) return json({ error: "Offering not found" }, 404);

    const source = students.length > 1 ? "bulk_import" : (body?.source || "admin_manual");

    // ── Per-student worker ───────────────────────────────────────────────────
    const grantOne = async (s: StudentInput): Promise<RowResult> => {
      try {
        const fullName = s.full_name?.trim() || null;
        const email = s.email?.trim().toLowerCase() || null;
        const authPhone = toAuthPhone(s.phone);
        const profilePhone = authPhone ? `+${authPhone}` : null;
        if (!email && !authPhone) {
          return { input: s, status: "error", detail: "Needs an email or a valid phone" };
        }

        // 1. Existing profile? Phone is the strongest key on this platform.
        let userId: string | null = null;
        let repaired = false;
        if (profilePhone) {
          const { data } = await admin.from("users").select("id").eq("phone", profilePhone).maybeSingle();
          if (data) userId = data.id;
        }
        if (!userId && email) {
          const { data } = await admin.from("users").select("id").ilike("email", email).maybeSingle();
          if (data) userId = data.id;
        }

        // 2. Auth-only account (profile row empty or missing)?
        let createdAccount = false;
        if (!userId) {
          const { data: authRows } = await admin.rpc("admin_find_auth_user", {
            p_email: email,
            p_phone: authPhone,
          });
          if (authRows?.length) userId = authRows[0].id;

          // 3. Nobody anywhere → create the account, pre-confirmed.
          if (!userId) {
            const { data: created, error: cErr } = await admin.auth.admin.createUser({
              email: email ?? undefined,
              phone: authPhone ?? undefined,
              email_confirm: !!email,
              phone_confirm: !!authPhone,
              user_metadata: { full_name: fullName, provisioned_by_admin: true },
            });
            if (cErr || !created?.user) {
              return { input: s, status: "error", detail: cErr?.message || "Account creation failed" };
            }
            userId = created.user.id;
            createdAccount = true;
          }

          // 4. Profile: handle_new_user may have auto-created it — fill the
          // gaps, never overwrite non-empty fields, tolerate unique clashes.
          const { data: prof } = await admin.from("users")
            .select("id, full_name, email, phone").eq("id", userId).maybeSingle();
          if (prof) {
            const updates: Record<string, string> = {};
            if (!prof.full_name && fullName) updates.full_name = fullName;
            if (!prof.email && email) updates.email = email;
            if (!prof.phone && profilePhone) updates.phone = profilePhone;
            if (Object.keys(updates).length) {
              const { error: uErr } = await admin.from("users").update(updates).eq("id", userId);
              if (!uErr && !createdAccount) repaired = true;
            }
          } else {
            const { error: iErr } = await admin.from("users").insert({
              id: userId, full_name: fullName, email, phone: profilePhone, role: "student",
            });
            if (iErr) return { input: s, status: "error", detail: `Profile insert failed: ${iErr.message}` };
            if (!createdAccount) repaired = true;
          }
        }

        // 5. Enrolment — idempotent by hand (no DB unique constraint).
        const { data: existing } = await admin.from("enrolments")
          .select("id, status").eq("user_id", userId).eq("offering_id", offeringId).limit(1);
        let status: RowResult["status"];
        let targetId: string | undefined;
        if (existing?.length) {
          targetId = existing[0].id;
          if (existing[0].status === "active") {
            status = "already_enrolled";
          } else {
            const { error } = await admin.from("enrolments")
              .update({ status: "active" }).eq("id", existing[0].id);
            if (error) return { input: s, status: "error", detail: error.message };
            status = "reactivated";
          }
        } else {
          const { data: ins, error } = await admin.from("enrolments").insert({
            user_id: userId, offering_id: offeringId, status: "active", source,
          }).select("id").single();
          if (error) return { input: s, status: "error", detail: error.message };
          targetId = ins?.id;
          status = createdAccount ? "created_and_enrolled" : repaired ? "repaired_and_enrolled" : "enrolled";
        }

        if (status !== "already_enrolled") {
          await admin.from("admin_audit_logs").insert({
            actor_user_id: actor.id,
            action: `enrolment.${status}`,
            target_table: "enrolments",
            target_id: targetId ?? null,
            metadata: { offering_id: offeringId, offering_title: offering.title, user_id: userId, via: "offering-editor", source },
          });
        }
        return { input: s, status, user_id: userId ?? undefined };
      } catch (e) {
        return { input: s, status: "error", detail: String(e instanceof Error ? e.message : e) };
      }
    };

    // Small concurrency — enough for a 300-row CSV inside the time limit,
    // gentle enough on GoTrue's createUser endpoint.
    const results: RowResult[] = new Array(students.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, students.length) }, async () => {
      while (cursor < students.length) {
        const i = cursor++;
        results[i] = await grantOne(students[i]);
      }
    });
    await Promise.all(workers);

    const counts: Record<string, number> = {};
    for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
    return json({ offering: offering.title, counts, results });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
