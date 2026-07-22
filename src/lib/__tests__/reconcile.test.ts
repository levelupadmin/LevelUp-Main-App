import { describe, it, expect } from "vitest";
import {
  amountToProduct,
  computeJoinHealth,
  deriveStage,
  joinKeys,
  offeringToProductMatch,
} from "@shared/reconcile";
import {
  BOTH_KEYS,
  FORGE_OFFERING,
  keys,
  lead,
  LIVE_OFFERING,
  offering,
  razorpayAmounts,
  razorpayNoMatch,
  razorpayUnavailable,
  tallyCompleted,
  tallyNoMatch,
  tallyPartial,
  tallyUnavailable,
  telecrmLeads,
  telecrmNoMatch,
  telecrmStatus,
  telecrmUnavailable,
} from "../../../qa-harness/reconcile-fixtures";

/**
 * RC-T3 — the proof. The PURE, OFFERING-SCOPED `deriveStage` core
 * (`@shared/reconcile`) is driven over all six `FUNNEL-DATA-AUDIT.md §6`
 * stage→CTA rows, both invisible markers (§7.2 completed-no-fee /
 * contactable-partial), the null-key orphan, the multi-application
 * no-contamination guarantee, the GST-tolerant amount match, the shared-tier
 * ambiguity, and `computeJoinHealth` — with ZERO network and no mocking.
 * Fixtures come from `qa-harness/reconcile-fixtures` by RELATIVE path (there is
 * no `@qa` alias); vitest's `src/**` include glob pulls this test in and the
 * fixture transitively. `resolvedKey` is asserted per case, because the whole
 * point of the reconciler is to record WHICH identity key (phone primary → email
 * fallback) resolved the join — an orphan is `null`.
 *
 * The mocked-fetch integration test for `index.ts`'s I/O + health-emit layer is
 * hedged as DEFERRABLE in the brief: `index.ts` imports esm.sh + `Deno.*` and is
 * not vitest-importable, so its orphan-alert side-effect is verified at the deploy
 * step. The PURE inputs that trip it (`resolvedKey: null` + `computeJoinHealth`)
 * ARE asserted below.
 */

describe("amountToProduct — §4 amount→product buckets (GST-tolerant; the amount IS the SKU)", () => {
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

  it("classifies GST-inclusive captures in the band (not an exact ===)", () => {
    expect(amountToProduct(472).kind).toBe("live-app-fee"); // ₹400 + 18% GST
    expect(amountToProduct(9440).kind).toBe("live-seat-confirm"); // ₹8,000 + 18%
    expect(amountToProduct(17700).kind).toBe("forge-seat-confirm"); // ₹15,000 + 18%
    expect(amountToProduct(826).kind).toBe("forge-app-fee"); // ₹700 + 18%
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

describe("offeringToProductMatch — code-level offering→product_1 map (no offerings column)", () => {
  it("maps Forge verticals + Live products to their product_1 codes", () => {
    expect(offeringToProductMatch({ title: "Forge Writing", slug: "forge-writing" })).toEqual(["FW"]);
    expect(offeringToProductMatch({ title: "Forge Creators", slug: "forge-creators" })).toEqual(["FC"]);
    expect(offeringToProductMatch({ title: "Forge Filmmaking", slug: "forge-film" })).toEqual(["FFM"]);
    expect(offeringToProductMatch({ title: "Forge AI", slug: "forge-ai" })).toEqual(["FAI"]);
    expect(offeringToProductMatch({ title: "Video Editing Academy", slug: "ve-academy" })).toEqual(["VE"]);
  });
  it("returns [] for an offering it cannot map (falls back to newest-overall)", () => {
    expect(offeringToProductMatch({ title: "Masterclass", slug: "masterclass" })).toEqual([]);
  });
});

describe("deriveStage — §6 stage→CTA table (all six rows, offering-scoped)", () => {
  it("row 1 — Tally partial, no completion → partial (resume application)", () => {
    const d = deriveStage(LIVE_OFFERING, tallyPartial("phone"), telecrmNoMatch(), razorpayNoMatch(), BOTH_KEYS);
    expect(d.stage).toBe("partial");
    expect(d.resolvedKey).toBe("phone");
  });

  it("row 2 — completed form, no captured ₹400 → completed-no-fee (pay the ₹400)", () => {
    const d = deriveStage(LIVE_OFFERING, tallyCompleted("phone"), telecrmNoMatch(), razorpayNoMatch(), BOTH_KEYS);
    expect(d.stage).toBe("completed-no-fee");
    expect(d.resolvedKey).toBe("phone");
    expect(d.markers.completedNoFee).toBe(true);
  });

  it("row 3 — `Application Fee Paid`, no `Interview Scheduled` → fee-paid-no-interview (book interview)", () => {
    // Fee captured in Razorpay (₹400) and TeleCRM stalled at the fee-paid status.
    const d = deriveStage(
      LIVE_OFFERING,
      tallyCompleted("phone"),
      telecrmStatus("Application Fee Paid"),
      razorpayAmounts([400], "phone"),
      BOTH_KEYS,
    );
    expect(d.stage).toBe("fee-paid-no-interview");
    expect(d.resolvedKey).toBe("phone");
    // Fee IS present, so the completed-no-fee marker must be cleared.
    expect(d.markers.completedNoFee).toBe(false);
    expect(d.ambiguous).toBe(false);
  });

  it("row 4 — `Interview completed`, not yet Converted → awaiting-decision", () => {
    const d = deriveStage(
      LIVE_OFFERING,
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
      LIVE_OFFERING,
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
      LIVE_OFFERING,
      tallyCompleted("phone"),
      telecrmStatus("Converted"),
      razorpayAmounts([400, 8000, 25785], "phone"),
      BOTH_KEYS,
    );
    expect(viaStatus.stage).toBe("enrolled");
    expect(viaStatus.resolvedKey).toBe("phone");

    // Full/balance payment ALONE (≥₹22k) enrolls even without a Converted status.
    const viaMoney = deriveStage(
      LIVE_OFFERING,
      tallyCompleted("phone"),
      telecrmNoMatch(),
      razorpayAmounts([25785], "phone"),
      BOTH_KEYS,
    );
    expect(viaMoney.stage).toBe("enrolled");
  });
});

describe("deriveStage — OFFERING-SCOPED: no cross-offering contamination (the council headline)", () => {
  // One multi-application caller, ONE CRM footprint: a Live (VE) lead at
  // `Application Fee Paid` with a captured ₹400, and a Forge (FC) lead at `Lost`.
  const crm = telecrmLeads([
    lead("Application Fee Paid", { product1: "VE", timestamp: 2000 }),
    lead("Lost", { product1: "FC", timestamp: 3000 }),
  ]);
  const money = razorpayAmounts([400], "phone"); // the shared Live ₹400

  it("deriveStage(Live) sees the Live lead → fee-paid-no-interview", () => {
    const d = deriveStage(LIVE_OFFERING, tallyNoMatch(), crm, money, BOTH_KEYS);
    expect(d.stage).toBe("fee-paid-no-interview");
    expect(d.telecrmStatus).toBe("Application Fee Paid");
    expect(d.ambiguous).toBe(false);
  });

  it("deriveStage(Forge) sees ONLY the Forge lead → never the Live fee-paid stage", () => {
    const d = deriveStage(FORGE_OFFERING, tallyNoMatch(), crm, money, BOTH_KEYS);
    // The Forge lead is `Lost` and the ₹400 does NOT fall in Forge's ₹700 band,
    // so the Live stage/money can never bleed onto the Forge application.
    expect(d.stage).not.toBe("fee-paid-no-interview");
    expect(d.stage).toBe("unknown");
    expect(d.telecrmStatus).toBe("Lost");
  });

  it("the newest-overall lead (Forge `Lost`) does NOT override the scoped Live stage", () => {
    // Without offering-scoping, newest-wins would pick the Forge `Lost` lead for
    // BOTH — proving the scope is what protects the Live application.
    const live = deriveStage(LIVE_OFFERING, tallyNoMatch(), crm, money, BOTH_KEYS);
    expect(live.telecrmStatus).toBe("Application Fee Paid");
  });
});

describe("deriveStage — GST-tolerant offering-scoped money match + shared-tier ambiguity", () => {
  it("matches a GST-inclusive ₹472 against the offering's ₹400 app fee (not missed)", () => {
    const d = deriveStage(
      LIVE_OFFERING,
      tallyCompleted("phone"),
      telecrmStatus("Application Fee Paid"), // confirms attribution of the shared fee
      razorpayAmounts([472], "phone"),
      BOTH_KEYS,
    );
    expect(d.stage).toBe("fee-paid-no-interview");
    expect(d.markers.completedNoFee).toBe(false);
    expect(d.ambiguous).toBe(false);
  });

  it("a lone shared ₹400 with NO confirming product_1 lead is ambiguous, not fee-paid", () => {
    const d = deriveStage(LIVE_OFFERING, tallyNoMatch(), telecrmNoMatch(), razorpayAmounts([400], "phone"), BOTH_KEYS);
    expect(d.ambiguous).toBe(true);
    expect(d.stage).not.toBe("fee-paid-no-interview");
  });

  it("a confirming product_1 lead disambiguates the shared ₹400 → fee-paid", () => {
    const d = deriveStage(
      LIVE_OFFERING,
      tallyNoMatch(),
      telecrmStatus("Application Fee Paid"),
      razorpayAmounts([400], "phone"),
      BOTH_KEYS,
    );
    expect(d.ambiguous).toBe(false);
    expect(d.stage).toBe("fee-paid-no-interview");
  });

  it("a first-party (payment_orders) row disambiguates the shared ₹400 → fee-paid", () => {
    const d = deriveStage(
      LIVE_OFFERING,
      tallyNoMatch(),
      telecrmNoMatch(),
      razorpayAmounts([400], "phone", { firstPartyConfirmed: true }),
      BOTH_KEYS,
    );
    expect(d.ambiguous).toBe(false);
    expect(d.stage).toBe("fee-paid-no-interview");
  });

  it("a product-distinct Forge ₹700 app fee needs no confirmation (not shared-tier)", () => {
    const d = deriveStage(FORGE_OFFERING, tallyNoMatch(), telecrmNoMatch(), razorpayAmounts([700], "phone"), BOTH_KEYS);
    expect(d.ambiguous).toBe(false);
    expect(d.stage).toBe("fee-paid-no-interview");
  });
});

describe("deriveStage — §7.2 markers (invisible in cohort_applications.status today)", () => {
  it("completed-no-fee fires for essay-present + no ₹400 (the warmest recoverable lead)", () => {
    const d = deriveStage(LIVE_OFFERING, tallyCompleted("phone"), telecrmNoMatch(), razorpayNoMatch(), BOTH_KEYS);
    expect(d.markers.completedNoFee).toBe(true);
    expect(d.markers.contactablePartial).toBe(false);
  });

  it("completed-no-fee CLEARS the moment a ₹400 is captured (and attributed)", () => {
    const d = deriveStage(
      LIVE_OFFERING,
      tallyCompleted("phone"),
      telecrmStatus("Application Fee Paid"),
      razorpayAmounts([400], "phone"),
      BOTH_KEYS,
    );
    expect(d.markers.completedNoFee).toBe(false);
  });

  it("does NOT flag completed-no-fee when an ambiguous ₹400 might already be theirs", () => {
    // Essay present + a shared ₹400 that can't be attributed to THIS offering (no
    // confirming product_1 lead, no first-party row). We saw a possibly-matching
    // payment, so the outreach marker stays OFF (never queue a possibly-paid caller
    // for the fee chase) and `ambiguous` is surfaced for the client to soften the
    // CTA. The money is never mis-credited — the stage is still completed-no-fee —
    // but the mirror never asserts the fee is unpaid over a match we saw.
    const d = deriveStage(
      LIVE_OFFERING,
      tallyCompleted("phone"),
      telecrmNoMatch(),
      razorpayAmounts([400], "phone"),
      BOTH_KEYS,
    );
    expect(d.ambiguous).toBe(true);
    expect(d.markers.completedNoFee).toBe(false);
  });

  it("contactable-partial fires for a phone+email partial with no completion", () => {
    const d = deriveStage(LIVE_OFFERING, tallyPartial("phone"), telecrmNoMatch(), razorpayNoMatch(), BOTH_KEYS);
    expect(d.markers.contactablePartial).toBe(true);
    expect(d.stage).toBe("partial");
  });

  it("contactable-partial does NOT fire on a phone-only partial (needs BOTH channels)", () => {
    const phoneOnly = keys("+919788385577", null);
    const d = deriveStage(LIVE_OFFERING, tallyPartial("phone"), telecrmNoMatch(), razorpayNoMatch(), phoneOnly);
    expect(d.markers.contactablePartial).toBe(false);
    expect(d.stage).toBe("partial");
  });
});

describe("deriveStage — resolvedKey records the resolving channel (phone → email fallback)", () => {
  it("resolves on email when the match came off the email fallback", () => {
    const d = deriveStage(
      LIVE_OFFERING,
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
      LIVE_OFFERING,
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
    const d = deriveStage(LIVE_OFFERING, tallyNoMatch(), telecrmNoMatch(), razorpayNoMatch(), BOTH_KEYS);
    expect(d.stage).toBe("unknown");
    expect(d.resolvedKey).toBeNull();
  });

  it("a structurally keyless caller with every source unavailable is an orphan, not an error", () => {
    const d = deriveStage(
      LIVE_OFFERING,
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

describe("computeJoinHealth — total outage is NOT an orphan; a resolved-nothing caller IS", () => {
  it("every source unavailable → complete (not assessable), orphan false, quiet", () => {
    const h = computeJoinHealth(tallyUnavailable(), telecrmUnavailable(), razorpayUnavailable());
    expect(h.orphan).toBe(false);
    expect(h.joinCompleteness).toBe(1);
    expect(h.orphanRate).toBe(0);
    expect(h.sourcesAvailable).toBe(0);
  });

  it("a reachable source but no match → orphan, above the watch line", () => {
    const h = computeJoinHealth(tallyNoMatch(), telecrmNoMatch(), razorpayNoMatch());
    expect(h.orphan).toBe(true);
    expect(h.joinCompleteness).toBe(0);
    expect(h.orphanRate).toBe(1);
    expect(h.orphanRate).toBeGreaterThan(0.1); // ORPHAN_WATCH_LINE
    expect(h.sourcesAvailable).toBe(3);
    expect(h.sourcesResolved).toBe(0);
  });

  it("a resolved caller → complete, orphan false", () => {
    const h = computeJoinHealth(tallyCompleted("phone"), telecrmStatus("NEW"), razorpayNoMatch());
    expect(h.resolved).toBe(true);
    expect(h.orphan).toBe(false);
    expect(h.joinCompleteness).toBe(1);
    expect(h.sourcesResolved).toBeGreaterThanOrEqual(1);
  });

  it("scopes join health independent of the offering context (source-level metric)", () => {
    // Uses an ad-hoc offering to prove computeJoinHealth reads the source reads,
    // not the derivation — a resolved TeleCRM lead counts even for an offering the
    // lead's product_1 doesn't match.
    const off = offering({ productMatch: ["FAI"] });
    const d = deriveStage(off, tallyNoMatch(), telecrmStatus("NEW", { product1: "VE" }), razorpayNoMatch(), BOTH_KEYS);
    // The VE lead doesn't match FAI → no scoped stage for this offering.
    expect(d.telecrmStatus).toBeNull();
    expect(d.resolvedKey).toBeNull();
    // But the source DID resolve the person, so health is PERSON-LEVEL: resolved,
    // NOT an orphan. Health must never contradict `sourcesResolved` — a caller who
    // resolves to a source but not to this offering is not an orphan (would inflate
    // the aggregate surge alert).
    const h = computeJoinHealth(tallyNoMatch(), telecrmStatus("NEW", { product1: "VE" }), razorpayNoMatch());
    expect(h.sourcesResolved).toBe(1);
    expect(h.resolved).toBe(true);
    expect(h.orphan).toBe(false);
  });
});
