/**
 * reconcile-razorpay-orders — finds payments Razorpay captured on orders we
 * still read as open ("created", or "failed" by verify), and finishes them the
 * way razorpay-webhook would: the buyer's account (by phone), the capture, the
 * course, the coupon, the receipt. Runs every 15 minutes from pg_cron, and by
 * hand for a backfill.
 *
 * WHY. On 2026-10-09 the Supabase pause made Razorpay's webhook deliveries
 * fail for days and Razorpay stopped sending them. Buyers whose browser never
 * came back from their UPI app (verify never ran) paid and got no course,
 * from 2026-10-09 until this shipped. The webhook stays the fast path; this
 * makes sure it is not the only one. The rules for which order gets what live
 * in _shared/paymentRecovery.ts.
 *
 * WHAT A LIVE RUN DOES, per order Razorpay captured:
 *   - the buyer already paid for the course on another order → a second
 *     charge: parked as needs_review (refund candidate), nothing else;
 *   - otherwise one conditional UPDATE claims it (status → captured), then
 *     the course is granted (ensureCourseGranted), the coupon redeemed, and
 *     post-capture (receipt + server Purchase) started.
 * And per captured order in the window whose buyer holds no course (a run or
 * a verify that died between capture and grant): the grant is tried again.
 * Anything a person must look at is emailed to OPS_ALERT_EMAIL.
 *
 * DRY RUN BY DEFAULT. Anything but a body with `"dry_run": false` reads
 * Razorpay and our tables and writes nothing, and the answer lists what a live
 * run would do. Body: { dry_run?, lookback_hours? (72, max 1080),
 * post_capture? (true: receipt email + server Purchase, as the webhook does),
 * post_capture_orders? (ids of orders captured by hand that never had their
 * receipt; live runs only, at most 20) }.
 *
 * AUTH. The caller must present POLL_AUTH_TOKEN byte for byte (the injected
 * service-role key when that secret is unset), the same contract as
 * tally-application-poll and cohort-reentry-cron: pg_cron sends the vault
 * secret `email_queue_service_role_key`, which is not the injected
 * SUPABASE_SERVICE_ROLE_KEY on this project.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { timingSafeEqual } from "../_shared/crypto.ts";
import { canonicalBuyerPhone, resolveOrCreateBuyer } from "../_shared/buyerIdentity.ts";
import { courseGranted, ensureCourseGranted } from "../_shared/captureGrant.ts";
import { enqueueEmail, sanitizeVar } from "../_shared/email.ts";
import { schedulePostCapture } from "../_shared/postCaptureRuntime.ts";
import {
  duplicateOf,
  grantRetryable,
  isLiveRun,
  lookbackHours,
  phoneTail,
  planRecovery,
  RECOVERABLE_STATUSES,
  RECOVERY_MIN_AGE_MS,
  type HeldEnrolment,
  type OpenOrder,
  type RazorpayPayment,
  type RecoveryStep,
} from "../_shared/paymentRecovery.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POLL_AUTH_TOKEN = Deno.env.get("POLL_AUTH_TOKEN") ?? "";
const SOURCE = "reconcile-razorpay-orders";
/** Runaway guard: at most 50 pages of 100 payments per run. */
const MAX_PAGES = 50;

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** One structured log line, so this cron is greppable in the function logs. */
function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ fn: SOURCE, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Every payment Razorpay made between `from` and `to` (unix seconds). Throws when Razorpay cannot be read. */
async function fetchPayments(keyId: string, keySecret: string, from: number, to: number): Promise<RazorpayPayment[]> {
  const auth = "Basic " + btoa(`${keyId}:${keySecret}`);
  const items: RazorpayPayment[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ from: String(from), to: String(to), count: "100", skip: String(page * 100) });
    const res = await fetch(`https://api.razorpay.com/v1/payments?${q}`, { headers: { Authorization: auth } });
    if (!res.ok) throw new Error(`razorpay ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const batch: RazorpayPayment[] = Array.isArray(body?.items) ? body.items : [];
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  throw new Error(`more than ${MAX_PAGES * 100} payments in the window; narrow lookback_hours`);
}

type Order = OpenOrder & {
  user_id: string | null;
  offering_id: string;
  coupon_id: string | null;
  bump_offering_ids: string[] | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  created_at: string;
  notes: unknown;
  razorpay_payment_id?: string | null;
  captured_at?: string | null;
};

const ORDER_COLUMNS =
  "id, razorpay_order_id, razorpay_payment_id, status, total_inr, payment_type, application_id, user_id, offering_id, coupon_id, bump_offering_ids, guest_name, guest_email, guest_phone, created_at, captured_at, notes";

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Our still-open orders for these Razorpay order ids. Throws on a read error. */
async function openOrders(admin: Admin, razorpayOrderIds: string[]): Promise<Order[]> {
  const out: Order[] = [];
  for (let i = 0; i < razorpayOrderIds.length; i += 100) {
    const { data, error } = await admin
      .from("payment_orders")
      .select(ORDER_COLUMNS)
      .in("razorpay_order_id", razorpayOrderIds.slice(i, i + 100))
      .in("status", RECOVERABLE_STATUSES);
    if (error) throw new Error(`payment_orders read: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/** The buyer's active enrolment in this course and the order it came from. Throws on a read error. */
async function heldEnrolment(admin: Admin, userId: string, offeringId: string): Promise<HeldEnrolment | null> {
  const { data, error } = await admin
    .from("enrolments")
    .select("payment_order_id, source, order:payment_orders(status, razorpay_payment_id, total_inr)")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .eq("status", "active")
    .limit(1);
  if (error) throw new Error(`enrolments read: ${error.message}`);
  return Array.isArray(data) && data.length > 0 ? (data[0] as HeldEnrolment & { source?: string }) : null;
}

/** The report line for one step. Names and emails only in a dry run, which a person reads. */
function describe(step: RecoveryStep, titles: Map<string, string>, live: boolean) {
  const o = step.order as Order;
  return {
    kind: step.kind,
    payment_order_id: o.id,
    order_status: o.status,
    razorpay_order_id: o.razorpay_order_id,
    razorpay_payment_id: step.payment.id,
    paid_at: step.payment.created_at ? new Date(step.payment.created_at * 1000).toISOString() : null,
    amount_inr: (step.payment.amount ?? 0) / 100,
    order_total_inr: Number(o.total_inr),
    offering: titles.get(o.offering_id) ?? o.offering_id,
    ...(live ? {} : { name: o.guest_name, email: o.guest_email }),
    phone: phoneTail(o.guest_phone),
    signed_in_order: !!o.user_id,
    extra_captured_payments: step.kind === "capture" ? step.extraPayments.map((p) => p.id) : [],
  };
}

/** What a live run would do for the buyer: the account it lands on, and whether this is a second payment. */
async function previewBuyer(admin: Admin, o: Order) {
  let userId = o.user_id;
  if (!userId) {
    const phone = canonicalBuyerPhone(o.guest_phone);
    if (!phone) return { buyer: "no usable phone: a live run would park it as needs_review" };
    const { data, error } = await admin.rpc("find_login_identity", { p_phone: phone, p_email: null });
    if (error) return { buyer: `lookup failed: ${error.message}` };
    const row = (Array.isArray(data) ? data[0] : data) as { id?: string } | undefined;
    if (!row?.id) return { buyer: "new account on this phone" };
    userId = row.id;
  }
  try {
    const held = await heldEnrolment(admin, userId, o.offering_id);
    const dup = duplicateOf(held, o.id);
    return {
      buyer: o.user_id ? "signed-in buyer" : "existing account on this phone",
      user_id: userId,
      already_holds_course: held ? ((held as { source?: string }).source ?? true) : false,
      ...(dup ? { duplicate_of: dup, would: "park as needs_review (refund candidate)" } : {}),
    };
  } catch (e) {
    return { buyer: `lookup failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Park an open order for a person, with the payment on it. Only while it is still open. */
async function park(admin: Admin, o: Order, paymentId: string, extraNotes: Record<string, unknown> = {}) {
  const notes = o.notes && typeof o.notes === "object" && !Array.isArray(o.notes) ? (o.notes as Record<string, unknown>) : {};
  await admin
    .from("payment_orders")
    .update({ status: "needs_review", razorpay_payment_id: paymentId, notes: { ...notes, ...extraNotes } })
    .eq("id", o.id)
    .in("status", RECOVERABLE_STATUSES);
}

/** Finish one captured order the way razorpay-webhook does. Never throws. */
async function recover(admin: Admin, step: Extract<RecoveryStep, { kind: "capture" }>, postCapture: boolean) {
  const o = step.order as Order;
  const paymentId = step.payment.id;
  try {
    let userId = o.user_id;
    if (!userId) {
      const resolved = await resolveOrCreateBuyer(
        admin,
        { name: o.guest_name, email: o.guest_email, phone: o.guest_phone },
        { tag: SOURCE, paid: true },
      );
      if (!resolved.ok) {
        await park(admin, o, paymentId);
        log("error", "buyer_unresolved", { payment_order_id: o.id, error: resolved.error });
        return { result: "needs_review", reason: "buyer_unresolved" };
      }
      userId = resolved.userId;
      await admin.from("payment_orders").update({ user_id: userId }).eq("id", o.id).is("user_id", null);
    }

    // A second payment for a course the buyer already paid for is a refund
    // for a person to make, not a sale: no claim, no coupon, no receipt.
    const dup = duplicateOf(await heldEnrolment(admin, userId, o.offering_id), o.id);
    if (dup) {
      await park(admin, o, paymentId, { recovered: { source: SOURCE, at: new Date().toISOString(), duplicate_of: dup } });
      log("warn", "duplicate_payment", { payment_order_id: o.id, razorpay_payment_id: paymentId, duplicate_of: dup });
      return { result: "needs_review", reason: "refund_candidate", duplicate_of: dup };
    }

    // The same atomic claim as the webhook: one conditional UPDATE, so a
    // webhook or verify landing at the same moment cannot capture it twice.
    // captured_at is when the buyer paid, not when we noticed. If this run
    // dies after the claim, the captured-but-ungranted sweep below grants it.
    const paidAt = step.payment.created_at ? new Date(step.payment.created_at * 1000).toISOString() : new Date().toISOString();
    const notes = o.notes && typeof o.notes === "object" && !Array.isArray(o.notes) ? (o.notes as Record<string, unknown>) : {};
    const { data: claimed, error: claimErr } = await admin
      .from("payment_orders")
      .update({
        status: "captured",
        razorpay_payment_id: paymentId,
        captured_at: paidAt,
        notes: { ...notes, recovered: { source: SOURCE, at: new Date().toISOString(), from_status: o.status } },
      })
      .eq("id", o.id)
      .in("status", RECOVERABLE_STATUSES)
      .select("id");
    if (claimErr) throw claimErr;
    if (!claimed || claimed.length === 0) return { result: "skipped", reason: "captured_elsewhere" };

    const grant = await ensureCourseGranted(
      admin,
      { ...o, user_id: userId, razorpay_payment_id: paymentId },
      { source: SOURCE, razorpayPaymentId: paymentId },
    );

    // Capture-time coupon redemption, as in the webhook: the buyer keeps the
    // course either way; a failed redemption only parks the order for review.
    if (o.coupon_id) {
      const { data: redeemed, error: redeemErr } = await admin.rpc("redeem_coupon", { p_coupon_id: o.coupon_id });
      if (redeemErr || redeemed === false) {
        await admin.from("payment_orders").update({ status: "needs_review" }).eq("id", o.id);
        log("error", "coupon_redeem_failed", { payment_order_id: o.id, coupon_id: o.coupon_id });
      }
    }

    if (postCapture) schedulePostCapture(admin, o.id, { source: SOURCE });

    const course = grant.ok ? (grant.created ? "granted" : "already_held") : `not_granted:${grant.reason}`;
    log(grant.ok ? "info" : "error", "recovered", { payment_order_id: o.id, razorpay_payment_id: paymentId, user_id: userId, course });
    return { result: "captured", user_id: userId, course };
  } catch (e) {
    log("error", "recover_failed", { payment_order_id: o.id, error: e instanceof Error ? e.message : String(e) });
    return { result: "error", reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Email a person when a live run did or found something they must know about.
 * message_id is derived from what is reported, and the email worker skips a
 * message_id it already sent, so the same finding is mailed once.
 */
async function alertOps(admin: Admin, subject: string, lines: string[], key: string) {
  const to = Deno.env.get("OPS_ALERT_EMAIL") ?? "";
  if (!to) {
    log("warn", "alert_unsent", { reason: "OPS_ALERT_EMAIL unset", subject, lines: lines.length });
    return;
  }
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  const safe = lines.map((l) => sanitizeVar(l, 400));
  try {
    await enqueueEmail(admin, {
      runId: crypto.randomUUID(),
      to,
      subject: sanitizeVar(subject, 150),
      html: `<p>${safe.join("</p><p>")}</p>`,
      text: safe.join("\n"),
      label: "ops-payment-reconcile",
      idempotencyKey: `${SOURCE}:${digest}`,
      messageId: `${SOURCE}:${digest}`,
    });
  } catch (e) {
    log("error", "alert_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  // ── AUTH ──────────────────────────────────────────────────────────────────
  // An unset secret and an empty bearer both compare equal as "", so a missing
  // secret is a hard 401 before the compare, with its own event.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const expected = POLL_AUTH_TOKEN || SERVICE_KEY;
  if (!expected) {
    log("error", "auth_misconfigured", { reason: "poll_auth_token_unset" });
    return jsonRes({ error: "Unauthorized" }, 401);
  }
  if (!token || !timingSafeEqual(token, expected)) {
    log("warn", "auth_rejected", { hasAuthHeader: authHeader.length > 0, tokenLength: token.length });
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  const live = isLiveRun(body);
  const hours = lookbackHours(body?.lookback_hours);
  const postCapture = body?.post_capture !== false;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) {
    log("error", "razorpay_keys_unset", {});
    if (live) await alertOps(admin, "Payment reconciler cannot run: Razorpay keys missing", ["RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set on the edge functions."], `keys:${new Date().toISOString().slice(0, 10)}`);
    return jsonRes({ error: "Razorpay keys not configured" }, 500);
  }

  const now = Date.now();
  const to = Math.floor(now / 1000);
  const from = to - hours * 3600;

  // Read everything first: a Razorpay or database error stops the run before
  // anything is written.
  let payments: RazorpayPayment[];
  let orders: Order[];
  try {
    payments = await fetchPayments(keyId, keySecret, from, to);
    const ids = [...new Set(
      payments.filter((p) => p.order_id && (p.status === "captured" || p.status === "authorized")).map((p) => p.order_id!),
    )];
    orders = await openOrders(admin, ids);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log("error", "read_failed", { error });
    // Once a day at most: a run that cannot read is a run that recovers nothing.
    if (live) await alertOps(admin, "Payment reconciler could not read Razorpay or the database", [error], `read:${new Date().toISOString().slice(0, 10)}`);
    return jsonRes({ error }, 502);
  }

  const steps = planRecovery(orders, payments, { now });
  const offeringIds = [...new Set(orders.map((o) => o.offering_id))];
  const titles = new Map<string, string>();
  if (offeringIds.length > 0) {
    const { data } = await admin.from("offerings").select("id, title").in("id", offeringIds);
    for (const r of data ?? []) titles.set(r.id, r.title);
  }

  const items: Record<string, unknown>[] = [];
  for (const step of steps) {
    const line: Record<string, unknown> = describe(step, titles, live);
    const o = step.order as Order;
    if (!live) {
      if (step.kind === "capture") Object.assign(line, await previewBuyer(admin, o));
    } else if (step.kind === "capture") {
      Object.assign(line, await recover(admin, step, postCapture));
    } else if (step.kind === "amount_mismatch") {
      // Park it for a person, as the webhook does; the amount will never change.
      await park(admin, o, step.payment.id);
      line.result = "needs_review";
    }
    items.push(line);
  }

  // Captured orders whose buyer holds no course: a capture (here or in
  // verify) that died before its grant leaves no marker and has no Razorpay
  // redelivery behind it, so grant it here. Orders captured in the last few
  // minutes are left to the call that is still granting them.
  const retried: Record<string, unknown>[] = [];
  const { data: captured, error: capturedErr } = await admin
    .from("payment_orders")
    .select(ORDER_COLUMNS)
    .eq("status", "captured")
    .gte("created_at", new Date(from * 1000).toISOString())
    .lte("captured_at", new Date(now - RECOVERY_MIN_AGE_MS).toISOString())
    .not("razorpay_payment_id", "is", null)
    .gt("total_inr", 0)
    .is("payment_type", null)
    .is("application_id", null);
  if (capturedErr) log("error", "sweep_read_failed", { error: capturedErr.message });
  for (const o of (captured ?? []) as unknown as Order[]) {
    if (!grantRetryable(o.notes)) continue;
    try {
      if (await courseGranted(admin, o)) continue;
    } catch (e) {
      log("error", "sweep_read_failed", { payment_order_id: o.id, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (!live) {
      retried.push({ payment_order_id: o.id, result: "would_grant" });
      continue;
    }
    const grant = await ensureCourseGranted(admin, o, { source: SOURCE });
    retried.push({ payment_order_id: o.id, result: grant.ok ? "granted" : `not_granted:${grant.reason}` });
  }

  // Post-capture (receipt + server Purchase) for orders a person captured by
  // hand, named in the body. runPostCapture claims each order once and skips
  // anything not captured, not paid, or already sent, so a repeat sends nothing.
  const receiptsFor = Array.isArray(body?.post_capture_orders)
    ? (body.post_capture_orders as unknown[]).filter((id): id is string => typeof id === "string").slice(0, 20)
    : [];
  if (live) for (const id of receiptsFor) schedulePostCapture(admin, id, { source: SOURCE });

  const count = (kind: RecoveryStep["kind"]) => steps.filter((s) => s.kind === kind).length;
  const summary = {
    ok: true,
    dry_run: !live,
    lookback_hours: hours,
    razorpay_payments_seen: payments.length,
    captured_on_open_orders: count("capture"),
    amount_mismatch: count("amount_mismatch"),
    authorized_only: count("authorized_only"),
    staged_for_a_person: count("staged"),
    grant_retries: retried.length,
    post_capture_requested: live ? receiptsFor.length : 0,
  };

  if (live) {
    // One email per finding. Recoveries and parked orders change status, so
    // they are reported once; authorized/staged items stay open and are keyed
    // on their payment, so the same one is not mailed every 15 minutes.
    const lines: string[] = [];
    for (const it of items) {
      const what = it.kind === "capture" ? `${it.result}${it.course ? ` (${it.course})` : ""}${it.reason ? ` (${it.reason})` : ""}` : String(it.kind);
      lines.push(`${what}: Rs ${it.amount_inr} for ${it.offering}, order ${it.payment_order_id}, payment ${it.razorpay_payment_id}, phone ${it.phone ?? "-"}`);
    }
    for (const r of retried) lines.push(`grant retried for captured order ${r.payment_order_id}: ${r.result}`);
    if (lines.length > 0) {
      const key = items.map((it) => `${it.kind}:${it.razorpay_payment_id}:${it.result ?? ""}`).concat(retried.map((r) => `retry:${r.payment_order_id}:${r.result}`)).sort().join("|");
      await alertOps(
        admin,
        `Payment reconciler: ${summary.captured_on_open_orders} recovered, ${lines.length} item(s) to check`,
        [
          "Razorpay took these payments but neither the checkout nor the Razorpay webhook finished them. If this keeps happening, check that the webhook is Active in the Razorpay dashboard.",
          ...lines,
        ],
        key,
      );
    }
  }

  // A live recovery means verify and the webhook both missed a paid order.
  // One or two a week is mobile UPI; a steady stream means the webhook is down.
  if (live && summary.captured_on_open_orders > 0) log("warn", "webhook_missed", summary);
  else log("info", "run", summary);
  return jsonRes({ ...summary, items, retried });
});
