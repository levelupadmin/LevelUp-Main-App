import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";

/**
 * P6-T5 — native splash → web handoff.
 *
 * These tests exercise the REAL `src/main.tsx` module (imported for its
 * side-effects with the native surface mocked), not a re-implementation, so the
 * evidence stays non-vacuous. They pin the four load-bearing invariants of the
 * handoff described in capacitor.config.ts and main.tsx:
 *
 *   1. NO BLACK GAP — on native, `SplashScreen.hide()` fires only AFTER a
 *      painted React frame exists (the double-rAF), never before render. The OS
 *      holds the branded splash until then (launchAutoHide:false), so it lifts
 *      straight onto rendered content.
 *   2. NO DOUBLE-FLASH — `hide()` is idempotent (the `hidden` guard). The
 *      failsafe timer and the double-rAF path can never both hide the splash;
 *      whichever runs first wins and the other no-ops.
 *   3. 4s FAILSAFE — the timer is armed BEFORE `render()`. A synchronous throw
 *      during the initial render (above the in-tree ErrorBoundary) skips the
 *      rAF hide, but the pre-armed failsafe still force-hides the splash so the
 *      user is never trapped on the splash.
 *   4. WEB IS UNTOUCHED — off native, `SplashScreen` is never imported or
 *      called; React just mounts.
 */

// Hoisted so the vi.mock factories (which are hoisted above imports) can close
// over the same spies we assert on.
const h = vi.hoisted(() => ({
  hide: vi.fn(() => Promise.resolve()),
  render: vi.fn(),
  createRoot: vi.fn(),
  isNativePlatform: vi.fn(() => true),
  initSentry: vi.fn(),
}));

vi.mock("react-dom/client", () => ({
  createRoot: (...args: unknown[]) => {
    h.createRoot(...args);
    return { render: h.render, unmount: vi.fn() };
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => h.isNativePlatform() },
}));

// The dynamic `import("@capacitor/splash-screen")` inside hide() resolves to
// this — the module cache means the repeated import per hide() is cheap.
vi.mock("@capacitor/splash-screen", () => ({
  SplashScreen: { hide: (...args: unknown[]) => h.hide(...args) },
}));

// App renders nothing; index.css / sentry are irrelevant to the handoff.
vi.mock("./App.tsx", () => ({ default: () => null }));
vi.mock("./index.css", () => ({}));
vi.mock("./lib/sentry", () => ({ initSentry: () => h.initSentry() }));

// Manual requestAnimationFrame queue so we control exactly when "paint" frames
// fire. Fake timers below deliberately do NOT fake rAF, leaving this in place.
let rafQueue: FrameRequestCallback[] = [];
let realRaf: typeof globalThis.requestAnimationFrame;
let realCaf: typeof globalThis.cancelAnimationFrame;

/** Fire every rAF callback currently queued (snapshot: nested schedules queue
 *  for the NEXT flush, mirroring one real frame). */
function flushFrame() {
  const batch = rafQueue;
  rafQueue = [];
  for (const cb of batch) cb(performance.now());
}

/** Let queued microtasks (the dynamic-import .then chain in hide()) settle. */
async function settleMicrotasks() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

let errorSpy: MockInstance;

beforeEach(() => {
  vi.resetModules();
  h.hide.mockClear();
  h.render.mockReset();
  h.render.mockImplementation(() => {});
  h.createRoot.mockClear();
  h.isNativePlatform.mockReset();
  h.isNativePlatform.mockReturnValue(true);
  h.initSentry.mockClear();

  document.body.innerHTML = '<div id="root"></div>';

  rafQueue = [];
  realRaf = globalThis.requestAnimationFrame;
  realCaf = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    rafQueue.push(cb)) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;

  // Fake ONLY setTimeout/clearTimeout so we can jump the 4s failsafe instantly
  // while keeping our manual rAF control intact.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

  // The failsafe path deliberately throws during render; keep that noise out of
  // the test log.
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.requestAnimationFrame = realRaf;
  globalThis.cancelAnimationFrame = realCaf;
  errorSpy.mockRestore();
});

describe("native splash → web handoff (src/main.tsx)", () => {
  it("holds the splash until a painted React frame, then hides once (no black gap)", async () => {
    await import("./main");

    // React mounted…
    expect(h.createRoot).toHaveBeenCalledTimes(1);
    expect(h.render).toHaveBeenCalledTimes(1);
    // …but the splash is STILL up — no frame has painted yet. This is the
    // no-black-gap guarantee: the OS branded splash covers the unpainted root.
    expect(h.hide).not.toHaveBeenCalled();

    // First rAF fires before paint on some WebViews; the handoff waits for a
    // second frame, so one flush must NOT hide yet.
    flushFrame();
    await settleMicrotasks();
    expect(h.hide).not.toHaveBeenCalled();

    // Second frame = a real painted frame exists → splash lifts onto content.
    flushFrame();
    await settleMicrotasks();
    expect(h.hide).toHaveBeenCalledTimes(1);
    expect(h.hide).toHaveBeenCalledWith({ fadeOutDuration: 240 });
  });

  it("never double-hides: the 4s failsafe no-ops after the rAF hide already ran", async () => {
    await import("./main");
    flushFrame();
    flushFrame();
    await settleMicrotasks();
    expect(h.hide).toHaveBeenCalledTimes(1);

    // Drive the clock well past the failsafe. Because the rAF path cleared the
    // timer AND set `hidden`, the splash is not hidden a second time.
    vi.advanceTimersByTime(10_000);
    await settleMicrotasks();
    expect(h.hide).toHaveBeenCalledTimes(1);
  });

  it("still hides via the 4s failsafe when render throws BEFORE mount", async () => {
    // Synchronous throw during initial render (e.g. a provider above the
    // in-tree ErrorBoundary) — propagates out of render().
    h.render.mockImplementation(() => {
      throw new Error("boom during initial render");
    });

    await expect(import("./main")).rejects.toThrow("boom during initial render");

    // The throw skipped the rAF hide entirely — the splash would be stuck…
    flushFrame();
    flushFrame();
    await settleMicrotasks();
    expect(h.hide).not.toHaveBeenCalled();

    // …until the pre-armed 4s failsafe force-hides it, dropping the user onto
    // the dark canvas + ErrorBoundary instead of trapping them on the splash.
    vi.advanceTimersByTime(4000);
    await settleMicrotasks();
    expect(h.hide).toHaveBeenCalledTimes(1);
    expect(h.hide).toHaveBeenCalledWith({ fadeOutDuration: 240 });
  });

  it("does nothing splash-related on web (isNativePlatform() === false)", async () => {
    h.isNativePlatform.mockReturnValue(false);

    await import("./main");

    // React mounts on web too…
    expect(h.createRoot).toHaveBeenCalledTimes(1);
    expect(h.render).toHaveBeenCalledTimes(1);

    // …but nothing touches the native splash, even after frames and the full
    // failsafe window elapse (the failsafe was never armed off-native).
    flushFrame();
    flushFrame();
    vi.advanceTimersByTime(10_000);
    await settleMicrotasks();
    expect(h.hide).not.toHaveBeenCalled();
  });
});
