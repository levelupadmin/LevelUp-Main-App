import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeadersFor } from "../_shared/cors.ts";
import { normalizePhone, phoneVariants } from "../_shared/phone.ts";

// CORS is origin-aware (see _shared/cors.ts). The hardcoded single-origin
// header this function used to build from SITE_URL rejected the iOS Capacitor
// origin (capacitor://app.leveluplearning.in), so every call from the iOS shell
// would die as a silent "(network)" failure.
const ALLOW_METHODS = { "Access-Control-Allow-Methods": "POST, OPTIONS" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The signup gate matches every identifier by EQUALITY (`eq`/`in`) or through
// find_login_identity, never LIKE/ilike, so no caller-supplied value can be read
// as a pattern. Belt and braces, it also validates the address against a strict
// character set: PostgREST rewrites "*" into "%" inside like/ilike values
// server-side, AFTER any client-side escaping has run, so the moment this branch
// went back to ilike a single "*" would turn an anon-reachable endpoint into a
// prefix/suffix enumeration oracle. "*" and "%" are not valid in a real address,
// so rejecting them costs nothing real, and a rejected address 400s, which the
// client treats as fail-open, so a false reject can never block a genuine signup.
const SIGNUP_EMAIL_RE = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

// A phone maps to a handful of legacy_enrolments rows at most, and we only need
// to know whether ANY of them still leads to an account someone can get into.
const LEGACY_ROW_CAP = 10;

// Rate-limit ceilings for the signup gate, both over the same 15-minute window
// the offering path uses. Two-bucket rationale at the call site.
const SIGNUP_RL_WINDOW_SECONDS = 900;
const SIGNUP_RL_PER_IP = 60;
const SIGNUP_RL_PER_IDENTIFIER = 10;

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

// Canonical +91XXXXXXXXXX for an Indian number in ANY dialect this codebase has
// emitted (bare 10-digit, 91…, +91…), or null when the number is not Indian.
// The endpoint is callable directly, so it cannot lean on the browser always
// sending E.164: the offering branch below already accepts the bare 10-digit
// form, and both branches have to agree on what a phone is.
function indianE164(raw: string): string | null {
  const subscriber = normalizePhone(raw);
  return subscriber ? `+91${subscriber}` : null;
}

// Short SHA-256 digest, so the rate-limit table keys on a hash rather than
// storing anybody's phone number or address.
async function identifierDigest(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
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
    // offering lookup entirely and keys its rate limit on the caller instead.
    // It answers exactly ONE question and returns nothing but that boolean: no
    // user_id, no scenario, no name, no email, no offering. This endpoint is
    // anon-reachable and must not become an enumeration oracle beyond the
    // yes/no the signup UX genuinely needs.
    //
    // The question is "WILL THE SIGN-IN DOOR OPEN for this identifier", not the
    // looser "does some row mention it". Telling someone they already have an
    // account and then handing them a sign-in that refuses them shuts BOTH
    // doors, which is the one dead end the brief forbids. So every predicate
    // below mirrors a door the app actually opens:
    //   • +91 phone → MSG91 → verify-msg91-otp, which admits a caller whose
    //     phone resolves through find_login_identity (auth.users), or who has
    //     ANY legacy_enrolments row on that phone (it provisions from the row).
    //   • email → supabase.auth.signInWithOtp({ shouldCreateUser: false }),
    //     which admits ONLY an address that already exists in auth.users.
    //   • a non-+91 phone has no door at all: Login sends those numbers straight
    //     to the email step, so a number we cannot dial is never a reason to
    //     block a signup.
    // An identity also has to survive arrival: AuthContext force-signs-out
    // anyone whose profile row is hidden, so a soft-deleted (or profile-less)
    // account is a shut door too.
    //
    // Deliberately NOT a reason to block, each verified rather than assumed:
    //   • A public.users row on its own. All three payment paths create the auth
    //     user with no phone (razorpay-webhook, verify-razorpay-payment and
    //     guest-create-order each write the number into public.users afterwards),
    //     so a guest buyer's auth.users.phone is NULL and no phone door exists
    //     for them. Blocking them here would strand a PAYING customer with no
    //     way in at all, so they keep signing up exactly as they do today.
    //     Reaching them properly needs an auth.users.phone backfill: an admin
    //     job, filed, not guessed at from inside a gate.
    //   • A legacy_enrolments EMAIL with no auth user behind it. That lookup is
    //     only ever reached from the non-+91 path, whose door is
    //     shouldCreateUser:false, which by definition refuses such an address.
    //
    // The offering_id + scenario A/B/C contract below is untouched for any
    // caller that passes an offering_id.
    if (mode === "signup") {
      const emailIn = (typeof email === "string" ? email.trim() : "").toLowerCase();
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

      // The only phone with a sign-in door is an Indian one, and it is matched
      // in every stored dialect (legacy_enrolments holds +91XXXXXXXXXX,
      // auth.users holds whatever GoTrue was handed).
      const phoneE164 = phoneIn ? indianE164(phoneIn) : null;

      // ── Rate limit: two buckets, because one IP is not one person ──
      // Indian carrier CGNAT and campus/office NAT put thousands of users behind
      // a single x-forwarded-for, so a 10-per-IP ceiling would be a de-facto off
      // switch: the eleventh signup in the window 429s, the client fails open on
      // any non-2xx (deliberately, so a flaky check can never brick signup), and
      // every buyer behind that egress sails through. The IP bucket is therefore
      // sized for a shared egress, and a second bucket caps how often a single
      // identifier can be probed. One signup costs exactly one call on either
      // path, so 60 is ~4 signups a minute from one egress while still holding a
      // single scraper to well under 6k bare yes/no answers a day.
      const idDigest = await identifierDigest(
        `${phoneE164 ?? phoneIn.replace(/\D/g, "")}|${emailIn}`,
      );
      const buckets: Array<[string, number]> = [
        [`check-user-exists:signup:ip:${ip}`, SIGNUP_RL_PER_IP],
        [`check-user-exists:signup:id:${idDigest}`, SIGNUP_RL_PER_IDENTIFIER],
      ];
      for (const [key, max] of buckets) {
        const { data: allowed, error: rlErr } = await admin.rpc(
          "check_and_increment_rate_limit",
          { p_key: key, p_max_count: max, p_window_seconds: SIGNUP_RL_WINDOW_SECONDS }
        );
        if (rlErr) {
          console.error("rate-limit rpc failed:", rlErr);
          return jsonRes({ error: "Internal error" }, 500);
        }
        if (allowed === false) {
          return jsonRes({ error: "Too many requests" }, 429);
        }
      }

      // Is there an auth identity for this identifier, and does it still let its
      // owner in? "shut" is a match that cannot sign in (no profile row, or a
      // soft-deleted one), kept distinct from "none" because a match — live or
      // not — is what verify-msg91-otp keys its existing-user branch on.
      const authDoor = async (
        args: { p_phone: string | null; p_email: string | null }
      ): Promise<"open" | "shut" | "none" | null> => {
        const { data, error } = await admin.rpc("find_login_identity", args);
        if (error) {
          console.error("signup check: find_login_identity failed:", error);
          return null;
        }
        const row = (Array.isArray(data) ? data[0] : data) as { id?: string } | undefined;
        if (!row?.id) return "none";
        const { data: profile, error: pErr } = await admin
          .from("users")
          .select("id")
          .eq("id", row.id)
          .is("deleted_at", null)
          .maybeSingle();
        if (pErr) {
          console.error("signup check: profile lookup failed:", pErr);
          return null;
        }
        return profile ? "open" : "shut";
      };

      if (phoneE164) {
        const door = await authDoor({ p_phone: phoneE164, p_email: null });
        if (door === null) return jsonRes({ error: "Internal error" }, 500);
        if (door === "open") return jsonRes({ exists: true });
        // A matched-but-dead identity short-circuits: verify-msg91-otp takes its
        // existing-user branch on that same match and never reaches the legacy
        // provisioning below, so there is no second door left to find.
        if (door === "shut") return jsonRes({ exists: false });

        // ── Or a PURCHASE we already hold? ──
        // verify-msg91-otp provisions an account straight from legacy_enrolments
        // for any matching phone, in any claimed state, so a row here IS an open
        // door. The exception is a row whose claimer has since been soft-deleted:
        // provisioning then collides with that account's email and logs the
        // caller into a profile the app signs out of on arrival.
        const { data: legacyRows, error: plErr } = await admin
          .from("legacy_enrolments")
          .select("claimed_by_user_id")
          .in("phone", phoneVariants(phoneE164))
          .limit(LEGACY_ROW_CAP);
        if (plErr) {
          console.error("signup check: legacy-by-phone failed:", plErr);
          return jsonRes({ error: "Internal error" }, 500);
        }
        if (legacyRows && legacyRows.length > 0) {
          const claimers = [
            ...new Set(
              legacyRows
                .map((r) => r.claimed_by_user_id)
                .filter((id): id is string => typeof id === "string")
            ),
          ];
          // An unclaimed row provisions cleanly, so it needs no owner check.
          if (claimers.length < legacyRows.length) return jsonRes({ exists: true });
          const { data: liveClaimers, error: lcErr } = await admin
            .from("users")
            .select("id")
            .in("id", claimers)
            .is("deleted_at", null)
            .limit(1);
          if (lcErr) {
            console.error("signup check: legacy claimer lookup failed:", lcErr);
            return jsonRes({ error: "Internal error" }, 500);
          }
          return jsonRes({ exists: !!(liveClaimers && liveClaimers.length > 0) });
        }
      }

      // The email door is auth.users and nothing else: signInWithOtp is called
      // with shouldCreateUser:false, so an address GoTrue has never seen gets an
      // otp_disabled error rather than a link, however many purchases sit behind
      // it. find_login_identity matches case-insensitively on that same table.
      if (emailIn) {
        const door = await authDoor({ p_phone: null, p_email: emailIn });
        if (door === null) return jsonRes({ error: "Internal error" }, 500);
        if (door === "open") return jsonRes({ exists: true });
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
