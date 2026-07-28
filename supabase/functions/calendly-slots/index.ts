/**
 * calendly-slots — server-side availability for the three-soonest-slot buttons
 * (PHASE IV Q-1, REQ-INT-0).
 *
 * RULED — REQ-INT-0 IS BACK ON (Rahul, 2026-07-28). `04-INTEGRATION-CONTRACTS.md`
 * §6.4 had parked app-native slot buttons in favour of an inline hosted embed;
 * that park is superseded in place (see §6.4's 2026-07-28 note). This function is
 * the server half of the reinstated surface.
 *
 * THE THREE INVIOLABLE RULES (a violation is a failed task):
 *   1. `CALENDLY_TOKEN` NEVER LEAVES THIS PROCESS. It is read by name from
 *      `Deno.env`, used only on outbound calls to api.calendly.com, and is not
 *      echoed into any response body, header, or log line — not even on error.
 *      Nothing under `src/` can import it, which is what makes the "token in no
 *      bundle" grep hold by construction rather than by care.
 *   2. IT CANNOT BOOK, AND THAT IS THE POINT. Calendly's API has no
 *      create-a-booking call, so the confirm always happens on Calendly's own
 *      surface. We hand out `scheduling_url`, Calendly's per-slot deep link, and
 *      Calendly stays the single writer of its own calendar: double-booking is
 *      impossible by construction, and `calendly-webhook` still records the fact.
 *   3. IT NEVER DEAD-ENDS THE STUDENT (SOR-1 too: it names no funnel stage). Every
 *      failure — no slots, a Calendly outage, a rate limit, a misconfigured
 *      offering — answers 200 with an empty list and a `reason`, so the client
 *      falls back to the hosted Calendly link instead of rendering an error where
 *      a booking should be.
 *
 * CORS: `corsHeadersFor(req)`, not the static `corsHeaders`. The iOS Capacitor
 * origin is `capacitor://app.leveluplearning.in`; the static headers do not cover
 * it and every call from the iOS shell would fail as a misleading "(network)"
 * error — the exact failure the VdoCipher OTP mint hit live.
 *
 * `verify_jwt = false` (see `config.toml`): an applicant who paid the ₹400 through
 * the hosted intake chain frequently has NO app session yet, and that guest is the
 * exact person this surface exists for. The offering id is not a secret and the
 * response contains only public booking availability, so the open posture costs
 * nothing beyond call volume — which the cache below is sized for.
 *
 * THE EVENT TYPE IS RESOLVED, NEVER HARDCODED. The account carries several live
 * interview event types (executive-presence, forge-ai-residency,
 * forge-creators-residency) and `offerings.calendly_url` already says which one an
 * offering uses; we match it against the account's `scheduling_url`s. A pinned URI
 * would offer one cohort's calendar to another cohort's applicants.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeadersFor } from "../_shared/cors.ts";
import {
  availabilityWindow,
  CALENDLY_SLOT_COUNT,
  type CalendlySlot,
  eventTypeUriFor,
  isCalendlySchedulingUrl,
  parseAvailableTimes,
} from "../_shared/calendly.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
/** Secret by name only. Never logged, never returned, never re-exported. */
const calendlyToken = Deno.env.get("CALENDLY_TOKEN") ?? "";

const CALENDLY_API = "https://api.calendly.com";

/**
 * Why the list is empty. The client branches on this to choose its fallback, and
 * every one of them ends at the hosted Calendly link rather than at an error.
 */
type SlotsReason = "no_slots" | "not_configured" | "rate_limited" | "unavailable";

interface SlotsPayload {
  slots: CalendlySlot[];
  reason: SlotsReason | null;
}

/* ────────────────────────────────────────────────────────────────────────────
   Caching — because a render storm must not become a Calendly storm.

   `ApplicationStatus` and `/thank-you` both mount this surface, react-query
   refetches, and a student who reloads three times in ten seconds is ordinary
   behaviour. Availability moves on the order of minutes, so a short shared cache
   costs the student nothing and removes the entire class of "we hammered the API
   and got throttled at peak intent".
   ──────────────────────────────────────────────────────────────────────────── */

/** How long an answer (including an empty one) is served without re-asking. */
const SLOT_TTL_MS = 90_000;

/**
 * The floor a `fresh` re-check cannot go under. The re-check on tap is a real
 * user action and must see the live calendar, so it bypasses `SLOT_TTL_MS` — but
 * `fresh` arrives from an unauthenticated client, so it needs a bound of its own
 * or it is a free hammer.
 */
const FRESH_FLOOR_MS = 8_000;

/** Event types change when an admin edits Calendly: minutes, not seconds. */
const EVENT_TYPE_TTL_MS = 15 * 60_000;

/** A cold isolate holds few keys; this only bounds a pathological one. */
const MAX_CACHE_KEYS = 200;

interface CacheEntry<T> {
  at: number;
  value: T;
}

const slotCache = new Map<string, CacheEntry<SlotsPayload>>();
/**
 * Successful resolutions only. A miss and a cached "no match" must stay
 * distinguishable, and a negative entry here would pin a genuine
 * admin-fixed-the-link recovery behind a fifteen-minute wall.
 */
const eventTypeCache = new Map<string, CacheEntry<string>>();

/**
 * When the whole TOKEN is throttled. Calendly's rate limit is per-token, not per
 * offering, so a 429 on one cohort is a 429 on all of them; backing off globally
 * is the difference between one throttled minute and a self-sustaining one.
 */
let backoffUntil = 0;

function cacheGet<T>(cache: Map<string, CacheEntry<T>>, key: string, ttl: number, now: number): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at >= ttl) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, now: number): void {
  if (cache.size >= MAX_CACHE_KEYS) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { at: now, value });
}

/* ──────────────────────────────────────────────────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

/** Every soft failure answers 200 with an empty list. See rule 3. */
function soft(req: Request, reason: SlotsReason): Response {
  return json(req, { slots: [], reason } satisfies SlotsPayload);
}

/**
 * One authenticated GET against Calendly, with a timeout and no throw.
 *
 * Returns `"rate_limited"` for 429 (and for 403 with a rate-limit body, which is
 * how Calendly reports some quota refusals) so the caller can back the whole
 * token off, and `null` for anything else that failed. The token is in the
 * request headers and in nothing else: the error branch logs the STATUS and the
 * PATH, never the headers and never the body, because a Calendly error body can
 * echo request context.
 */
async function calendlyGet(
  path: string,
  params: Record<string, string>,
): Promise<{ ok: true; body: unknown } | { ok: false; rateLimited: boolean }> {
  const query = new URLSearchParams(params).toString();
  const url = `${CALENDLY_API}${path}${query ? `?${query}` : ""}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${calendlyToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 429) {
      console.warn(`[calendly-slots] rate limited on ${path}`);
      return { ok: false, rateLimited: true };
    }
    if (!res.ok) {
      // Body deliberately not read into the log: it can echo the request.
      console.error(`[calendly-slots] ${path} failed status=${res.status}`);
      return { ok: false, rateLimited: false };
    }
    return { ok: true, body: await res.json() };
  } catch (err) {
    console.error(`[calendly-slots] ${path} threw: ${(err as Error)?.name ?? "error"}`);
    return { ok: false, rateLimited: false };
  }
}

/**
 * How the event-type lookup ended, AS FOUR DISTINCT FACTS.
 *
 * The three failure shapes were collapsed into a single `null` once, and the
 * handler filed all of them as `not_configured` — an admin-misconfiguration
 * verdict — and then CACHED it for ninety seconds. So a two-minute wobble on
 * Calendly's `/users/me` recorded every offering that happened to be requested
 * during it as misconfigured, and pinned that record in place past the recovery.
 * That is the exact dishonesty §6.4 forbids for the availability call itself ("a
 * failed availability call answers `unavailable` and is not cached"); the rule
 * does not stop applying because the failing call is one hop upstream.
 *
 *   • `uri`          — resolved. The only outcome worth caching.
 *   • `no_match`     — Calendly answered, and none of the org's event types is
 *                      this offering's link. A real, durable configuration fact
 *                      (typically the second Calendly account, INTEG-CAL-1's
 *                      fast-follow), and the one that legitimately reads as
 *                      `not_configured`.
 *   • `rate_limited` — the token is throttled. Back the whole token off.
 *   • `failed`       — Calendly could not be reached, or answered a shape we do
 *                      not understand. An OUTAGE: reported as `unavailable` and
 *                      never cached, so the recovery is visible immediately.
 *
 * The student sees no difference between the last three — every one of them lands
 * on the hosted calendar — so the entire cost of getting this wrong is diagnostic,
 * which is precisely why the field has to be true.
 */
type EventTypeLookup =
  | { kind: "uri"; uri: string }
  | { kind: "no_match" }
  | { kind: "rate_limited" }
  | { kind: "failed" };

/**
 * The organization this token belongs to, so event types can be listed for the
 * whole org rather than for one user. INTEG-CAL-1 puts every interviewer on ONE
 * org-level account, so this is a single lookup for the entire product.
 */
async function currentOrganization(): Promise<
  { kind: "org"; uri: string } | { kind: "rate_limited" } | { kind: "failed" }
> {
  const res = await calendlyGet("/users/me", {});
  if (!res.ok) return { kind: res.rateLimited ? "rate_limited" : "failed" };
  const resource = (res.body as { resource?: { current_organization?: unknown } })?.resource;
  const org = resource?.current_organization;
  if (typeof org === "string" && org.trim() !== "") return { kind: "org", uri: org.trim() };
  // A 200 with no organization on it is not something an admin can fix on our
  // side, so it is an outage rather than a misconfiguration: the token's own
  // account shape changed, or the response is not what we think it is.
  console.error("[calendly-slots] /users/me answered without an organization");
  return { kind: "failed" };
}

/** Resolve (and briefly cache) the event-type URI an offering's link names. */
async function resolveEventTypeUri(
  calendlyUrl: string,
  now: number,
): Promise<EventTypeLookup> {
  const cached = cacheGet(eventTypeCache, calendlyUrl, EVENT_TYPE_TTL_MS, now);
  if (cached !== null) return { kind: "uri", uri: cached };

  const org = await currentOrganization();
  if (org.kind !== "org") return org;

  const res = await calendlyGet("/event_types", {
    organization: org.uri,
    count: "100",
    active: "true",
  });
  if (!res.ok) return { kind: res.rateLimited ? "rate_limited" : "failed" };

  const uri = eventTypeUriFor(res.body, calendlyUrl);
  if (!uri) {
    // Not an outage: an offering can legitimately point at a link this token
    // cannot see (the second Calendly account, INTEG-CAL-1's fast-follow). The
    // student still gets the hosted link, so this is a fallback, not a failure.
    console.warn("[calendly-slots] no event type matched the offering's calendly_url");
    return { kind: "no_match" };
  }
  cacheSet(eventTypeCache, calendlyUrl, uri, now);
  return { kind: "uri", uri };
}

/**
 * The three soonest slots for an event type.
 *
 * TWO WINDOWS, NOT ONE. Calendly caps a window at seven days, and an interviewer
 * whose next opening is nine days out is an ordinary calendar, not an empty one —
 * a single window would render "no slots" for a cohort that is perfectly
 * bookable. Two is the bound: fourteen days ahead, a student is no longer at peak
 * intent and the hosted calendar is the better surface anyway.
 *
 * `failed` IS NOT `slots.length === 0`, and the caller must not conflate them. A
 * Calendly 5xx and an interviewer with a clear fortnight both produce an empty
 * list, but they are different facts: one is transient and must not be cached or
 * reported as an empty calendar, the other is the calendar. The `reason` field is
 * what the client and any future telemetry branch on, so an outage recorded as
 * `no_slots` is a diagnosis nobody can trust.
 */
async function fetchSlots(
  eventTypeUri: string,
  now: number,
): Promise<{ slots: CalendlySlot[]; rateLimited: boolean; failed: boolean }> {
  const slots: CalendlySlot[] = [];
  for (let window = 0; window < 2; window += 1) {
    const { startTime, endTime } = availabilityWindow(now, { offsetDays: window * 7 });
    const res = await calendlyGet("/event_type_available_times", {
      event_type: eventTypeUri,
      start_time: startTime,
      end_time: endTime,
    });
    if (!res.ok) return { slots, rateLimited: res.rateLimited, failed: !res.rateLimited };
    const found = parseAvailableTimes(res.body, { limit: CALENDLY_SLOT_COUNT, now });
    for (const slot of found) {
      if (slots.length < CALENDLY_SLOT_COUNT) slots.push(slot);
    }
    if (slots.length >= CALENDLY_SLOT_COUNT) break;
  }
  return { slots, rateLimited: false, failed: false };
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => null);
  const offeringId = (body as { offeringId?: unknown } | null)?.offeringId;
  const wantsFresh = (body as { fresh?: unknown } | null)?.fresh === true;
  if (typeof offeringId !== "string" || !UUID_RE.test(offeringId)) {
    return json(req, { error: "Bad request" }, 400);
  }

  const now = Date.now();

  // A cached answer serves the render storm AND bounds `fresh`: a re-check may
  // outrun the normal TTL, but not the floor.
  const ttl = wantsFresh ? FRESH_FLOOR_MS : SLOT_TTL_MS;
  const cached = cacheGet(slotCache, offeringId, ttl, now);
  if (cached) return json(req, cached);

  // The whole token is throttled. Say so without adding to the throttling.
  if (now < backoffUntil) return soft(req, "rate_limited");

  if (!calendlyToken || !supabaseUrl || !serviceKey) {
    // Misconfiguration, not an outage — and the student must never see the
    // difference: the hosted link still books them.
    console.error("[calendly-slots] missing CALENDLY_TOKEN or Supabase service env");
    return soft(req, "unavailable");
  }

  // The offering's own link is the ONLY accepted input. A client-supplied URL
  // would let any caller point this token's availability lookup wherever they
  // liked, and would decouple the two entry points from the one row that makes
  // them the same event type (ENTRY-PARITY-1).
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: offering, error } = await admin
    .from("offerings")
    .select("calendly_url, thankyou_show_calendly")
    .eq("id", offeringId)
    .maybeSingle();

  if (error) {
    console.error(`[calendly-slots] offering read failed: ${error.message}`);
    return soft(req, "unavailable");
  }

  // No booking surface configured at all. Cached like any other answer so a
  // misconfigured offering cannot be turned into load.
  if (
    !offering ||
    offering.thankyou_show_calendly !== true ||
    !isCalendlySchedulingUrl(offering.calendly_url)
  ) {
    const payload: SlotsPayload = { slots: [], reason: "not_configured" };
    cacheSet(slotCache, offeringId, payload, now);
    return json(req, payload);
  }

  const lookup = await resolveEventTypeUri(offering.calendly_url as string, now);
  if (lookup.kind === "rate_limited") {
    backoffUntil = Date.now() + 60_000;
    return soft(req, "rate_limited");
  }
  // An OUTAGE on the two upstream calls, not a verdict about this offering. Same
  // rule as the availability call below: `unavailable`, and `soft` caches nothing,
  // so Calendly's recovery is visible on the next request rather than ninety
  // seconds later. See `EventTypeLookup`.
  if (lookup.kind === "failed") return soft(req, "unavailable");
  if (lookup.kind === "no_match") {
    const payload: SlotsPayload = { slots: [], reason: "not_configured" };
    cacheSet(slotCache, offeringId, payload, now);
    return json(req, payload);
  }

  const { slots, rateLimited, failed } = await fetchSlots(lookup.uri, now);
  if (rateLimited && slots.length === 0) {
    backoffUntil = Date.now() + 60_000;
    return soft(req, "rate_limited");
  }

  // Calendly answered the availability call with an error or did not answer at
  // all, and we have nothing to show for it. That is `unavailable`, NOT
  // `no_slots`: the client documents the latter as "the calendar is genuinely
  // empty for the next fortnight", and an outage filed under it is a fact the
  // whole client — and every future alert on this field — reads wrong. It is
  // also deliberately NOT written to `slotCache`: caching a 5xx would hold a
  // recovered Calendly behind ninety seconds of a stale outage, and `soft` is
  // the one response builder that caches nothing. Both branches still land the
  // student on the hosted calendar, so nothing about the fallback changes.
  if (failed && slots.length === 0) return soft(req, "unavailable");

  const payload: SlotsPayload = {
    slots,
    reason: slots.length > 0 ? null : "no_slots",
  };
  cacheSet(slotCache, offeringId, payload, now);
  return json(req, payload);
});
