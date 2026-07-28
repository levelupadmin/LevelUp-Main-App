import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hmacSha256Base64, timingSafeEqual } from "../_shared/crypto.ts";
import { decideProvision, identityKeys, type ProvisionOutcome } from "../_shared/identity.ts";
import { normalizePhone } from "../_shared/phone.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const tallySigningSecret = Deno.env.get("TALLY_SIGNING_SECRET") || "";

/**
 * The service-role client. Wrapped in a factory purely so `AdminClient` below
 * is the client type as actually INSTANTIATED here — a bare
 * `ReturnType<typeof createClient>` picks up the generic defaults instead and
 * does not match (the same trap tally-application-poll documents).
 */
function createAdminClient() {
  return createClient(supabaseUrl, serviceKey);
}

type AdminClient = ReturnType<typeof createAdminClient>;

/* ───────────────────────── identity provisioning (phase SP, REQ-IDENT-1) ────
 * KEPT DELIBERATELY IDENTICAL TO tally-application-poll. This function is
 * fail-closed and INERT today — no TALLY_SIGNING_SECRET is set, so every
 * request is rejected at the signature check above and none of this runs. The
 * poller is the live intake host and is where provisioning actually happens.
 * It is duplicated here so that if a signing secret is ever set, an applicant
 * arriving through the webhook is provisioned by the SAME sequence and lands in
 * the same state — the intake host has already changed once, and an applicant's
 * identity must not depend on which door they came through.
 *
 * The decision itself is the shared pure module (`_shared/identity.ts`); only
 * the two lookups and the one write live here. Fail-soft: any error leaves
 * `user_id` NULL and the application is still written. Never merges: ANY
 * partial identity match defers to an interactive claim.
 *
 * DEPLOY ORDER — MIGRATION FIRST, same as the poller. The collision path names
 * `pending_claim`, so deploying ahead of
 * `20260727120000_cohort_applications_pending_claim.sql` would raise 42703 on
 * a collision row (ordinary rows never name the column and are unaffected).
 *
 * Changes here MUST be mirrored into tally-application-poll and vice versa.
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * One `auth.users` lookup on ONE key, via the deterministic
 * `find_login_identity` RPC (service_role-only). Never GoTrue's admin list
 * `?email=`/`?phone=` filter — that param is silently ignored and returns page
 * 1 of ALL users, which is what made returning users read as brand-new before
 * 20260603120000_legacy_login_fix.sql.
 *
 * Exactly ONE key per call: the RPC ORs its predicates and `LIMIT 1`s, so
 * asking both at once would collapse "email belongs to A, phone belongs to B" —
 * the collision — into a single winner. Throws rather than returning null,
 * because a failed lookup read as "nobody has this email" mints a duplicate
 * account for an existing user.
 */
async function findAuthIdentity(
  admin: AdminClient,
  key: { email: string } | { phone: string },
): Promise<{ id: string } | null> {
  const { data, error } = await admin.rpc("find_login_identity", {
    p_phone: "phone" in key ? key.phone : null,
    p_email: "email" in key ? key.email : null,
  });
  if (error) throw new Error(`find_login_identity failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { id?: string } | undefined;
  return row?.id ? { id: row.id } : null;
}

/**
 * The applicant's identity BY EMAIL — `auth.users` first, then the
 * `public.users` mirror. The mirror leg is REQUIRED, not defensive: the app's
 * phone-first signup mints the auth row on `syntheticEmail(phone)` and the real
 * address is written later by `set_onboarding_profile`, which touches
 * `public.users` ONLY — so for most of the existing user base the real email
 * lives nowhere GoTrue can see it, and an auth-only lookup would park their
 * application in a claim flow. Both sides are keyed on the same lowercased,
 * trimmed value, `public.users.email` is UNIQUE, and the id is shared between
 * the two tables. See tally-application-poll for the full reasoning.
 */
async function findIdentityByEmail(
  admin: AdminClient,
  email: string,
): Promise<{ id: string } | null> {
  const authRow = await findAuthIdentity(admin, { email });
  if (authRow) return authRow;

  const { data, error } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`users mirror email lookup failed: ${error.message}`);
  const id = (data as { id?: string } | null)?.id;
  return id ? { id } : null;
}

/**
 * The applicant's phone as GoTrue must receive it (`+91XXXXXXXXXX`), or null
 * when it is not a 10-digit / 91-prefixed 12-digit number. Deliberately not
 * `e164()`, which only prepends a `+` and would mint "+9788385577" from bare
 * form text. See tally-application-poll for the full reasoning.
 */
function mintablePhone(raw: string | null): string | null {
  const digits = normalizePhone((raw ?? "").trim());
  return digits ? `+91${digits}` : null;
}

/**
 * Service-role-only `app_metadata` marking an identity whose email and phone
 * are still nothing but unauthenticated form text.
 * `claim_legacy_enrolments_for_user` (hardened in 20260727120000) grants
 * NOTHING while this is set and no channel is confirmed — without it, minting
 * a user here fires the INSERT-only legacy-entitlement claim on an unverified
 * email and hands a stranger a real TagMango customer's paid catalogue.
 */
const INTAKE_APP_METADATA = {
  levelup_unverified_intake: true,
  provisioned_by: "tally_intake",
} as const;

interface ProvisionResult {
  userId: string | null;
  pendingClaim: boolean;
  status: ProvisionOutcome["status"] | "error";
}

/**
 * Resolve — and if necessary CREATE — the applicant's auth identity, so the
 * application is bound to an `auth.uid` before insert and the applicant never
 * meets a signup screen.
 *
 * A minted account carries BOTH identifiers, both unconfirmed, plus
 * `INTAKE_APP_METADATA` — that is the phase requirement (a later OTP on either
 * channel must resolve to the same uid; an email-only row dead-ends the phone
 * tab and mints a second account through signup). It carries no
 * `user_metadata.phone`, which is the separate field `handle_new_user` mirrors
 * into the UNIQUE `public.users.phone`; that one waits for
 * `sync_confirmed_phone_to_users` and a real `phone_confirmed_at`.
 *
 * ALL THREE collision reasons — `email_taken`, `phone_taken`, `cross_linked` —
 * write NOTHING and defer to `pending_claim`. Nothing at intake proves the
 * email, so stamping an `email_taken` row would let an unauthenticated form
 * attach an application to a stranger's account.
 *
 * See `provisionApplicant` in tally-application-poll for the full reasoning,
 * including the accepted residual risk of pre-binding an unproven phone; this
 * mirrors it verbatim.
 */
async function provisionApplicant(
  admin: AdminClient,
  applicant: { email: string; phone: string | null; fullName: string },
): Promise<ProvisionResult> {
  const keys = identityKeys({ email: applicant.email, phone: applicant.phone });

  try {
    const byEmail = keys.email ? await findIdentityByEmail(admin, keys.email) : null;
    const byPhone = keys.phone ? await findAuthIdentity(admin, { phone: keys.phone }) : null;
    const outcome = decideProvision(keys, { byEmail, byPhone });

    switch (outcome.status) {
      case "existing":
        return {
          userId: await mirroredUserId(admin, outcome.userId),
          pendingClaim: false,
          status: "existing",
        };

      case "collision": {
        console.warn(
          "[tally-webhook] identity collision; inserting with user_id NULL + pending_claim, nothing merged:",
          outcome.reason,
        );
        return { userId: null, pendingClaim: true, status: "collision" };
      }

      case "created": {
        if (!keys.email) {
          console.warn(
            "[tally-webhook] application carries no usable email; inserted with user_id NULL rather than minting an account with no way to mint a session",
          );
          return { userId: null, pendingClaim: false, status: "skipped" };
        }
        // EMAIL-ONLY, mirroring the poller exactly. See the long note at
        // tally-application-poll/index.ts's createUser for the full reasoning.
        //
        // WHY THIS FILE MATTERS EVEN THOUGH IT IS INERT. This handler is
        // fail-closed today: no TALLY_SIGNING_SECRET is set, so it rejects
        // every delivery. That makes the vector LATENT, not absent — setting a
        // signing secret is a one-line operator action that would silently arm
        // it. A dormant account-takeover path is still an account-takeover
        // path, and this file's own header promises it stays identical to the
        // poller, so the two must not diverge on the one line that matters.
        //
        // THE VECTOR: `auth.users.phone` is the phone-OTP login key
        // (`find_login_identity`, 20260603120000, matches it on the last 10
        // digits with no `phone_confirmed_at` predicate). Writing unproven form
        // text there lets {an email you own, a stranger's number} bind that
        // stranger's next genuine MSG91 login into an account you control.
        const intakePhone = mintablePhone(applicant.phone);
        if (keys.phone && !intakePhone) {
          console.warn(
            "[tally-webhook] the application's phone is not a 10-digit or 91-prefixed 12-digit number, so nothing is stashed for later promotion",
          );
        }
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: keys.email,
          email_confirm: false,
          phone_confirm: false,
          user_metadata: { full_name: applicant.fullName },
          app_metadata: {
            ...INTAKE_APP_METADATA,
            ...(intakePhone ? { levelup_intake_phone: intakePhone } : {}),
          },
        });
        if (createErr || !created?.user?.id) {
          throw new Error(createErr?.message ?? "createUser returned no user");
        }
        return {
          userId: await mirroredUserId(admin, created.user.id),
          pendingClaim: false,
          status: "created",
        };
      }

      case "skipped":
        return { userId: null, pendingClaim: false, status: "skipped" };
    }
  } catch (err) {
    // Fail-soft: an unlinked application is recoverable by hand, a lost one is
    // not. Logged at ERROR because nothing re-runs provisioning for this row.
    console.error(
      "[tally-webhook] provisioning failed; application still inserted with user_id NULL:",
      err instanceof Error ? err.message : String(err),
    );
    return { userId: null, pendingClaim: false, status: "error" };
  }
}

/**
 * `cohort_applications.user_id` references `public.users(id)`, not
 * `auth.users(id)`. `handle_new_user()` (20260405070345) mirrors one to the
 * other with the SAME id, so a freshly-created uid is always present — but an
 * auth row predating that trigger need not be, and stamping an unmirrored uid
 * would fail the FK and cost the whole application. Unlinked, not lost.
 */
async function mirroredUserId(admin: AdminClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from("users").select("id").eq("id", userId).maybeSingle();
  if (error) throw new Error(`users mirror check failed: ${error.message}`);
  if (data) return userId;
  console.error(
    "[tally-webhook] auth user has no public.users mirror row; user_id left NULL:",
    userId,
  );
  return null;
}

async function verifyTallySignature(body: string, signature: string | null): Promise<boolean> {
  if (!tallySigningSecret) {
    console.error("TALLY_SIGNING_SECRET is not configured, rejecting webhook");
    return false;
  }
  if (!signature) return false;
  return timingSafeEqual(await hmacSha256Base64(body, tallySigningSecret), signature);
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

    const supabase = createAdminClient();

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

    // Existing user by email (optional, used to link + enrich the profile).
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

    // IDENTITY FIRST, THEN THE INSERT (phase SP). Only on the CREATE path: a
    // re-submission that updated an existing application above already has
    // whatever identity that row was given, and re-provisioning it could mint a
    // second account for the same person. The `existingUser` read above stays
    // exactly as it was — it feeds the profile enrichment below, not `user_id`.
    const provisioned = await provisionApplicant(supabase, {
      email,
      phone: phone || null,
      fullName: fullName || email.split("@")[0],
    });

    // Create new application. `pending_claim` is only ever SET, never written
    // as `false` — byte-for-byte the poller's write shape, and for the same
    // reason: the column DEFAULTs to false, so an ordinary row omits it and
    // keeps inserting on a database where 20260727120000 has not landed yet.
    //
    // That is NOT a substitute for deploy order. A COLLISION row does name the
    // column, so on a database without the migration it raises 42703 and the
    // application is not written (here: a 500 Tally will retry; in the poller:
    // an `insertFailed` the next tick re-attempts). Apply the migration BEFORE
    // deploying either intake function.
    const applicationRow: Record<string, unknown> = {
      offering_id: offering.id,
      user_id: provisioned.userId,
      full_name: fullName || email.split("@")[0],
      email,
      phone: phone || null,
      city: city || null,
      occupation: occupation || null,
      bio: bio || null,
      status: "submitted",
      tally_response_id: responseId,
      tally_data: payload.data,
    };
    if (provisioned.pendingClaim) applicationRow.pending_claim = true;

    const { data: newApp, error: appError } = await supabase
      .from("cohort_applications")
      .insert(applicationRow)
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
