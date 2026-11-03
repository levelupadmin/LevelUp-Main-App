import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

/**
 * The classic /login honours one new entry param, `?method=email`, which the
 * Stage sign-in's "Sign in with email" links to. It opens straight on email
 * sign-in and keeps `next` for where the email link lands. Without the param
 * the page opens exactly as before, on the phone form.
 */

const h = vi.hoisted(() => ({
  search: "",
  signInWithOtp: vi.fn(async () => ({ error: null })),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null }),
  useSearchParams: () => [new URLSearchParams(h.search), () => {}],
  Link: ({ to, children, ...rest }: { to?: unknown; children?: unknown }) =>
    createElement("a", { href: typeof to === "string" ? to : "#", ...rest }, children as never),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabaseUrl: "https://test-project.supabase.co",
  supabasePublishableKey: "sb_publishable_test_public_key_1234567890",
  supabase: { auth: { signInWithOtp: h.signInWithOtp, setSession: vi.fn() } },
}));

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
    layoutId: _lid,
    ...rest
  }: Record<string, unknown>) => rest;
  const create = (Comp: unknown) =>
    React.forwardRef((props: Record<string, unknown>, ref) =>
      React.createElement(Comp as never, { ref, ...strip(props) }, props.children as never),
    );
  const motion = new Proxy(
    {},
    {
      get: (_t, tag: string) => (tag === "create" ? create : create(tag)),
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: unknown }) => children as never,
    useReducedMotion: () => false,
  };
});

vi.mock("@/components/auth/PhoneInput", () => ({
  PhoneInput: ({ onChange }: { onChange?: (v: string) => void }) =>
    createElement("input", { type: "tel", "data-testid": "phone", onChange: (e: { target: { value: string } }) => onChange?.(e.target.value) }),
}));
vi.mock("@/components/auth/InstructorProof", () => ({ InstructorProof: () => null }));
vi.mock("@/components/auth/OtpEntryStep", () => ({ OtpEntryStep: () => null }));

import Login from "@/pages/Login";

beforeEach(() => {
  h.search = "";
  try {
    localStorage.removeItem("VITE_EMAIL_OTP_TAB");
  } catch {
    // no storage in this environment
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  try {
    localStorage.removeItem("VITE_EMAIL_OTP_TAB");
  } catch {
    // no storage in this environment
  }
});

describe("Login ?method=email", () => {
  it("without the param, opens on the phone form as before", () => {
    render(createElement(Login));
    expect(screen.getByTestId("phone")).toBeInTheDocument();
    expect(screen.queryByText("Send sign-in link")).toBeNull();
  });

  it("opens straight on the email step and sends the link back to next", async () => {
    h.search = "?classic=1&method=email&next=%2Fcourse%2Fabc";
    render(createElement(Login));
    expect(screen.queryByTestId("phone")).toBeNull();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "buyer@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));
    await waitFor(() => expect(h.signInWithOtp).toHaveBeenCalledTimes(1));
    expect(h.signInWithOtp).toHaveBeenCalledWith({
      email: "buyer@example.com",
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/course/abc` },
    });
  });

  it("opens on the Email tab instead when that flag is on", () => {
    localStorage.setItem("VITE_EMAIL_OTP_TAB", "true");
    h.search = "?classic=1&method=email";
    render(createElement(Login));
    expect(screen.getByRole("tab", { name: "Email" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Phone" })).toHaveAttribute("aria-selected", "false");
    expect(screen.queryByText("Send sign-in link")).toBeNull();
  });

  it("with the flag on but no param, still opens on the Phone tab", () => {
    localStorage.setItem("VITE_EMAIL_OTP_TAB", "true");
    render(createElement(Login));
    expect(screen.getByRole("tab", { name: "Phone" })).toHaveAttribute("aria-selected", "true");
  });

  it("sends a number outside India to the Email tab when that flag is on", () => {
    localStorage.setItem("VITE_EMAIL_OTP_TAB", "true");
    render(createElement(Login));
    fireEvent.change(screen.getByTestId("phone"), { target: { value: "+447700900123" } });
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));
    expect(screen.getByRole("tab", { name: "Email" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Send sign-in link")).toBeNull();
    expect(h.signInWithOtp).not.toHaveBeenCalled();
  });

  it("can still go back to the phone form from there", () => {
    h.search = "?classic=1&method=email";
    render(createElement(Login));
    fireEvent.click(screen.getByRole("button", { name: /use phone instead/i }));
    expect(screen.getByTestId("phone")).toBeInTheDocument();
  });
});
