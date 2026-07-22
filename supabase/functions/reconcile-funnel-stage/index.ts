/**
 * reconcile-funnel-stage — the app's first first-party read of a logged-in
 * user's funnel stage (REQ-RECON-1, `04-INTEGRATION-CONTRACTS.md` §7).
 *
 * Flow: authenticate the caller (user-scoped JWT), read their phone + email,
 * then READ the three external systems the app can query — Tally, TeleCRM,
 * Razorpay — keyed on phone (primary) → email (fallback), recording which key
 * resolved each match. The pure `deriveStage` (`_shared/reconcile.ts`) turns
 * those reads into the §6 stage + the two invisible markers, which are mirrored
 * onto the app-owned `cohort_applications` columns via a service-role client.
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeadersFor } from "../_shared/cors.ts";
import { last10, normalizePhone } from "../_shared/phone.ts";
import {
  amountToProduct,
  deriveStage,
  joinKeys,
  type ProductInfo,
  type RazorpayRead,
  type ResolvedKey,
  type TallyRead,
  type TeleCrmRead,
} from "../_shared/reconcile.ts";

const TELECRM_BASE = "https://next.telecrm.in/autoupdate/v2";
const RAZORPAY_BASE = "https://api.razorpay.com/v1";
const TALLY_BASE = "https://api.tally.so";

// Razorpay `/payments` has NO server-side contact/email filter — matching is
// client-side — and returns at most 100 rows/page, newest-first. At LevelUp's
// volume a given user's payment is almost never inside the newest 100 global
// rows, so we must PAGE (`count` + `skip`) and accumulate before matching, or a
// paid user regresses to an earlier stage. Bounded scan: newest
// PAGE_SIZE * MAX_PAGES payments. A payment older than that window won't match —
// an accepted fail-soft limit, never a fabricated stage.
const RAZORPAY_PAGE_SIZE = 100;
const RAZORPAY_MAX_PAGES = 20;

// Join-completeness watch line (§health / RC-T3). A logged-in caller who resolves
// to NO reachable external system is an orphan — an application the app can't tie
// back to a funnel record. Above this orphan share the run trips a VISIBLE
// structured error so a rising orphan rate is never a silent under-count. Per-run
// the metric is binary (0 = joined, 1 = orphan); the client health surface
// aggregates the returned numbers across users to watch the true population rate.
const ORPHAN_WATCH_LINE = 0.1;

interface JoinHealth {
  /** true when at least one reachable source resolved a match for this caller. */
  resolved: boolean;
  /** true when NO reachable source matched (stage `unknown`). */
  orphan: boolean;
  /** how many of the three externals were reachable this run. */
  sourcesAvailable: number;
  /** how many reachable externals actually resolved a match. */
  sourcesResolved: number;
  /** 0..1 join-completeness for this single run (1 = joined, 0 = orphan). */
  joinCompleteness: number;
  /** 1 - joinCompleteness — the per-run orphan share compared to the watch line. */
  orphanRate: number;
}

/**
 * computeJoinHealth — the per-run join-completeness metric. An orphan is a
 * resolved-nothing caller (`resolvedKey === null`) AGAINST at least one reachable
 * source; when every source is unavailable the run isn't assessable (source
 * availability is a separate signal already in `sources`), so it is NOT counted
 * as an orphan — a total outage must not masquerade as an orphan surge.
 */
function computeJoinHealth(
  resolvedKey: ResolvedKey,
  tally: TallyRead,
  telecrm: TeleCrmRead,
  razorpay: RazorpayRead,
): JoinHealth {
  const all = [tally, telecrm, razorpay];
  const sourcesAvailable = all.filter((s) => s.available).length;
  const sourcesResolved = all.filter((s) => s.available && s.resolvedKey !== null).length;
  const resolved = resolvedKey !== null;
  const assessable = sourcesAvailable > 0;
  const orphan = assessable && !resolved;
  // Not assessable (no reachable source) → treat as complete so the orphan alert
  // stays quiet; a joined caller is complete; an orphan against reachable sources
  // is 0.
  const joinCompleteness = !assessable ? 1 : resolved ? 1 : 0;
  return {
    resolved,
    orphan,
    sourcesAvailable,
    sourcesResolved,
    joinCompleteness,
    orphanRate: 1 - joinCompleteness,
  };
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
  status: null,
  mql: null,
  essayPresent: false,
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
 * is a READ (search), phone first then email. Newest lead wins on duplicate
 * phones (§7.1 edge case). Fail-soft: missing secrets or any non-ok response
 * yields `available: false`.
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

  // Phone first, then email — record which key resolved.
  let resolvedKey: ResolvedKey = null;
  let leads: Record<string, unknown>[] | null = null;

  if (keys.phone) {
    leads = await search("phone", keys.phone);
    if (leads && leads.length > 0) resolvedKey = "phone";
  }
  if ((!leads || leads.length === 0) && keys.email) {
    const byEmail = await search("email_1", keys.email);
    if (byEmail && byEmail.length > 0) {
      leads = byEmail;
      resolvedKey = "email";
    }
  }

  // `null` from BOTH attempts means the endpoint was unreachable → unavailable.
  // An empty array means reachable-but-no-match → available with a null key.
  if (leads === null) return TELECRM_UNAVAILABLE;
  if (leads.length === 0) {
    return { available: true, resolvedKey: null, status: null, mql: null, essayPresent: false };
  }

  // Newest lead wins (duplicate leads on one phone).
  const sorted = [...leads].sort((a, b) => leadTimestamp(b) - leadTimestamp(a));
  const lead = sorted[0];
  const fields = (lead.fields ?? {}) as Record<string, unknown>;
  const status = lead.status != null ? String(lead.status) : null;
  const mqlRaw = fields.mql;
  const mql = typeof mqlRaw === "number" ? mqlRaw : mqlRaw != null ? Number(mqlRaw) : null;
  const essay = fields.essay;
  const charCount = fields.character_count;
  const essayPresent =
    (typeof essay === "string" && essay.trim().length > 0) ||
    (typeof charCount === "number" && charCount > 0) ||
    (charCount != null && Number(charCount) > 0);

  return {
    available: true,
    resolvedKey,
    status,
    mql: Number.isFinite(mql as number) ? (mql as number) : null,
    essayPresent,
  };
}

/** Best-effort recency for a lead, from common TeleCRM timestamp fields. */
function leadTimestamp(lead: Record<string, unknown>): number {
  const candidate =
    lead.updatedOn ?? lead.updated_on ?? lead.createdOn ?? lead.created_on ?? lead.updatedAt ?? lead.createdAt;
  const t = new Date(String(candidate ?? "")).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Razorpay read — payments, bucketed by amount (§4.5). `GET /payments`, HTTP
 * Basic, PAGED (`count` + `skip`, newest-first). The endpoint has no per-contact
 * filter, so we accumulate a bounded window of recent payments and match
 * client-side by phone (`contact` / `notes.phone`) first, email second. Only
 * `captured` / `authorized` advance a stage. Fail-soft: missing secrets, or the
 * FIRST page unreachable → `available: false`; a mid-scan hiccup keeps the pages
 * already gathered (best-effort, never a fabricated stage).
 */
async function readRazorpay(
  keys: { phone: string | null; email: string | null },
): Promise<RazorpayRead> {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return RAZORPAY_UNAVAILABLE;

  const payments: Record<string, unknown>[] = [];
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
    for (const item of items) payments.push(item);
    if (items.length < RAZORPAY_PAGE_SIZE) break; // last page reached
  }

  const productsFor = (
    predicate: (p: Record<string, unknown>) => boolean,
  ): ProductInfo[] => {
    const seen = new Set<string>(); // dedup by payment.id (§4.5)
    const out: ProductInfo[] = [];
    for (const p of payments) {
      const paymentStatus = String(p.status ?? "");
      if (paymentStatus !== "captured" && paymentStatus !== "authorized") continue;
      if (!predicate(p)) continue;
      const id = String(p.id ?? "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const paise = Number(p.amount ?? 0);
      out.push(amountToProduct(Math.round(paise / 100)));
    }
    return out;
  };

  const notesOf = (p: Record<string, unknown>) => (p.notes ?? {}) as Record<string, unknown>;

  // Phone first.
  let resolvedKey: ResolvedKey = null;
  let products = keys.phone
    ? productsFor((p) => matchesPhone(p.contact, keys.phone) || matchesPhone(notesOf(p).phone, keys.phone))
    : [];
  if (products.length > 0) {
    resolvedKey = "phone";
  } else if (keys.email) {
    products = productsFor(
      (p) => matchesEmail(p.email, keys.email) || matchesEmail(notesOf(p).email, keys.email),
    );
    if (products.length > 0) resolvedKey = "email";
  }

  return { available: true, resolvedKey, products };
}

/**
 * Tally read — completed vs partial submissions + the resume signal (§3.3/§7.1).
 * The staged offerings' `tally_form_url`s give the form IDs to query; each
 * form's submissions are scanned for the caller's phone/email. Read-only GETs.
 * Fail-soft: unset `TALLY_API_KEY` (or no reachable form) → `available: false`.
 */
async function readTally(
  keys: { phone: string | null; email: string | null },
  admin: ReturnType<typeof createClient>,
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
    let submissions: Record<string, unknown>[] | null = null;
    try {
      const res = await fetch(`${TALLY_BASE}/forms/${formId}/submissions`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
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
    if (submissions === null) continue; // this form unreachable — try the next
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

    // Optional `offering_id` scopes the mirror write to a SINGLE application.
    // The derived stage is global (across all the caller's Tally/TeleCRM/Razorpay
    // signals); stamping it onto every `cohort_applications` row would
    // cross-contaminate a user who applied to more than one offering. Read it
    // fail-soft (empty/no body → null).
    let offeringId: string | null = null;
    try {
      const body = await req.json();
      const raw = body?.offering_id ?? body?.offeringId;
      offeringId = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    } catch {
      offeringId = null;
    }

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

    // Service-role client — used ONLY to read offerings (Tally form list) and to
    // write the app-owned mirror. It NEVER writes `status` and NEVER writes `accepted`.
    const admin = createClient(supabaseUrl, serviceKey);

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
    const [tally, telecrm, razorpay] = await Promise.all([
      readTally(keys, admin).catch(() => TALLY_UNAVAILABLE),
      readTeleCrm(keys).catch(() => TELECRM_UNAVAILABLE),
      readRazorpay(keys).catch(() => RAZORPAY_UNAVAILABLE),
    ]);

    const derived = deriveStage(tally, telecrm, razorpay, keys);

    // Join-completeness health (§health / RC-T3). Emit the metric on every run and
    // raise a VISIBLE structured alert when a logged-in caller resolved to nothing
    // reachable — the orphan case a silent under-count would otherwise hide.
    const health = computeJoinHealth(derived.resolvedKey, tally, telecrm, razorpay);
    if (health.orphanRate > ORPHAN_WATCH_LINE) {
      // Structured error log (visible in the edge fn logs / any log drain) — level
      // `error` so an orphan surge is alertable, carrying the queryable numbers.
      console.error(
        JSON.stringify({
          level: "error",
          event: "reconcile.join_completeness.orphan",
          message:
            "join-completeness below watch line: logged-in caller resolved to no reachable external system",
          userId: user.id,
          stage: derived.stage,
          resolvedKey: derived.resolvedKey,
          joinCompleteness: health.joinCompleteness,
          orphanRate: health.orphanRate,
          watchLine: ORPHAN_WATCH_LINE,
          sourcesAvailable: health.sourcesAvailable,
          sourcesResolved: health.sourcesResolved,
          sources: {
            tally: tally.available ? "ok" : "unavailable",
            telecrm: telecrm.available ? "ok" : "unavailable",
            razorpay: razorpay.available ? "ok" : "unavailable",
          },
        }),
      );
    }

    // Mirror the derived stage onto the app-owned columns via the service-role
    // client. Fail-soft: a mirror-write failure never fails the read response.
    // NOTE: this writes ONLY the five reconciled_* mirror columns — never
    // `status`, never `accepted`.
    //
    // Scoped to `offering_id` when supplied, so the global stage never lands on a
    // sibling application (cross-offering contamination). Without a scope key we
    // SKIP the write rather than stamp every row — the live stage is still in the
    // response payload (which is what consumers read; the mirror is a cache).
    let mirrored = false;
    if (offeringId) {
      // supabase-js resolves with { error } on DB-level failures instead of
      // throwing, so inspect the returned error (a genuine mirror failure — e.g.
      // the column missing before RC-T2 lands — would otherwise be invisible).
      // The try/catch still guards a thrown transport-level rejection.
      try {
        const { error: mirrorError } = await admin
          .from("cohort_applications")
          .update({
            reconciled_stage: derived.stage,
            reconciled_key: derived.resolvedKey,
            completed_no_fee: derived.markers.completedNoFee,
            contactable_partial: derived.markers.contactablePartial,
            reconciled_at: new Date().toISOString(),
          })
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
    } else {
      console.warn("[reconcile] mirror write skipped: no offering_id to scope by");
    }

    return jsonRes(
      {
        stage: derived.stage,
        resolvedKey: derived.resolvedKey,
        markers: derived.markers,
        telecrmStatus: derived.telecrmStatus,
        amounts: derived.amounts,
        mirrored,
        // Join-completeness metric — queryable by the client health surface, and
        // aggregable across users to watch the population orphan rate.
        joinCompleteness: health.joinCompleteness,
        health,
        sources: {
          tally: tally.available ? "ok" : "unavailable",
          telecrm: telecrm.available ? "ok" : "unavailable",
          razorpay: razorpay.available ? "ok" : "unavailable",
        },
      },
      req,
    );
  } catch (err) {
    return jsonRes({ error: (err as Error)?.message ?? "Reconcile failed" }, req, 500);
  }
});
