/**
 * The course behind a single-payment order that is already marked captured.
 *
 * Captured is not the same as granted. verify-razorpay-payment writes status
 * "captured" before it inserts the enrolment, and an insert error then answers
 * 500. Every later call used to read "captured" as done: verify and the webhook
 * answered success and started the receipt and the server Purchase, and the
 * checkout's status check told the buyer "Welcome", while nothing ever granted
 * the course.
 *
 * So the already-captured returns of verify-razorpay-payment and
 * razorpay-webhook call `ensureCourseGranted` before they report success or
 * start post-capture, and the checkout's status check asks `courseGranted`.
 * Staged cohort payments (payment_type / application_id set) never come here:
 * the callers leave that pipeline as it was.
 *
 * A grant this file refuses (the course was taken away, the order has no
 * buyer, a read or insert failed) is written on the order as
 * notes.grant_issue = { reason, source, at }, so a person can find every paid
 * order that holds no course. A later grant that works marks it resolved.
 *
 * Free of URL imports so vitest can run it.
 */

// The service-role client, kept loose so a test double fits.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export type CapturedOrder = {
  id: string;
  user_id: string | null;
  offering_id: string;
  total_inr: number | string | null;
  application_id?: string | null;
  bump_offering_ids?: string[] | null;
  razorpay_payment_id?: string | null;
  /** The order's notes; read for an earlier notes.grant_issue. */
  notes?: unknown;
};

type EnrolmentRow = { id: string; status: string | null; payment_order_id: string | null };

/** Did money move on this order: a Razorpay payment id and a total above 0? A free order has neither. */
export function paidOrder(po: { razorpay_payment_id?: string | null; total_inr?: number | string | null }): boolean {
  return typeof po.razorpay_payment_id === "string" && po.razorpay_payment_id.trim() !== "" && Number(po.total_inr) > 0;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
}

/**
 * Enrolments in this order's course that belong to this order or its buyer, in
 * any status. Throws when the read fails.
 */
async function courseEnrolments(admin: Admin, po: CapturedOrder): Promise<EnrolmentRow[]> {
  const base = admin.from("enrolments").select("id, status, payment_order_id").eq("offering_id", po.offering_id);
  const { data, error } = await (po.user_id
    ? base.or(`payment_order_id.eq.${po.id},user_id.eq.${po.user_id}`)
    : base.eq("payment_order_id", po.id));
  if (error) throw new Error(`enrolments read: ${error.message ?? String(error)}`);
  return Array.isArray(data) ? (data as EnrolmentRow[]) : [];
}

/** Does the buyer hold this order's course now? Read-only. Throws when it cannot tell. */
export async function courseGranted(admin: Admin, po: CapturedOrder): Promise<boolean> {
  return (await courseEnrolments(admin, po)).some((r) => r.status === "active");
}

export type GrantReason = "read_failed" | "insert_failed" | "taken_away" | "no_user";

export type GrantResult =
  | { ok: true; created: boolean }
  | {
      ok: false;
      /**
       *   read_failed / insert_failed  a database error; trying again can work
       *   taken_away  this order's course was granted and later revoked or cancelled
       *   no_user     the order has no buyer to grant it to
       */
      reason: GrantReason;
      /** Is notes.grant_issue on the order now? False when that write failed too. */
      recorded: boolean;
    };

/**
 * Read, change and write back the order's notes. post-capture claims the
 * order by writing notes.post_capture with the same kind of whole-object
 * write, so when the read found no claim, this write lands only while there
 * still is none; a claim made in between makes it read again. `change`
 * returns null when there is nothing to write. Returns false when the write
 * did not land; throws on a database error.
 */
async function updateNotes(
  admin: Admin,
  orderId: string,
  change: (notes: Record<string, unknown>) => Record<string, unknown> | null,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin.from("payment_orders").select("notes").eq("id", orderId).maybeSingle();
    if (error || !data) throw error ?? new Error("order not found");
    const notes = asObject(data.notes);
    const next = change({ ...notes });
    if (!next) return true;
    let write = admin.from("payment_orders").update({ notes: next }).eq("id", orderId);
    if (!notes.post_capture) write = write.is("notes->>post_capture", null);
    const { data: hit, error: writeErr } = await write.select("id");
    if (writeErr) throw writeErr;
    if (Array.isArray(hit) && hit.length > 0) return true;
  }
  return false;
}

/**
 * Write a refused grant on the order as notes.grant_issue, where a person can
 * find it. Once per reason: a Razorpay retry or another status check finds it
 * there and writes nothing. Returns whether the marker is on the order.
 */
async function recordGrantIssue(admin: Admin, po: CapturedOrder, reason: GrantReason, source: string): Promise<boolean> {
  try {
    const done = await updateNotes(admin, po.id, (notes) => {
      const prev = asObject(notes.grant_issue);
      if (prev.reason === reason && !prev.resolved_at) return null;
      return { ...notes, grant_issue: { reason, source, at: new Date().toISOString() } };
    });
    if (!done) throw new Error("the write did not land");
    console.error(`[grant-issue] order ${po.id}: course not granted (${reason}); on notes.grant_issue`);
    return true;
  } catch (e) {
    console.error(`[grant-issue] order ${po.id}: course not granted (${reason}), and notes.grant_issue could not be written`, e);
    return false;
  }
}

/** Mark an open notes.grant_issue resolved once the buyer holds the course. Best-effort. */
async function resolveGrantIssue(admin: Admin, po: CapturedOrder, source: string): Promise<void> {
  const known = asObject(asObject(po.notes).grant_issue);
  if (!known.reason || known.resolved_at) return;
  try {
    await updateNotes(admin, po.id, (notes) => {
      const issue = asObject(notes.grant_issue);
      if (!issue.reason || issue.resolved_at) return null;
      return { ...notes, grant_issue: { ...issue, resolved_at: new Date().toISOString(), resolved_by: source } };
    });
  } catch (e) {
    console.warn(`[grant-issue] order ${po.id}: could not mark notes.grant_issue resolved`, e);
  }
}

/**
 * Make sure the buyer of a captured single-payment order holds its course,
 * with the same idempotent insert the capture paths use: the partial unique
 * index enrolments_unique_active turns a concurrent grant into a 23505, which
 * counts as granted once the winner's row is found.
 */
export async function ensureCourseGranted(
  admin: Admin,
  po: CapturedOrder,
  opts: { source: string; razorpayPaymentId?: string | null },
): Promise<GrantResult> {
  const tag = `[${opts.source}] captured order ${po.id}:`;
  const refuse = async (reason: GrantReason): Promise<GrantResult> => ({
    ok: false,
    reason,
    recorded: await recordGrantIssue(admin, po, reason, opts.source),
  });
  const granted = async (created: boolean): Promise<GrantResult> => {
    await resolveGrantIssue(admin, po, opts.source);
    return { ok: true, created };
  };

  let rows: EnrolmentRow[];
  try {
    rows = await courseEnrolments(admin, po);
  } catch (e) {
    console.error(tag, "enrolment read failed", e);
    return refuse("read_failed");
  }
  // The buyer holds the course, from this order or another one.
  if (rows.some((r) => r.status === "active")) return granted(false);

  // This order's own enrolment, no longer active, was taken away on purpose
  // (an admin revoke, a refund). This path needs no fresh payment proof, so
  // granting it again here would quietly undo that. A person decides.
  // The buyer's rows from other orders do not block: a refund or an expiry
  // ends that order, and buying again is allowed (enrolments_unique_active
  // counts only active rows). Free orders never come here: verify answers
  // them from the row before this step, and the webhook only sees orders
  // Razorpay signed a payment for.
  const blocking = rows.filter((r) => r.payment_order_id === po.id);
  if (blocking.length > 0) {
    console.error(tag, `course enrolment is ${blocking[0].status}; not granting it again`);
    return refuse("taken_away");
  }
  if (!po.user_id) {
    console.error(tag, "no buyer on the order; cannot grant the course");
    return refuse("no_user");
  }

  const { data: enrolment, error: enrolErr } = await admin
    .from("enrolments")
    .insert({
      user_id: po.user_id,
      offering_id: po.offering_id,
      payment_order_id: po.id,
      status: "active",
      source: "checkout",
      application_id: po.application_id || null,
      total_paid_inr: Number(po.total_inr),
    })
    .select("id")
    .single();

  if (!enrolment) {
    if (enrolErr?.code === "23505") {
      const { data: existing } = await admin
        .from("enrolments")
        .select("id")
        .eq("user_id", po.user_id)
        .eq("offering_id", po.offering_id)
        .eq("status", "active")
        .maybeSingle();
      if (existing?.id) return granted(false);
      console.error(tag, "enrolment unique violation but no active row on re-select");
    } else {
      console.error(tag, "enrolment insert failed", enrolErr);
    }
    return refuse("insert_failed");
  }

  console.log(tag, "granted the course that capture had not", { enrolment_id: enrolment.id });
  try {
    await admin.from("enrolment_audit_log").insert({
      enrolment_id: enrolment.id,
      action: "granted",
      actor_user_id: po.user_id,
      metadata: {
        payment_order_id: po.id,
        razorpay_payment_id: po.razorpay_payment_id ?? opts.razorpayPaymentId ?? null,
        total_inr: po.total_inr,
        payment_type: "full",
        source: `${opts.source}:already_captured`,
      },
    });
    // The capture path enrols bumps right after the main course, so they were
    // skipped too. Same insert, a 23505 means the row is there.
    for (const bumpId of Array.isArray(po.bump_offering_ids) ? po.bump_offering_ids : []) {
      const { error: bumpErr } = await admin.from("enrolments").insert({
        user_id: po.user_id,
        offering_id: bumpId,
        payment_order_id: po.id,
        status: "active",
        source: "checkout",
      });
      if (bumpErr && bumpErr.code !== "23505") console.error(tag, "bump enrolment insert failed", bumpErr);
    }
  } catch (e) {
    console.error(tag, "audit log or bump enrolment failed", e);
  }
  return granted(true);
}
