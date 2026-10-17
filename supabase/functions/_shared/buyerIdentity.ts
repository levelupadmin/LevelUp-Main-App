/**
 * Buyer identity for guest checkout — ONE rule, used by every function that
 * turns a paid (or free) guest order into an account + enrolment:
 *
 *     THE PHONE IS THE IDENTITY. The typed email is a receipt address.
 *
 * Why this file exists (2026-09-09 incident): `razorpay-webhook` and
 * `verify-razorpay-payment` looked the buyer up with
 * `GET /auth/v1/admin/users?email=…`. GoTrue ignores that filter and returns
 * the newest signups, so `users[0]` was whoever had registered last. Every
 * guest purchase since 26 May (19/19, ₹40k) was credited to a stranger, whose
 * profile was then overwritten with the buyer's name/email/phone. The same
 * broken `?phone=` filter had already been removed from the login path; this
 * module removes the email twin and makes the lookup identical to login's:
 * the `find_login_identity` RPC over auth.users, keyed on the last 10 digits.
 *
 * Rules:
 *   1. Phone match in auth.users → that account, UNTOUCHED. Nothing typed on an
 *      unauthenticated form is ever written onto someone else's profile or
 *      login (name, email or phone) — that would let anyone redirect a
 *      stranger's receipts or plant a login on their account.
 *   2. No phone match → create a NEW account bound to the phone
 *      (`phone_confirm: true`, so phone-OTP login lands on it). The auth email
 *      is ALWAYS the synthetic placeholder (see `syntheticEmail`): the typed
 *      email is unverified, and binding it as a confirmed login on an
 *      unverified phone would let a ₹999 purchase plant a permanent second
 *      login in the account the real phone owner inherits at their first OTP.
 *      The typed email is kept on public.users only (admin display), and only
 *      for PAID captures; receipts already go to the order's guest_email.
 *   3. An account that matches ONLY by email (no phone on it, or a different
 *      phone) is never adopted. Adopting it would let anyone with the email
 *      hijack a phone, and the buyer logs in by phone anyway.
 *
 * No session is minted from payment proof; the buyer proves the phone with
 * one OTP on /login (prefilled) and lands on the Thank-you page.
 *
 * Dependency-light: the admin client is structurally typed so vitest can drive
 * it with a scripted fake; only `./phone.ts` is imported.
 */

import { e164, normalizePhone, syntheticEmail } from "./phone.ts";

export type BuyerInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type BuyerOptions = {
  /** Log prefix, e.g. "verify" | "razorpay-webhook". */
  tag: string;
  /**
   * True only when money has moved (verify / webhook capture). Only then is the
   * typed email placed on the NEW account's profile (for admin display). On an
   * unpaid, unauthenticated call (₹0 guest order) nothing typed persists beyond
   * the placeholder account itself, so a stranger's future phone-OTP login
   * cannot inherit an attacker-chosen contact address.
   */
  paid: boolean;
};

export type BuyerResolution =
  | {
      ok: true;
      userId: string;
      created: boolean;
      matchedBy: "phone" | "email" | "created";
      /** The auth email a session can be minted against (may be synthetic). */
      loginEmail: string | null;
    }
  | { ok: false; error: string };

type RpcResult = { data: unknown; error: { message: string } | null };
type CreateUserResult = {
  data: { user: { id: string; email?: string | null } | null } | null;
  error: { message: string; code?: string; status?: number } | null;
};

/** Structural subset of the supabase-js service-role client we use. */
export type BuyerAdmin = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
  auth: {
    admin: {
      createUser: (attrs: Record<string, unknown>) => PromiseLike<CreateUserResult>;
    };
  };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Canonical "+<cc><number>" for anything a checkout form may have sent, or null. */
export function canonicalBuyerPhone(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (s.startsWith("+")) {
    const digits = s.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  const national = normalizePhone(s); // 10 digits, or 12 starting with 91
  if (national) return `+91${national}`;
  const digits = s.replace(/^0+/, "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? e164(digits) : null;
}

export function cleanBuyerEmail(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  return s && EMAIL_RE.test(s) ? s : null;
}

async function findIdentity(
  admin: BuyerAdmin,
  phone: string | null,
  email: string | null,
): Promise<{ id: string; email: string | null; phone: string | null } | null> {
  const { data, error } = await admin.rpc("find_login_identity", { p_phone: phone, p_email: email });
  if (error) throw new Error(`find_login_identity: ${error.message}`);
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const row = rows[0] as { id?: string; email?: string | null; phone?: string | null } | undefined;
  return row?.id ? { id: row.id, email: row.email ?? null, phone: row.phone ?? null } : null;
}

async function emailUsedByOtherProfile(admin: BuyerAdmin, email: string, userId: string): Promise<boolean> {
  const { data } = await admin.from("users").select("id").eq("email", email).neq("id", userId).limit(1);
  return Array.isArray(data) && data.length > 0;
}

export async function resolveOrCreateBuyer(
  admin: BuyerAdmin,
  input: BuyerInput,
  opts: BuyerOptions,
): Promise<BuyerResolution> {
  const phone = canonicalBuyerPhone(input.phone);
  const email = cleanBuyerEmail(input.email);
  const name = (input.name ?? "").trim() || null;
  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(`[${opts.tag}] buyerIdentity: ${msg}`, extra ? JSON.stringify(extra) : "");

  if (!phone && !email) return { ok: false, error: "guest order has neither a usable phone nor email" };

  try {
    // 1. Phone is the identity.
    if (phone) {
      const byPhone = await findIdentity(admin, phone, null);
      if (byPhone) {
        log("matched existing account by phone", { user_id: byPhone.id });
        return { ok: true, userId: byPhone.id, created: false, matchedBy: "phone", loginEmail: byPhone.email };
      }
    }

    // 2. No phone at all (legacy/odd orders only): fall back to an email match.
    if (!phone && email) {
      const byEmail = await findIdentity(admin, null, email);
      if (byEmail) {
        log("matched existing account by email (no phone on order)", { user_id: byEmail.id });
        return { ok: true, userId: byEmail.id, created: false, matchedBy: "email", loginEmail: byEmail.email };
      }
    }

    // 3. Create a new account bound to the phone. Auth email is ALWAYS the
    //    synthetic placeholder (rule 2); the typed email goes on the profile.
    if (!phone) return { ok: false, error: "cannot create an account without a phone" };
    const res = await admin.auth.admin.createUser({
      email: syntheticEmail(phone),
      email_confirm: true,
      phone: phone.replace(/^\+/, ""), // GoTrue stores bare digits
      phone_confirm: true,
      user_metadata: { full_name: name ?? "LevelUp Student", phone },
    });
    if (res.error || !res.data?.user?.id) {
      // Race: razorpay-webhook and verify-razorpay-payment both run for the
      // same order within seconds. If the other side created the account
      // between our lookup and our createUser, GoTrue rejects the duplicate
      // phone — re-run the phone lookup once and attach to that account.
      const raced = await findIdentity(admin, phone, null);
      if (raced) {
        log("createUser lost a race; attached to the account created concurrently", { user_id: raced.id });
        return { ok: true, userId: raced.id, created: false, matchedBy: "phone", loginEmail: raced.email };
      }
      return { ok: false, error: `createUser failed: ${res.error?.message ?? "no user returned"}` };
    }
    const userId = res.data.user.id;

    // The on_auth_user_created trigger mirrors placeholder email/phone/name into
    // public.users. Put the typed email on the PROFILE (never on auth) for
    // receipts/display, unless another profile already carries it.
    if (opts.paid && email && !(await emailUsedByOtherProfile(admin, email, userId))) {
      await admin.from("users").update({ email }).eq("id", userId);
    }
    log("created account", { user_id: userId, has_phone: true });
    return { ok: true, userId, created: true, matchedBy: "created", loginEmail: syntheticEmail(phone) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
