// admin-grant-access — admin/owner only. One call = "make sure this person can
// watch this offering", whether or not they have an account yet.
//
// For each student {full_name?, email?, phone?, country_code?} it:
//   0. resolves the phone to E.164 via the shared, unit-tested
//      `resolveImportPhone` — a CRM export splits the dial code into its
//      own column, and without honouring it a +44 student's national
//      number silently became an Indian one they can never receive an OTP on;
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
import { resolveImportPhone, phoneVariants } from "../_shared/phone.ts";

function corsFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed =
    !!origin &&
    (origin.endsWith("leveluplearning.in") ||
      // Extra web origins: set only on the staging project, unset in production.
      (Deno.env.get("EXTRA_ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).includes(origin) ||
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
  /** Dial code from a CRM export's own column ("+44", "0044", "44"). Ignored
   *  when `phone` already starts with "+" — see `resolveImportPhone`. */
  country_code?: string;
  /** The admin's decision on a held row: grant to exactly this account. */
  user_id?: string;
  /** The admin's decision on a held row: make a new account on this phone
   *  even though the email already belongs to someone (the email is left off). */
  create_new?: boolean;
}

/** One account offered to the admin when a row is held for a decision. */
interface Candidate {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  owns: string[];
  last_sign_in_at: string | null;
}

interface RowResult {
  input: StudentInput;
  status:
    | "enrolled"            // existing account, new enrolment
    | "created_and_enrolled" // account created, then enrolled
    | "repaired_and_enrolled" // half-provisioned profile fixed, then enrolled
    | "already_enrolled"
    | "reactivated"
    | "phone_belongs_to_another_account" // enrolled, but the number is taken
    | "needs_decision"      // held: nothing granted, the admin picks below
    | "error";
  user_id?: string;
  detail?: string;
  /** Present only on needs_decision. */
  decision?: {
    kind: "two_accounts" | "email_has_other_phone";
    candidates: Candidate[];
  };
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
    // A ceiling, not a workflow limit: the admin UI slices a larger CSV into
// chunks of this size and calls repeatedly, so a 2,000-row CRM export
// imports in one click. The cap keeps a single invocation inside the
// edge runtime's wall-clock budget.
    if (students.length > 300) {
      return json({ error: "Max 300 students per call — send it in chunks" }, 400);
    }

    const { data: offering } = await admin
      .from("offerings").select("id, title").eq("id", offeringId).maybeSingle();
    if (!offering) return json({ error: "Offering not found" }, 404);

    const source = students.length > 1 ? "bulk_import" : (body?.source || "admin_manual");

    // ── Per-student worker ───────────────────────────────────────────────────
    const grantOne = async (s: StudentInput): Promise<RowResult> => {
      try {
        const fullName = s.full_name?.trim() || null;
        const email = s.email?.trim().toLowerCase() || null;
        const authPhone = resolveImportPhone(s.phone, s.country_code);
        const profilePhone = authPhone ? `+${authPhone}` : null;
        if (!email && !authPhone) {
          return { input: s, status: "error", detail: "Needs an email or a valid phone" };
        }

        // 1. Who is this? THE PHONE DECIDES (founder, 2026-11-02). The phone
        // and the email are looked up separately; when they point at two
        // different people, or the email's account already has another
        // number, the row is HELD and the admin picks: nothing is guessed.
        let userId: string | null = null;
        let repaired = false;
        let createdAccount = false;

        if (s.user_id) {
          // The admin's decision on a held row (or a pick from search).
          const { data: chosen } = await admin.auth.admin.getUserById(s.user_id);
          if (!chosen?.user) return { input: s, status: "error", detail: "That account no longer exists" };
          userId = s.user_id;
        } else {
          if (!authPhone && !email) {
            return { input: s, status: "error", detail: "Needs a mobile number" };
          }
          const phoneId = authPhone ? await accountIdByPhone(admin, authPhone, profilePhone!) : null;
          const emailId = email ? await accountIdByEmail(admin, email) : null;

          if (phoneId && emailId && phoneId !== emailId && !s.create_new) {
            return held(s, "two_accounts", await candidates(admin, [phoneId, emailId]),
              "This number and this email belong to two different accounts.");
          }
          if (phoneId) {
            userId = phoneId;
          } else if (emailId && !s.create_new) {
            if (authPhone) {
              const onFile = await phoneOf(admin, emailId);
              if (onFile && onFile.replace(/\D/g, "") !== authPhone) {
                return held(s, "email_has_other_phone", await candidates(admin, [emailId]),
                  "This email's account already has a different number.");
              }
            }
            userId = emailId;
          }

          if (!userId) {
            // A new person needs a mobile number: it is how they sign in.
            if (!authPhone) {
              return { input: s, status: "error", detail: "Needs a mobile number to add a new student" };
            }

            // LAST RESORT BEFORE MINTING: the student's own application.
            // cohort_applications is the one record where a phone and an email
            // were typed by the STUDENT and bound to a real account, so a phone
            // match there finds a person whose roster email was wrong (the
            // 2026-10-23 "Moses" case). Phone-only, and exactly one account.
            const { data: apps } = await admin
              .from("cohort_applications")
              .select("user_id")
              .in("phone", phoneVariants(`+${authPhone}`))
              .not("user_id", "is", null);
            const ids = [...new Set((apps ?? []).map((a: { user_id: string }) => a.user_id))];
            if (ids.length === 1) userId = ids[0];
          }

          // 3. Nobody anywhere → create the account on the phone, pre-confirmed.
          // The email goes on only if no other account holds it (create_new on
          // an email_has_other_phone row leaves it off).
          if (!userId) {
            const useEmail = email && !emailId ? email : null;
            const { data: created, error: cErr } = await admin.auth.admin.createUser({
              email: useEmail ?? undefined,
              phone: authPhone!,
              email_confirm: !!useEmail,
              phone_confirm: true,
              user_metadata: { full_name: fullName, provisioned_by_admin: true },
            });
            if (cErr || !created?.user) {
              return { input: s, status: "error", detail: cErr?.message || "Account creation failed" };
            }
            userId = created.user.id;
            createdAccount = true;
          }
        }

        // 4. Reconcile the resolved account with what the CSV asserts.
        //
        // THIS RUNS FOR EVERY ROW, not just newly-created accounts. It used to
        // sit inside the `if (!userId)` branch above, so a row matched by EMAIL
        // at step 1 skipped it entirely: the account was enrolled and left with
        // NO PHONE. Phone-OTP login resolves through `auth.users.phone`, so it
        // never found that account — GoTrue minted an empty phone-only shell
        // instead and the student saw an empty library. On the Creator Academy
        // Cohort 03 import that was 16 of 17 students; the enrolments were all
        // real, just hanging on the half of the identity nobody could log into.
        //
        // Note which table matters: writing `public.users.phone` alone does NOT
        // fix login. `find_login_identity` reads `auth.users.phone`, so the
        // number has to be attached through the Auth admin API as well.
        let phoneConflict = false;
        if (authPhone) {
          const { data: au } = await admin.auth.admin.getUserById(userId!);
          if (au?.user && !au.user.phone) {
            // Only claim a number that belongs to nobody. If another account
            // holds it, these are two identities for one human and merging them
            // is a judgement call with data loss on the line — report it and let
            // an admin decide, rather than silently picking a winner.
            const { data: taken } = await admin.rpc("admin_find_auth_user", {
              p_email: null,
              p_phone: authPhone,
            });
            const other = (taken ?? []).find((r: { id: string }) => r.id !== userId);
            if (other) {
              phoneConflict = true;
            } else {
              const { error: pErr } = await admin.auth.admin.updateUserById(userId!, {
                phone: `+${authPhone}`,
                phone_confirm: true,
              });
              if (!pErr && !createdAccount) repaired = true;
            }
          }
        }

        // Profile row: handle_new_user may have auto-created it — fill the
        // gaps, never overwrite non-empty fields, tolerate unique clashes.
        const { data: prof } = await admin.from("users")
          .select("id, full_name, email, phone").eq("id", userId).maybeSingle();
        if (prof) {
          const updates: Record<string, string> = {};
          if (!prof.full_name && fullName) updates.full_name = fullName;
          if (!prof.email && email && !s.create_new) updates.email = email;
          if (!prof.phone && profilePhone && !phoneConflict) updates.phone = profilePhone;
          if (Object.keys(updates).length) {
            const { error: uErr } = await admin.from("users").update(updates).eq("id", userId);
            if (!uErr && !createdAccount) repaired = true;
          }
        } else {
          const { error: iErr } = await admin.from("users").insert({
            id: userId, full_name: fullName, email,
            phone: phoneConflict ? null : profilePhone, role: "student",
          });
          if (iErr) return { input: s, status: "error", detail: `Profile insert failed: ${iErr.message}` };
          if (!createdAccount) repaired = true;
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
            // Re-granting also clears the revoke stamp, otherwise the row
            // reads "active, revoked on <date> by <admin>" forever.
            const { error } = await admin.from("enrolments")
              .update({ status: "active", revoked_at: null, revoked_by: null, revoked_reason: null })
              .eq("id", existing[0].id);
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
        // The enrolment is real either way; the row is flagged so the report
        // tells the admin this student still cannot log in by phone.
        if (phoneConflict) {
          return {
            input: s,
            status: "phone_belongs_to_another_account",
            user_id: userId ?? undefined,
            detail: "Enrolled, but this number is already on a different account — merge them or the student won't see it after phone login.",
          };
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

// deno-lint-ignore no-explicit-any
type Admin = any;

/** The account holding this phone: profile phone (either stored form), else the login phone. */
async function accountIdByPhone(admin: Admin, authPhone: string, profilePhone: string): Promise<string | null> {
  const { data } = await admin.from("users").select("id").in("phone", [profilePhone, authPhone]).is("deleted_at", null).limit(1);
  if (data?.length) return data[0].id;
  const { data: authRows } = await admin.rpc("admin_find_auth_user", { p_email: null, p_phone: authPhone });
  return authRows?.length ? authRows[0].id : null;
}

/** The account holding this email: a profile email held by exactly one account, else the login email. */
async function accountIdByEmail(admin: Admin, email: string): Promise<string | null> {
  const { data } = await admin.from("users").select("id").ilike("email", email).is("deleted_at", null).limit(2);
  if (data?.length === 1) return data[0].id;
  const { data: authRows } = await admin.rpc("admin_find_auth_user", { p_email: email, p_phone: null });
  return authRows?.length === 1 ? authRows[0].id : null;
}

/** The number on an account (login phone first), as digits with country code, or null. */
async function phoneOf(admin: Admin, userId: string): Promise<string | null> {
  const { data: au } = await admin.auth.admin.getUserById(userId);
  if (au?.user?.phone) return au.user.phone;
  const { data: prof } = await admin.from("users").select("phone").eq("id", userId).maybeSingle();
  return prof?.phone ?? null;
}

async function candidates(admin: Admin, ids: string[]): Promise<Candidate[]> {
  return await Promise.all(ids.map(async (id) => {
    const [{ data: prof }, { data: au }, { data: enrols }] = await Promise.all([
      admin.from("users").select("full_name, email, phone").eq("id", id).maybeSingle(),
      admin.auth.admin.getUserById(id),
      admin.from("enrolments").select("offerings(title)").eq("user_id", id).eq("status", "active"),
    ]);
    const realEmail = prof?.email && !prof.email.endsWith("@phone.leveluplearning.in") ? prof.email : null;
    return {
      user_id: id,
      full_name: prof?.full_name ?? null,
      email: realEmail,
      phone: prof?.phone ?? (au?.user?.phone ? `+${au.user.phone}` : null),
      owns: (enrols ?? []).map((e: { offerings: { title: string } | null }) => e.offerings?.title).filter(Boolean),
      last_sign_in_at: au?.user?.last_sign_in_at ?? null,
    };
  }));
}

function held(s: StudentInput, kind: "two_accounts" | "email_has_other_phone", c: Candidate[], detail: string): RowResult {
  return { input: s, status: "needs_decision", detail, decision: { kind, candidates: c } };
}
