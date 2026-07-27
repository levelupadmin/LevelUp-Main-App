/**
 * calendly-slots — the THIN SERVER CALL behind the interview slot buttons
 * (REQ-INT-0 / CRO-2, `design/briefs/cohort-iv.md` V-2).
 *
 * Why this function exists at all: Calendly's availability endpoints are
 * Bearer-token endpoints. `CALENDLY_TOKEN` is an ORG-WIDE credential (it can
 * read every event type and every invitee on the account), so it can never be
 * compiled into the client bundle. This function is the only thing that ever
 * holds it; the client receives nothing but start times and Calendly's own
 * public scheduling URLs. (Grep the built bundle for CALENDLY — zero hits.)
 *
 * WHAT THIS FUNCTION IS NOT — read before extending it:
 *   • It does NOT book anything. Calendly exposes availability READS but no
 *     public create-invitee API, so "one tap" resolves to launching Calendly's
 *     own scheduling flow deep-linked to the chosen time. Calendly itself
 *     remains the sole writer of its calendar, which is exactly what makes
 *     double-booking impossible: our list is a hint, Calendly's booking page is
 *     the truth (INTEG-CAL-1: "inherits Calendly's own availability truth").
 *   • It does NOT touch the intake chain (INTEG-PAY-1). No Tally edit, no
 *     Razorpay-link edit, no redirect change. It enriches the Calendly step
 *     that already follows the in-form ₹400 payment.
 *   • It writes NOTHING. No funnel status, no mirror row (SOR-1). The booking
 *     confirmation arrives back through `calendly-webhook` (V-1) and only that
 *     receiver records the booking fact.
 *   • It seeds no app id outward. The event type is resolved FROM the
 *     offering's existing `offerings.calendly_url`, so the slots offered here
 *     and the hosted link on the marketing path (`src/pages/ThankYou.tsx:796`)
 *     are literally the same Calendly event and produce identical invitee data
 *     (ENTRY-PARITY-1).
 *   • It obeys the SAME admin switch as the marketing path. `ThankYou.tsx:797`
 *     gates its Calendly surface on `offerings.thankyou_show_calendly` AND
 *     `isCalendlyUrl(offerings.calendly_url)` — BOTH conjuncts — and renders
 *     nothing when either fails. So this function reports BOTH halves
 *     separately (`booking_disabled`, `no_calendly_url`) and the client renders
 *     nothing for either one. `thankyou_show_calendly` DEFAULTs to false and
 *     `calendly_url` is independently nullable
 *     (`src/pages/admin/AdminOfferingEditor.tsx:374,376` save them with no
 *     coupling), so "switch on, URL blank" is a reachable misconfiguration and
 *     it must go dark on BOTH paths, not turn into a promise on one of them.
 *     Both conditions, both paths, or ENTRY-PARITY-1 is a claim rather than a
 *     property.
 *
 * Failure posture: fail-soft, never a dead end. EVERY response is HTTP 200 —
 * including throttling and a malformed body. `supabase.functions.invoke` throws
 * away the body of any non-2xx (`FunctionsHttpError`), so a 429 would discard
 * the very `reason` and `hostedUrl` the client needs to choose the right
 * affordance and would collapse a "we are checking too often, here is the full
 * calendar" state into a bare error. Upstream problems (booking switched off,
 * token unset, offering has no Calendly URL, event type unresolvable, Calendly
 * down, throttled, genuinely no open times) all return 200 with `slots: []`, a
 * machine `reason`, and `hostedUrl` whenever we know it. Same degrade-don't-
 * throw contract `reconcile-funnel-stage` uses.
 *
 * Ordering is load-bearing, not stylistic. The admin gates are evaluated BEFORE
 * the slot cache and BEFORE the rate-limit spend, because (a) a toggle flipped
 * off must go dark in the app in the same render the marketing path goes dark,
 * never SLOTS_FRESH_MS later, and (b) a deliberately-disabled offering must not
 * burn a rate-limit budget it can then be blocked by. The offering row is
 * therefore read on every request; it is one indexed select on our own
 * Postgres, and the scarce resource this function protects is Calendly's quota,
 * which the cache below still shields.
 *
 * Secrets by name only: `CALENDLY_TOKEN`, read via Deno.env.get.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeadersFor } from "../_shared/cors.ts";

const CALENDLY_API = "https://api.calendly.com";

// Calendly caps `event_type_available_times` at a 7-day range per call. Three
// consecutive windows (21 days) is plenty to find three soonest slots for an
// interview calendar without turning one tap into a 20-request fan-out.
const WINDOW_DAYS = 7;
const MAX_WINDOWS = 3;

// Calendly rejects a `start_time` that is not strictly in the future, and clock
// skew between us and them is real, so the first window starts a minute out.
const START_SKEW_MS = 60_000;

// How many slots the UI asks for. Three is the brief's number; the clamp stops
// a crafted body from turning this into a full availability scrape.
const DEFAULT_COUNT = 3;
const MAX_COUNT = 5;

// ── Caching ──────────────────────────────────────────────────────────────────
// Availability is read once per offering per FRESH_MS and shared by every
// applicant that lands in that window, instead of once per applicant. This is
// the real protection for the org's Calendly quota: a per-IP limit does nothing
// against N distinct applicants, each on their own carrier IP, all opening the
// success screen after the same ad push.
//
// Best-effort by construction: this Map lives in one isolate's memory, so a
// cold start or a second isolate simply re-reads. Staleness is safe for the
// same reason the whole feature is safe — a stale slot that has since been
// taken is refused by Calendly's own booking page, which stays the sole writer.
const SLOTS_FRESH_MS = 60_000;
// A throttled or Calendly-down request MAY fall back to a list this old, but
// nothing depends on that hit. The rate-limit counter is global (a Postgres
// row) while this Map is per-isolate, so under the only burst big enough to
// trip the counter Deno Deploy is also fanning requests across cold isolates
// and the blocked request usually lands on one holding no cache at all. The
// real guarantee for a blocked applicant is the `hostedUrl` returned alongside
// `rate_limited` — Calendly's own full calendar, always tappable. The stale
// list is a bonus on top of that, never the mitigation.
const SLOTS_STALE_MS = 5 * 60_000;
// Event types change about never; resolving one costs two Calendly requests.
const EVENT_TYPE_FRESH_MS = 10 * 60_000;

interface CacheEntry<T> {
  at: number;
  value: T;
}

const slotsCache = new Map<string, CacheEntry<SlotsResponse>>();
const eventTypeCache = new Map<string, CacheEntry<EventType>>();

function readCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  maxAgeMs: number,
): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > maxAgeMs) return null;
  return hit.value;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  cache.set(key, { at: Date.now(), value });
}

// ── Probe budgets ────────────────────────────────────────────────────────────
// Per-IP: stops one client hammering the endpoint. Deliberately NOT the only
// guard — Indian carrier CGNAT puts many unrelated applicants behind one
// address, so a per-IP block must degrade to the hosted calendar (and the
// cached list when this isolate happens to hold one), never to the "nothing is
// open" copy, which would be a lie.
const IP_LIMIT_MAX = 30;
// Per-offering: the guard that actually protects the org's Calendly quota,
// because it counts every applicant on that offering, not every applicant on
// one IP. Sized so a genuine rush still gets served from cache: only the first
// request of each FRESH_MS window costs Calendly anything.
const OFFERING_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_SECONDS = 300;

/** Why the slot list came back empty. The client maps these to copy. */
type Reason =
  // Both members of the marketing gate. Either one means the marketing path
  // renders nothing, so the client renders nothing too — never copy.
  | "booking_disabled" // offerings.thankyou_show_calendly is off
  | "no_calendly_url" // offerings.calendly_url is blank or not a calendly.com URL
  | "not_configured" // CALENDLY_TOKEN unset in this environment: never asked
  | "event_type_unresolved" // the link doesn't match any readable active event type
  | "no_availability" // Calendly answered, genuinely nothing open in the window
  | "unavailable" // Calendly unreachable / errored — degrade, don't dead-end
  | "rate_limited";

interface Slot {
  /** ISO-8601 UTC start, exactly as Calendly reports it. */
  startTime: string;
  /** Calendly's own public booking URL, deep-linked to this exact time. */
  schedulingUrl: string;
  /** Event-type duration in minutes, or null when Calendly omits it. */
  durationMinutes: number | null;
}

interface SlotsResponse {
  slots: Slot[];
  /** The offering's hosted Calendly link — the "see all times" escape hatch. */
  hostedUrl: string | null;
  /** Null when `slots` is non-empty. */
  reason: Reason | null;
}

/**
 * Always 200 — see the failure posture note in the header. There is no status
 * argument on purpose: a non-2xx makes `functions.invoke` throw away the body,
 * which is where the `reason` and the hosted link live.
 */
function jsonRes(req: Request, body: SlotsResponse): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Pin the configured URL to Calendly before we ever hand it to a browser. A
 * compromised (or fat-fingered) admin `calendly_url` otherwise turns the
 * booking step into a phishing vector — the same guard `ThankYou.tsx:48`
 * applies before embedding the hosted iframe.
 */
function isCalendlyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return (
      parsed.hostname === "calendly.com" || parsed.hostname.endsWith(".calendly.com")
    );
  } catch {
    return false;
  }
}

/**
 * Compare two Calendly scheduling URLs by identity, ignoring the noise an admin
 * paste picks up (case, trailing slash, `?month=`/UTM query, fragment).
 */
function schedulingKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    return `${parsed.hostname.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

async function calendlyGet(
  path: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${CALENDLY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    // Never log the token or the Authorization header — only the shape of the
    // failure, so a log leak can't become a credential leak.
    console.error(`calendly-slots: GET ${path} -> ${res.status}`);
    return null;
  }
  return (await res.json()) as Record<string, unknown>;
}

interface EventType {
  uri: string;
  schedulingUrl: string;
  durationMinutes: number | null;
}

function matchEventType(
  listed: Record<string, unknown> | null,
  wanted: string,
): EventType | null {
  const collection = Array.isArray(listed?.collection) ? listed.collection : [];
  for (const raw of collection) {
    const item = raw as Record<string, unknown>;
    const uri = typeof item.uri === "string" ? item.uri : null;
    const schedulingUrl = typeof item.scheduling_url === "string"
      ? item.scheduling_url
      : null;
    if (!uri || !schedulingUrl) continue;
    if (schedulingKey(schedulingUrl) !== wanted) continue;
    const duration = typeof item.duration === "number" ? item.duration : null;
    return { uri, schedulingUrl, durationMinutes: duration };
  }
  return null;
}

/**
 * Resolve the ONE event type the offering's hosted link points at.
 *
 * USER-scoped first, org-scoped only as a fallback. Calendly requires
 * admin/owner privileges on the organization to LIST event types with
 * `?organization=`, and a token minted by a plain member answers 403 — which
 * would leave the whole feature permanently dark. `?user=<me.uri>` always works
 * for the token's own event types, and INTEG-CAL-1 fixes v1 at a single account
 * whose own scheduling link is exactly what `offerings.calendly_url` holds, so
 * the user scope is sufficient in the shipped configuration. The org probe
 * stays as a fallback for the case where the link belongs to a colleague on an
 * admin token; when it 403s, `calendlyGet` returns null and we degrade.
 *
 * It NEVER falls back to "the first event type" — offering slots for the wrong
 * event would book applicants into the wrong interview, so an unmatched link
 * degrades to the hosted-link path instead.
 */
async function resolveEventType(
  token: string,
  calendlyUrl: string,
): Promise<EventType | null> {
  const wanted = schedulingKey(calendlyUrl);
  if (!wanted) return null;

  const cached = readCache(eventTypeCache, wanted, EVENT_TYPE_FRESH_MS);
  if (cached) return cached;

  const me = await calendlyGet("/users/me", token);
  const meResource = me?.resource as Record<string, unknown> | undefined;
  const userUri = typeof meResource?.uri === "string" ? meResource.uri : null;
  const organization = typeof meResource?.current_organization === "string"
    ? meResource.current_organization
    : null;

  let resolved: EventType | null = null;

  if (userUri) {
    const listed = await calendlyGet(
      `/event_types?user=${encodeURIComponent(userUri)}&active=true&count=100`,
      token,
    );
    resolved = matchEventType(listed, wanted);
  }

  if (!resolved && organization) {
    const listed = await calendlyGet(
      `/event_types?organization=${encodeURIComponent(organization)}&active=true&count=100`,
      token,
    );
    resolved = matchEventType(listed, wanted);
  }

  // Only a SUCCESSFUL resolution is cached. Caching a null would make a
  // transient 403/outage sticky for the whole TTL.
  if (resolved) writeCache(eventTypeCache, wanted, resolved);
  return resolved;
}

/**
 * Walk forward in 7-day windows until we have `count` open times or run out of
 * windows. Returns null (not []) when Calendly itself failed before we saw a
 * single open time, so the caller can tell "nothing is open" apart from "we
 * couldn't ask".
 *
 * The walk STOPS at the first window Calendly refuses to answer. That is the
 * whole point of a "soonest" list: if days 0–7 error and days 8–14 answer,
 * continuing would present next week's times as though they were the soonest,
 * with nothing in the payload saying the nearest week was never read. Stopping
 * means the returned slots are always drawn from a contiguous prefix of windows
 * we actually read, so the soonest-ness is a property, not a hope.
 */
async function fetchSoonestSlots(
  token: string,
  eventType: EventType,
  count: number,
): Promise<Slot[] | null> {
  const slots: Slot[] = [];
  let cursor = new Date(Date.now() + START_SKEW_MS);
  let windowFailed = false;

  for (let window = 0; window < MAX_WINDOWS && slots.length < count; window++) {
    const end = new Date(cursor.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const query = new URLSearchParams({
      event_type: eventType.uri,
      start_time: cursor.toISOString(),
      end_time: end.toISOString(),
    });
    const page = await calendlyGet(`/event_type_available_times?${query}`, token);
    if (!page) {
      windowFailed = true;
      break;
    }
    const collection = Array.isArray(page.collection) ? page.collection : [];
    for (const raw of collection) {
      const item = raw as Record<string, unknown>;
      const startTime = typeof item.start_time === "string" ? item.start_time : null;
      const schedulingUrl = typeof item.scheduling_url === "string"
        ? item.scheduling_url
        : null;
      // `invitees_remaining` is Calendly's own capacity read. Honour it (and
      // the `status` flag) rather than assuming every returned row is open —
      // group event types can come back listed but full.
      const remaining = typeof item.invitees_remaining === "number"
        ? item.invitees_remaining
        : 1;
      if (!startTime || !schedulingUrl) continue;
      if (item.status !== undefined && item.status !== "available") continue;
      if (remaining <= 0) continue;
      slots.push({
        startTime,
        schedulingUrl,
        durationMinutes: eventType.durationMinutes,
      });
    }
    cursor = end;
  }

  // Nothing read AND a window errored = "we couldn't ask", not "nothing open".
  if (windowFailed && slots.length === 0) return null;

  // Calendly returns each window in order, but never trust cross-window order.
  slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return slots.slice(0, count);
}

/** True when the answer came from Calendly itself and is worth caching. */
function isCacheable(body: SlotsResponse): boolean {
  return body.reason === null || body.reason === "no_availability";
}

Deno.serve(async (req) => {
  // The iOS shell's origin is capacitor://app.leveluplearning.in, so the
  // preflight MUST answer with corsHeadersFor(req). A hardcoded corsHeaders
  // constant fails the call as a bare "(network)" error on iOS only.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      offering_id?: unknown;
      count?: unknown;
    };
    const offeringId = typeof body.offering_id === "string" ? body.offering_id : null;
    if (!offeringId) {
      // 200, not 400: `functions.invoke` discards the body of a non-2xx, and a
      // caller that cannot name an offering still deserves the honest "we could
      // not read availability" branch rather than a bare transport error.
      return jsonRes(req, { slots: [], hostedUrl: null, reason: "unavailable" });
    }
    const requested = typeof body.count === "number" ? Math.floor(body.count) : DEFAULT_COUNT;
    const count = Math.min(MAX_COUNT, Math.max(1, requested));

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── The admin gates, FIRST, uncached, every request ──────────────────────
    // Both halves of `ThankYou.tsx:797`, so the app path goes dark in the same
    // render the marketing path does. Reading these before the slot cache is
    // what stops a toggle flipped off from still serving one-tap booking for a
    // cache TTL; reading them before the rate-limit spend is what stops a
    // deliberately-disabled offering from burning (and then being blocked by) a
    // budget it never needed. It costs LESS than the old ordering did, not
    // more: the counter RPC is itself two DB writes, so moving one primary-key
    // select ahead of it strictly reduces the per-request DB cost of a flood.
    const { data: offeringRow, error: offeringError } = await admin
      .from("offerings")
      .select("calendly_url, thankyou_show_calendly")
      .eq("id", offeringId)
      .maybeSingle();

    if (offeringError) {
      // We could not READ the switch, which is not the same as the switch being
      // off. Say so, so the client shows error copy plus a retry instead of
      // silently rendering nothing on a working offering.
      console.error("calendly-slots: offering read failed:", offeringError);
      return jsonRes(req, { slots: [], hostedUrl: null, reason: "unavailable" });
    }

    const offering = offeringRow as
      | { calendly_url: string | null; thankyou_show_calendly: boolean | null }
      | null;

    // The admin off-switch, honoured exactly as `ThankYou.tsx:797` honours it.
    // The column DEFAULTs to false, so this is opt-in on BOTH paths and a stale
    // `calendly_url` left on an offering can never re-open booking in the app
    // alone (ENTRY-PARITY-1).
    if (offering?.thankyou_show_calendly !== true) {
      return jsonRes(req, { slots: [], hostedUrl: null, reason: "booking_disabled" });
    }

    // The second conjunct of the marketing gate. Only ever hand the client a
    // URL we have pinned to calendly.com; "switch on, URL blank or non-Calendly"
    // renders nothing on the marketing path, so it must render nothing here too
    // rather than becoming a "we will text you" promise no ops process backs.
    const hostedUrl = isCalendlyUrl(offering.calendly_url)
      ? (offering.calendly_url as string)
      : null;
    if (!hostedUrl) {
      return jsonRes(req, { slots: [], hostedUrl: null, reason: "no_calendly_url" });
    }

    // Keyed by the resolved link too, so re-pointing `calendly_url` cannot
    // serve 60s of slots for the event type the admin just moved off.
    const key = `${offeringId}:${count}:${schedulingKey(hostedUrl) ?? ""}`;

    // Fresh shared answer — no Calendly read, no quota spent, no budget spent.
    const fresh = readCache(slotsCache, key, SLOTS_FRESH_MS);
    if (fresh) return jsonRes(req, fresh);

    /** Ask the shared counter; a broken counter must not take booking down. */
    const withinBudget = async (rlKey: string, max: number): Promise<boolean> => {
      const { data, error } = await admin.rpc("check_and_increment_rate_limit", {
        p_key: rlKey,
        p_max_count: max,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      });
      if (error) {
        console.error("calendly-slots: rate-limit rpc failed:", error);
        return true;
      }
      return data !== false;
    };

    const ip = getClientIp(req);
    const allowed =
      (await withinBudget(`calendly-slots:ip:${ip}:${offeringId}`, IP_LIMIT_MAX)) &&
      (await withinBudget(`calendly-slots:offering:${offeringId}`, OFFERING_LIMIT_MAX));

    if (!allowed) {
      // Prefer a slightly stale truth over a false "nothing is open": carrier
      // CGNAT means a blocked IP is often a legitimate applicant. When this
      // isolate holds no cache (the common case in a burst), `hostedUrl` still
      // goes back with the reason, so the applicant always has Calendly's full
      // calendar to tap. 200, so that body survives the client.
      const stale = readCache(slotsCache, key, SLOTS_STALE_MS);
      if (stale) return jsonRes(req, stale);
      return jsonRes(req, { slots: [], hostedUrl, reason: "rate_limited" });
    }

    const token = Deno.env.get("CALENDLY_TOKEN");
    if (!token) {
      // A missing/misnamed deploy secret means Calendly was never ASKED, so the
      // client classes this with the read failures (honest copy + the hosted
      // link), never with "nothing is open". The hosted link still works, so
      // the surface degrades to it rather than dead-ending.
      return jsonRes(req, { slots: [], hostedUrl, reason: "not_configured" });
    }

    const eventType = await resolveEventType(token, hostedUrl);
    if (!eventType) {
      return jsonRes(req, { slots: [], hostedUrl, reason: "event_type_unresolved" });
    }

    const slots = await fetchSoonestSlots(token, eventType, count);
    if (slots === null) {
      return jsonRes(req, { slots: [], hostedUrl, reason: "unavailable" });
    }

    const answer: SlotsResponse = slots.length === 0
      ? { slots: [], hostedUrl, reason: "no_availability" }
      : { slots, hostedUrl, reason: null };
    if (isCacheable(answer)) writeCache(slotsCache, key, answer);
    return jsonRes(req, answer);
  } catch (err) {
    console.error("calendly-slots error:", err);
    return jsonRes(req, { slots: [], hostedUrl: null, reason: "unavailable" });
  }
});
