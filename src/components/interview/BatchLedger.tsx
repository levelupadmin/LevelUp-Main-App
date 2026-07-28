import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useMotionSafe } from "@/lib/motion";

/**
 * One REVIEW batch's outcome counts — the ledger row's entire input.
 *
 * A review batch is an APPLICATION WINDOW with interview/admit counts
 * (`03-DATA-MODEL-ERD.md` §6.4). It is NOT the delivery batch in
 * `cohort_batches`, which groups already-enrolled students and carries only
 * `offering_id, name, max_students, created_at` — no window, no close time and
 * no admit count. The two are different objects with a confusingly similar
 * name, and deriving this row from that table is the specific mistake §6.4
 * calls out.
 */
export interface ReviewBatchCounts {
  /** The batch's own label, e.g. "Batch 12". Rendered verbatim. */
  label: string;
  /**
   * Applications received in the window. OPTIONAL because the copy deck's line
   * (`CD-05-PREP-05`) shows interviewed + admitted only: a source that has two
   * of the three numbers renders the two it has rather than inventing a third.
   */
  applications?: number | null;
  /** Applicants interviewed in the window. */
  interviewed: number;
  /** Applicants admitted out of those interviews. */
  admitted: number;
}

/** A count we are willing to print: a real, whole, non-negative number. */
function isRealCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Is this payload something a person could defend on a phone call
 * (`07-COPY-DECK.md` §2.4's number rule)?
 *
 * Presence is not enough. A source can be reachable and still hand back a shape
 * that cannot be true — more admitted than interviewed, more interviewed than
 * applications — and printing it would put a number on the screen that the
 * admissions team would have to disown. An impossible ledger is treated exactly
 * like an absent one: the row hides. Exported for its own unit tests.
 */
export function isRenderableBatch(
  batch: ReviewBatchCounts | null | undefined,
): batch is ReviewBatchCounts {
  if (!batch || typeof batch.label !== "string" || batch.label.trim().length === 0) {
    return false;
  }
  if (!isRealCount(batch.interviewed) || !isRealCount(batch.admitted)) return false;
  // A ledger nobody appears in is not honest FOMO, it is a bug wearing a
  // number. Hide it and let the source catch up.
  if (batch.interviewed < 1) return false;
  if (batch.admitted > batch.interviewed) return false;
  // `applications` is optional, but a PRESENT value still has to be coherent —
  // a malformed third number hides the whole row rather than just itself, so
  // the row is never a mix of one checked number and one unchecked one.
  if (batch.applications != null) {
    if (!isRealCount(batch.applications)) return false;
    if (batch.interviewed > batch.applications) return false;
  }
  return true;
}

export interface BatchLedgerProps {
  /**
   * The review batch to render, from a REAL aggregate source. `null` /
   * `undefined` — the shape every caller in this repo can supply today — hides
   * the row entirely. See the component docblock.
   */
  batch?: ReviewBatchCounts | null;
  className?: string;
}

/**
 * BatchLedger — REQ-INT-3's honest-FOMO row: what recent review batches
 * actually did ("Batch 12 · 41 interviewed · 11 admitted").
 *
 * ── THE ROW HIDES TODAY, BECAUSE THE SOURCE DOES NOT EXIST YET ──
 *
 * REQ-INT-3's own data-source note says these numbers have no app writer, and
 * the trace confirms it end to end in this repo:
 *
 *   • `cohort_batches` (migration `20260410140000`) is the DELIVERY batch:
 *     `id, offering_id, name, max_students, created_at`. No window, no close
 *     time, no interview count, no admit count. `03-DATA-MODEL-ERD.md` §6.4
 *     names deriving the ledger from it as the mistake to avoid.
 *   • `review_batches` — the table that WOULD hold this — is listed as
 *     🟥 NEW (optional) in §6.4 and does not exist in any migration.
 *   • The reconciler exposes no aggregate. `reconcile-funnel-stage` reads
 *     TeleCRM with a per-caller `/lead/search` and answers with
 *     `{stage, resolvedKey, markers, telecrmStatus, amounts, ambiguous,
 *     mirrored, joinCompleteness, health, sources}` — a single applicant's
 *     stage, never a count over a window.
 *   • A client-side count is impossible by RLS anyway:
 *     `students_read_own_applications` scopes `cohort_applications` SELECT to
 *     `user_id = auth.uid()`, so an applicant counting rows counts themselves.
 *     The admin aggregates (`offering_performance_in_range`) are enrolment and
 *     revenue counts behind `public.is_admin()`, not interview outcomes.
 *   • `04-INTEGRATION-CONTRACTS.md` §5.2 adds the standing instruction while
 *     the money-stage split is unresolved: the interview-ledger row hides
 *     rather than invents numbers.
 *
 * So the component keeps the render path for real counts and supplies none of
 * its own: no fallback figures, no zeroes standing in for an unreachable
 * source, no "typical" batch. Absent source → `null`, and the surrounding
 * surface closes over the gap. Zeroing is the failure mode the requirement
 * names — a zeroed ledger reads as a real, catastrophic batch.
 *
 * (Contrast the selectivity line in `InterviewerCard`, which has no input prop
 * at all. The asymmetry is deliberate: a batch count is a fact about a cohort
 * that a future aggregate can hand over intact, whereas a selectivity figure is
 * a claim attributed to a named person, so it gets no code path until its
 * source ships with it.)
 *
 * One batch per instance, which is what `CD-05-PREP-05` shows. A list of recent
 * batches is the same component repeated, so the honesty check runs per row
 * instead of once for a whole array.
 */
export const BatchLedger = ({ batch, className }: BatchLedgerProps) => {
  const m = useMotionSafe();

  // The only decision this component makes: real numbers, or nothing at all.
  if (!isRenderableBatch(batch)) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: m.reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={m.springs.glide}
      aria-label="Recent review batch"
      className={cn("rounded-xl border border-border bg-surface p-4", className)}
    >
      <p className="text-sm font-medium text-foreground">Recent review batch</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {batch.label}
        {batch.applications != null ? ` · ${batch.applications} applied` : ""}
        {` · ${batch.interviewed} interviewed · ${batch.admitted} admitted`}
      </p>
    </motion.section>
  );
};

export default BatchLedger;
