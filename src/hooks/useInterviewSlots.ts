import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CALENDLY_APPLICATION_TOKEN_PREFIX } from "@shared/calendly";

/**
 * useInterviewSlots.ts — the reader behind the interview booking surface: the
 * three soonest slots, and the hosted Calendly link they fall back to.
 *
 * RULED — REQ-INT-0 IS BACK ON (Rahul, 2026-07-28). An earlier revision of this
 * file recorded INTEG-CAL-1 / `04-INTEGRATION-CONTRACTS.md` §6.4 as having PARKED
 * app-native slot buttons in favour of an inline hosted embed. Rahul reversed
 * that: he wants a native surface, not an embed. §6.4 and `design/briefs/
 * cohort-iv.md` V-2 are superseded in place with the same date, and this module
 * now reads TWO things instead of one.
 *
 * THE REVERSAL DOES NOT REOPEN THE DOUBLE-BOOKING HAZARD, because the surface
 * still cannot book. This integration never calls Calendly's invitee-creation
 * API: every slot button opens `scheduling_url` — Calendly's own deep link to
 * THAT EXACT SLOT — and the applicant confirms it on Calendly's page. Our list
 * is only ever an OFFER; the
 * calendar has exactly one writer, as before. What the park was really protecting
 * against is a stale offer, and that is handled where it actually happens: the
 * list is re-checked on tap (`useInterviewSlots().recheck`) so a slot taken
 * between render and tap re-offers rather than dead-ends.
 *
 *   1. `useInterviewBooking` — does THIS offering have a booking surface at all,
 *      and which Calendly URL is it? A plain client select on `offerings`, which
 *      carries a public SELECT policy (`offerings_public_read`, migration
 *      20260407182236). No edge function, works signed-in AND guest.
 *   2. `useInterviewSlots` — the three soonest openings, read through the
 *      `calendly-slots` edge function. Availability needs the Calendly API
 *      token, which is read SERVER-SIDE ONLY; nothing in this file, or anywhere
 *      under `src/`, so much as names that secret. The function is `verify_jwt = false` for the same
 *      reason the select above is unauthenticated: someone who paid the ₹400
 *      through the hosted intake chain may have no app session yet, and that is
 *      the exact person this surface exists for.
 *
 * Both degrade to the hosted Calendly link rather than to an error. The student
 * must always be able to book.
 */

/**
 * Why no embed was rendered. Drives the copy, and the caller MUST branch on it:
 * "the admin switched booking off" and "we could not read the offering" are
 * different facts and only one of them is ever true at a time.
 */
export type InterviewBookingReason =
  /**
   * `offerings.thankyou_show_calendly` is off — the first conjunct of the
   * marketing path's gate (`src/pages/ThankYou.tsx:797`).
   */
  | "booking_disabled"
  /**
   * `offerings.calendly_url` is blank or not a calendly.com URL — the SECOND
   * conjunct of that same gate. Both are saved independently by the admin
   * editor with no coupling, so "switch on, URL blank" is reachable.
   */
  | "no_calendly_url"
  /**
   * The offering row is not VISIBLE to this applicant: zero rows came back and
   * the transport reported no error. In practice that means the offering was
   * archived — `AdminOfferings.tsx:85` flips `status` active↔archived with one
   * click, which is routine when a cohort closes while applicants are still
   * mid-funnel at `app_fee_paid`, and BOTH RLS policies on `offerings` are
   * scoped to `status = 'active'` for a non-admin (`offerings_read_active`,
   * `offerings_public_read`).
   *
   * This is a LIFECYCLE fact, not an outage, and the distinction is the whole
   * point of splitting it out: reported as `unavailable` it would render "we
   * could not load your interview calendar just now" plus a "Check again"
   * button that can NEVER succeed, plus a promise to text them — a permanent
   * fake outage. It is silent instead, for the same reason `booking_disabled`
   * is: the row we would need in order to offer a booking surface is not there,
   * so there is no booking surface, and copy on top of that is a promise made
   * about a state the applicant cannot influence.
   */
  | "no_offering"
  /** The offering row could not be READ at all — offline, or a transport error. */
  | "unavailable";

/**
 * The reasons that mean "we could not read the offering", as opposed to "we
 * read it and it says there is no booking surface". These get honest error copy
 * plus a retry. Conflating the two is how an outage starts telling applicants
 * something that is not true.
 */
export const INTERVIEW_BOOKING_ERROR_REASONS = new Set<InterviewBookingReason>([
  "unavailable",
]);

export function isInterviewBookingError(
  reason: InterviewBookingReason | null | undefined,
): boolean {
  return !!reason && INTERVIEW_BOOKING_ERROR_REASONS.has(reason);
}

/**
 * The reasons that mean "there is no booking surface for this offering at all":
 * the admin's own gate says so, or the offering the gate lives on is no longer
 * visible. The marketing path renders NOTHING for the first two
 * (`ThankYou.tsx:797` gates on `thankyou_show_calendly && isCalendlyUrl(...)`),
 * so the app path must render nothing too — copy of any kind here, graceful or
 * otherwise, is a promise made on a pure misconfiguration and it breaks
 * ENTRY-PARITY-1 on the exact axis that rule exists to hold. `no_offering` joins
 * them because an archived offering is the same shape of fact (see its docs
 * above): permanent, admin-owned, and not something a retry can move.
 */
export const INTERVIEW_BOOKING_SILENT_REASONS = new Set<InterviewBookingReason>([
  "booking_disabled",
  "no_calendly_url",
  "no_offering",
]);

export function isInterviewBookingSilent(
  reason: InterviewBookingReason | null | undefined,
): boolean {
  return !!reason && INTERVIEW_BOOKING_SILENT_REASONS.has(reason);
}

/**
 * Pin every Calendly URL to calendly.com before handing it to a browser, so a
 * mis-pasted or tampered admin link cannot turn the booking step into a
 * phishing hop that arrives prefilled with the applicant's name and email.
 *
 * This is the ONE home for that pin. `ThankYou.tsx` used to carry a byte-identical
 * private copy and now imports this, because two entry points that must stay
 * literally the same event type cannot each own their own opinion of what
 * counts as a Calendly URL.
 *
 * Also used to pin `MessageEvent.origin` on the embed's booked-signal listener,
 * where the value is an origin (`https://calendly.com`) rather than a full
 * booking link — the same parse answers both.
 */
export function isCalendlyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return parsed.hostname === "calendly.com" || parsed.hostname.endsWith(".calendly.com");
  } catch {
    return false;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Calendly URL construction — ONE builder for BOTH entry points

   `offerings.calendly_url` is embedded by the app path
   (`components/interview/SlotButtons.tsx`) AND by the marketing post-payment
   path (`pages/ThankYou.tsx`). They were building that src separately — one
   through a private `withPrefill`, the other through raw string concatenation —
   which is how the two surfaces drift into producing different invitee records
   off the identical link. ENTRY-PARITY-1 is a property of ONE builder, not of
   two implementations that currently agree.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Calendly's inline-embed marker. Its own `widget.js` appends exactly
 * `embed_domain=<parent host>` and `embed_type=Inline` to the iframe src; those
 * two params ARE how the booking page learns it is embedded and therefore how
 * it knows to post its lifecycle messages (`calendly.event_scheduled` among
 * them) up to the parent frame rather than behaving as a standalone page.
 *
 * Without them the embed still books — it is Calendly's real booking page
 * either way — but it never tells the parent, so a listener on
 * `calendly.event_scheduled` is dead code and the surface serves a fresh open
 * calendar to somebody who has already taken a slot. That is the §6.4
 * double-booking hazard, arriving through the front door.
 */
export const CALENDLY_EMBED_TYPE = "Inline";

/**
 * SINCE THE 2026-07-28 REVERSAL the embed is the FALLBACK, not the primary path:
 * it renders when the availability API has nothing to offer, errors, or is
 * throttled. Everything about it below is unchanged and still load-bearing — the
 * fallback has to work exactly as well as it did when it was the only surface,
 * because the student who reaches it is by definition the one the fast path could
 * not serve.
 */

/** The prefill fields, and deliberately only these. See `applyPrefill`. */
export interface CalendlyPrefill {
  name?: string | null;
  email?: string | null;
}

export interface CalendlyTrackingOptions {
  /**
   * Random per-application UUID minted by `calendly-slots` after verifying the
   * signed-in owner. Calendly returns it in the reserved
   * `tracking.utm_content` value, giving the webhook an identity the invitee did
   * not type.
   */
  applicationToken?: string | null;
}

const APPLICATION_TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Calendly's documented prefill query params — `name` and `email`, and nothing
 * else.
 *
 * The list stops there ON PURPOSE. `_shared/calendly.ts` reads
 * `invitee.text_reminder_number` as the phone and `calendly-webhook` matches
 * phone-primary with email as fallback (INTEG-KEY-1), so a booking prefilled
 * with an extra phone field would reconcile on a DIFFERENT join key than the
 * identical booking made from the other entry point. Same fields, same invitee
 * shape, same join key, both paths — which is only enforceable now that both
 * paths call this one function.
 *
 * Adding or removing a field here changes the reconcilable record the webhook
 * parses; it is a contract change, not a UI change.
 */
function applyPrefill(url: URL, fields: CalendlyPrefill): void {
  if (fields.name) url.searchParams.set("name", fields.name);
  if (fields.email) url.searchParams.set("email", fields.email);
}

function applyTracking(url: URL, options: CalendlyTrackingOptions): void {
  const token = options.applicationToken?.trim();
  if (token && APPLICATION_TOKEN_RE.test(token)) {
    url.searchParams.set(
      "utm_content",
      `${CALENDLY_APPLICATION_TOKEN_PREFIX}${token.toLowerCase()}`,
    );
  }
}

/**
 * The host this document is served from, in the shape Calendly's own widget
 * uses (`window.location.host`, port included).
 *
 * Read at call time from the live document rather than configured, because
 * that is what `widget.js` does and because a hardcoded production host would
 * be wrong on every preview deploy.
 *
 * NOT claimed here: that this makes the message reach the parent on a plain
 * `http://localhost` dev server. Calendly's public docs no longer state how the
 * target origin is derived from `embed_domain`, and if it is reconstructed as
 * `https://<embed_domain>` then an http dev origin cannot match and the message
 * is dropped. So localhost is not a place this signal can be regression-tested
 * by hand; the tests in `__tests__/InterviewEmbed.test.tsx` pin the parameters
 * and the handler instead, and a real booking on a deployed https host is the
 * only end-to-end proof.
 *
 * Which is exactly why the surfaces do not BET on it. `isCalendlyMessage` is a
 * runtime probe of the same uncertainty — any `calendly.*` message proves the
 * channel is live — and when nothing arrives at all, `canSelfReport` stops the
 * page from quietly assuming "no message" means "not booked". If the parameters
 * turn out not to be sufficient, the surface still does not serve a fresh open
 * calendar to somebody who has already taken a slot.
 *
 * NOT sent on the native surfaces, because they render no frame at all: on
 * Android an inline Calendly frame launches the system browser by itself (see
 * `components/interview/SlotButtons.tsx`), and on iOS the WKWebView's origin is
 * `capacitor://app.leveluplearning.in` while this returns
 * `app.leveluplearning.in`, so a target origin rebuilt as `https://<host>` could
 * not match it and the message would be dropped anyway. Both natives take the
 * hosted hand-off (`calendlyBookingUrl`) instead — the same on both entry
 * points, which is ENTRY-PARITY-1 on the platform axis.
 */
function currentEmbedDomain(): string | null {
  if (typeof window === "undefined") return null;
  return window.location?.host || null;
}

/**
 * The HOSTED link: prefill only, no embed params.
 *
 * Used for every route that opens Calendly as a top-level page — the "open in a
 * new tab" escape hatch and the native hand-off. `embed_type=Inline` on a
 * top-level page would tell Calendly to render its embedded chrome outside of an
 * embed, so the two builders are split rather than parameterised into one.
 * Same URL, same prefill, same event type: same reconcilable booking.
 */
export function calendlyBookingUrl(
  bookingUrl: string,
  fields: CalendlyPrefill = {},
  options: CalendlyTrackingOptions = {},
): string {
  try {
    const url = new URL(bookingUrl);
    applyPrefill(url, fields);
    applyTracking(url, options);
    return url.toString();
  } catch {
    // Prefill is a convenience, never a requirement: an unparseable URL falls
    // back to the raw link rather than blocking the booking.
    return bookingUrl;
  }
}

/**
 * The IFRAME src: prefill plus the `embed_domain` / `embed_type` pair Calendly's
 * embed contract requires. Every inline Calendly frame in this codebase is built
 * here.
 *
 * ON `referrerPolicy="no-referrer"`, which both frames keep. The referrer is the
 * OTHER, implicit way a page can look embedded, and stripping it is why the
 * explicit params are not optional. It stays stripped deliberately: the two
 * embedding URLs are `/thank-you/:paymentOrderId` and the application status
 * route, so a referrer would hand Calendly a live payment-order identifier on
 * every frame load, for nothing. `embed_domain` sends the one bit Calendly
 * actually needs (which host to post back to) and sends it explicitly, which is
 * strictly better than leaking a whole URL and hoping the receiver parses the
 * host out of it. The pair is sufficient on its own — it is what `widget.js`
 * sets, and `widget.js` does not control the host page's referrer policy either.
 */
export function calendlyEmbedUrl(
  bookingUrl: string,
  fields: CalendlyPrefill = {},
  options: CalendlyTrackingOptions & { embedDomain?: string | null } = {},
): string {
  try {
    const url = new URL(bookingUrl);
    applyPrefill(url, fields);
    applyTracking(url, options);
    const domain = options.embedDomain ?? currentEmbedDomain();
    if (domain) url.searchParams.set("embed_domain", domain);
    url.searchParams.set("embed_type", CALENDLY_EMBED_TYPE);
    return url.toString();
  } catch {
    return bookingUrl;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   The booked marker — a signal that outlives the tab, not just the mount

   `calendly.event_scheduled` arrives once, in one document, and is gone. The
   webhook (`calendly-webhook`) is the DURABLE record, but it is asynchronous and
   can lag; in that gap the applicant reloads and, without a persisted marker, is
   served a fresh open calendar under "This is the last step" — an invitation to
   take a second slot. So the in-page signal is written down.

   It claims no funnel status and is never read as one. It withdraws a calendar,
   nothing more; the moment the webhook lands, the reconciled state owns the
   page.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * How long a locally-observed booking withdraws the calendar.
 *
 * This marker covers ONE gap and only one: the seconds-to-minutes between
 * Calendly confirming a booking inside the frame and `calendly-webhook`
 * recording it, after which the reconciled row owns the page and the parent's
 * own gate stops mounting a booking surface at all. It is therefore sized to
 * that gap plus a wide margin, and deliberately NOT to the life of the booking,
 * because the two ways of getting it wrong are asymmetric in time:
 *
 *   • too SHORT → a lagging webhook re-opens the calendar inside the very gap
 *     this exists to cover, which is measured in seconds;
 *   • too LONG → a booking CANCELLED after the fact (from Calendly's own email,
 *     typically hours or days later) is invisible to client storage, because the
 *     webhook can only write the database. `ApplicationStatus` mounts this
 *     component for the REBOOK path as well as the never-booked one, so a marker
 *     that outlives a cancellation greets the student who just tapped "Rebook"
 *     with "your interview time is booked" — reintroducing the exact stranding
 *     this phase exists to remove. A week-long marker walks straight into it.
 *
 * Two hours is ~2 orders of magnitude more than the webhook needs, and is
 * comfortably shorter than any realistic time-to-cancel. The booked panel also
 * carries an explicit reopen control worded for the cancelled case, so this
 * ceiling is a backstop and not the only way out.
 */
export const CALENDLY_BOOKED_TTL_MS = 2 * 60 * 60 * 1000;

/** The scope used when we do not know whose booking this is. See `bookedStores`. */
const ANON_BOOKED_SCOPE = "anon";

/**
 * A short, stable, non-reversible discriminator for WHOSE marker this is,
 * derived from the one identifier both entry points already hold: the invitee
 * email that is also the Calendly prefill.
 *
 * The marker is device-durable and these devices are shared — a telecaller's
 * handset, a family phone. Keyed by offering alone, one applicant's booking
 * withdraws the calendar from the NEXT person to open the page on that device:
 * the fee-paid-but-never-scheduled loss this phase exists to close, manufactured
 * by the fix for it. Scoping the key by identity makes that impossible, and it
 * is also why this key needs no entry in `AuthContext.clearPerUserLocalState` —
 * a second user cannot read the first user's marker in the first place, so there
 * is nothing for a sign-out purge to protect.
 *
 * Hashed rather than stored raw so a shared device does not accumulate a
 * readable list of who booked what in `localStorage`. FNV-1a: a namespacing
 * device, not a security boundary.
 */
function bookedIdentity(identity: string | null | undefined): string | null {
  const normalized = identity?.trim().toLowerCase();
  if (!normalized) return null;
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Per offering AND per applicant: one applicant can hold applications to two
 * cohorts, and one device can hold two applicants.
 */
export const calendlyBookedKey = (
  offeringId: string,
  identity?: string | null,
): string =>
  `levelup.interview.booked.${offeringId}.${bookedIdentity(identity) ?? ANON_BOOKED_SCOPE}`;

/**
 * WHERE a marker may live, which depends on whether we know whose it is.
 *
 * Identified → `localStorage` first (survives reload, tab close, and the
 * Android/iOS WebView being evicted from memory), `sessionStorage` second so a
 * browser that refuses persistent storage still covers the tab.
 *
 * ANONYMOUS (a guest order that carries no email) → `sessionStorage` ONLY. An
 * unowned marker in device-durable storage is precisely the shared-device leak
 * the identity scope exists to prevent, and a tab-scoped one still survives the
 * reload this whole mechanism is about; it just does not survive handing the
 * phone to somebody else.
 *
 * Both accesses are wrapped: private modes throw on ACCESS, not only on write.
 */
function bookedStores(identified: boolean): Storage[] {
  if (typeof window === "undefined") return [];
  const out: Storage[] = [];
  if (identified) {
    try {
      if (window.localStorage) out.push(window.localStorage);
    } catch {
      // Storage disabled. Fall through to the session store, then to memory.
    }
  }
  try {
    if (window.sessionStorage) out.push(window.sessionStorage);
  } catch {
    // Both disabled: the caller's in-memory state still covers the mount the
    // booking happened on, which is the common case.
  }
  return out;
}

/** Has THIS applicant already completed THIS offering's calendar on this device? */
export function readCalendlyBooked(
  offeringId: string | undefined,
  identity?: string | null,
  now: number = Date.now(),
): boolean {
  if (!offeringId) return false;
  const key = calendlyBookedKey(offeringId, identity);
  for (const store of bookedStores(!!bookedIdentity(identity))) {
    let raw: string | null = null;
    try {
      raw = store.getItem(key);
    } catch {
      continue;
    }
    if (!raw) continue;

    let at: number | null = null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && typeof (parsed as { at?: unknown }).at === "number") {
        at = (parsed as { at: number }).at;
      }
    } catch {
      // Not our shape.
    }

    // Fresh and ours: withdraw the calendar.
    if (at !== null && now - at < CALENDLY_BOOKED_TTL_MS) return true;

    // Expired, or a value we cannot date. An undateable value is NOT ours —
    // every write below is `{at:<number>}` — and it used to be read as "booked"
    // on the theory that re-offering a calendar is the only hazard here. It is
    // not: withdrawing a calendar from somebody who has not booked strands them,
    // and unlike the double-booking case there is no reconciled record behind it
    // to argue from. Sweep it so the same entry is not re-decided on every read,
    // and offer the calendar.
    try {
      store.removeItem(key);
    } catch {
      // Nothing to do; the checks above already answered.
    }
  }
  return false;
}

/** Record that this applicant just completed the calendar for this offering. */
export function rememberCalendlyBooked(
  offeringId: string,
  identity?: string | null,
  now: number = Date.now(),
): void {
  const key = calendlyBookedKey(offeringId, identity);
  const value = JSON.stringify({ at: now });
  // Written to every permitted store rather than the first that works: a quota
  // failure on one must not cost the marker entirely.
  for (const store of bookedStores(!!bookedIdentity(identity))) {
    try {
      store.setItem(key, value);
    } catch {
      // Quota or private mode. The other store, or in-memory state, carries it.
    }
  }
}

/** Drop the marker — the booking did not complete, or the slot was cancelled. */
export function forgetCalendlyBooked(
  offeringId: string,
  identity?: string | null,
): void {
  const key = calendlyBookedKey(offeringId, identity);
  // Cleared from BOTH stores regardless of whether we can identify the writer,
  // so an escape hatch can never be defeated by a marker sitting in the store
  // this identity would not have written to.
  for (const store of bookedStores(true)) {
    try {
      store.removeItem(key);
    } catch {
      // See rememberCalendlyBooked.
    }
  }
}

/**
 * The `calendly.*` event name this `MessageEvent` carries, or null if it is not
 * one of Calendly's.
 *
 * Origin-pinned to calendly.com with the same guard the URL itself gets: an
 * arbitrary frame or extension must not be able to blank the booking surface by
 * posting at us.
 *
 * The string branch is deliberate. `postMessage` payloads survive as structured
 * clones OR as JSON text depending on how the sender was built, and this
 * listener exists precisely because we cannot hand-verify Calendly's embed
 * channel from localhost (see `currentEmbedDomain`). Accepting both shapes costs
 * one `JSON.parse` inside an origin check that has already passed, and removes
 * one way for the whole mechanism to be silently dead.
 */
function calendlyEventName(event: MessageEvent): string | null {
  if (!isCalendlyUrl(event.origin)) return null;
  let data: unknown = event.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const name = (data as { event?: unknown }).event;
  return typeof name === "string" && name.startsWith("calendly.") ? name : null;
}

/**
 * Is this ANY message from Calendly's embedded booking page — `event_type_viewed`,
 * `date_and_time_selected`, `event_scheduled`, whichever?
 *
 * This is the HANDSHAKE PROBE, and it is the answer to "we cannot prove the
 * embed params work". Calendly's booking page chatters at its parent from the
 * first paint onward; one message of any kind is proof that `embed_domain` /
 * `embed_type` did their job and that a booking WILL be reported. No message at
 * all is proof of the opposite, and the surfaces use it to decide whether they
 * may rely on the signal or must offer the applicant a way to say so themselves
 * (`canSelfReport`). Neither the probe nor the fallback ever books anything or
 * claims a funnel state; they only decide whether a calendar keeps being offered
 * to somebody who has already used it.
 */
export function isCalendlyMessage(event: MessageEvent): boolean {
  return calendlyEventName(event) !== null;
}

/** Is this Calendly telling us the applicant finished booking? */
export function isCalendlyBookedMessage(event: MessageEvent): boolean {
  return calendlyEventName(event) === "calendly.event_scheduled";
}

/**
 * How long the embed gets to prove it can talk to us before the applicant is
 * offered a way to say "I already picked my time" themselves.
 *
 * Sized so it cannot fire during a booking that is actually working: Calendly's
 * first message lands within a second of the frame painting, so on any embed
 * where the channel is live this control is never rendered at all. It is a
 * fallback for the one outcome the parameters alone cannot guarantee — not a
 * second way to do the normal thing.
 *
 * And it is long enough that nobody reaches it by accident: a genuine booking
 * (pick a date, pick a time, fill the form, submit) does not complete in under
 * 45 seconds, so a control offered after that point is being read by somebody
 * who has been sitting with this calendar, not by somebody scrolling past it.
 */
export const CALENDLY_SELF_REPORT_AFTER_MS = 45_000;

/**
 * The booked-panel copy, and the two guarded exits, in ONE place.
 *
 * Both entry points render these strings. They were duplicated, which is how the
 * app path and the marketing path end up telling the same student two different
 * things about the same booking — ENTRY-PARITY-1 applies to what the surfaces
 * SAY as much as to the URL they build, and NFR-COPY-4's grep is only worth
 * anything if there is one place for it to grep.
 *
 * On the wording of `reopenConfirm*`: the panel's premise is that the
 * confirmation has NOT arrived yet, so "booking did not complete?" is a line a
 * student who booked 30 seconds ago and sees an empty inbox will rationally tap.
 * Behind it, therefore, is a question and the actual consequence — a second held
 * slot carries no `old_invitee` for the receiver to reconcile against (§6.4) —
 * rather than an immediate open calendar. A hard time-lock was considered and
 * rejected: it would also block the student whose booking genuinely failed,
 * which is the stranding this phase exists to remove. The guard is the
 * confirmation, and the confirmation names the cost.
 */
export const CALENDLY_BOOKED_COPY = {
  heading: "Your interview time is booked",
  body: "Calendly is holding your slot and the confirmation is on its way to your inbox.",
  reassurance:
    "Nothing else to do right now. This page catches up once the booking reaches us.",
  reopenPrompt: "Booking did not complete, or your time was cancelled? Reopen the calendar",
  reopenQuestion: "Open the calendar again and pick a new time?",
  reopenWarning:
    "Do this only if you have no confirmation email, or your time was cancelled. If your first booking did go through, picking again holds a second slot and we cannot tell which one you meant.",
  reopenConfirm: "Yes, pick a new time",
  reopenCancel: "No, keep my time",
  selfReportBody:
    "This calendar has not told us whether you finished. If you already picked a time and Calendly showed you a confirmation, you are done and you do not need to pick again.",
  selfReportPrompt: "I already picked my time",
  selfReportQuestion: "Put this calendar away?",
  selfReportWarning:
    "Only if Calendly showed you a confirmation. If it did not, pick a time above instead.",
  selfReportConfirm: "Yes, I have my time",
  selfReportCancel: "Not yet",
} as const;

export interface CalendlyBookedSignal {
  /** True while a locally-observed booking should withdraw the calendar. */
  booked: boolean;
  /**
   * True only for a booking this document WATCHED happen (Calendly's message, or
   * the applicant's own confirmation), as opposed to one seeded from storage on
   * mount. It is the difference between a state CHANGE, which assistive tech has
   * to be told about and whose focus has to be moved because the frame it was
   * inside just disappeared, and a page that simply opened in that state.
   */
  announceBooked: boolean;
  /** The reopen control has been tapped and is awaiting confirmation. */
  reopenPending: boolean;
  requestReopen: () => void;
  cancelReopen: () => void;
  /** Drop the marker and put the calendar back. */
  confirmReopen: () => void;
  /**
   * The embed never proved it can talk to us, and enough time has passed that a
   * booking could have completed unseen. See `CALENDLY_SELF_REPORT_AFTER_MS`.
   */
  canSelfReport: boolean;
  selfReportPending: boolean;
  requestSelfReport: () => void;
  cancelSelfReport: () => void;
  confirmSelfReport: () => void;
}

/**
 * The whole booked-signal behaviour — seed from storage, listen for Calendly's
 * completion message, write it down, and offer the two guarded ways back — as
 * ONE hook, so both entry points get the same FLOW and not merely the same URL.
 *
 * ENTRY-PARITY-1 is why this is a hook rather than two listeners. The app path
 * (`components/interview/SlotButtons.tsx`) and the marketing post-payment path
 * (`pages/ThankYou.tsx`) embed the SAME `offerings.calendly_url`. Both now carry
 * `embed_domain`, so Calendly posts `calendly.event_scheduled` at both; a page
 * that sets the parameter and drops the message is strictly worse than one that
 * never asked for it, because it re-serves an open calendar to somebody who has
 * already taken a slot and a second booking carries no `old_invitee` for the
 * receiver to reconcile against (§6.4).
 *
 * `identity` is the same value the frame is prefilled with (the invitee email);
 * see `bookedIdentity` for why the marker is scoped to it.
 *
 * `options.listen` exists for the surfaces that render no frame — the native
 * hand-off — where there is nothing in this document to hear from. It also turns
 * off the self-report fallback, which is a statement about a frame that is not
 * there.
 */
export function useCalendlyBookedSignal(
  offeringId: string | undefined,
  identity: string | null | undefined,
  options: { listen?: boolean; selfReportReady?: boolean } = {},
): CalendlyBookedSignal {
  const listen = options.listen ?? true;
  /**
   * The SLOT path's version of the dwell timer, and the reason the timer alone is
   * no longer sufficient.
   *
   * A slot button opens Calendly as a TOP-LEVEL page in another tab, so there is
   * no frame in this document and no `calendly.event_scheduled` will ever arrive
   * — `listen` is false and the dwell clock never runs. But we know something the
   * embed case never did: the student tapped a specific time and left to confirm
   * it. Offering them "I already picked my time" at that exact moment is the only
   * way this document can learn a booking happened, and it is the same guarded,
   * self-reported control the embed's silent-channel fallback uses — same copy,
   * same confirmation, same marker. The caller raises this only AFTER a tap, so
   * it is never on screen for somebody who has done nothing.
   */
  const selfReportReady = options.selfReportReady ?? false;
  const [booked, setBooked] = useState(() => readCalendlyBooked(offeringId, identity));
  const [announceBooked, setAnnounceBooked] = useState(false);
  const [reopenPending, setReopenPending] = useState(false);
  const [selfReportPending, setSelfReportPending] = useState(false);
  /** Has the embed said ANYTHING to us? See `isCalendlyMessage`. */
  const [handshake, setHandshake] = useState(false);
  const [dwellElapsed, setDwellElapsed] = useState(false);

  /**
   * A booking this document WATCHED happen. A ref because the key effect below
   * must read the current value without re-subscribing to it.
   */
  const observed = useRef(false);

  // Either input can arrive late (the parent is still resolving its row), so the
  // initial read may have run against `undefined`.
  //
  // A booking we have ALREADY OBSERVED is never un-observed by that key moving.
  // On `/thank-you` the identity is `guest_email ?? session?.user?.email` and the
  // session starts null, so a signed-in buyer's order resolves with identity
  // `undefined`: the marker gets written under the anonymous scope, and when the
  // session lands a plain re-read finds nothing under the identified key and
  // flips `booked` back to false — putting an open calendar back in front of
  // somebody who booked seconds ago, which is the §6.4 hazard restored by the fix
  // for it. So the observed booking is re-written under the NEW key instead,
  // which also promotes it from the tab-scoped store to the durable one.
  //
  // A marker merely SEEDED from storage still re-reads normally: that is what
  // keeps one applicant's booking from withdrawing another's calendar on a shared
  // handset (`bookedIdentity`), and no booking is un-observed by it because
  // nothing in this document ever observed one.
  useEffect(() => {
    if (observed.current) {
      if (offeringId) rememberCalendlyBooked(offeringId, identity);
      setBooked(true);
      return;
    }
    setBooked(readCalendlyBooked(offeringId, identity));
  }, [offeringId, identity]);

  useEffect(() => {
    if (!offeringId || !listen) return;

    const onMessage = (event: MessageEvent) => {
      // Any Calendly message at all proves the embed handshake is live, which is
      // what retires the fallback below.
      if (!isCalendlyMessage(event)) return;
      setHandshake(true);
      if (!isCalendlyBookedMessage(event)) return;
      rememberCalendlyBooked(offeringId, identity);
      observed.current = true;
      setBooked(true);
      setAnnounceBooked(true);
      setReopenPending(false);
      setSelfReportPending(false);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [offeringId, identity, listen]);

  // The fallback's clock. It never runs once the handshake has proved itself, so
  // on a working embed this timer is armed for one render and then cleared.
  useEffect(() => {
    if (!listen || booked || handshake || dwellElapsed) return;
    const timer = window.setTimeout(
      () => setDwellElapsed(true),
      CALENDLY_SELF_REPORT_AFTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [listen, booked, handshake, dwellElapsed]);

  const requestReopen = useCallback(() => setReopenPending(true), []);
  const cancelReopen = useCallback(() => setReopenPending(false), []);

  // The marker must be cleared from storage as well as from state, or the next
  // mount restores the withdrawn calendar the applicant just asked to leave —
  // and `observed` with it, or the effect above would immediately write it back.
  const confirmReopen = useCallback(() => {
    if (offeringId) forgetCalendlyBooked(offeringId, identity);
    observed.current = false;
    setBooked(false);
    setAnnounceBooked(false);
    setReopenPending(false);
  }, [offeringId, identity]);

  const requestSelfReport = useCallback(() => setSelfReportPending(true), []);
  const cancelSelfReport = useCallback(() => setSelfReportPending(false), []);

  const confirmSelfReport = useCallback(() => {
    if (!offeringId) return;
    rememberCalendlyBooked(offeringId, identity);
    observed.current = true;
    setBooked(true);
    setAnnounceBooked(true);
    setSelfReportPending(false);
  }, [offeringId, identity]);

  return {
    booked,
    announceBooked,
    reopenPending,
    requestReopen,
    cancelReopen,
    confirmReopen,
    canSelfReport:
      !!offeringId &&
      !booked &&
      (selfReportReady || (listen && !handshake && dwellElapsed)),
    selfReportPending,
    requestSelfReport,
    cancelSelfReport,
    confirmSelfReport,
  };
}

export interface InterviewBookingPayload {
  /** The offering's Calendly booking URL, already pinned to calendly.com. */
  bookingUrl: string | null;
  reason: InterviewBookingReason | null;
}

/** The fail-soft payload: honest error copy plus a retry, never a dead end. */
const UNAVAILABLE: InterviewBookingPayload = { bookingUrl: null, reason: "unavailable" };

export interface UseInterviewBookingResult {
  data: InterviewBookingPayload | undefined;
  /**
   * "A request is out and has not answered yet" — the gate for the loading
   * skeleton, and NOTHING else.
   *
   * It is deliberately false when `offeringId` is undefined. A react-query v5
   * query that is disabled and holds no data reports `status: "pending"`
   * forever, so gating the skeleton on `isPending` alone would shimmer
   * indefinitely for a parent that will never supply an id. Waiting on the
   * PARENT is a different state from waiting on the SERVER.
   */
  isWaiting: boolean;
  /** True while a retry is in flight. Drives the retry button. */
  isFetching: boolean;
  refetch: () => void;
}

/**
 * Read whether this offering has an in-app booking surface, and its URL.
 *
 * Fail-soft by contract: the queryFn RESOLVES on every error rather than
 * throwing, so a bad connection degrades to honest copy plus a retry instead of
 * a spinner-lock or a retry storm.
 */
export function useInterviewBooking(
  offeringId: string | undefined,
): UseInterviewBookingResult {
  const query = useQuery<InterviewBookingPayload>({
    queryKey: ["interview", "booking", offeringId],
    enabled: !!offeringId,
    // The admin toggle and the URL change about as often as an offering is
    // edited, and the availability that actually moves lives inside Calendly's
    // own iframe — so there is nothing here worth re-reading on every focus.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    // The applicant gets an explicit retry control instead, which is both
    // honest and cheaper than a background retry they cannot see.
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offerings")
        .select("calendly_url, thankyou_show_calendly")
        .eq("id", offeringId as string)
        .maybeSingle();

      // Transport failure and zero-rows are DIFFERENT facts and `maybeSingle`
      // is what makes them separable — it resolves `{data: null, error: null}`
      // for "no row matched" and only sets `error` for a real failure. Folding
      // them together (the old `if (error || !data)`) turned an archived
      // offering into a permanent, unfixable "we could not load your calendar,
      // check again" — an outage report and an SMS promise standing in for a
      // row-visibility fact. Only the first of these two is retryable.
      if (error) return UNAVAILABLE;
      if (!data) return { bookingUrl: null, reason: "no_offering" };

      // BOTH conjuncts of the marketing path's gate, reported separately so the
      // caller can go silent on either without pretending it knows which.
      if (data.thankyou_show_calendly !== true) {
        return { bookingUrl: null, reason: "booking_disabled" };
      }
      if (!isCalendlyUrl(data.calendly_url)) {
        return { bookingUrl: null, reason: "no_calendly_url" };
      }
      return { bookingUrl: data.calendly_url as string, reason: null };
    },
  });

  return {
    data: query.data,
    // A disabled query is pending forever, and that is a wait on the PARENT,
    // which only the caller can bound. Reporting it as `isWaiting` is how a
    // skeleton becomes permanent.
    isWaiting: !!offeringId && query.isPending,
    isFetching: query.isFetching,
    refetch: () => {
      void query.refetch();
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   THE SLOTS — the reinstated REQ-INT-0 surface (Rahul, 2026-07-28)

   Three soonest openings, read through the `calendly-slots` edge function.

   WHY AN EDGE FUNCTION AND NOT A CLIENT FETCH: availability needs
   the Calendly API token, and a token in the bundle is a token in every student's
   devtools — one that can read and cancel bookings across the whole org account.
   The function reads it from `Deno.env` and nothing else; no symbol in this file
   names it, so the "token in no bundle" grep holds by construction.

   WHAT THIS LIST IS: an OFFER, never a hold. Calendly's API cannot create a
   booking, so the confirm always happens on Calendly's own page via the per-slot
   `scheduling_url`. That is what keeps Calendly the single writer of its calendar
   even though we now render times ourselves.
   ──────────────────────────────────────────────────────────────────────────── */

/** One offered opening. `bookingUrl` is Calendly's deep link to THAT slot. */
export interface InterviewSlot {
  /** ISO-8601 start instant, as Calendly sent it. Rendered in IST at the leaf. */
  startTime: string;
  bookingUrl: string;
}

/**
 * Why there is nothing to offer. EVERY value falls back to the hosted Calendly
 * link — none of them is an error state the student is asked to do anything
 * about.
 *
 *   • `no_slots`       — the calendar is genuinely empty for the next fortnight.
 *   • `not_configured` — this offering has no availability we can read (booking
 *                        switched off, or a link on the second Calendly account
 *                        this token cannot see — INTEG-CAL-1's fast-follow).
 *   • `rate_limited`   — Calendly throttled us. Transient by definition.
 *   • `unavailable`    — the function, the network, or Calendly's availability
 *                        call itself failed. THE SERVER OWES US THIS
 *                        DISTINCTION: a Calendly 5xx answers `unavailable` and
 *                        is not cached, precisely so the empty list above keeps
 *                        meaning an empty calendar. Both land the student on the
 *                        hosted calendar, so the fallback does not care — but
 *                        this field is what any diagnosis reads, and a `reason`
 *                        that lies about which of the two happened is worse than
 *                        no field at all.
 */
export type InterviewSlotsReason =
  | "no_slots"
  | "not_configured"
  | "rate_limited"
  | "unavailable";

export interface InterviewSlotsPayload {
  slots: InterviewSlot[];
  reason: InterviewSlotsReason | null;
  applicationToken: string | null;
}

/** The fail-soft payload. Empty list, fallback reason, never a thrown query. */
const SLOTS_UNAVAILABLE: InterviewSlotsPayload = {
  slots: [],
  reason: "unavailable",
  applicationToken: null,
};

/**
 * The reasons that mean "we did not get a straight answer", as opposed to "we got
 * one and it is empty". Only the second kind may overwrite a good list: a
 * re-check that fails must not blank three perfectly valid buttons in front of
 * somebody who is mid-tap.
 */
function isTrustworthySlotsAnswer(payload: InterviewSlotsPayload): boolean {
  return payload.reason !== "unavailable" && payload.reason !== "rate_limited";
}

/**
 * The slots in a payload that have NOT already started.
 *
 * Only used when a list is being carried through an answer we could not trust
 * (see the queryFn). Holding a list is a claim that it is still bookable, and a
 * start time in the past is not: if an outage outlives the openings it was
 * covering, the surface must let go and fall back to the hosted calendar rather
 * than offer a button whose Calendly page will refuse it.
 */
function futureSlots(payload: InterviewSlotsPayload, now: number): InterviewSlot[] {
  return payload.slots.filter((slot) => {
    const at = Date.parse(slot.startTime);
    return Number.isFinite(at) && at > now;
  });
}

/**
 * Narrow the function's response, and PIN EVERY LINK TO calendly.com on the way
 * through.
 *
 * The pin is not redundant with the server's. These URLs are opened in a browser
 * carrying the applicant's name and email as query parameters, and this is the
 * last place before that happens; a client that trusts whatever an edge function
 * hands it is one compromised dependency away from a prefilled phishing hop. Same
 * rule, same reason, as `isCalendlyUrl` on the admin-authored link.
 */
export function parseSlotsResponse(data: unknown): InterviewSlotsPayload {
  if (!data || typeof data !== "object") return SLOTS_UNAVAILABLE;
  const raw = data as { slots?: unknown; reason?: unknown; applicationToken?: unknown };

  const slots: InterviewSlot[] = [];
  if (Array.isArray(raw.slots)) {
    for (const item of raw.slots) {
      if (!item || typeof item !== "object") continue;
      const { startTime, bookingUrl } = item as { startTime?: unknown; bookingUrl?: unknown };
      if (typeof startTime !== "string" || !startTime.trim()) continue;
      if (typeof bookingUrl !== "string" || !isCalendlyUrl(bookingUrl)) continue;
      slots.push({ startTime, bookingUrl });
    }
  }

  const reason = raw.reason;
  const known: InterviewSlotsReason[] = [
    "no_slots",
    "not_configured",
    "rate_limited",
    "unavailable",
  ];
  const parsedReason =
    typeof reason === "string" && (known as string[]).includes(reason)
      ? (reason as InterviewSlotsReason)
      : null;
  const token = typeof raw.applicationToken === "string" &&
      APPLICATION_TOKEN_RE.test(raw.applicationToken.trim())
    ? raw.applicationToken.trim().toLowerCase()
    : null;

  // A response that carried neither slots nor a reason we understand is not an
  // empty calendar, it is a response we could not read.
  if (slots.length === 0 && parsedReason === null) return SLOTS_UNAVAILABLE;
  return { slots, reason: slots.length > 0 ? null : parsedReason, applicationToken: token };
}

/**
 * How long a slot list is treated as current.
 *
 * Short, because it is a claim about a calendar other people are booking into;
 * long enough that mounting the surface twice in one session is not two calls.
 * The tap path does not rely on it at all — see `recheck`.
 */
export const INTERVIEW_SLOTS_STALE_MS = 60_000;

const slotsQueryKey = (
  offeringId: string | undefined,
  applicationId: string | undefined,
) => ["interview", "slots", offeringId, applicationId] as const;

/** One call to the function. Resolves on every failure; never throws. */
async function readSlots(
  offeringId: string,
  applicationId: string | undefined,
  fresh: boolean,
): Promise<InterviewSlotsPayload> {
  const { data, error } = await supabase.functions.invoke("calendly-slots", {
    body: { offeringId, applicationId, fresh },
  });
  if (error) return SLOTS_UNAVAILABLE;
  return parseSlotsResponse(data);
}

export interface UseInterviewSlotsResult {
  slots: InterviewSlot[];
  reason: InterviewSlotsReason | null;
  applicationToken: string | null;
  /** A request is out. Gates the skeleton, and nothing else. */
  isWaiting: boolean;
  isFetching: boolean;
  refetch: () => void;
  /**
   * Re-read availability RIGHT NOW, bypassing both caches, and answer with what
   * Calendly says at this instant.
   *
   * This is the tap path. A slot can be taken between the render and the tap —
   * by another applicant, or by the interviewer blocking their own calendar — and
   * sending somebody to a dead slot at the exact moment they finally decided to
   * book is the worst available outcome on this surface.
   *
   * A FAILED re-check does not block the tap and does not overwrite the list. The
   * student proceeds to the slot they chose: Calendly's own page is then the
   * authority, and it says so gracefully. Refusing to open on a network hiccup
   * would invent a dead end out of a working booking.
   */
  recheck: () => Promise<InterviewSlotsPayload>;
}

/**
 * Read the three soonest openings for an offering.
 *
 * Fail-soft by contract, exactly like `useInterviewBooking`: the queryFn RESOLVES
 * on every error so the caller falls back to the hosted link instead of
 * spinner-locking or retry-storming.
 */
export function useInterviewSlots(
  offeringId: string | undefined,
  options: { enabled?: boolean; applicationId?: string } = {},
): UseInterviewSlotsResult {
  const enabled = !!offeringId && (options.enabled ?? true);
  const queryClient = useQueryClient();

  const query = useQuery<InterviewSlotsPayload>({
    queryKey: slotsQueryKey(offeringId, options.applicationId),
    enabled,
    staleTime: INTERVIEW_SLOTS_STALE_MS,
    // Availability moves, so a student returning to the tab should not be shown
    // a list from ten minutes ago — but `staleTime` already bounds how often
    // that costs a call.
    refetchOnWindowFocus: true,
    retry: false,
    /**
     * AN ANSWER WE DID NOT GET STRAIGHT MAY NOT BLANK A LIST WE DID.
     *
     * `isTrustworthySlotsAnswer` was applied only inside `recheck`, which left the
     * ORDINARY refetch — the one `refetchOnWindowFocus` fires the instant a
     * student returns from Calendly — free to overwrite three good buttons with
     * `SLOTS_UNAVAILABLE` on a mobile-network blip, an edge cold start or a
     * Calendly 429. That is not a cosmetic flicker: the caller's whole slot branch
     * disappears with the list, and with it the post-tap panel used to disappear
     * too (`components/interview/SlotButtons.tsx` now builds that panel outside
     * the branch, which is the other half of this fix). The student who had just
     * booked was handed a fresh open calendar — the §6.4 double-booking hazard,
     * manufactured by a failed background call.
     *
     * So a failed or throttled answer KEEPS the previous list, minus any opening
     * that has since started (`futureSlots`), and only surrenders it when there is
     * nothing still bookable to keep. An empty answer we DO trust (`no_slots`,
     * `not_configured`) overwrites normally: that is the calendar telling us the
     * truth, and the fallback below it is the hosted calendar, never a dead end.
     */
    queryFn: async () => {
      const answer = await readSlots(offeringId as string, options.applicationId, false);
      if (isTrustworthySlotsAnswer(answer)) return answer;
      const previous = queryClient.getQueryData<InterviewSlotsPayload>(
        slotsQueryKey(offeringId, options.applicationId),
      );
      if (!previous) return answer;
      const kept = futureSlots(previous, Date.now());
      return kept.length > 0
        ? {
            slots: kept,
            reason: null,
            applicationToken: previous.applicationToken ?? answer.applicationToken,
          }
        : answer;
    },
  });

  const recheck = useCallback(async (): Promise<InterviewSlotsPayload> => {
    if (!offeringId) return SLOTS_UNAVAILABLE;
    const payload = await readSlots(offeringId, options.applicationId, true);
    if (isTrustworthySlotsAnswer(payload)) {
      queryClient.setQueryData(slotsQueryKey(offeringId, options.applicationId), payload);
    }
    return payload;
  }, [offeringId, options.applicationId, queryClient]);

  return {
    slots: query.data?.slots ?? [],
    reason: query.data?.reason ?? null,
    applicationToken: query.data?.applicationToken ?? null,
    // A disabled query is pending forever; that is a wait on the PARENT and must
    // never shimmer. Same rule as `useInterviewBooking.isWaiting`.
    isWaiting: enabled && query.isPending,
    isFetching: query.isFetching,
    refetch: () => {
      void query.refetch();
    },
    recheck,
  };
}

/**
 * The slot surface's copy, in one place for the same reason
 * `CALENDLY_BOOKED_COPY` is: two entry points render it, and NFR-COPY-4's grep
 * for "free" / "mentor" / "counselor" is only worth something if there is one
 * place to grep.
 */
export const INTERVIEW_SLOTS_COPY = {
  heading: "Book your interview",
  subheading: "This is the last step before your application is reviewed.",
  slotsLead: "Pick a time. Calendly confirms it with your details already filled in.",
  moreTimes: "See all available times",
  /**
   * Shown when a re-check finds the tapped slot gone AND there are replacements.
   * It states the fact and hands over the replacement in the same breath — no
   * apology, no dead end.
   */
  slotTaken: "That time was just taken. Here are the three soonest now.",
  /**
   * The same moment, with NOTHING left to re-offer: the last opening went, or the
   * interviewer cleared the fortnight between the render and the tap. It needs its
   * own line because the surface underneath has just swapped from three buttons to
   * the full calendar, and the sentence above ("here are the three soonest") would
   * then point at buttons that are no longer there. Without it the swap happens in
   * silence, which is the one thing a list changing under somebody's thumb may
   * never do.
   */
  slotTakenEmpty:
    "That time was just taken, and nothing else is open right now. The full calendar below has every time we have.",
  /**
   * After a tap that handed off. Deliberately does NOT claim the booking happened:
   * the confirm is on Calendly's page and this document cannot see it.
   */
  openedHeading: "Finish on Calendly",
  openedBody:
    "Your time opens on Calendly with your details already filled in. Confirm it there, then come back and tell us below.",
  /**
   * The way back to the same slot, always rendered beside the copy above. It is a
   * real link on a real tap, which is the ONE hand-off mechanism that works on
   * every surface this ships to — the web tab, the Android WebView and the iOS
   * WKWebView. If anything swallowed the first hand-off, this is the recovery,
   * and it is why the panel above can describe what happened without gambling on
   * it.
   */
  openedReopen: "Open that time again",
  openedConfirm: "I confirmed my time",
  openedDismiss: "Pick a different time",
  /**
   * The tap did NOT hand off: a desktop browser with popups blocked refused the
   * tab, and `window.open` said so by answering null.
   *
   * This is its own state and not a variant of the one above for one reason: the
   * panel above ends in "I confirmed my time", a control that withdraws the
   * calendar for two hours, and offering it to somebody whose Calendly never
   * opened is how an applicant marks themselves booked for an interview that does
   * not exist. So the blocked state says what happened, gives the link that is
   * never blocked, and shows no confirmation control until it is used.
   */
  blockedHeading: "Your browser blocked the new tab",
  blockedBody:
    "Nothing opened, so nothing is booked yet. Use the link below and your time is still waiting with your details filled in.",
  blockedOpen: "Open your time on Calendly",
} as const;
