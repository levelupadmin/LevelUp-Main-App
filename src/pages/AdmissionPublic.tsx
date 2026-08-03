/**
 * AdmissionPublic — the RECIPIENT's view of a shared admission link (REQ-DEC-6 /
 * FLOW-FEEDBACK §9h, Screen 6H).
 *
 * This is the most public surface in the funnel: anyone with the link, logged
 * out, on any device. It therefore renders EXACTLY two pieces of per-record
 * data and nothing else. Everything else on the page is static, cohort-agnostic
 * copy that is true of every LevelUp cohort. In particular there is no date on
 * the card: no admitted-on column exists, and captioning the share page's own
 * publish stamp as an admit date would assert a fact the data does not support.
 *
 * How the whitelist is enforced (three layers, see the header of
 * `supabase/migrations/20260728110000_admission_public_policy.sql`):
 *   1. `anon` holds NO grant on `cohort_applications` and there is no anon RLS
 *      policy on it, so the table itself is unreachable from here.
 *   2. `get_admission_page(p_slug)` is a SECURITY DEFINER function whose SELECT
 *      list IS the whitelist. It is the only thing this page can call.
 *   3. This file picks the whitelisted keys off the response BY NAME
 *      (`pickWhitelist`) and renders only those. No `select('*')`, no spread of
 *      the response into JSX, so a future widening of the RPC cannot silently
 *      start painting new fields onto a public page.
 *
 * Unpublished, revoked, unknown or malformed slug → the RPC returns zero rows →
 * this page renders the private/404 state. Same for a flag-off build, which
 * never issues the request at all. A REQUEST FAILURE is a different outcome and
 * is rendered differently: telling an offline recipient that someone's admission
 * was unpublished is a lie, and one they cannot recover from without a retry.
 *
 * ── THE FLAG IS NOT THE BOUNDARY ──
 * `VITE_DECISION_FLOW` gates this ROUTE and nothing else, so "it is all behind a
 * flag, default OFF" is true of the bundle and false of the feature. `flag()`
 * resolves a per-device `localStorage` override AHEAD of the compiled default —
 * deliberately, so an internal tester can preview a dark feature, and therefore
 * flippable by any visitor who sets the key. And the RPC is granted to `anon` in
 * the database the moment the migration applies: it is callable with the
 * publishable key without this bundle ever loading. Neither is a bug and neither
 * is weakened; they simply are not the boundary. The boundary is the three
 * properties the migration enforces: the RPC projects two columns, one of them
 * clamped, and no caller can ask a SECURITY DEFINER function for a third;
 * reaching even those two needs the share token, which is ~244 bits of entropy
 * (two v4 uuids at 122 bits each, not the 256 its 64 hex characters suggest);
 * and the publish marker is NULL on every row until an admin publishes one
 * deliberately, so the readable set starts empty.
 *
 * ── WHY `pickWhitelist` CLAMPS AS WELL AS PICKS, AND ONLY ONE FIELD ──
 * The invariant is "no applicant free text on a public page", not "these column
 * names are safe". `admitted_name` IS applicant free text: unbounded, and
 * assigned by a form alias matcher that is documented to be fallible, so a
 * question worded "tell us your name and a bit about what you make" can file
 * three sentences of prose into it — which a stranger with the link then reads
 * verbatim. The SQL projection clamps it to 80 characters and `pickWhitelist`
 * applies the identical cap to the identical field, so the invariant holds
 * structurally on both sides rather than resting on an upstream heuristic
 * staying correct, and it still holds if an older function body is live when a
 * new bundle ships. The cut counts CODE POINTS rather than UTF-16 units (hence
 * the spread before the slice), matching what Postgres `left()` counts: a bare
 * `.slice(80)` on the string would split the surrogate pair of an emoji landing
 * on the boundary and paint a U+FFFD into the one line this page exists to
 * show.
 *
 * `program_title` is NOT clamped, here or in SQL. It is admin-authored — the
 * same string the public offering page already prints — so a cap would buy no
 * invariant and would silently cut a long cohort name mid-word with no
 * ellipsis. It wraps instead, exactly as the name does.
 *
 * ── WHAT THIS PAGE HANDS TO THIRD PARTIES (and what it cannot control) ──
 * The app root boots analytics for EVERY route with no allow-list, so "this
 * component makes no analytics call" would be a meaningless claim: the pixels
 * fire underneath it and read `document.location.href` and `document.title`.
 * Two consequences, handled here rather than asserted away:
 *   • The title is a CONSTANT. It never carries the admitted person's name, so
 *     no vendor, screenshot or browser-history entry picks it up, whatever the
 *     firing order turns out to be.
 *   • While this page is mounted it installs inert stubs on the four pixel
 *     globals. `src/lib/analytics.ts` early-returns from each loader when its
 *     global already exists, so the vendor scripts are never injected while the
 *     share token is in the address bar. On unmount the stubs are removed and
 *     `bootAnalytics()` runs again, against the token-free URL the visitor
 *     navigated to, so the rest of the session is tracked normally.
 * Two limits, stated plainly: a pixel a PREVIOUS in-app route already loaded is
 * not ours to remove, and this only wins the cold-load race because the boot
 * awaits a DB read of `analytics_settings` first. Neither is load-bearing — the
 * migration's security property is that a leaked token reaches the two
 * whitelisted fields of one deliberately published record and nothing else, and
 * that unpublishing revokes it.
 *
 * Registered by D-1 in the PUBLIC (unguarded) route block as
 * `/admission/:slug`. Nothing imported here is auth-gated.
 */

import { useEffect, useLayoutEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import usePageTitle from "@/hooks/usePageTitle";
import SystemState from "@/components/SystemState";
import { bootAnalytics } from "@/lib/analytics";
import { DECISION_FLOW, flag } from "@/lib/flags";
import { durations, easings, useMotionSafe } from "@/lib/motion";

// The public whitelist, mirrored from the migration's `RETURNS TABLE` list.
// `src/lib/__tests__/admissionPublicPolicy.test.ts` parses BOTH this literal and
// that RETURNS TABLE block off disk and asserts they are identical, so the
// client and the policy can never drift. Keep it a flat array literal.
const ADMISSION_PUBLIC_FIELDS = ["admitted_name", "program_title"] as const;

/**
 * The character cap the applicant-typed field is held to, mirrored from the
 * migration's `left(a.full_name, 80)`. Longer than any real name, far shorter
 * than a paragraph. Both halves are pinned by the policy test, so neither can be
 * dropped on its own.
 */
const MAX_PUBLIC_FIELD_CHARS = 80;

type AdmissionField = (typeof ADMISSION_PUBLIC_FIELDS)[number];
type AdmissionRow = Record<AdmissionField, string | null>;

/**
 * The whitelisted fields carrying APPLICANT-typed text, and therefore the ones
 * the cap applies to — mirroring which columns the SQL projection wraps in
 * `left(…, 80)`. `program_title` is admin-authored and stays off this list on
 * purpose: see the header. Pinned against the migration by the policy test.
 */
const CLAMPED_PUBLIC_FIELDS: readonly AdmissionField[] = ["admitted_name"];

/**
 * The document title, deliberately constant and deliberately impersonal. GA4's
 * `send_page_view` reports `page_title` and Clarity records it, so anything
 * per-record here would be a name in three vendors' logs. It is also what the
 * recipient's browser history and tab strip show.
 */
const PAGE_TITLE = "Admission";

/**
 * What the page resolved to. `private` and `failed` are deliberately distinct:
 * the first is a fact about the record, the second is a fact about the network,
 * and collapsing them tells an offline recipient that a live admission was
 * revoked. Neither state reveals anything about the record itself, so keeping
 * them apart costs no privacy — an unknown slug and an unpublished one still
 * land on the identical `private` screen.
 */
type AdmissionState =
  | { phase: "loading" }
  | { phase: "ready"; row: AdmissionRow }
  | { phase: "private" }
  | { phase: "failed"; offline: boolean };

/**
 * The four pixel globals `src/lib/analytics.ts` guards its loaders on
 * (`if (window.fbq) return;` and friends). PostHog is left alone: it boots with
 * `capture_pageview: false`, `autocapture: false` and session recording off, so
 * it sends no URL and no title of its own.
 */
const PIXEL_GLOBALS = ["fbq", "gtag", "clarity", "twq"] as const;

type PixelGlobal = (typeof PIXEL_GLOBALS)[number];

/**
 * Occupy the pixel globals with inert functions so the loaders take their
 * early-return and never inject a vendor script while the share token is in the
 * address bar. Returns the undo: it removes only the stubs THIS page installed
 * (a pixel an earlier route already loaded is left alone) and then re-runs the
 * app's normal boot, which is idempotent and by then sees a token-free URL.
 */
function suppressPixelLoaders(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const inert = () => undefined;
  const installed: PixelGlobal[] = [];
  for (const key of PIXEL_GLOBALS) {
    if (window[key]) continue;
    window[key] = inert;
    installed.push(key);
  }

  return () => {
    for (const key of installed) delete window[key];
    if (installed.length > 0) {
      void bootAnalytics().catch(() => undefined);
    }
  };
}

/**
 * Reduce an RPC row to exactly the whitelisted keys, with the applicant-typed
 * ones clamped to `MAX_PUBLIC_FIELD_CHARS`. Anything else the response happens
 * to carry is dropped here, before it can reach the render tree, and free text
 * longer than the cap is cut here even if the function body that served it was
 * not the one in this repo's migration. Returns null when the row cannot name an
 * admitted person, which is the same outcome as no row at all: private.
 */
function pickWhitelist(row: unknown): AdmissionRow | null {
  if (!row || typeof row !== "object") return null;
  const source = row as Record<string, unknown>;
  const picked = {} as AdmissionRow;
  for (const key of ADMISSION_PUBLIC_FIELDS) {
    const value = source[key];
    const trimmed = typeof value === "string" ? value.trim() : "";
    // Spread, not `.slice` on the string: spreading iterates CODE POINTS, the
    // unit Postgres `left()` counts, so the two halves cut in the same place
    // and an emoji sitting on the boundary cannot be halved into a U+FFFD.
    // Trim again afterwards so a cut landing mid-space leaves no trailing gap.
    // Admin-authored fields are passed through as authored.
    const clamped = CLAMPED_PUBLIC_FIELDS.includes(key)
      ? [...trimmed].slice(0, MAX_PUBLIC_FIELD_CHARS).join("").trim()
      : trimmed;
    picked[key] = clamped === "" ? null : clamped;
  }
  return picked.admitted_name ? picked : null;
}

/** True only when the browser is certain it has no connection. */
function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// The three program sentences (COPY CD-06-PUB-02, cohort-agnostic base). Static
// copy, not record data: true of every cohort, so it leaks nothing about this
// applicant even when the offering itself is private.
const PROGRAM_SENTENCES = [
  "Twelve weeks, live.",
  "Sunday learning sessions, Saturday feedback, one finished piece of work by the end.",
  "Taught by working professionals, in a deliberately small room.",
];

const AdmissionPublic = () => {
  const { slug } = useParams<{ slug: string }>();
  const enabled = flag(DECISION_FLOW) && Boolean(slug);

  const [state, setState] = useState<AdmissionState>(
    enabled ? { phase: "loading" } : { phase: "private" },
  );
  // Bumping this re-runs the effect; it is the retry button's only job.
  const [attempt, setAttempt] = useState(0);

  usePageTitle(PAGE_TITLE);

  // A layout effect, not a passive one: the boot this races is already in
  // flight by the time the route's chunk evaluates, so every millisecond
  // before paint counts. It touches no layout, so it costs nothing.
  useLayoutEffect(suppressPixelLoaders, []);

  useEffect(() => {
    if (!enabled) {
      setState({ phase: "private" });
      return;
    }

    let cancelled = false;
    setState({ phase: "loading" });

    // `types.ts` predates these columns, so the established `(supabase as any)`
    // cast is used rather than regenerating it (see the phase brief).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc("get_admission_page", { p_slug: slug })
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (cancelled) return;
        // A transport/RPC error is NOT an answer about the record. Only a
        // successful call that came back empty means "private".
        if (error) {
          setState({ phase: "failed", offline: isOffline() });
          return;
        }
        const first = Array.isArray(data) ? data[0] : data;
        const picked = pickWhitelist(first);
        // Zero rows covers unpublished, revoked, unknown AND typo'd slugs
        // alike, which is the point: the screen below cannot distinguish them.
        setState(picked ? { phase: "ready", row: picked } : { phase: "private" });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ phase: "failed", offline: isOffline() });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, slug, attempt]);

  if (state.phase === "loading") return <AdmissionLoading />;

  if (state.phase === "failed") {
    return (
      <SystemState
        kind={state.offline ? "offline" : "error"}
        title={state.offline ? "You're offline" : "We couldn't load this page"}
        description={
          state.offline
            ? "This page needs a connection to load. Reconnect and try again, the link itself is fine."
            : "Something on our end didn't answer. The link is fine, so give it another go."
        }
        action={{ label: "Try again", onClick: () => setAttempt((n) => n + 1) }}
      />
    );
  }

  if (state.phase === "private") {
    return (
      <SystemState
        kind="404"
        eyebrow="Private"
        title="Nothing to show at this link"
        // This screen is reached by an unpublished page, a taken-down one, and
        // an address that never matched anything, and it cannot tell them
        // apart. So it claims none of them, and speaks for nobody: a page can
        // only be taken down from inside LevelUp, so "they wanted it private"
        // would be putting words in the mouth of a person who may not exist.
        description="This admission page is either not published or no longer up, and an address that is off by one character looks exactly the same from here. Worth checking the link you were sent."
        action={{ label: "Create a LevelUp account", to: "/signup" }}
      />
    );
  }

  return <AdmissionCard row={state.row} />;
};

/** Quiet hold while the RPC resolves. Opacity-only, so reduced motion is a no-op. */
const AdmissionLoading = () => (
  <div
    role="status"
    aria-label="Loading admission"
    className="flex min-h-[100dvh] items-center justify-center bg-canvas px-6"
  >
    <div className="h-px w-24 animate-pulse bg-cream/30" />
  </div>
);

const AdmissionCard = ({ row }: { row: AdmissionRow }) => {
  const motionSafe = useMotionSafe();

  // Transform/opacity only, and the rise collapses to a pure crossfade under
  // reduced motion. No backdrop-filter anywhere on this page.
  const rise = motionSafe.reduced ? 0 : 14;
  const step = motionSafe.reduced ? 0 : 0.07;
  const beat = (index: number) => ({
    initial: { opacity: 0, y: rise },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: motionSafe.reduced ? durations.fast : durations.slow,
      ease: easings.out,
      delay: index * step,
    },
  });

  return (
    <main className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center bg-canvas px-6 py-12 text-center">
      {/* Celebratory backdrop: a champagne glow feathering into the canvas.
          Gradients + grain only, no filters, so Android WebView compositing
          stays cheap. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="h-full w-full bg-[radial-gradient(120%_90%_at_50%_0%,hsl(var(--cream)/0.16),transparent_62%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/30 via-canvas/70 to-canvas" />
        <div className="grain absolute inset-0" />
      </div>

      <motion.section
        {...beat(0)}
        className="w-full max-w-md rounded-2xl border border-cream/15 bg-surface/70 px-6 py-10 sm:px-10"
      >
        <motion.div
          {...beat(1)}
          className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 text-gold"
        >
          <Check size={24} strokeWidth={1.5} aria-hidden />
        </motion.div>

        <motion.p
          {...beat(2)}
          className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground"
        >
          Admitted
        </motion.p>

        {/* Whitelisted field 1 of 2: the admitted person's name. It is free text
            from a form, so it wraps rather than trusting it to fit: the app's
            `#root { overflow-x: clip }` guard would turn an overflowing name
            into a silent truncation with no ellipsis, on the one line the whole
            page exists to show. */}
        <motion.h1
          {...beat(3)}
          className="mt-4 break-words hyphens-auto font-serif-italic text-3xl text-cream sm:text-4xl"
        >
          {row.admitted_name}
        </motion.h1>

        {/* Whitelisted field 2 of 2: the offering title, and only when that
            offering is public and active. A private cohort degrades to this
            cohort-agnostic line rather than naming itself. */}
        <motion.p
          {...beat(4)}
          className="mt-3 break-words text-sm text-foreground/80 sm:text-base"
        >
          {row.program_title ?? "A LevelUp live cohort"}
        </motion.p>

        <div className="mx-auto my-8 h-px w-16 bg-cream/15" />

        <motion.div {...beat(5)} className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          {PROGRAM_SENTENCES.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
        </motion.div>

        {/* No third field. A date here would have to be the share page's own
            publish stamp dressed up as an admit date, which is a claim the row
            cannot back: there is no admitted-on column. The line is the one
            thing this page can stand behind on its own. */}
        <motion.p
          {...beat(6)}
          className="mt-8 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80"
        >
          Verified by LevelUp
        </motion.p>
      </motion.section>

      {/* The one tasteful door (CD-06-PUB-04). Public route, no auth wall, and
          the label is exactly what the destination does: `/signup` creates an
          account. The app's notify-me lives on the catalogue cards behind that
          door, so promising a heads-up here would be a promise this button
          cannot keep. */}
      <motion.div {...beat(7)} className="mt-10 max-w-md">
        <p className="text-sm text-muted-foreground">
          Applications open when the next cohort is announced.
        </p>
        <Link
          to="/signup"
          className="focus-ring pressable mt-4 inline-flex h-11 items-center justify-center rounded-full bg-cream px-6 text-sm font-semibold text-cream-text transition-colors hover:bg-cream/90"
        >
          Create a LevelUp account
        </Link>
      </motion.div>
    </main>
  );
};

export default AdmissionPublic;
