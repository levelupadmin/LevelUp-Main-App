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
};

type EnrolmentRow = { id: string; status: string | null };

/**
 * Enrolments in this order's course that belong to this order or its buyer, in
 * any status. Throws when the read fails.
 */
async function courseEnrolments(admin: Admin, po: CapturedOrder): Promise<EnrolmentRow[]> {
  const base = admin.from("enrolments").select("id, status").eq("offering_id", po.offering_id);
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

export type GrantResult =
  | { ok: true; created: boolean }
  | {
      ok: false;
      /**
       *   read_failed / insert_failed  a database error; trying again can work
       *   taken_away  the course was granted and later revoked or cancelled
       *   no_user     the order has no buyer to grant it to
       */
      reason: "read_failed" | "insert_failed" | "taken_away" | "no_user";
    };

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
  let rows: EnrolmentRow[];
  try {
    rows = await courseEnrolments(admin, po);
  } catch (e) {
    console.error(tag, "enrolment read failed", e);
    return { ok: false, reason: "read_failed" };
  }
  if (rows.some((r) => r.status === "active")) return { ok: true, created: false };

  // A row that is no longer active was taken away on purpose (an admin revoke,
  // a refund). This path needs no fresh payment proof, so granting it again
  // here would quietly undo that. A person decides.
  if (rows.length > 0) {
    console.error(tag, `course enrolment is ${rows[0].status}; not granting it again`);
    return { ok: false, reason: "taken_away" };
  }
  if (!po.user_id) {
    console.error(tag, "no buyer on the order; cannot grant the course");
    return { ok: false, reason: "no_user" };
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
      if (existing?.id) return { ok: true, created: false };
      console.error(tag, "enrolment unique violation but no active row on re-select");
    } else {
      console.error(tag, "enrolment insert failed", enrolErr);
    }
    return { ok: false, reason: "insert_failed" };
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
  return { ok: true, created: true };
}
