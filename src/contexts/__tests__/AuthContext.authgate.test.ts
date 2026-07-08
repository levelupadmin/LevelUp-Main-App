import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  renderHook,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

/**
 * P6-T4 — auth gate off the critical path.
 *
 * The task caches the `users` profile row (`lu_profile_v1`, keyed by user id) so
 * a returning user's cold start paints Home with ZERO auth-blocking round-trips,
 * while revalidating in the background. The non-negotiable is that every gate
 * route's ACCESS DECISION stays byte-identical to before — the cache only
 * changes the loading choreography, never who gets in.
 *
 * This file drives the REAL AuthProvider + RequireAuth/RequireRole guards
 * through a mocked supabase client, covering the acceptance #3 test matrix:
 *   • logged-in       — cached profile → instant, non-blocking hydrate + revalidate
 *   • logged-out      — null session → no profile, stale cache purged
 *   • deep-link       — authed link resolves; anon link bounces to /login (from-state)
 *   • expired session — session dropping to null fires the expiry path + clears cache
 *   • role-downgrade  — cached admin role re-evaluated to student → access revoked
 *
 * The file is `.ts` (not `.tsx`) per the task's file list, so element trees are
 * built with `React.createElement` rather than JSX.
 */

// This repo's `.env` ships `VITE_DEV_ADMIN_BYPASS=true` for localhost dev, and
// vitest runs with `import.meta.env.DEV === true` on a loopback host — which
// would trip AuthContext's dev bypass and short-circuit the real auth path we
// are testing. Neutralise the flag BEFORE AuthContext evaluates its top-level
// bypass constants (vi.hoisted runs ahead of the static imports below).
vi.hoisted(() => {
  vi.stubEnv("VITE_DEV_ADMIN_BYPASS", "");
});

// ── Hoisted, mutable control state the mocks read at call time ──────────────
const h = vi.hoisted(() => ({
  authCallbacks: [] as Array<(event: string, session: unknown) => void>,
  getSessionResult: { data: { session: null as unknown } },
  // Factory so a test can hand back a DEFERRED promise and prove `loading`
  // flips before the profile fetch resolves.
  profileResponder: (): Promise<{ data: unknown; error: unknown }> =>
    Promise.resolve({ data: null, error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve(h.getSessionResult)),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        h.authCallbacks.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: vi.fn(() => {
        // A real sign-out fans out a SIGNED_OUT event; mirror that so the
        // soft-delete path exercises the null-session branch.
        h.authCallbacks.forEach((cb) => cb("SIGNED_OUT", null));
        return Promise.resolve({ error: null });
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => h.profileResponder()),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/queryClient", () => ({
  purgePersistedQueryCache: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/sentry", () => ({ setSentryUser: vi.fn() }));

import { AuthProvider, useAuth } from "../AuthContext";
import RequireAuth from "@/components/guards/RequireAuth";
import RequireRole from "@/components/guards/RequireRole";
import { toast } from "@/lib/toast";

const PROFILE_CACHE_KEY = "lu_profile_v1";

// jsdom here ships without a working localStorage, so install an in-memory one
// (the persister test does the same). AuthContext reads it synchronously.
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  get length(): number { return this.m.size; }
}

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  avatar_url: string | null;
  member_number: number | null;
  bio: string | null;
  city: string | null;
  occupation: string | null;
};

const profileRow = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  id: "u1",
  email: "u@x.com",
  full_name: "Rahul",
  role: "student",
  avatar_url: null,
  member_number: 1,
  bio: null,
  city: null,
  occupation: null,
  ...over,
});

const makeSession = (userId: string, email = "u@x.com"): Session =>
  ({ user: { id: userId, email } } as unknown as Session);

const seedCache = (userId: string, profile: ProfileRow) =>
  localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ userId, profile }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const providerWrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(AuthProvider, null, children);

beforeEach(() => {
  const mem = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: mem, configurable: true, writable: true });
  Object.defineProperty(window, "localStorage", { value: mem, configurable: true, writable: true });
  h.authCallbacks.length = 0;
  h.getSessionResult = { data: { session: null } };
  h.profileResponder = () => Promise.resolve({ data: null, error: null });
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe("P6-T4 auth gate — logged-in (cached profile fast path)", () => {
  it("hydrates from the cached profile and drops loading BEFORE the fetch resolves, then revalidates + re-caches", async () => {
    seedCache("u1", profileRow({ full_name: "Cached Rahul" }));
    h.getSessionResult = { data: { session: makeSession("u1") } };
    const d = deferred<{ data: unknown; error: unknown }>();
    h.profileResponder = () => d.promise; // fetch stays pending

    const { result } = renderHook(() => useAuth(), { wrapper: providerWrapper });

    // getSession resolves locally → loading false with the CACHED row while the
    // profile fetch is still in flight = zero auth-blocking round-trip.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile?.full_name).toBe("Cached Rahul");
    expect(result.current.session).not.toBeNull();

    // Background revalidation lands a fresher row → state updates + cache refreshes.
    await act(async () => {
      d.resolve({ data: profileRow({ full_name: "Fresh Rahul" }), error: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.profile?.full_name).toBe("Fresh Rahul"));

    const persisted = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY)!);
    expect(persisted.userId).toBe("u1");
    expect(persisted.profile.full_name).toBe("Fresh Rahul");
  });

  it("ignores a cached profile that belongs to a DIFFERENT user (blocks on the fetch instead)", async () => {
    // Stale cache for someone else on this device must never hydrate u1.
    seedCache("other-user", profileRow({ id: "other-user", full_name: "Someone Else" }));
    h.getSessionResult = { data: { session: makeSession("u1") } };
    const d = deferred<{ data: unknown; error: unknown }>();
    h.profileResponder = () => d.promise;

    const { result } = renderHook(() => useAuth(), { wrapper: providerWrapper });

    // No matching cache → still loading (blocked on the network fetch).
    await waitFor(() => expect(result.current.session).not.toBeNull());
    expect(result.current.loading).toBe(true);
    expect(result.current.profile).toBeNull();

    await act(async () => {
      d.resolve({ data: profileRow({ id: "u1", full_name: "Real Rahul" }), error: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile?.full_name).toBe("Real Rahul");
  });
});

describe("P6-T4 auth gate — logged-out", () => {
  it("resolves to loading=false with a null profile and purges any stale cached profile", async () => {
    seedCache("old-user", profileRow({ id: "old-user" }));
    h.getSessionResult = { data: { session: null } };

    const { result } = renderHook(() => useAuth(), { wrapper: providerWrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });
});

describe("P6-T4 auth gate — deep-link", () => {
  const LoginProbe = () => {
    const loc = useLocation();
    const from = (loc.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "none";
    return React.createElement("div", null, `LOGIN from:${from}`);
  };

  const gatedTree = (initialPath: string) =>
    React.createElement(
      MemoryRouter,
      { initialEntries: [initialPath] },
      React.createElement(
        AuthProvider,
        null,
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: "/chapters/:chapterId",
            element: React.createElement(
              RequireAuth,
              null,
              React.createElement("div", null, "PROTECTED CHAPTER")
            ),
          }),
          React.createElement(Route, { path: "/login", element: React.createElement(LoginProbe) })
        )
      )
    );

  it("resolves an authenticated deep link straight to the protected route", async () => {
    h.getSessionResult = { data: { session: makeSession("u1") } };
    h.profileResponder = () => Promise.resolve({ data: profileRow(), error: null });

    render(gatedTree("/chapters/abc"));

    expect(await screen.findByText("PROTECTED CHAPTER")).toBeInTheDocument();
  });

  it("bounces an unauthenticated deep link to /login preserving the intended path, with no protected-content flash", async () => {
    h.getSessionResult = { data: { session: null } };

    render(gatedTree("/chapters/abc"));

    expect(await screen.findByText("LOGIN from:/chapters/abc")).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED CHAPTER")).toBeNull();
  });
});

describe("P6-T4 auth gate — expired session", () => {
  it("fires the expiry toast and clears the profile + cached row when the session drops to null", async () => {
    seedCache("u1", profileRow());
    h.getSessionResult = { data: { session: makeSession("u1") } };
    h.profileResponder = () => Promise.resolve({ data: profileRow(), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper: providerWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    // Supabase reports the session gone (refresh returns no session).
    await act(async () => {
      h.authCallbacks.forEach((cb) => cb("TOKEN_REFRESHED", null));
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.profile).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("Your session has expired. Please sign in again.");
    expect(localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });
});

describe("P6-T4 auth gate — role-downgrade", () => {
  it("re-evaluates a cached admin role once revalidation returns a downgraded role and revokes access", async () => {
    seedCache("u1", profileRow({ role: "admin" }));
    h.getSessionResult = { data: { session: makeSession("u1") } };
    const d = deferred<{ data: unknown; error: unknown }>();
    h.profileResponder = () => d.promise;

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/admin"] },
        React.createElement(
          AuthProvider,
          null,
          React.createElement(
            Routes,
            null,
            React.createElement(Route, {
              path: "/admin",
              element: React.createElement(
                RequireRole,
                { role: "admin" },
                React.createElement("div", null, "ADMIN CONTENT")
              ),
            })
          )
        )
      )
    );

    // Fast path: the cached admin role briefly grants access.
    expect(await screen.findByText("ADMIN CONTENT")).toBeInTheDocument();

    // Revalidation returns a downgraded role → guard re-evaluates → Forbidden.
    await act(async () => {
      d.resolve({ data: profileRow({ role: "student" }), error: null });
      await Promise.resolve();
    });

    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    expect(screen.queryByText("ADMIN CONTENT")).toBeNull();
  });

  it("clears the stale cached role when background revalidation FAILS, so a transient fetch error can't retain elevated access (byte-identical to pre-cache)", async () => {
    seedCache("u1", profileRow({ role: "admin" }));
    h.getSessionResult = { data: { session: makeSession("u1") } };
    const d = deferred<{ data: unknown; error: unknown }>();
    h.profileResponder = () => d.promise;

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/admin"] },
        React.createElement(
          AuthProvider,
          null,
          React.createElement(
            Routes,
            null,
            React.createElement(Route, {
              path: "/admin",
              element: React.createElement(
                RequireRole,
                { role: "admin" },
                React.createElement("div", null, "ADMIN CONTENT")
              ),
            })
          )
        )
      )
    );

    // Fast path: the cached admin role briefly grants access.
    expect(await screen.findByText("ADMIN CONTENT")).toBeInTheDocument();

    // Revalidation FAILS transiently (network/API error). The access decision
    // must converge to the pre-cache behavior — profile cleared → RouteFallback —
    // NOT retain the stale cached admin role.
    await act(async () => {
      d.resolve({ data: null, error: { message: "network" } });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.queryByText("ADMIN CONTENT")).toBeNull());
  });
});
