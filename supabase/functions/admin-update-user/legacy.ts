// admin-update-user, action "move_legacy": the admin's "Change number" for a
// TagMango buyer who has no account yet (founder, 3 Nov 2026). Free of Deno,
// like handler.ts, so vitest can drive it with a fake client
// (src/lib/__tests__/adminMoveLegacy.test.ts).
//
// Their purchases sit under the number TagMango holds and attach only at a
// phone sign-in with exactly that number. When that number is wrong, the buyer
// signs in with their real one and lands in an empty account. This moves the
// purchases to the right number and attaches them to an account straight
// away, so the buyer just signs in:
//
//   1. The new number already has an account (often the empty one they made):
//      attach to it, but only after the admin confirms it, since it may be
//      somebody else's.
//   2. Otherwise open one on the new number, pre-confirmed like
//      admin-grant-access does, with the buyer's TagMango name, and their email
//      when no other account holds it.
//
// Every move is written to admin_audit_logs with the old number.
import { isSyntheticEmail, last10, resolveImportPhone } from "../_shared/phone.ts";
import type { Actor, AdminClient } from "./handler.ts";

export interface MoveLegacyBody {
  action: "move_legacy";
  /** The buyer's number exactly as legacy_enrolments holds it (the Users row). */
  legacy_phone?: string;
  phone?: string;
  country_code?: string | null;
  /** Set by the UI after the admin confirms attaching to an existing account. */
  confirm_existing_account?: boolean;
}

export type MoveLegacyOutcome =
  | {
    ok: true;
    user_id: string;
    created_account: boolean;
    phone: string;
    rows: number;
    claimed: number;
    blocked: number;
  }
  | {
    ok: false;
    code: "bad_request" | "not_found" | "needs_confirmation" | "failed";
    error: string;
    account?: { id: string; full_name: string | null };
  };

const fail = (code: Exclude<MoveLegacyOutcome, { ok: true }>["code"], error: string, extra: Record<string, unknown> = {}): MoveLegacyOutcome =>
  ({ ok: false, code, error, ...extra }) as MoveLegacyOutcome;

export async function moveLegacyPurchases(admin: AdminClient, actor: Actor, body: MoveLegacyBody | null): Promise<MoveLegacyOutcome> {
  const fromPhone = body?.legacy_phone?.trim();
  if (!fromPhone) return fail("bad_request", "legacy_phone required");

  const { data: rows, error: rowsErr } = await admin.from("legacy_enrolments")
    .select("id, email, full_name, offering_id")
    .eq("phone", fromPhone)
    .is("claimed_by_user_id", null);
  if (rowsErr) return fail("failed", `Couldn't read their purchases: ${rowsErr.message}`);
  if (!rows?.length) return fail("not_found", "No TagMango purchases are waiting on that number any more.");

  const raw = body?.phone?.trim() || "";
  const digits = raw ? resolveImportPhone(raw, body?.country_code) : null;
  if (!digits) return fail("bad_request", raw ? `"${raw}" is not a usable phone number` : "Enter the student's correct number");
  const toPhone = `+${digits}`;
  if (toPhone === fromPhone) return fail("bad_request", "That is the number TagMango already has for them.");

  const pick = (k: "email" | "full_name"): string | null => {
    const v = rows.map((r: Record<string, unknown>) => r[k]).find((x: unknown) => typeof x === "string" && x.trim());
    return typeof v === "string" ? v.trim() : null;
  };
  const fullName = pick("full_name");
  const buyerEmail = pick("email")?.toLowerCase() ?? null;

  // ── Who signs in with the new number today ─────────────────────────────────
  // auth.users holds "91…" (and rarely "+91…"); profiles hold all three forms.
  const { data: authRows } = await admin.rpc("admin_find_auth_user", { p_email: null, p_phone: digits });
  let account: { id: string } | null = (authRows ?? []).find((r: { phone?: string | null }) =>
    (r.phone ?? "").replace(/\D/g, "") === digits) ?? null;
  if (!account) {
    const forms = Array.from(new Set([toPhone, digits, last10(digits)].filter(Boolean)));
    const { data: profs } = await admin.from("users").select("id").in("phone", forms).is("deleted_at", null).limit(1);
    if (profs?.length) account = { id: profs[0].id };
  }

  let userId: string;
  let created = false;
  if (account) {
    if (!body?.confirm_existing_account) {
      const { data: prof } = await admin.from("users").select("id, full_name").eq("id", account.id).maybeSingle();
      const who = prof?.full_name && prof.full_name !== "LevelUp Student" ? prof.full_name : "an account with no name yet";
      return fail(
        "needs_confirmation",
        `${toPhone} already signs in to ${who}. Attach ${rows.length} TagMango purchase${rows.length === 1 ? "" : "s"} to that account? Only say yes if it is ${fullName || "this student"}'s.`,
        { account: { id: account.id, full_name: prof?.full_name ?? null } },
      );
    }
    userId = account.id;
  } else {
    // Their TagMango email goes on only when nobody else signs in with it.
    let email: string | null = buyerEmail && !isSyntheticEmail(buyerEmail) ? buyerEmail : null;
    if (email) {
      const { data: taken } = await admin.rpc("admin_find_auth_user", { p_email: email, p_phone: null });
      if ((taken ?? []).length) email = null;
    }
    const { data: made, error: cErr } = await admin.auth.admin.createUser({
      phone: digits,
      phone_confirm: true,
      email: email ?? undefined,
      email_confirm: !!email,
      user_metadata: { full_name: fullName ?? "", provisioned_by_admin: true },
    });
    if (cErr || !made?.user) return fail("failed", `Couldn't open their account: ${cErr?.message || "unknown error"}`);
    userId = made.user.id;
    created = true;
    // handle_new_user leaves the profile phone empty for an admin-made account.
    await admin.from("users").update({ phone: toPhone }).eq("id", userId).is("phone", null);
  }

  const { data: result, error: mErr } = await admin.rpc("admin_move_legacy_purchases", {
    p_from_phone: fromPhone,
    p_to_phone: toPhone,
    p_user_id: userId,
  });
  if (mErr) return fail("failed", `Couldn't move their purchases: ${mErr.message}`);
  const r = (result ?? {}) as { rows?: number; moved?: number; claimed?: number; stamped?: number; blocked?: number };

  await admin.from("admin_audit_logs").insert({
    actor_user_id: actor.id, action: "legacy.move_number", target_table: "legacy_enrolments", target_id: userId,
    metadata: {
      via: "admin-update-user", from_phone: fromPhone, to_phone: toPhone,
      account: created ? "created" : "existing", legacy_ids: rows.map((x: { id: string }) => x.id), result: r,
    },
  });

  return {
    ok: true, user_id: userId, created_account: created, phone: toPhone,
    rows: r.rows ?? rows.length, claimed: r.claimed ?? 0, blocked: r.blocked ?? 0,
  };
}
