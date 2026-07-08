import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

/**
 * T5 punch-list: automated proof of VdoCipherPlayer's branded failure state
 * (VdoCipherPlayer.tsx — the `if (error)` branch). The OTP mint itself is out
 * of scope; what this spec pins is the SCREENING-ROOM contract around a load
 * failure:
 *
 *  1. Branded state renders — the film-slate heading "The reel didn't load"
 *     and the calm one-liner, matching EmptyState / SystemState's voice.
 *  2. NO technical string reaches the DOM — supabase-js's raw network reason
 *     ("Failed to send a request to the Edge Function") is routed to Sentry +
 *     console only; the student never sees it. This is the Pillar-5 promise the
 *     component's own comment makes, so it is worth pinning in a test.
 *  3. Retry re-mounts — the Retry button re-runs the OTP mint (bumps retryKey,
 *     re-fires the effect); on a now-healthy mint the player iframe replaces the
 *     error frame.
 *
 * The web/iframe path is forced (isNativeDrmAvailable → false) so the mount
 * effect runs the OTP mint; supabase.functions.invoke is the single seam we
 * drive to shape success vs. the canonical network failure.
 */

const TECH = "Failed to send a request to the Edge Function";

// ── Hoisted, per-test-mutable harness state ─────────────────────────────────
const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  session: null as unknown,
  captureException: vi.fn(),
}));

// Force the web iframe path (not iOS native FairPlay) so the mount effect mints
// the OTP and the error branch is reachable.
vi.mock("@/lib/vdoNative", () => ({
  isNativeDrmAvailable: () => false,
  VdoPlayerNative: { play: vi.fn(), addListener: vi.fn(async () => ({ remove: () => {} })) },
}));

// The single seam: the edge-function invoke. Shaped per-test.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => h.invoke(...args) } },
}));

// Session only steers the access-error CTA; irrelevant to the network path but
// must exist for useAuth().
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ session: h.session }),
}));

vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/haptics", () => ({ hapticImpact: vi.fn() }));
// Spy on Sentry so we can prove the raw reason is routed HERE, not to the DOM.
vi.mock("@/lib/sentry", () => ({ captureException: (...args: unknown[]) => h.captureException(...args) }));

// Link as a plain anchor so no Router provider is required.
vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: { to?: unknown; children?: unknown }) =>
    createElement("a", { href: typeof to === "string" ? to : "#", ...rest }, children as never),
}));

import VdoCipherPlayer from "@/components/VdoCipherPlayer";

// The canonical load failure: supabase-js puts its FunctionsFetchError message
// on `error.message` with `data` null — the exact shape that classifies as
// "network" and carries a technical string that must never reach the screen.
const networkFailure = { data: null, error: { message: TECH } };

describe("VdoCipherPlayer failure state (T5)", () => {
  beforeEach(() => {
    h.invoke = vi.fn();
    h.session = null;
    h.captureException = vi.fn();
    // Silence the intentional console.error diagnostic in the network branch.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the branded failure state and leaks NO technical string to the DOM", async () => {
    h.invoke.mockResolvedValue(networkFailure);

    render(createElement(VdoCipherPlayer, { chapterId: "ch1" }));

    // Branded heading + calm one-liner (not the raw reason).
    expect(await screen.findByText("The reel didn't load")).toBeInTheDocument();
    expect(screen.getByText("Check your connection and try again.")).toBeInTheDocument();

    // The raw technical string appears NOWHERE in the rendered tree.
    expect(document.body.textContent).not.toContain(TECH);
    expect(document.body.innerHTML).not.toContain(TECH);

    // …and it WAS routed to Sentry instead (diagnosable, just not to the student).
    expect(h.captureException).toHaveBeenCalledTimes(1);
    const captured = h.captureException.mock.calls[0][0] as { message?: string };
    expect(String(captured?.message ?? captured)).toContain(TECH);
  });

  it("Retry re-runs the OTP mint and re-mounts into the player on recovery", async () => {
    // First mint fails (network), the retried mint succeeds.
    h.invoke
      .mockResolvedValueOnce(networkFailure)
      .mockResolvedValueOnce({ data: { otp: "OTP1", playbackInfo: "PB1" }, error: null });

    render(createElement(VdoCipherPlayer, { chapterId: "ch1" }));

    // Error frame first, from the single initial mint.
    const retry = await screen.findByRole("button", { name: /retry/i });
    expect(h.invoke).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);

    // Retry re-fires the mint…
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(2));

    // …and on success the branded error frame is gone, replaced by the player
    // iframe carrying the freshly minted OTP — i.e. Retry re-mounts.
    const iframe = await screen.findByTitle("DRM Video Player");
    expect(iframe.getAttribute("src")).toContain("otp=OTP1");
    expect(iframe.getAttribute("src")).toContain("playbackInfo=PB1");
    expect(screen.queryByText("The reel didn't load")).not.toBeInTheDocument();
  });
});
