import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeadersFor } from "../_shared/cors.ts";
import { e164, normalizePhone, phoneVariants } from "../_shared/phone.ts";

// CORS is origin-aware (see _shared/cors.ts). The hardcoded single-origin
// header this function used to build from SITE_URL rejected the iOS Capacitor
// origin (capacitor://app.leveluplearning.in), so every call from the iOS shell
// died as a silent "(network)" failure.
const ALLOW_METHODS = { "Access-Control-Allow-Methods": "POST, OPTIONS" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The signup gate matches every identifier by EQUALITY (`eq`/`in`), never
// LIKE/ilike, so no caller-supplied value can be read as a pattern. Belt and
// braces, it also validates the address against a strict character set:
// PostgREST rewrites "*" into "%" inside like/ilike values server-side, AFTER
// any client-side escaping has run, so the moment this branch went back to
// ilike a single "*" would turn an anon-reachable endpoint into a
// prefix/suffix enumeration oracle over public.users and the legacy_enrolments
// PII table. "*" and "%" are not valid in a real address, so rejecting them
// costs nothing real — and a rejected address 400s, which the client treats as
// fail-open, so a false reject can never block a genuine signup.
const SIGNUP_EMAIL_RE = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

// A phone or an email maps to a handful of users rows at most, and we only need
// to know whether ANY of them is live vs. all of them soft-deleted.
const IDENTITY_ROW_CAP = 10;

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

Deno.serve(async (req) => {
  const corsHeaders = { ...corsHeadersFor(req), ...ALLOW_METHODS };

  const jsonRes = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonRes({ error: "Bad request" }, 400);

    const { email, phone, offering_id, mode } = body as {
      email?: string; phone?: string; offering_id?: string; mode?: string;
    };

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const ip = getClientIp(req);

    // ── mode: "signup" — boolean-only "do you already exist?" gate (SC-3) ──
    //
    // Signup has no offering to prove intent with, so this branch skips the
    // offering lookup entirely and keys its rate limit on the IP alone. It
    // answers exactly ONE question — does this phone/email already have an
    // account with us, or a purchase we already hold — and returns nothing
    // but that boolean. No user_id, no scenario, no name, no email, no
    // offering: this endpoint is anon-reachable and must not become an
    // enumeration oracle beyond the yes/no the signup UX genuinely needs.
    //
    // The offering_id + scenario A/B/C contract below is untouched for any
    // caller that passes an offering_id.
    if (mode === "signup") {
      const emailRaw = typeof email === "string" ? email.trim() : "";
      const emailIn = emailRaw.toLowerCase();
      const phoneIn = typeof phone === "string" ? phone.trim() : "";

      if (!emailIn && !phoneIn) {
        return jsonRes({ error: "email or phone is required" }, 400);
      }
      if (emailIn && (emailIn.length > 200 || !SIGNUP_EMAIL_RE.test(emailIn))) {
        return jsonRes({ error: "Invalid email" }, 400);
      }
      if (phoneIn && phoneIn.length > 20) {
        return jsonRes({ error: "Invalid phone" }, 400);
      }

      // Rate limit: same window and ceiling as the offering path, keyed on the
      // IP alone since there is no offering to key on.
      const { data: allowed, error: rlErr } = await admin.rpc(
        "check_and_increment_rate_limit",
        {
          p_key: `check-user-exists:signup:${ip}`,
          p_max_count: 10,
          p_window_seconds: 900,
        }
      );
      if (rlErr) {
        console.error("rate-limit rpc failed:", rlErr);
        return jsonRes({ error: "Internal error" }, 500);
      }
      if (allowed === false) {
        return jsonRes({ error: "Too many requests" }, 429);
      }

      // legacy_enrolments stores phones as +91XXXXXXXXXX while public.users
      // has been written in several dialects over time (bare 10-digit from
      // guest checkout, +91 from the MSG91 path). Querying either with a
      // single dialect matches nothing, so match every historical form.
      const phoneDigits = phoneIn.replace(/\D/g, "");
      const variants = phoneDigits.length >= 8
        ? [...new Set(phoneVariants(e164(phoneDigits)))]
        : [];
      // Match the address as typed AND lower-cased. Equality (not ilike) keeps
      // the value out of any pattern and keeps the query btree-shaped, so the
      // legacy partial index on (email) can actually serve it.
      const emails = emailIn ? [...new Set([emailIn, emailRaw])] : [];

      // ── Does an ACCOUNT already exist? ──
      // Deliberately unfiltered on deleted_at: we need to tell "no account" from
      // "soft-deleted account" apart. A soft-deleted user keeps their auth phone
      // and AuthContext force-signs-out anyone whose profile row is RLS-hidden,
      // so sign-in already rejects them. Blocking signup too would close BOTH
      // doors, the one dead end the brief forbids. A live row wins if the
      // identifier somehow matches both (they can genuinely sign in).
      let liveAccount = false;
      let softDeletedOnly = false;

      // Records what an identifier matched into the two flags above.
      // Returns false only when the query itself failed.
      const readIdentity = async (
        column: "phone" | "email",
        values: string[]
      ): Promise<boolean> => {
        const { data, error } = await admin
          .from("users")
          .select("deleted_at")
          .in(column, values)
          .limit(IDENTITY_ROW_CAP);
        if (error) {
          console.error(`signup check: users-by-${column} failed:`, error);
          return false;
        }
        if (data && data.length > 0) {
          if (data.some((r) => r.deleted_at === null)) liveAccount = true;
          else softDeletedOnly = true;
        }
        return true;
      };

      if (variants.length > 0 && !(await readIdentity("phone", variants))) {
        return jsonRes({ error: "Internal error" }, 500);
      }
      // Skipped once the phone already found a live account: the answer can
      // no longer change, and public.users has no index on email.
      if (emails.length > 0 && !liveAccount && !(await readIdentity("email", emails))) {
        return jsonRes({ error: "Internal error" }, 500);
      }

      if (liveAccount) return jsonRes({ exists: true });
      // Soft-deleted and nothing live: answer "no" and skip the legacy lookups
      // entirely, so a soft-deleted account that also has a legacy purchase
      // isn't re-blocked one query later.
      if (softDeletedOnly) return jsonRes({ exists: false });

      // ── Or a PURCHASE we already hold? ──
      // Phone is matched in every claimed state and in every dialect, exactly
      // as verify-msg91-otp matches it on the sign-in path. That is the point:
      // the gate must say "you already exist" if and only if the sign-in door
      // will actually open, and that door provisions an account straight from
      // legacy_enrolments for any matching phone, claimed or not.
      if (variants.length > 0) {
        const { data: phoneLegacy, error: plErr } = await admin
          .from("legacy_enrolments")
          .select("id")
          .in("phone", variants)
          .limit(1);
        if (plErr) {
          console.error("signup check: legacy-by-phone failed:", plErr);
          return jsonRes({ error: "Internal error" }, 500);
        }
        if (phoneLegacy && phoneLegacy.length > 0) return jsonRes({ exists: true });
      }

      // The email lookup is scoped to UNCLAIMED rows so it rides the partial
      // index legacy_enrolments_email_unclaimed_idx instead of scanning all
      // 73,926 rows on a blocking pre-OTP path (an unindexed scan here can hit
      // the statement timeout, and the client fails open on a 500, silently
      // switching the gate off). Nothing is lost: a CLAIMED row means the
      // claimer already holds an account, which the users lookup above answers
      // — and when that account is soft-deleted we deliberately answer "no".
      if (emails.length > 0) {
        const { data: emailLegacy, error: elErr } = await admin
          .from("legacy_enrolments")
          .select("id")
          .in("email", emails)
          .is("claimed_by_user_id", null)
          .limit(1);
        if (elErr) {
          console.error("signup check: legacy-by-email failed:", elErr);
          return jsonRes({ error: "Internal error" }, 500);
        }
        if (emailLegacy && emailLegacy.length > 0) return jsonRes({ exists: true });
      }

      return jsonRes({ exists: false });
    }

    // ── Input validation (offering / guest-checkout contract) ─────
    // Previously this function accepted { email, phone } from any
    // internet caller with no rate limit and no proof of intent,
    // making it a public email+phone enumeration oracle against the
    // entire user base. We now require:
    //   1. A valid email / phone format
    //   2. A valid active public offering_id (proof the caller is
    //      actually trying to check out, not just scraping)
    //   3. A rate limit of 10 calls per 15 minutes per (ip, offering_id)
    //
    // The returned scenario labels are unchanged so the PublicOffering
    // guest flow still works.
    if (!email || !phone || !offering_id) {
      return jsonRes({ error: "email, phone and offering_id are required" }, 400);
    }
    if (typeof email !== "string" || !EMAIL_RE.test(email) || email.length > 200) {
      return jsonRes({ error: "Invalid email" }, 400);
    }
    if (typeof phone !== "string" || phone.length > 20) {
      return jsonRes({ error: "Invalid phone" }, 400);
    }
    if (typeof offering_id !== "string" || !UUID_RE.test(offering_id)) {
      return jsonRes({ error: "Invalid offering_id" }, 400);
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return jsonRes({ error: "Invalid phone, must be 10 digits" }, 400);
    }

    // ── Proof of intent: offering must exist and be publicly active ──
    const { data: offering } = await admin
      .from("offerings")
      .select("id, status")
      .eq("id", offering_id)
      .maybeSingle();
    if (!offering || offering.status !== "active") {
      return jsonRes({ error: "Offering not available" }, 404);
    }

    // ── Rate limit: 10 calls per 15 min per (ip, offering) ──
    const { data: allowed, error: rlErr } = await admin.rpc(
      "check_and_increment_rate_limit",
      {
        p_key: `check-user-exists:${ip}:${offering_id}`,
        p_max_count: 10,
        p_window_seconds: 900,
      }
    );
    if (rlErr) {
      console.error("rate-limit rpc failed:", rlErr);
      return jsonRes({ error: "Internal error" }, 500);
    }
    if (allowed === false) {
      return jsonRes({ error: "Too many requests" }, 429);
    }

    // ── Lookups ──
    const { data: emailUser } = await admin
      .from("users")
      .select("id, phone")
      .eq("email", email)
      .maybeSingle();

    const { data: phoneUser } = await admin
      .from("users")
      .select("id, email")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (emailUser) {
      if (!emailUser.phone || normalizePhone(emailUser.phone) === normalizedPhone) {
        return jsonRes({ scenario: "A", user_id: emailUser.id });
      }
      return jsonRes({ scenario: "C", user_id: null });
    }

    if (phoneUser) {
      return jsonRes({ scenario: "C", user_id: null });
    }

    return jsonRes({ scenario: "B", user_id: null });
  } catch (err) {
    console.error("check-user-exists error:", err);
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
