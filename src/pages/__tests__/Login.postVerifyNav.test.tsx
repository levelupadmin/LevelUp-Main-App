import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { otpSuccess } from "@/lib/motion";

/**
 * P4 punch-list: automated proof of Login's STEAL-8 post-verify navigation
 * contract (Login.tsx — the `celebratingRef` latch + `navTimerRef` deferred
 * navigate). The auth flow is out of scope and byte-identical either way; what
 * this spec pins is the *route-paint* choreography around it:
 *
 *  1. Animated path: navigation is DEFERRED to the bounded `otpSuccess.windowMs`
 *     (850ms) window, and the reactive `user → /home` redirect STANDS DOWN
 *     during that window (only the scheduled timer paints the route — exactly
 *     once, at the resolved destination).
 *  2. Reduced motion: the window collapses to 0ms — navigation fires on the next
 *     tick, never waiting the 850ms animated cap.
 *  3. Failed verify: the celebration latch is RESET, NO navigation is scheduled,
 *     and the user stays on /login fully functional (a later session propagation
 *     redirects immediately — proving the latch is no longer held).
 *  4. Unmount mid-timer: the pending nav timer is cancelled by the cleanup effect
 *     — no strand, no navigate() from an unmounted component.
 *
 * The presentational children (OtpEntryStep, PhoneInput, InstructorProof) and
 * framer-motion are stubbed so the test drives Login's real timer/latch logic
 * and real auth calls (fetch → setSession → resolvePostAuthDestination) without
 * animation frames fighting the fake timer clock.
 */

// ── Hoisted, per-test-mutable harness state ─────────────────────────────────
const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  auth: { user: null as unknown, loading: false },
  fetchOk: true,
  // Captures the real `onVerify` wrapper Login hands to OtpEntryStep so the test
  // can drive a verify without reproducing the OTP input UI.
  onVerify: null as null | ((otp: string) => Promise<{ ok: boolean; error?: string }>),
}));

// react-router: spy navigate, no `from` state (redirectTarget resolves to /home),
// Link as a plain anchor so no Router provider is required.
vi.mock("react-router-dom", () => ({
  useNavigate: () => h.navigate,
  useLocation: () => ({ state: null }),
  Link: ({ to, children, ...rest }: { to?: unknown; children?: unknown }) =>
    createElement("a", { href: typeof to === "string" ? to : "#", ...rest }, children as never),
}));

// Auth: mutable so a test can flip anon → signed-in and fire the reactive effect.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: h.auth.user, loading: h.auth.loading }),
}));

// Supabase: setSession mints a session (user id → resolvePostAuthDestination),
// the users lookup returns a craft so the destination is the redirectTarget
// (/home) rather than /onboarding.
vi.mock("@/integrations/supabase/client", () => {
  const usersBuilder: Record<string, unknown> = {};
  usersBuilder.select = vi.fn(() => usersBuilder);
  usersBuilder.eq = vi.fn(() => usersBuilder);
  usersBuilder.single = vi.fn(async () => ({ data: { craft_interests: ["film"] }, error: null }));
  return {
    supabase: {
      from: vi.fn(() => usersBuilder),
      auth: {
        setSession: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })),
        signInWithOtp: vi.fn(async () => ({ error: null })),
      },
    },
  };
});

vi.mock("@/lib/msg91-widget", () => ({
  initMsg91: vi.fn(async () => {}),
  sendOtp: vi.fn(async () => {}),
  verifyOtp: vi.fn(async () => ({ accessToken: "tok" })),
  retryOtp: vi.fn(async () => {}),
}));

vi.mock("@/lib/platform", () => ({
  isNative: () => false,
  isAndroid: () => false,
  isIOS: () => false,
  isWeb: () => true,
}));

vi.mock("@/lib/haptics", () => ({
  hapticImpact: vi.fn(async () => {}),
  hapticNotification: vi.fn(async () => {}),
  hapticSelection: vi.fn(async () => {}),
  tapTick: vi.fn(async () => {}),
}));

// framer-motion: stub `motion.*` to plain host elements (dropping animation-only
// props) and back useReducedMotion with the live matchMedia. Keeps the fake
// timer clock free of framer's frameloop.
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const strip = ({
    initial: _i,
    animate: _a,
    exit: _e,
    transition: _t,
    whileTap: _w,
    whileHover: _h,
    variants: _v,
    layout: _l,
    ...rest
  }: Record<string, unknown>) => rest;
  const create = (Comp: unknown) =>
    React.forwardRef((props: Record<string, unknown>, ref) =>
      React.createElement(Comp as never, { ref, ...strip(props) }, props.children as never),
    );
  const motion = new Proxy(
    {},
    {
      get: (_t, tag: string) => {
        if (tag === "create") return create;
        return React.forwardRef((props: Record<string, unknown>, ref) =>
          React.createElement(tag, { ref, ...strip(props) }, props.children as never),
        );
      },
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: unknown }) => children as never,
    useReducedMotion: () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
});

// Presentational stubs. OtpEntryStep captures the real onVerify wrapper.
vi.mock("@/components/auth/PhoneInput", () => ({
  PhoneInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    createElement("input", {
      type: "tel",
      "data-testid": "phone",
      value,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    }),
}));
vi.mock("@/components/auth/InstructorProof", () => ({ InstructorProof: () => null }));
vi.mock("@/components/auth/OtpEntryStep", () => ({
  OtpEntryStep: ({
    onVerify,
  }: {
    onVerify: (otp: string) => Promise<{ ok: boolean; error?: string }>;
  }) => {
    h.onVerify = onVerify;
    return createElement("div", { "data-testid": "otp-step" }, "otp");
  },
}));

import Login from "@/pages/Login";

// The reserved App-Review number skips the MSG91 widget: handleSendOtp routes
// straight to the OTP step, so the verify path is reachable without a live send.
const REVIEW_PHONE = "+918888777666";

function setMatchMedia({ reduced = false, desktop = true }: { reduced?: boolean; desktop?: boolean } = {}) {
  window.matchMedia = ((q: string) => ({
    matches: q.includes("prefers-reduced-motion")
      ? reduced
      : q.includes("min-width: 1024px")
        ? desktop
        : false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Drive phone entry → OTP step (review-login path is synchronous, no widget).
async function reachOtpStep() {
  await act(async () => {
    fireEvent.change(screen.getByTestId("phone"), { target: { value: REVIEW_PHONE } });
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));
  });
}

// Fetch is stubbed to Login's verify-msg91-otp endpoint; ok=false yields an
// invalid_otp error the same way a wrong code would.
function installFetch() {
  global.fetch = vi.fn(async () => ({
    ok: h.fetchOk,
    json: async () => (h.fetchOk ? { access_token: "a", refresh_token: "r" } : { error: "invalid_otp" }),
  })) as unknown as typeof fetch;
}

describe("Login post-verify navigation (P4 STEAL-8)", () => {
  beforeEach(() => {
    h.navigate = vi.fn();
    h.auth = { user: null, loading: false };
    h.fetchOk = true;
    h.onVerify = null;
    installFetch();
    setMatchMedia({ reduced: false, desktop: true });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.clearAllMocks();
  });

  it("defers navigation to the 850ms window and the reactive redirect stands down during it", async () => {
    const { rerender } = render(createElement(Login));
    await reachOtpStep();

    let res: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      res = await h.onVerify!("1234");
    });
    expect(res?.ok).toBe(true);

    // Session is minted; simulate the auth context propagating `user` truthy.
    // The reactive `user → /home` effect must STAND DOWN (celebratingRef latched)
    // — no early navigate ahead of the choreography.
    h.auth.user = { id: "u1" };
    await act(async () => {
      rerender(createElement(Login));
    });
    expect(h.navigate).not.toHaveBeenCalled();

    // Nothing fires up to the last millisecond of the bounded window…
    await act(async () => {
      vi.advanceTimersByTime(otpSuccess.windowMs - 1);
    });
    expect(h.navigate).not.toHaveBeenCalled();

    // …then the scheduled timer paints the resolved destination, exactly once.
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith("/home", { replace: true });
  });

  it("reduced motion navigates on the next tick (0ms), never waiting the animated cap", async () => {
    setMatchMedia({ reduced: true, desktop: true });
    render(createElement(Login));
    await reachOtpStep();

    await act(async () => {
      await h.onVerify!("1234");
    });
    // Scheduled with a 0ms delay: not yet fired synchronously…
    expect(h.navigate).not.toHaveBeenCalled();

    // …fires on the very next tick, well before the 850ms animated window.
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith("/home", { replace: true });
  });

  it("failed verify resets the latch, schedules no navigation, and keeps the user on /login", async () => {
    h.fetchOk = false; // wrong code → verify fails before any session is set
    const { rerender } = render(createElement(Login));
    await reachOtpStep();

    let res: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      res = await h.onVerify!("0000");
    });
    expect(res?.ok).toBe(false);

    // No timer was scheduled — advancing well past the window paints nothing,
    // and the OTP step is still mounted and functional for a retry.
    await act(async () => {
      vi.advanceTimersByTime(otpSuccess.windowMs + 100);
    });
    expect(h.navigate).not.toHaveBeenCalled();
    expect(screen.getByTestId("otp-step")).toBeTruthy();

    // The latch must be RESET: a subsequent session propagation redirects
    // immediately. If celebratingRef were still held, the reactive effect would
    // stand down and this navigate would never fire.
    h.auth.user = { id: "u1" };
    await act(async () => {
      rerender(createElement(Login));
    });
    expect(h.navigate).toHaveBeenCalledWith("/home", { replace: true });
  });

  it("unmounting during the pending nav timer cancels it (no navigate after unmount)", async () => {
    const { unmount } = render(createElement(Login));
    await reachOtpStep();

    await act(async () => {
      await h.onVerify!("1234");
    });
    // Timer is pending (850ms). A route change elsewhere unmounts Login first.
    act(() => {
      unmount();
    });

    // The cleanup effect cleared the timer: firing the clock paints nothing.
    await act(async () => {
      vi.advanceTimersByTime(otpSuccess.windowMs + 100);
    });
    expect(h.navigate).not.toHaveBeenCalled();
  });
});
