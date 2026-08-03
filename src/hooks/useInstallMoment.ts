// useInstallMoment — the decision layer behind <InstallNudge> (REQ-INSTALL-1/2).
//
// ── THE FLAG COMES FIRST ──
// Everything below is dark behind `VITE_INSTALL_NUDGE` (src/lib/flags.ts),
// default OFF. That gate is not cosmetic: `handleBeforeInstallPrompt` calls
// `event.preventDefault()`, which SUPPRESSES Chromium's own install mini-infobar
// for every web visitor — an app-wide change to install promotion, not a change
// to one page. Whether the event fires here at all is browser-version dependent
// (no service worker is registered in this repo, and Chromium's installability
// criteria have moved across versions), so the gate is what makes the answer
// stop mattering: flag down, we attach no listener, claim no event and render no
// card, which is exactly the app as it was before this feature.
// `isInstallNudgeEnabled()` is read LIVE at every gate rather than cached at
// module load, so a tester flipping the localStorage override off mid-session
// genuinely stops the suppression instead of only stopping the card.
//
// The rule this hook exists to enforce: **web is the whole journey**. Applying,
// paying, interviewing, hearing the decision and entering the room all complete
// in a browser, so install is an OFFER at a value moment and never a wall, never
// a gate, never a repeated interruption. Everything below is a reason to say NO:
//
//  1. Native shell (Capacitor Android/iOS) → the app IS installed. `isNative()`
//     per the brief, NOT isIOS/isAndroid: the question is "already installed?",
//     not "which store?".
//  2. No captured `beforeinstallprompt` event → render nothing. There is no
//     service worker registered anywhere in this repo (`grep -rn serviceWorker
//     src index.html` = zero hits), only `public/manifest.webmanifest` linked at
//     index.html:35, so Chromium's installability criteria are NOT met today and
//     this event will not fire. That is fine and deliberate: with no event there
//     is no prompt to show, so the nudge degrades to nothing at all rather than
//     to a dead button that does nothing when tapped. Registering a service
//     worker is a Tier-1 change and is out of this phase's scope.
//  3. Dismissed → suppressed for the rest of the session (below).
//
// ── WHERE THE LISTENER LIVES, AND WHY IT IS NOT HERE-ON-IMPORT ──
// `beforeinstallprompt` fires ONCE per page load, shortly after the user agent
// finishes its installability check, and never again — SPA route changes do not
// re-fire it. The only surface that renders an offer today is a LAZY route
// (`/my-application/:id`, App.tsx:86), whose chunk is fetched minutes into the
// session. A listener attached when that chunk evaluates is attached to an event
// that already came and went, so the feature would be structurally dead on every
// real navigation path. `registerInstallCapture()` therefore exists to be called
// from the app ENTRY (src/main.tsx), before anything is routed. It is idempotent,
// so the fallback call in <InstallNudge>'s module is a cheap no-op.
//
// State is module-level rather than per-component because the captured event
// fires once on `window` and must be readable by whichever moment the applicant
// reaches later. It is fanned out to subscribers through `useSyncExternalStore`,
// the same single-listener pattern `useFinePointer` uses in src/lib/motion.ts.

import { useCallback, useSyncExternalStore } from "react";

import { flag, INSTALL_NUDGE } from "@/lib/flags";
import { isNative } from "@/lib/platform";

/**
 * Is the install nudge switched on? Default false. Exported because every entry
 * point into this feature — the entry-point capture call in src/main.tsx, the
 * <InstallNudge> module and component, and both of its mounts in
 * ApplicationStatus — gates on it, and they should all be asking the same
 * question of the same registry rather than each reaching for `flag()` with a
 * name of their own.
 */
export function isInstallNudgeEnabled(): boolean {
  return flag(INSTALL_NUDGE);
}

/**
 * The ONLY value moments allowed to offer install. Exactly two, by product
 * ruling: this tuple is the entire registry, so a third moment is a deliberate
 * edit here rather than a call site quietly adding another interruption.
 * Both are earned moments on the application timeline (fee paid, accepted) —
 * points where the applicant has just gained something, not points where they
 * are trying to get somewhere.
 */
export const INSTALL_MOMENTS = ["fee-paid", "accepted"] as const;

export type InstallMoment = (typeof INSTALL_MOMENTS)[number];

// Runtime membership guard. The union type covers compile time; this covers a
// call site that widens to `string` (or a test that casts) so an unregistered
// moment can never offer.
const MOMENT_KEYS: ReadonlySet<string> = new Set<string>(INSTALL_MOMENTS);

/**
 * sessionStorage key for the dismissal. Session-scoped on purpose: a "not now"
 * ends today's ask, it does not follow the applicant forever, and it never
 * outlives the tab. localStorage would turn a soft decline into a permanent one.
 */
export const INSTALL_DISMISSED_KEY = "levelup.install-nudge.dismissed";

/**
 * How many times a refused `prompt()` may be handed back to the applicant before
 * the offer retires itself. One retry: a transient refusal (a stale event after
 * a long SPA session, a bfcache restore) is worth recovering from, but a
 * permanently unusable event must end as NO CARD rather than as a button that
 * silently does nothing on every tap.
 */
const MAX_PROMPT_ATTEMPTS = 2;

/**
 * The `beforeinstallprompt` event, which TypeScript's DOM lib still does not
 * type. Only the two members we actually use are declared.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The captured, not-yet-fired browser prompt. `null` until the user agent hands
// us one, and back to `null` the moment it is spent (a captured prompt is
// single-use — calling `prompt()` twice throws).
let deferredPrompt: BeforeInstallPromptEvent | null = null;

// Refused `prompt()` calls so far. Bounds the recovery in promptInstall().
let promptAttempts = 0;

// True while a prompt() call is awaiting the user agent. Guards a double-tap
// without hiding the card, so a refusal never costs the applicant the offer.
let promptInFlight = false;

// Lazily-read mirror of INSTALL_DISMISSED_KEY. `null` = not read yet. Cached so
// getSnapshot (which React calls on every render) never touches storage in a
// loop, and so a storage-less environment is asked exactly once.
let dismissedCache: boolean | null = null;

const subscribers = new Set<() => void>();
const notify = (): void => {
  subscribers.forEach((cb) => cb());
};

const subscribe = (onStoreChange: () => void): (() => void) => {
  subscribers.add(onStoreChange);
  return () => {
    subscribers.delete(onStoreChange);
  };
};

const readDismissed = (): boolean => {
  if (dismissedCache !== null) return dismissedCache;
  try {
    dismissedCache =
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    // Private mode / storage disabled: treat as not dismissed, but the write in
    // markDismissed() also fails silently, so the in-memory cache below is what
    // actually holds the suppression for the session. Still correct.
    dismissedCache = false;
  }
  return dismissedCache;
};

const markDismissed = (): void => {
  dismissedCache = true;
  try {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    }
  } catch {
    /* storage unavailable — the in-memory cache still suppresses this session */
  }
};

// One boolean is the whole store: is there a live prompt we are still allowed to
// offer? Returning a primitive keeps getSnapshot referentially stable, which is
// what useSyncExternalStore requires.
const getSnapshot = (): boolean => deferredPrompt !== null && !readDismissed();

// Server / prerender: never offer. There is no captured event off the client.
const getServerSnapshot = (): boolean => false;

const handleBeforeInstallPrompt = (event: Event): void => {
  // Flag down: leave the event completely alone. registerInstallCapture() will
  // not have attached this handler in the first place, so the only way here is a
  // flag that went off after registration (a tester clearing the localStorage
  // override mid-session) — and in that case the browser's mini-infobar must go
  // back to being the browser's business, immediately.
  if (!isInstallNudgeEnabled()) return;

  // Native shell: the app IS installed, so there is nothing to offer and
  // therefore nothing to suppress — leave the event entirely alone. A Capacitor
  // WebView does not fire it today, so this is belt-and-braces; it lives here
  // rather than in registerInstallCapture() so the platform read stays out of
  // module-evaluation time, where an unrelated page test's `@/lib/platform`
  // double would have to know about it.
  if (isNative()) return;

  // Suppress the user agent's own mini-infobar, unconditionally, at capture
  // time. preventDefault() has no effect once the event handler has returned, so
  // "decide later, when a value moment is on screen" is not a real option: the
  // browser fires this ONCE, seconds after load, long before the lazy
  // `/my-application/:id` chunk, its auth and its data have landed. A gate that
  // reads how many moments are mounted is therefore false on essentially every
  // real navigation, and the outcome is the failure this feature exists to
  // avoid — the browser's bar stays up, and when the applicant reaches
  // fee-paid/accepted our card appears next to it. Two simultaneous asks is a
  // repeated interruption; one card at a value moment is the product.
  //
  // What preventDefault() costs is the mini-infobar only. Chromium's menu entry
  // ("Install app" / "Add to Home screen") is untouched, so install stays
  // reachable for the applicant who never hits a value moment, and it is not a
  // path we can suppress even if we wanted to.
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  notify();
};

const handleAppInstalled = (): void => {
  // Installed elsewhere (browser menu, another tab): drop the prompt and stop
  // asking for the rest of the session.
  deferredPrompt = null;
  markDismissed();
  notify();
};

let captureRegistered = false;

// Where the live instance's handlers are parked so a NEW instance of this module
// can unhook the old one. Module state is per-instance, but `window` is not:
// under vite HMR (and under vi.resetModules() in the tests) a second copy of
// this module would otherwise stack a second listener on the same window, and
// the stale copy — whose `deferredPrompt` nothing can read any more — would keep
// claiming events. One live capture, always the newest.
interface CaptureHost extends Window {
  __levelupInstallCapture?: {
    beforeInstallPrompt: (event: Event) => void;
    appInstalled: () => void;
  };
}

/**
 * Attach the `beforeinstallprompt` / `appinstalled` listeners. Idempotent, safe
 * on the server, and safe to call from more than one place.
 *
 * **Call this from the app entry (src/main.tsx), not from a route.** The browser
 * fires `beforeinstallprompt` once per page load and never re-fires it on SPA
 * navigation, so a listener attached inside a lazily-loaded route chunk arrives
 * after the event on every realistic path and captures nothing. Both listeners
 * live for the document's lifetime by design — no per-component listener growth,
 * and the only teardown is the one below, where a replacing instance of this
 * module unhooks the instance it replaced.
 *
 * Inside the native shell the listeners are still attached but inert: the
 * handler itself returns before touching the event (see
 * handleBeforeInstallPrompt), so an installed app neither offers nor suppresses.
 *
 * With `VITE_INSTALL_NUDGE` off (the default) this attaches NOTHING — it is the
 * one choke point every caller funnels through, so the flag-off app never has a
 * `beforeinstallprompt` listener on `window` at all and can never claim the
 * browser's install affordance. Note the early return leaves `captureRegistered`
 * false, so flipping the flag on and calling again still registers.
 */
export function registerInstallCapture(): void {
  if (!isInstallNudgeEnabled()) return;
  if (captureRegistered || typeof window === "undefined") return;
  captureRegistered = true;

  const host = window as CaptureHost;
  const previous = host.__levelupInstallCapture;
  if (previous) {
    window.removeEventListener(
      "beforeinstallprompt",
      previous.beforeInstallPrompt,
    );
    window.removeEventListener("appinstalled", previous.appInstalled);
  }

  host.__levelupInstallCapture = {
    beforeInstallPrompt: handleBeforeInstallPrompt,
    appInstalled: handleAppInstalled,
  };
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
}

// Register on import as the floor, so any consumer that forgets the entry-point
// call still behaves as it did before. The entry's explicit call is what makes
// it EARLY; this one only makes it certain. Flag-gated inside the function, so
// merely importing this module is inert while the flag is off.
registerInstallCapture();

/**
 * What actually happened when the applicant tapped install. Returned rather than
 * swallowed because the caller has to TELL them: a screen-reader announcement
 * that says "opening your browser's install dialog" when the user agent refused
 * to open one is a lie, and the refusal paths are exactly where that happens.
 *
 * - `shown` — the dialog was displayed; the offer is spent and the card exits.
 * - `refused` — the user agent would not show it; the offer is handed straight
 *   back and the card STAYS, so the tap is recoverable rather than dead.
 * - `retired` — refused once too often (MAX_PROMPT_ATTEMPTS); the card exits
 *   without any dialog ever having been shown.
 * - `unavailable` — nothing captured, or a call already in flight. Nothing
 *   changed and nothing to announce.
 */
export type InstallPromptOutcome =
  | "shown"
  | "refused"
  | "retired"
  | "unavailable";

export interface InstallMomentState {
  /**
   * True only when this moment may render an install offer: web (not native), a
   * real captured prompt in hand, and not dismissed this session. False here
   * means render NOTHING — never a disabled or inert button.
   */
  offered: boolean;
  /**
   * Hand the captured prompt to the browser. Resolves with what actually
   * happened (see InstallPromptOutcome) once the user agent has either shown its
   * dialog or refused to. Whether the applicant then installed or backed out is
   * deliberately NOT surfaced: either way this session stops asking.
   */
  promptInstall: () => Promise<InstallPromptOutcome>;
  /** Decline: suppress every install offer for the rest of the session. */
  dismiss: () => void;
}

/**
 * Decide whether the given value moment may offer an install, and expose the two
 * actions that end the ask. Reactive: a prompt captured after mount flips
 * `offered` on, and either action flips it off everywhere at once.
 */
export function useInstallMoment(moment: InstallMoment): InstallMomentState {
  const available = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // Flag first, then platform. isNative() is a synchronous Capacitor platform
  // read with no side effects, so both are safe to evaluate during render.
  // Flag off → no offer; already installed → no offer at all.
  const eligible =
    isInstallNudgeEnabled() && !isNative() && MOMENT_KEYS.has(moment);

  const promptInstall = useCallback(async (): Promise<InstallPromptOutcome> => {
    const event = deferredPrompt;
    // Nothing captured, or a call already awaiting the user agent: a second tap
    // must never reach prompt() twice (Chromium throws on the replay).
    if (!event || promptInFlight) return "unavailable";
    promptInFlight = true;
    try {
      await event.prompt();
    } catch {
      // The user agent refused to show it (stale event, bfcache restore, UA
      // policy). The offer is untouched, so the card is still on screen and the
      // applicant can try again — until the attempt budget runs out, at which
      // point the offer retires itself rather than becoming a dead button.
      promptAttempts += 1;
      if (promptAttempts >= MAX_PROMPT_ATTEMPTS) {
        deferredPrompt = null;
        markDismissed();
        notify();
        return "retired";
      }
      return "refused";
    } finally {
      promptInFlight = false;
    }
    // Shown. A captured prompt cannot be replayed, and whether the applicant
    // installed or backed out of the browser dialog, we do not ask again today.
    deferredPrompt = null;
    markDismissed();
    notify();
    return "shown";
  }, []);

  const dismiss = useCallback((): void => {
    markDismissed();
    notify();
  }, []);

  const offered = available && eligible;

  return { offered, promptInstall, dismiss };
}

export default useInstallMoment;
