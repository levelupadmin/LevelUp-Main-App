import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

/**
 * The Stage sign-in's three gaps, pinned:
 *
 *  1. A pasted "+91 98765 43210" reaches MSG91 as +919876543210, not as a
 *     wrong number built from its first 10 digits.
 *  2. "Sign in with email" opens the classic page straight on its email step
 *     (`?classic=1&method=email`) and keeps `next`.
 *  3. A number with no account is NEVER given one silently: verify-msg91-otp is
 *     called once, the person sees the choice, and the create call (with the
 *     /signup placeholders) is only made on "Create an account with this number".
 *
 * Presentational pieces (the wall, the intro, the sign-in moment, the mark and
 * loader) are stubbed; the network calls, the step machine and the copy are real.
 */

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: "?next=%2Fcourse%2Fabc",
  setSession: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })),
  sendOtp: vi.fn(async () => {}),
  verifyOtp: vi.fn(async () => ({ accessToken: "tok" })),
  moment: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => h.navigate,
  useLocation: () => ({ state: null }),
  useSearchParams: () => [new URLSearchParams(h.search), () => {}],
  Link: ({ to, children, ...rest }: { to?: unknown; children?: unknown }) =>
    createElement("a", { href: typeof to === "string" ? to : "#", ...rest }, children as never),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const usersBuilder: Record<string, unknown> = {};
  usersBuilder.select = vi.fn(() => usersBuilder);
  usersBuilder.eq = vi.fn(() => usersBuilder);
  usersBuilder.single = vi.fn(async () => ({ data: { craft_interests: ["film"] }, error: null }));
  return {
    supabaseUrl: "https://test-project.supabase.co",
    supabasePublishableKey: "sb_publishable_test_public_key_1234567890",
    supabase: { from: vi.fn(() => usersBuilder), auth: { setSession: h.setSession } },
  };
});

vi.mock("@/lib/msg91-widget", () => ({
  initMsg91: vi.fn(async () => {}),
  sendOtp: h.sendOtp,
  verifyOtp: h.verifyOtp,
  retryOtp: vi.fn(async () => {}),
}));

vi.mock("@/lib/stagingLogin", () => ({ isStagingTestLogin: () => false }));
vi.mock("@/lib/haptics", () => ({ confirm: vi.fn(async () => {}), hapticImpact: vi.fn(async () => {}) }));
vi.mock("@/lib/sound", () => ({ playSound: vi.fn() }));
vi.mock("@/hooks/usePageTitle", () => ({ default: () => {} }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("@/components/brand/BrandIntro", () => ({ BrandIntro: () => null }));
vi.mock("@/components/brand/SignInMoment", () => ({
  SignInMoment: (p: { eyebrow: string }) => {
    h.moment(p.eyebrow);
    return createElement("div", { "data-testid": "moment" }, p.eyebrow);
  },
}));
vi.mock("@/components/brand/LevelUpMark", () => ({ LevelUpMark: () => null }));
vi.mock("@/components/brand/LevelUpLoader", () => ({ LevelUpLoader: () => null }));
vi.mock("../PhotoWall", () => ({ PhotoWall: () => null }));
vi.mock("../photos", () => ({ INTRO_PHOTOS: [] }));

import StageLogin from "../StageLogin";

type Reply = { status: number; body: Record<string, unknown> };
const SESSION = { access_token: "a", refresh_token: "r" };

const fetchMock = vi.fn();
const replies = (...list: Reply[]) => {
  for (const r of list) {
    fetchMock.mockImplementationOnce(async () => ({
      ok: r.status >= 200 && r.status < 300,
      json: async () => r.body,
    }));
  }
};
const bodies = () => fetchMock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));

const onStep = (s: string) => document.querySelector(`.fo-step.is-on[data-s="${s}"]`);

async function reachCode(paste = "+91 98765 43210") {
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: paste } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await waitFor(() => expect(onStep("code")).not.toBeNull());
  fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "1234" } });
}

beforeEach(() => {
  h.search = "?next=%2Fcourse%2Fabc";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("StageLogin: pasted numbers", () => {
  it("normalises a pasted +91 number before sending the code", async () => {
    render(createElement(StageLogin));
    const input = screen.getByLabelText("Mobile number") as HTMLInputElement;
    expect(input.maxLength).toBeGreaterThanOrEqual(16);
    fireEvent.change(input, { target: { value: "+91 98765 43210" } });
    expect(input.value).toBe("98765 43210");
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(h.sendOtp).toHaveBeenCalledWith("+919876543210"));
  });

  it("drops a trunk zero from an autofilled national number", () => {
    render(createElement(StageLogin));
    const input = screen.getByLabelText("Mobile number") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "09876543210" } });
    expect(input.value).toBe("98765 43210");
  });
});

describe("StageLogin: sign in with email", () => {
  it("links to the classic page's email step and keeps next", () => {
    render(createElement(StageLogin));
    const links = screen.getAllByRole("link", { name: "Sign in with email" });
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      const url = new URL(a.getAttribute("href") as string, "https://app.example");
      expect(url.pathname).toBe("/login");
      expect(url.searchParams.has("classic")).toBe(true);
      expect(url.searchParams.get("method")).toBe("email");
      expect(url.searchParams.get("next")).toBe("/course/abc");
    }
  });

  it("leaves next off when they were only going home", () => {
    h.search = "?phone=%2B919876543210";
    render(createElement(StageLogin));
    const href = screen.getAllByRole("link", { name: "Sign in with email" })[0].getAttribute("href") as string;
    const url = new URL(href, "https://app.example");
    expect(url.searchParams.get("method")).toBe("email");
    expect(url.searchParams.has("next")).toBe(false);
  });
});

describe("StageLogin: a number with no account", () => {
  it("signs an existing account straight in with one call", async () => {
    replies({ status: 200, body: { ...SESSION, is_new_user: false } });
    render(createElement(StageLogin));
    await reachCode();
    await waitFor(() => expect(h.setSession).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodies()[0]).toEqual({ phone: "+919876543210", accessToken: "tok" });
    expect(onStep("join")).toBeNull();
    await waitFor(() => expect(h.moment).toHaveBeenCalledWith("Welcome back"));
  });

  it("asks instead of creating, and creates only on the explicit choice", async () => {
    replies(
      { status: 404, body: { error: "signup_requires_email_and_name", reason: "no_account_for_phone" } },
      { status: 200, body: { ...SESSION, is_new_user: true } },
    );
    render(createElement(StageLogin));
    await reachCode();

    await waitFor(() => expect(onStep("join")).not.toBeNull());
    // Nothing created, nobody signed in.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodies()[0]).toEqual({ phone: "+919876543210", accessToken: "tok" });
    expect(h.setSession).not.toHaveBeenCalled();

    const join = onStep("join") as HTMLElement;
    expect(join.textContent).toContain("No account with this number yet");
    expect(join.textContent).toContain("If you bought with your email, sign in with email.");
    const emailLink = join.querySelector("a") as HTMLAnchorElement;
    expect(emailLink.textContent).toBe("Sign in with email");
    expect(emailLink.getAttribute("href")).toContain("method=email");

    fireEvent.click(screen.getByRole("button", { name: "Create an account with this number" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodies()[1]).toEqual({
      phone: "+919876543210",
      accessToken: "tok",
      email: "919876543210@phone.leveluplearning.in",
      full_name: "LevelUp Student",
    });
    await waitFor(() => expect(h.setSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.moment).toHaveBeenCalledWith("Welcome to LevelUp"));
  });

  it("sends them back for a new code if it went stale while they chose", async () => {
    replies(
      { status: 404, body: { error: "signup_requires_email_and_name" } },
      { status: 401, body: { error: "invalid_otp" } },
    );
    render(createElement(StageLogin));
    await reachCode();
    await waitFor(() => expect(onStep("join")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Create an account with this number" }));
    await waitFor(() => expect(onStep("phone")).not.toBeNull());
    expect(h.setSession).not.toHaveBeenCalled();
  });

  it("Back from the choice returns to the number without creating anything", async () => {
    replies({ status: 404, body: { error: "signup_requires_email_and_name" } });
    render(createElement(StageLogin));
    await reachCode();
    await waitFor(() => expect(onStep("join")).not.toBeNull());
    // The header's back control (each step also has its own desktop one).
    fireEvent.click(screen.getAllByRole("button", { name: "Back" })[0]);
    await waitFor(() => expect(onStep("phone")).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.setSession).not.toHaveBeenCalled();
  });
});
