// admin-update-user — the logic, kept free of Deno so vitest can drive it with
// a fake client (see src/lib/__tests__/adminUpdateUser.test.ts). index.ts is
// the thin Deno.serve wrapper: CORS, actor gate, HTTP mapping.
//
// One place edits a student's contact details so the two copies of an identity
// can never drift apart:
//
//   • auth.users  — what OTP login actually checks (phone / email)
//   • public.users — the profile the app and the admin pages read
//
// Design rules (each one is a bug the pre-ship council found in the first cut):
//
//   1. "Changed" is decided on CANONICAL DIGITS against auth.users, never on the
//      raw profile string. ~68% of profiles store the phone bare ("91…") while
//      the app writes "+91…"; comparing strings made a bio edit look like a
//      phone change and re-keyed the login on every save.
//   2. Only fields the caller SENT are touched; the UI sends only dirty fields.
//   3. Write public.users FIRST (it owns the UNIQUE constraints and fails
//      cheaply), then auth.users; if auth fails, put the profile back. Never
//      leave the login pointing at a number the profile doesn't show.
//   4. Owners can only be edited by owners; another admin's LOGIN fields can
//      only be changed by an owner. Otherwise any admin could move an owner's
//      phone to a number they control and OTP in.
//   5. Moving a phone/email onto an identity that still has UNCLAIMED TagMango
//      purchases needs an explicit confirmation — on the student's next sign-in
//      claim_my_purchases() would attach that catalogue to them, so a typo into
//      a paying customer's number must not be silent.
//   6. Business errors come back as data ({ ok:false, error }) on HTTP 200:
//      supabase-js throws a generic "non-2xx" for anything else and the
//      readable message would never reach the admin.
import { isSyntheticEmail, last10, resolveImportPhone, syntheticEmail } from "../_shared/phone.ts";

export interface UpdateBody {
  user_id?: string;
  full_name?: string | null;
  bio?: string | null;
  email?: string | null;
  phone?: string | null;
  country_code?: string | null;
  /** Set by the UI after the admin confirms the legacy-purchase warning. */
  confirm_legacy_claim?: boolean;
}

export interface Actor { id: string; role: string }

/** The slice of a service-role supabase-js client the handler uses. Typed
 *  loosely on purpose: the fake in the unit tests only has to honour the
 *  call chains below. */
// deno-lint-ignore no-explicit-any
export type AdminClient = any;

export type Outcome =
  | { ok: true; changed: string[]; user: { id: string; full_name: string | null; email: string | null; phone: string | null; bio: string | null; role: string } }
  | { ok: false; code: "bad_request" | "not_found" | "forbidden" | "conflict" | "needs_confirmation" | "failed"; error: string; legacy_purchases?: number };

const digitsOf = (v: string | null | undefined): string | null => {
  const d = (v ?? "").replace(/\D/g, "");
  return d ? d : null;
};
const fail = (code: Exclude<Outcome, { ok: true }>["code"], error: string, extra: Record<string, unknown> = {}): Outcome =>
  ({ ok: false, code, error, ...extra }) as Outcome;
/** `_` and `%` are wildcards in ilike; a raw address as the pattern over-matches. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function updateUserContact(admin: AdminClient, actor: Actor, body: UpdateBody | null): Promise<Outcome> {
  const userId = body?.user_id;
  if (!userId) return fail("bad_request", "user_id required");
  const has = (k: keyof UpdateBody) => body != null && Object.prototype.hasOwnProperty.call(body, k);

  // ── Current state: profile + login ─────────────────────────────────────────
  const { data: prof } = await admin.from("users")
    .select("id, full_name, email, phone, bio, role").eq("id", userId).maybeSingle();
  if (!prof) return fail("not_found", "User not found");

  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const authUser = authData?.user ?? null;
  const authPhoneDigits = digitsOf(authUser?.phone);
  const authEmail: string | null = authUser?.email ?? null;
  const currentDigits = authPhoneDigits ?? digitsOf(prof.phone);
  const currentEmail: string | null =
    prof.email ?? (authEmail && !isSyntheticEmail(authEmail) ? authEmail.toLowerCase() : null);

  // ── Role gate (rule 4) ─────────────────────────────────────────────────────
  const touchesLogin = has("email") || has("phone");
  if (prof.role === "owner" && actor.role !== "owner") {
    return fail("forbidden", "Only an owner can edit an owner's account.");
  }
  if (prof.role === "admin" && actor.role !== "owner" && actor.id !== prof.id && touchesLogin) {
    return fail("forbidden", "Only an owner can change another admin's login email or phone.");
  }

  // ── Desired values, only for keys that were sent ───────────────────────────
  const nextName = has("full_name") ? (body!.full_name?.trim() || null) : prof.full_name;
  const nextBio = has("bio") ? (body!.bio?.trim() || null) : prof.bio;

  let nextEmail: string | null = currentEmail;
  if (has("email")) {
    const e = body!.email?.trim().toLowerCase() || null;
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return fail("bad_request", `"${body!.email}" is not a valid email`);
    if (e && isSyntheticEmail(e)) return fail("bad_request", "That is a placeholder address, not a real email");
    nextEmail = e;
  }

  let nextDigits: string | null = currentDigits;
  if (has("phone")) {
    const raw = body!.phone?.trim() || "";
    if (!raw) {
      if (currentDigits) return fail("bad_request", "A phone can't be removed — replace it with the student's current number instead.");
      nextDigits = null;
    } else {
      const d = resolveImportPhone(raw, body!.country_code);
      if (!d) return fail("bad_request", `"${raw}" is not a usable phone number`);
      nextDigits = d;
    }
  }

  const nameChanged = has("full_name") && (nextName ?? null) !== (prof.full_name ?? null);
  const bioChanged = has("bio") && (nextBio ?? null) !== (prof.bio ?? null);
  const emailChanged = has("email") && (nextEmail ?? null) !== (currentEmail ?? null);
  const phoneChanged = has("phone") && (nextDigits ?? null) !== (currentDigits ?? null); // rule 1

  if (!nameChanged && !bioChanged && !emailChanged && !phoneChanged) {
    return { ok: true, changed: [], user: { id: userId, full_name: prof.full_name, email: prof.email, phone: prof.phone, bio: prof.bio, role: prof.role } };
  }

  if (emailChanged && !nextEmail) {
    if (authEmail && !isSyntheticEmail(authEmail)) {
      return fail("bad_request", "An email can't be removed from a login — replace it with the student's current address instead.");
    }
  }
  if (!nextEmail && !nextDigits) return fail("bad_request", "A student needs at least an email or a phone number");

  // ── Clash checks: never steal an identity another account holds ────────────
  if (emailChanged && nextEmail) {
    const { data: clash } = await admin.from("users").select("id, full_name")
      .ilike("email", escapeLike(nextEmail)).neq("id", userId).limit(1);
    if (clash?.length) return fail("conflict", `${nextEmail} already belongs to ${clash[0].full_name || "another account"}`);
    const { data: authRows } = await admin.rpc("admin_find_auth_user", { p_email: nextEmail, p_phone: null });
    if ((authRows ?? []).some((r: { id: string }) => r.id !== userId)) {
      return fail("conflict", `${nextEmail} is already registered to another login. Merge or change that account first.`);
    }
  }
  if (phoneChanged && nextDigits) {
    // Profiles hold the number as "+91…", bare "91…", or the bare 10-digit form.
    const forms = Array.from(new Set([`+${nextDigits}`, nextDigits, last10(nextDigits)].filter(Boolean)));
    const { data: clash } = await admin.from("users").select("id, full_name")
      .in("phone", forms).neq("id", userId).limit(1);
    if (clash?.length) return fail("conflict", `+${nextDigits} already belongs to ${clash[0].full_name || "another account"}`);
    const { data: authRows } = await admin.rpc("admin_find_auth_user", { p_email: null, p_phone: nextDigits });
    if ((authRows ?? []).some((r: { id: string }) => r.id !== userId)) {
      return fail("conflict", `+${nextDigits} is already registered to another login. Merge or change that account first.`);
    }
  }

  // ── Legacy purchases on the NEW identity need an explicit yes (rule 5) ─────
  if ((emailChanged && nextEmail) || (phoneChanged && nextDigits)) {
    const ors: string[] = [];
    if (phoneChanged && nextDigits) ors.push(`phone.in.(${[`+${nextDigits}`, nextDigits, last10(nextDigits)].filter(Boolean).join(",")})`);
    if (emailChanged && nextEmail) ors.push(`email.ilike.${escapeLike(nextEmail)}`);
    const { count } = await admin.from("legacy_enrolments")
      .select("id", { count: "exact", head: true })
      .is("claimed_by_user_id", null)
      .or(ors.join(","));
    if ((count ?? 0) > 0 && !body!.confirm_legacy_claim) {
      return fail(
        "needs_confirmation",
        `This ${phoneChanged ? "number" : "email"} has ${count} TagMango purchase${count === 1 ? "" : "s"} not linked to any account yet. When ${prof.full_name || "the student"} next logs in, those purchases will be attached to their account. Save anyway?`,
        { legacy_purchases: count },
      );
    }
  }

  // ── 1. Profile first (rule 3) ──────────────────────────────────────────────
  const profilePatch: Record<string, unknown> = {};
  if (nameChanged) profilePatch.full_name = nextName;
  if (bioChanged) profilePatch.bio = nextBio;
  if (emailChanged) profilePatch.email = nextEmail;
  if (phoneChanged) profilePatch.phone = nextDigits ? `+${nextDigits}` : null;
  const revert: Record<string, unknown> = {};
  for (const k of Object.keys(profilePatch)) revert[k] = (prof as Record<string, unknown>)[k] ?? null;

  const { error: pErr } = await admin.from("users").update(profilePatch).eq("id", userId);
  if (pErr) return fail("failed", `Profile update failed: ${pErr.message}`);

  // ── 2. Login identity ──────────────────────────────────────────────────────
  const authPatch: Record<string, unknown> = {};
  if (phoneChanged && nextDigits) { authPatch.phone = nextDigits; authPatch.phone_confirm = true; }
  if (emailChanged && nextEmail) { authPatch.email = nextEmail; authPatch.email_confirm = true; }
  // A phone-only account's placeholder address encodes the OLD number; move it
  // with the phone so the legacy-recovery path can't re-bind the old number.
  if (phoneChanged && nextDigits && !authPatch.email && authEmail && isSyntheticEmail(authEmail)) {
    authPatch.email = syntheticEmail(nextDigits); authPatch.email_confirm = true;
  }
  if (nameChanged) authPatch.user_metadata = { ...(authUser?.user_metadata ?? {}), full_name: nextName };

  if (Object.keys(authPatch).length) {
    const { error: aErr } = await admin.auth.admin.updateUserById(userId, authPatch);
    if (aErr) {
      await admin.from("users").update(revert).eq("id", userId); // put the profile back
      await admin.from("admin_audit_logs").insert({
        actor_user_id: actor.id, action: "user.update_contact_failed", target_table: "users", target_id: userId,
        metadata: { via: "admin-update-user", attempted: Object.keys(profilePatch), reason: aErr.message },
      });
      const msg = /already|registered|exists|duplicate/i.test(aErr.message)
        ? `That ${phoneChanged ? "phone" : "email"} is already registered to another login. Merge or change that account first.`
        : `Login update failed, nothing was changed: ${aErr.message}`;
      return fail("failed", msg);
    }
  }

  await admin.from("admin_audit_logs").insert({
    actor_user_id: actor.id, action: "user.update_contact", target_table: "users", target_id: userId,
    metadata: {
      via: "admin-update-user",
      changed: Object.keys(profilePatch),
      from: { full_name: prof.full_name, email: prof.email, phone: prof.phone },
      to: { full_name: nextName, email: nextEmail, phone: nextDigits ? `+${nextDigits}` : null },
      legacy_claim_confirmed: !!body!.confirm_legacy_claim,
    },
  });

  return {
    ok: true,
    changed: Object.keys(profilePatch),
    user: { id: userId, full_name: nextName, email: nextEmail, phone: nextDigits ? `+${nextDigits}` : null, bio: nextBio, role: prof.role },
  };
}
