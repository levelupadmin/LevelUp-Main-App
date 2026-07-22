import { describe, it, expect } from "vitest";
import { amountToProduct, deriveStage, joinKeys } from "@shared/reconcile";
import {
  BOTH_KEYS,
  keys,
  razorpayAmounts,
  razorpayNoMatch,
  razorpayUnavailable,
  tallyCompleted,
  tallyNoMatch,
  tallyPartial,
  tallyUnavailable,
  telecrmNoMatch,
  telecrmStatus,
  telecrmUnavailable,
} from "../../../qa-harness/reconcile-fixtures";

/**
 * RC-T3 — the proof. The PURE `deriveStage` core (`@shared/reconcile`) is driven
 * over all six `FUNNEL-DATA-AUDIT.md §6` stage→CTA rows, both invisible markers
 * (§7.2 completed-no-fee / contactable-partial), and the null-key orphan — with
 * ZERO network and no mocking. Fixtures come from `qa-harness/reconcile-fixtures`
 * by RELATIVE path (there is no `@qa` alias); vitest's `src/**` include glob pulls
 * this test in and the fixture transitively. `resolvedKey` is asserted per case,
 * because the whole point of the reconciler is to record WHICH identity key
 * (phone primary → email fallback) resolved the join — an orphan is `null`.
 *
 * The mocked-fetch integration test for `index.ts`'s I/O + health-emit layer is
 * hedged as DEFERRABLE in the brief (§3): `index.ts` imports esm.sh + `Deno.*`
 * and is not vitest-importable, so its join-completeness/orphan-alert branch is
 * verified at the deploy step, not here. The orphan derivation that TRIPS that
 * alert IS asserted below (`resolvedKey: null`, stage `unknown`) — the input the
 * alert keys off is pinned even though the log side-effect isn't unit-run.
 */

describe("amountToProduct — §4 amount→product buckets (the amount IS the SKU)", () => {
  it("classifies the tabled app-fee / seat-confirm / balance amounts", () => {
    expect(amountToProduct(400).kind).toBe("live-app-fee");
    expect(amountToProduct(400).isAppFee).toBe(true);
    expect(amountToProduct(700).kind).toBe("forge-app-fee");
    expect(amountToProduct(700).isAppFee).toBe(true);
    expect(amountToProduct(8000).kind).toBe("live-seat-confirm");
    expect(amountToProduct(8000).isSeatConfirm).toBe(true);
    expect(amountToProduct(15000).kind).toBe("forge-seat-confirm");
    expect(amountToProduct(15000).isSeatConfirm).toBe(true);
    expect(amountToProduct(25785).kind).toBe("balance-or-full");
    expect(amountToProduct(25785).isBalanceOrFull).toBe(true);
  });

  it("retains the raw amount and never promotes an unknown bucket", () => {
    const odd = amountToProduct(1234);
    expect(odd.kind).toBe("unknown");
    expect(odd.amountInr).toBe(1234);
    expect(odd.isAppFee).toBe(false);
    expect(amountToProduct(0).kind).toBe("unknown");
    expect(amountToProduct(-1).kind).toBe("unknown");
  });
});

describe("joinKeys — last-10 phone + lowercased email", () => {
  it("normalizes both channels", () => {
    expect(joinKeys({ phone: "+91 97883 85577", email: " Aspirant@Example.com " })).toEqual({
      phone: "9788385577",
      email: "aspirant@example.com",
    });
  });
  it("nulls a channel that carries no usable value", () => {
    expect(joinKeys({ phone: "123", email: "" })).toEqual({ phone: null, email: null });
  });
});

describe("deriveStage — §6 stage→CTA table (all six rows)", () => {
  it("row 1 — Tally partial, no completion → partial (resume application)", () => {
    const d = deriveStage(tallyPartial("phone"), telecrmNoMatch(), razorpayNoMatch(), BOTH_KEYS);
    expect(d.stage).toBe("partial");
    expect(d.resolvedKey).toBe("phone");
  });

  it("row 2 — completed form, no captured ₹400 → completed-no-fee (pay the ₹400)", () => {
    const d = deriveStage(tallyCompleted("phone"), telecrmNoMatch(), razorpayNoMatch(), BOTH_KEYS);
    expect(d.stage).toBe("completed-no-fee");
    expect(d.resolvedKey).toBe("phone");
    expect(d.markers.completedNoFee).toBe(true);
  });

  it("row 3 — `Application Fee Paid`, no `Interview Scheduled` → fee-paid-no-interview (book interview)", () => {
    // Fee captured in Razorpay (₹400) and TeleCRM stalled at the fee-paid status.
    const d = deriveStage(
      tallyCompleted("phone"),
      telecrmStatus("Application Fee Paid"),
      razorpayAmounts([400], "phone"),
      BOTH_KEYS,
    );
    expect(d.stage).toBe("fee-paid-no-interview");
    expect(d.resolvedKey).toBe("phone");
    // Fee IS present, so the completed-no-fee marker must be cleared.
    expect(d.markers.completedNoFee).toBe(false);
  });

  it("row 4 — `Interview completed`, not yet Converted → awaiting-decision", () => {
    const d = deriveStage(
      tallyCompleted("phone"),
      telecrmStatus("Interview completed"),
      razorpayAmounts([400], "phone"),
      BOTH_KEYS,
    );
    expect(d.stage).toBe("awaiting-decision");
    expect(d.resolvedKey).toBe("phone");
  });

  it("row 5 — ₹8k confirm paid, balance unpaid → confirm-paid-no-balance (pay balance)", () => {
    const d = deriveStage(
      tallyCompleted("phone"),
      telecrmStatus("Accepted"),
      razorpayAmounts([400, 8000], "phone"),
      BOTH_KEYS,
    );
    expect(d.stage).toBe("confirm-paid-no-balance");
    expect(d.resolvedKey).toBe("phone");
  });

  it("row 6 — `Converted` / full payment → enrolled", () => {
    const viaStatus = deriveStage(
      tallyCompleted("phone"),
      telecrmStatus("Converted"),
      razorpayAmounts([400, 8000, 25785], "phone"),
      BOTH_KEYS,
    );
    expect(viaStatus.stage).toBe("enrolled");
    expect(viaStatus.resolvedKey).toBe("phone");

    // Full/balance payment ALONE (≥₹22k) enrolls even without a Converted status.
    const viaMoney = deriveStage(
      tallyCompleted("phone"),
      telecrmNoMatch(),
      razorpayAmounts([25785], "phone"),
      BOTH_KEYS,
    );
    expect(viaMoney.stage).toBe("enrolled");
  });
});

describe("deriveStage — §7.2 markers (invisible in cohort_applications.status today)", () => {
  it("completed-no-fee fires for essay-present + no ₹400 (the warmest recoverable lead)", () => {
    const d = deriveStage(tallyCompleted("phone"), telecrmNoMatch(), razorpayNoMatch(), BOTH_KEYS);
    expect(d.markers.completedNoFee).toBe(true);
    expect(d.markers.contactablePartial).toBe(false);
  });

  it("completed-no-fee CLEARS the moment a ₹400 is captured", () => {
    const d = deriveStage(
      tallyCompleted("phone"),
      telecrmNoMatch(),
      razorpayAmounts([400], "phone"),
      BOTH_KEYS,
    );
    expect(d.markers.completedNoFee).toBe(false);
  });

  it("contactable-partial fires for a phone+email partial with no completion", () => {
    const d = deriveStage(tallyPartial("phone"), telecrmNoMatch(), razorpayNoMatch(), BOTH_KEYS);
    expect(d.markers.contactablePartial).toBe(true);
    expect(d.stage).toBe("partial");
  });

  it("contactable-partial does NOT fire on a phone-only partial (needs BOTH channels)", () => {
    const phoneOnly = keys("+919788385577", null);
    const d = deriveStage(tallyPartial("phone"), telecrmNoMatch(), razorpayNoMatch(), phoneOnly);
    expect(d.markers.contactablePartial).toBe(false);
    expect(d.stage).toBe("partial");
  });
});

describe("deriveStage — resolvedKey records the resolving channel (phone → email fallback)", () => {
  it("resolves on email when the match came off the email fallback", () => {
    const d = deriveStage(
      tallyCompleted("email"),
      telecrmStatus("Interview completed", { resolvedKey: "email" }),
      razorpayNoMatch(),
      BOTH_KEYS,
    );
    expect(d.resolvedKey).toBe("email");
    expect(d.stage).toBe("awaiting-decision");
  });

  it("prefers phone when phone resolved on any reachable source", () => {
    const d = deriveStage(
      tallyCompleted("email"),
      telecrmStatus("Interview completed", { resolvedKey: "phone" }),
      razorpayNoMatch(),
      BOTH_KEYS,
    );
    expect(d.resolvedKey).toBe("phone");
  });
});

describe("deriveStage — the null-key orphan (the alert-tripping input, §health)", () => {
  it("matches NOTHING in any reachable system → stage unknown, resolvedKey null", () => {
    const d = deriveStage(tallyNoMatch(), telecrmNoMatch(), razorpayNoMatch(), BOTH_KEYS);
    expect(d.stage).toBe("unknown");
    expect(d.resolvedKey).toBeNull();
  });

  it("a structurally keyless caller with every source unavailable is an orphan, not an error", () => {
    const d = deriveStage(
      tallyUnavailable(),
      telecrmUnavailable(),
      razorpayUnavailable(),
      keys(null, null),
    );
    expect(d.stage).toBe("unknown");
    expect(d.resolvedKey).toBeNull();
    // An orphan is surfaced by the health metric, never thrown.
    expect(d.markers.completedNoFee).toBe(false);
    expect(d.markers.contactablePartial).toBe(false);
  });
});
