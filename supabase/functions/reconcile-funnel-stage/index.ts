/**
 * reconcile-funnel-stage — the app's first first-party read of a logged-in
 * user's funnel stage (REQ-RECON-1, `04-INTEGRATION-CONTRACTS.md` §7).
 *
 * Flow: authenticate the caller (user-scoped JWT), read their phone + email,
 * REQUIRE an `offering_id` (every real caller has an application context), load
 * that offering's amount bands + code-level `product_1` map, then READ the three
 * external systems the app can query — Tally, TeleCRM, Razorpay — keyed on phone
 * (primary) → email (fallback). The pure, OFFERING-SCOPED `deriveStage`
 * (`_shared/reconcile.ts`) turns those reads into the §6 stage + the two invisible
 * markers FOR THAT OFFERING, mirrored onto the app-owned `cohort_applications`
 * columns via a service-role client.
 *
 * THE THREE INVIOLABLE RULES (a violation is a failed task):
 *   1. Read-only against externals (SOR-1). ZERO POST/PUT/PATCH to Tally /
 *      TeleCRM / Razorpay. Only GETs (and the documented TeleCRM lead/search
 *      POST, which is a READ). The only write is the app-owned mirror; this fn
 *      NEVER writes `cohort_applications.status` and NEVER writes `accepted`.
 *   2. Fail-soft per source. An unreachable system or an unset secret marks
 *      that source `available: false` — the stage is derived from whatever is
 *      reachable; a stage is NEVER fabricated from a missing source.
 *   3. Secrets by name only. Every credential is read via `Deno.env.get(name)`;
 *      nothing is inlined.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeadersFor } from "../_shared/cors.ts";
import { last10, normalizePhone } from "../_shared/phone.ts";
import {
  amountToProduct,
  computeJoinHealth,
  deriveStage,
  joinKeys,
  offeringToProductMatch,
  TERMINAL_NEGATIVE_STATUSES,
  type OfferingContext,
  type ProductInfo,
  type RazorpayRead,
  type ResolvedKey,
  type TallyRead,
  type TeleCrmLead,
  type TeleCrmRead,
} from "../_shared/reconcile.ts";

// The concrete generic shape of a Supabase client differs between a bare
// `ReturnType<typeof createClient>` (schema params default to `never`) and what
// `createClient(url, key)` actually returns (`"public"`), so annotating a helper
// with the former rejects the real client. The service-role helpers below only
// touch `.from()`, so a permissive client type keeps the annotation honest —
// same precedent as `_shared/email.ts`. Types only; erased at runtime.
// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TELECRM_BASE = "https://next.telecrm.in/autoupdate/v2";
const RAZORPAY_BASE = "https://api.razorpay.com/v1";
const TALLY_BASE = "https://api.tally.so";

// Razorpay `/payments` has NO server-side contact/email filter — matching is
// client-side — and returns at most 100 rows/page, newest-first. At LevelUp's
// volume a given user's payment is almost never inside the newest 100 global
// rows, so we must PAGE (`count` + `skip`) and accumulate before matching, or a
// paid user regresses to an earlier stage. Bounded scan: newest
// PAGE_SIZE * MAX_PAGES payments. A payment older than that window won't match —
// an accepted fail-soft limit, never a fabricated stage. Now that derivation is
// offering-scoped, the scan STOPS EARLY once a captured in-band amount for THIS
// offering resolves the caller, bounding the login-adjacent external cost.
const RAZORPAY_PAGE_SIZE = 100;
const RAZORPAY_MAX_PAGES = 20;

// Tally submissions are paged the same way Razorpay is (page-based, 1-indexed) —
// an un-paged Tally read would under-report the exact class of older applicant
// the Razorpay paging exists to catch. Bounded: newest PAGE_SIZE * MAX_PAGES
// submissions per form.
const TALLY_PAGE_SIZE = 100;
const TALLY_MAX_PAGES = 20;

// Join-completeness watch line (§health / RC-T3). A logged-in caller who resolves
// to NO reachable external system is an orphan — an application the app can't tie
// back to a funnel record. A per-caller orphan is a WARN (UUID-free) — an
// individual orphan is expected (~10% never join cleanly) and error-logging one
// per caller, with the user UUID, floods the drain and fatigues the alert. Only a
// genuine AGGREGATE surge over the watch line, across a warm instance's runs,
// escalates to `error`.
const ORPHAN_WATCH_LINE = 0.1;
// Don't escalate to an aggregate `error` until a meaningful sample has accrued,
// so a cold instance's first orphan can't trip the surge alert on a 1/1 rate.
const ORPHAN_MIN_SAMPLE = 25;

// Per-instance rolling orphan counters (reset on cold start). These measure the
// TRUE population rate across callers — the metric the per-run binary can't.
let reconRuns = 0;
let reconOrphans = 0;

// Per-user+offering short-TTL cache. A warm instance serving repeated logins for
// the same caller returns the last computed body instead of re-scanning the
// shared external quota. Bounded in size so it can't grow unbounded on a
// long-lived instance.
const RECON_CACHE_TTL_MS = 30_000;
const RECON_CACHE_MAX = 500;
const reconCache = new Map<string, { at: number; body: Record<string, unknown> }>();

function cacheGet(key: string): Record<string, unknown> | null {
  const hit = reconCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > RECON_CACHE_TTL_MS) {
    reconCache.delete(key);
    return null;
  }
  return hit.body;
}
function cacheSet(key: string, body: Record<string, unknown>): void {
  if (reconCache.size >= RECON_CACHE_MAX) {
    // Evict the oldest inserted entry (Map preserves insertion order).
    const oldest = reconCache.keys().next().value;
    if (oldest !== undefined) reconCache.delete(oldest);
  }
  reconCache.set(key, { at: Date.now(), body });
}

/** A source that couldn't be reached / whose secret was unset — contributes no signal. */
const TALLY_UNAVAILABLE: TallyRead = {
  available: false,
  resolvedKey: null,
  completed: false,
  partial: false,
  essayPresent: false,
  furthestQuestion: null,
};
const TELECRM_UNAVAILABLE: TeleCrmRead = {
  available: false,
  resolvedKey: null,
  leads: [],
};
const RAZORPAY_UNAVAILABLE: RazorpayRead = {
  available: false,
  resolvedKey: null,
  products: [],
};

function jsonRes(body: unknown, req: Request, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

function encodeBasic(user: string, pass: string): string {
  return btoa(`${user}:${pass}`);
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Does a payment/lead's contact string match the caller's phone (last-10) or email? */
function matchesPhone(candidate: unknown, phone: string | null): boolean {
  if (!phone) return false;
  return last10(String(candidate ?? "")) === phone;
}
function matchesEmail(candidate: unknown, email: string | null): boolean {
  if (!email) return false;
  return String(candidate ?? "").trim().toLowerCase() === email;
}

/**
 * TeleCRM read — the funnel-status master (§5). `POST /enterprise/{id}/lead/search`
 * is a READ (search), phone first then email. Returns ALL matched leads (a
 * multi-application caller has several, one per `product_1`); the offering-scoped
 * `deriveStage` selects the lead for the target offering — the filtering is
 * centralized in the pure core so the no-contamination guarantee is unit-testable
 * rather than split across the un-testable I/O layer. Each lead carries its
 * `fields.product_1` (§84/§193). Fail-soft: missing secrets or any non-ok
 * response yields `available: false`.
 */
async function readTeleCrm(
  keys: { phone: string | null; email: string | null },
): Promise<TeleCrmRead> {
  const apiKey = Deno.env.get("TELECRM_API_KEY");
  const enterpriseId = Deno.env.get("TELECRM_ENTERPRISE_ID");
  if (!apiKey || !enterpriseId) return TELECRM_UNAVAILABLE;

  const search = async (
    field: "phone" | "email_1",
    value: string,
  ): Promise<Record<string, unknown>[] | null> => {
    try {
      const res = await fetch(
        `${TELECRM_BASE}/enterprise/${enterpriseId}/lead/search`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fields: { [field]: value } }),
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      // Tolerate both `{ leads: [...] }` and a bare array shape.
      const leads = Array.isArray(data)
        ? data
        : Array.isArray(data?.leads)
          ? data.leads
          : Array.isArray(data?.data)
            ? data.data
            : [];
      return leads as Record<string, unknown>[];
    } catch {
      return null; // unreachable → treat as no match for this attempt
    }
  };

  // Phone first, then email — record which key resolved each lead.
  let resolvedKey: ResolvedKey = null;
  let raw: Record<string, unknown>[] | null = null;

  if (keys.phone) {
    raw = await search("phone", keys.phone);
    if (raw && raw.length > 0) resolvedKey = "phone";
  }
  if ((!raw || raw.length === 0) && keys.email) {
    const byEmail = await search("email_1", keys.email);
    if (byEmail && byEmail.length > 0) {
      raw = byEmail;
      resolvedKey = "email";
    }
  }

  // `null` from BOTH attempts means the endpoint was unreachable → unavailable.
  // An empty array means reachable-but-no-match → available with no leads.
  if (raw === null) return TELECRM_UNAVAILABLE;
  if (raw.length === 0) return { available: true, resolvedKey: null, leads: [] };

  const leads: TeleCrmLead[] = raw.map((lead) => {
    const fields = (lead.fields ?? {}) as Record<string, unknown>;
    const status = lead.status != null ? String(lead.status) : null;
    const product1 = fields.product_1 != null ? String(fields.product_1) : null;
    const mqlRaw = fields.mql;
    const mql = typeof mqlRaw === "number" ? mqlRaw : mqlRaw != null ? Number(mqlRaw) : null;
    const essay = fields.essay;
    const charCount = fields.character_count;
    const essayPresent =
      (typeof essay === "string" && essay.trim().length > 0) ||
      (typeof charCount === "number" && charCount > 0) ||
      (charCount != null && Number(charCount) > 0);
    return {
      resolvedKey,
      product1,
      status,
      mql: Number.isFinite(mql as number) ? (mql as number) : null,
      essayPresent,
      timestamp: leadTimestamp(lead),
    };
  });

  return { available: true, resolvedKey, leads };
}

/** Best-effort recency for a lead, from common TeleCRM timestamp fields. */
function leadTimestamp(lead: Record<string, unknown>): number {
  const candidate =
    lead.updatedOn ?? lead.updated_on ?? lead.createdOn ?? lead.created_on ?? lead.updatedAt ?? lead.createdAt;
  const t = new Date(String(candidate ?? "")).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Razorpay read — the PRIMARY money signal (INTEG-PAY-1). The live ₹400/₹8k run
 * on hardcoded Razorpay links carrying no app id (0/199, `FUNNEL-DATA-AUDIT.md`
 * §2), so `payment_orders` is dormant for the live funnel and CANNOT be primary;
 * this external `/payments` scan is. `GET /payments`, HTTP Basic, PAGED (`count` +
 * `skip`, newest-first). The endpoint has no per-contact filter, so we accumulate
 * a bounded window and match client-side by phone (`contact` / `notes.phone`)
 * first, email second. Only `captured` / `authorized` advance a stage.
 *
 * `offering` bounds the cost: once a captured in-band amount for THIS offering has
 * matched the caller, the scan stops early (the caller is resolved; further pages
 * can't change the offering-scoped stage). Fail-soft: missing secrets, or the
 * FIRST page unreachable → `available: false`; a mid-scan hiccup keeps the pages
 * already gathered (best-effort, never a fabricated stage).
 */
async function readRazorpay(
  keys: { phone: string | null; email: string | null },
  offering: OfferingContext,
): Promise<RazorpayRead> {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return RAZORPAY_UNAVAILABLE;

  const notesOf = (p: Record<string, unknown>) => (p.notes ?? {}) as Record<string, unknown>;
  const matchesCaller = (p: Record<string, unknown>): ResolvedKey => {
    if (keys.phone && (matchesPhone(p.contact, keys.phone) || matchesPhone(notesOf(p).phone, keys.phone))) {
      return "phone";
    }
    if (keys.email && (matchesEmail(p.email, keys.email) || matchesEmail(notesOf(p).email, keys.email))) {
      return "email";
    }
    return null;
  };
  // An amount in one of THIS offering's own bands (GST-tolerant), used for the
  // early-stop: once we have a captured in-band amount for the caller, more pages
  // cannot change the offering-scoped result. Balance/full is scoped to THIS
  // offering's OWN floor (council B2), not a global `≥₹22k` — so an unrelated large
  // capture for another product does not short-circuit the scan.
  const inOfferingBand = (rupees: number): boolean => {
    const atOrAboveBalanceFloor =
      offering.balanceFloorInr != null &&
      offering.balanceFloorInr > 0 &&
      rupees >= offering.balanceFloorInr * 0.98;
    return (
      atOrAboveBalanceFloor ||
      bandHit(rupees, offering.appFeeInr) ||
      bandHit(rupees, offering.confirmationAmountInr)
    );
  };

  const seen = new Set<string>(); // dedup by payment.id (§4.5)
  const phoneProducts: ProductInfo[] = [];
  const emailProducts: ProductInfo[] = [];
  let sawOfferingBandForPhone = false;

  for (let page = 0; page < RAZORPAY_MAX_PAGES; page++) {
    let items: Record<string, unknown>[] | null = null;
    try {
      const res = await fetch(
        `${RAZORPAY_BASE}/payments?count=${RAZORPAY_PAGE_SIZE}&skip=${page * RAZORPAY_PAGE_SIZE}`,
        {
          method: "GET",
          headers: { Authorization: `Basic ${encodeBasic(keyId, keySecret)}` },
        },
      );
      if (res.ok) {
        const data = await res.json();
        items = Array.isArray(data?.items) ? data.items : [];
      }
    } catch {
      items = null; // unreachable this page
    }
    // First page unreachable → the source is unavailable. A later page failing
    // stops the scan but keeps the pages we already have (fail-soft).
    if (items === null) {
      if (page === 0) return RAZORPAY_UNAVAILABLE;
      break;
    }
    for (const p of items) {
      const paymentStatus = String(p.status ?? "");
      if (paymentStatus !== "captured" && paymentStatus !== "authorized") continue;
      const who = matchesCaller(p);
      if (who === null) continue;
      const id = String(p.id ?? "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const rupees = Math.round(Number(p.amount ?? 0) / 100);
      const info = amountToProduct(rupees);
      if (who === "phone") {
        phoneProducts.push(info);
        if (inOfferingBand(rupees)) sawOfferingBandForPhone = true;
      } else {
        emailProducts.push(info);
      }
    }
    // Early stop: a captured in-band amount for THIS offering resolved the caller
    // on the primary (phone) channel — further pages can't change the result.
    if (sawOfferingBandForPhone) break;
    if (items.length < RAZORPAY_PAGE_SIZE) break; // last page reached
  }

  // Phone is primary; fall back to email only when phone matched nothing.
  if (phoneProducts.length > 0) {
    return { available: true, resolvedKey: "phone", products: phoneProducts };
  }
  if (emailProducts.length > 0) {
    return { available: true, resolvedKey: "email", products: emailProducts };
  }
  return { available: true, resolvedKey: null, products: [] };
}

/** GST-tolerant band check mirroring `_shared/reconcile.ts` (a captured amount ≈ an expected SKU). */
function bandHit(amount: number, expected: number | null): boolean {
  const e = Number(expected);
  if (!Number.isFinite(e) || e <= 0) return false;
  return amount >= e * 0.98 && amount <= e * 1.18 + 1;
}

/**
 * payment_orders SUPPLEMENTARY lookup (INTEG-PAY-1). The app-owned staged-payment
 * path is DORMANT for the live funnel (0/199) — so this is NOT the primary money
 * signal — but a first-party captured order keyed on `user_id` + `offering_id` is
 * an UNAMBIGUOUS, offering-scoped attribution when it exists (rare today,
 * future-proof). It short-circuits the shared-tier ambiguity: the reconciler can
 * attribute the shared ₹400/₹8k to this offering with certainty. Read-only.
 */
async function readPaymentOrders(
  admin: Admin,
  userId: string,
  offering: OfferingContext,
): Promise<{ products: ProductInfo[]; confirmed: boolean }> {
  try {
    const { data } = await admin
      .from("payment_orders")
      .select("payment_type, total_inr, captured_at, status")
      .eq("user_id", userId)
      .eq("offering_id", offering.offeringId)
      .not("captured_at", "is", null)
      .in("status", ["captured", "paid"]);
    const rows = (data ?? []) as { payment_type: string | null; total_inr: number | null }[];
    if (rows.length === 0) return { products: [], confirmed: false };
    // Map the app-owned payment_type to the offering's expected amount so it
    // band-matches downstream exactly like an external capture would.
    const products: ProductInfo[] = [];
    for (const r of rows) {
      const type = String(r.payment_type ?? "");
      const expected =
        type === "app_fee"
          ? offering.appFeeInr
          : type === "confirmation"
            ? offering.confirmationAmountInr
            : numOrNull(r.total_inr);
      const rupees = numOrNull(r.total_inr) ?? expected;
      if (rupees != null && rupees > 0) products.push(amountToProduct(Math.round(rupees)));
    }
    return { products, confirmed: products.length > 0 };
  } catch {
    return { products: [], confirmed: false };
  }
}

/**
 * Tally read — completed vs partial submissions + the resume signal (§3.3/§7.1).
 * The staged offerings' `tally_form_url`s give the form IDs to query; each form's
 * submissions are scanned (PAGED, like Razorpay) for the caller's phone/email.
 * Read-only GETs. Fail-soft: unset `TALLY_API_KEY` (or no reachable form) →
 * `available: false`.
 */
async function readTally(
  keys: { phone: string | null; email: string | null },
  admin: Admin,
): Promise<TallyRead> {
  const apiKey = Deno.env.get("TALLY_API_KEY");
  if (!apiKey) return TALLY_UNAVAILABLE;

  // Which forms to scan — the staged offerings' Tally forms.
  const { data: offerings } = await admin
    .from("offerings")
    .select("tally_form_url")
    .eq("payment_mode", "staged")
    .not("tally_form_url", "is", null);

  const formIds = Array.from(
    new Set(
      (offerings ?? [])
        .map((o: { tally_form_url: string | null }) => extractTallyFormId(o.tally_form_url))
        .filter((id): id is string => !!id),
    ),
  );
  if (formIds.length === 0) return TALLY_UNAVAILABLE;

  let reachedAny = false;
  let resolvedKey: ResolvedKey = null;
  let completed = false;
  let partial = false;
  let essayPresent = false;
  let furthestQuestion: number | null = null;

  for (const formId of formIds) {
    let reachedForm = false;
    // Page the form's submissions (1-indexed `page`), bounded like Razorpay, so an
    // older applicant outside the newest page is not silently under-reported.
    for (let page = 1; page <= TALLY_MAX_PAGES; page++) {
      let submissions: Record<string, unknown>[] | null = null;
      try {
        const res = await fetch(
          `${TALLY_BASE}/forms/${formId}/submissions?page=${page}&limit=${TALLY_PAGE_SIZE}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${apiKey}` },
          },
        );
        if (res.ok) {
          const data = await res.json();
          submissions = Array.isArray(data?.submissions)
            ? data.submissions
            : Array.isArray(data)
              ? data
              : [];
        }
      } catch {
        submissions = null;
      }
      if (submissions === null) break; // this form/page unreachable — move on
      reachedForm = true;
      reachedAny = true;

      for (const sub of submissions) {
        const answers = Array.isArray(sub.responses)
          ? (sub.responses as Record<string, unknown>[])
          : Array.isArray(sub.answers)
            ? (sub.answers as Record<string, unknown>[])
            : [];
        const match = submissionMatchKey(answers, keys);
        if (!match) continue;
        if (resolvedKey === null || (resolvedKey === "email" && match === "phone")) {
          resolvedKey = match;
        }
        const isCompleted = sub.isCompleted === true || sub.completed === true;
        if (isCompleted) completed = true;
        else partial = true;
        if (submissionHasEssay(answers)) essayPresent = true;
        const reached = Number(sub.furthestQuestionIndex ?? sub.questionsAnswered ?? NaN);
        if (Number.isFinite(reached)) {
          furthestQuestion = Math.max(furthestQuestion ?? 0, reached);
        }
      }
      if (submissions.length < TALLY_PAGE_SIZE) break; // last page for this form
    }
    void reachedForm;
  }

  if (!reachedAny) return TALLY_UNAVAILABLE;
  return { available: true, resolvedKey, completed, partial, essayPresent, furthestQuestion };
}

/** Pull the Tally form id out of a stored `tally_form_url` (…/forms/{id}… or …/r/{id}). */
function extractTallyFormId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:forms|r)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Does a submission's answers contain the caller's phone (first) or email (second)? */
function submissionMatchKey(
  answers: Record<string, unknown>[],
  keys: { phone: string | null; email: string | null },
): ResolvedKey {
  const values = answers.map((a) => String(a.value ?? a.answer ?? ""));
  if (keys.phone && values.some((v) => last10(v) === keys.phone)) return "phone";
  if (keys.email && values.some((v) => v.trim().toLowerCase() === keys.email)) return "email";
  return null;
}

/** Heuristic: a completed application has a long free-text answer (the essay, §3.3). */
function submissionHasEssay(answers: Record<string, unknown>[]): boolean {
  return answers.some((a) => {
    const v = a.value ?? a.answer;
    return typeof v === "string" && v.trim().length >= 40;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "No auth" }, req, 401);

    // `offering_id` is REQUIRED: every real caller has an application context and
    // the derivation is offering-scoped (a global stage stamped on every sibling
    // application is the council's headline defect). Absent/blank → 400.
    let offeringId: string | null = null;
    try {
      const body = await req.json();
      const rawId = body?.offering_id ?? body?.offeringId;
      offeringId = typeof rawId === "string" && rawId.trim() ? rawId.trim() : null;
    } catch {
      offeringId = null;
    }
    if (!offeringId) return jsonRes({ error: "offering_id is required" }, req, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // User-scoped client: authenticate the caller (JWT from the Authorization header).
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return jsonRes({ error: "Invalid token" }, req, 401);

    // Per-user+offering short-TTL cache — bound the shared external quota against
    // a caller that reloads repeatedly (login-adjacent).
    const cacheKey = `${user.id}:${offeringId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return jsonRes({ ...cached, cached: true }, req);

    // Service-role client — used ONLY to read offerings / payment_orders and to
    // write the app-owned mirror. It NEVER writes `status` and NEVER writes `accepted`.
    const admin = createClient(supabaseUrl, serviceKey);

    // Load the target offering: its OWN amount bands + a code-level product_1 map
    // (offerings has no product_1 column; the map is built in `_shared/reconcile`).
    const { data: offeringRow } = await admin
      .from("offerings")
      .select("id, slug, title, type, app_fee_inr, confirmation_amount_inr, price_inr")
      .eq("id", offeringId)
      .maybeSingle();
    if (!offeringRow) return jsonRes({ error: "Unknown offering" }, req, 404);
    const appFeeInr = numOrNull(offeringRow.app_fee_inr);
    const confirmationAmountInr = numOrNull(offeringRow.confirmation_amount_inr);
    const priceInr = numOrNull(offeringRow.price_inr);
    // THIS offering's OWN balance/full floor (council B2): what the caller still
    // owes after app-fee + seat-confirm. A capture at/above it is a balance/full
    // payment FOR THIS OFFERING — replacing the old global `≥₹22k` threshold, so an
    // unrelated ≥₹22k for a pricier product can't force a false `enrolled`. `null`
    // when the offering carries no `price_inr` (or no amount bands) — then money
    // alone never infers `enrolled` (the safe default).
    const balanceFloorInr =
      priceInr != null && appFeeInr != null && confirmationAmountInr != null
        ? Math.max(0, priceInr - appFeeInr - confirmationAmountInr)
        : null;
    const offering: OfferingContext = {
      offeringId,
      appFeeInr,
      confirmationAmountInr,
      balanceFloorInr,
      productMatch: offeringToProductMatch(offeringRow as {
        slug?: string | null;
        title?: string | null;
        type?: string | null;
      }),
    };

    // Read the caller's phone + email. Prefer the app `users` row, fall back to
    // the auth identity, so a phone-only (synthetic-email) account still joins.
    let phone: string | null = user.phone ?? null;
    let email: string | null = user.email ?? null;
    try {
      const { data: profile } = await admin
        .from("users")
        .select("phone, email")
        .eq("id", user.id)
        .maybeSingle();
      if (profile) {
        phone = (profile.phone as string) ?? phone;
        email = (profile.email as string) ?? email;
      }
    } catch {
      // profile lookup best-effort — the auth identity is the fallback join key.
    }
    // Normalize the raw phone into last-10 for the join (defensive; joinKeys re-normalizes).
    const normPhone = phone ? normalizePhone(phone) ?? phone : null;
    const keys = joinKeys({ phone: normPhone, email });

    // Read the three externals — READ-ONLY, phone-first→email-fallback, fail-soft.
    // The app-owned payment_orders lookup runs alongside as a SUPPLEMENTARY signal.
    const [tally, telecrm, razorpayExternal, firstParty] = await Promise.all([
      readTally(keys, admin).catch(() => TALLY_UNAVAILABLE),
      readTeleCrm(keys).catch(() => TELECRM_UNAVAILABLE),
      readRazorpay(keys, offering).catch(() => RAZORPAY_UNAVAILABLE),
      readPaymentOrders(admin, user.id, offering).catch(() => ({ products: [], confirmed: false })),
    ]);

    // Merge the supplementary first-party evidence into the money signal. It does
    // NOT replace the external scan; it only ADDS an unambiguous, offering-scoped
    // confirmation (short-circuiting the shared-tier ambiguity).
    const razorpay: RazorpayRead = firstParty.confirmed
      ? {
          available: true,
          resolvedKey: razorpayExternal.resolvedKey ?? "phone",
          products: [...razorpayExternal.products, ...firstParty.products],
          firstPartyConfirmed: true,
        }
      : razorpayExternal;

    const derived = deriveStage(offering, tally, telecrm, razorpay, keys);

    // Join-completeness health (§health / RC-T3). Per-caller orphan → UUID-free
    // WARN (an individual orphan is expected; error-per-caller-with-UUID floods).
    // A genuine AGGREGATE surge over the watch line escalates to `error`. Neither
    // path logs the Razorpay payments array or the TeleCRM leads array.
    const health = computeJoinHealth(tally, telecrm, razorpay);
    reconRuns += 1;
    if (health.orphan) reconOrphans += 1;
    const sources = {
      tally: tally.available ? "ok" : "unavailable",
      telecrm: telecrm.available ? "ok" : "unavailable",
      razorpay: razorpay.available ? "ok" : "unavailable",
    };
    if (health.orphan) {
      // Per-caller: UUID-free structured counter at WARN. No userId, no arrays.
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "reconcile.join_completeness.orphan",
          message: "caller resolved to no reachable external system",
          stage: derived.stage,
          sources,
        }),
      );
    }
    const aggregateRate = reconRuns > 0 ? reconOrphans / reconRuns : 0;
    if (reconRuns >= ORPHAN_MIN_SAMPLE && aggregateRate > ORPHAN_WATCH_LINE) {
      // Aggregate surge across this warm instance's runs — the genuinely alertable
      // signal. UUID-free; carries only the population rate + sample.
      console.error(
        JSON.stringify({
          level: "error",
          event: "reconcile.join_completeness.orphan_surge",
          message: "aggregate orphan rate above the watch line",
          orphanRate: aggregateRate,
          sample: reconRuns,
          watchLine: ORPHAN_WATCH_LINE,
        }),
      );
    }

    // Data-layer status floor (council). Read THIS application's OWN status
    // (scoped by user_id + offering_id). When it maps to terminal-negative
    // (`rejected`/`withdrawn`/`waitlisted` — the client `STATUS_TO_STEP` = -1 set),
    // the application has no forward progress: the mirror must NOT stamp a progress
    // stage or outreach markers, so a later outreach job keyed on `reconciled_*`
    // can't fire on a dead row. Best-effort: a failed read leaves the derived write
    // intact (preserves today's behaviour rather than silently nulling).
    let applicationTerminal = false;
    try {
      const { data: appRow } = await admin
        .from("cohort_applications")
        .select("status")
        .eq("user_id", user.id)
        .eq("offering_id", offeringId)
        .maybeSingle();
      const appStatus =
        appRow && typeof appRow.status === "string" ? appRow.status.trim().toLowerCase() : null;
      applicationTerminal = appStatus != null && TERMINAL_NEGATIVE_STATUSES.has(appStatus);
    } catch {
      applicationTerminal = false;
    }

    // Mirror the derived stage onto the app-owned columns via the service-role
    // client. Fail-soft: a mirror-write failure never fails the read response.
    // Scoped to `offering_id` (guaranteed present), so the stage lands ONLY on
    // this application — never a sibling (cross-offering contamination). Writes
    // ONLY the five reconciled_* mirror columns — never `status`, never `accepted`.
    // A terminal-negative application gets a NULLED progress write (no stage, no
    // markers) — the data-layer floor above.
    let mirrored = false;
    try {
      const mirrorPayload = applicationTerminal
        ? {
            reconciled_stage: null,
            reconciled_key: null,
            completed_no_fee: false,
            contactable_partial: false,
            reconciled_at: new Date().toISOString(),
          }
        : {
            reconciled_stage: derived.stage,
            reconciled_key: derived.resolvedKey,
            completed_no_fee: derived.markers.completedNoFee,
            contactable_partial: derived.markers.contactablePartial,
            reconciled_at: new Date().toISOString(),
          };
      const { error: mirrorError } = await admin
        .from("cohort_applications")
        .update(mirrorPayload)
        .eq("user_id", user.id)
        .eq("offering_id", offeringId);
      if (mirrorError) {
        console.error("[reconcile] mirror write failed:", mirrorError.message);
      } else {
        mirrored = true;
      }
    } catch (mirrorErr) {
      console.error("[reconcile] mirror write threw:", (mirrorErr as Error)?.message);
    }

    const responseBody: Record<string, unknown> = {
      stage: derived.stage,
      resolvedKey: derived.resolvedKey,
      markers: derived.markers,
      telecrmStatus: derived.telecrmStatus,
      amounts: derived.amounts,
      ambiguous: derived.ambiguous,
      mirrored,
      joinCompleteness: health.joinCompleteness,
      health,
      sources,
    };
    cacheSet(cacheKey, responseBody);
    return jsonRes(responseBody, req);
  } catch (err) {
    return jsonRes({ error: (err as Error)?.message ?? "Reconcile failed" }, req, 500);
  }
});
