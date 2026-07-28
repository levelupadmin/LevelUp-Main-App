import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
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
  // Factory so a test can hand back a DEFERRED promise. The real `getSession()`
  // awaits `initializePromise`, so it CANNOT resolve until after
  // `_recoverAndRefresh()` has already emitted SIGNED_IN for a stored session;
  // deferring it is how the SC-2 tests reproduce that ordering.
  getSessionResponder: (): Promise<{ data: { session: unknown } }> =>
    Promise.resolve(h.getSessionResult),
  // Factory so a test can hand back a DEFERRED promise and prove `loading`
  // flips before the profile fetch resolves.
  profileResponder: (): Promise<{ data: unknown; error: unknown }> =>
    Promise.resolve({ data: null, error: null }),
  // SC-2: what `claim_my_purchases()` returns. `{claimed: n}` per SC-1.
  rpcResponder: (): Promise<{ data: unknown; error: unknown }> =>
    Promise.resolve({ data: { claimed: 0 }, error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => h.getSessionResponder()),
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
    // SC-2: the post-sign-in `claim_my_purchases()` call. Resolves like a real
    // PostgREST rpc so the awaited destructure in AuthContext sees
    // `{ data, error }`.
    rpc: vi.fn(() => h.rpcResponder()),
  },
}));

vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/queryClient", () => ({
  purgePersistedQueryCache: vi.fn(() => Promise.resolve()),
  // SC-2: a claim that actually attached rows invalidates the entitlement
  // query roots, otherwise the newly-claimed courses stay invisible behind the
  // 5-minute staleTime.
  queryClient: { invalidateQueries: vi.fn(() => Promise.resolve()) },
}));
vi.mock("@/lib/sentry", () => ({ setSentryUser: vi.fn(), captureException: vi.fn() }));

import { AuthProvider, useAuth } from "../AuthContext";
import RequireAuth from "@/components/guards/RequireAuth";
import RequireRole from "@/components/guards/RequireRole";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";

const PROFILE_CACHE_KEY = "lu_profile_v1";
// SC-2: the persisted "already claimed for this user at <ts>" watermark that
// rate-limits `claim_my_purchases()` across reloads and WebView restarts.
const CLAIM_WATERMARK_KEY = "lu_claim_v1";
const CLAIM_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

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

// `agoMs` back from now — i.e. how long ago this user's last claim ran.
const seedClaimWatermark = (userId: string, agoMs: number) =>
  localStorage.setItem(
    CLAIM_WATERMARK_KEY,
    JSON.stringify({ userId, at: Date.now() - agoMs })
  );

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
  h.getSessionResponder = () => Promise.resolve(h.getSessionResult);
  h.profileResponder = () => Promise.resolve({ data: null, error: null });
  h.rpcResponder = () => Promise.resolve({ data: { claimed: 0 }, error: null });
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

describe("SC-2 — claim_my_purchases fires only on a real sign-in", () => {
  const emit = async (event: string, session: unknown) => {
    await act(async () => {
      h.authCallbacks.forEach((cb) => cb(event, session));
      await Promise.resolve();
    });
  };

  it("claims exactly once when a signed-out user actually signs in", async () => {
    // The claim is a SECURITY DEFINER write, so it must fire on the sign-in and
    // on nothing else: `onAuthStateChange` also emits INITIAL_SESSION on cold
    // start and TOKEN_REFRESHED roughly hourly, and at 60k+ users either one
    // becomes a write storm.
    const rpc = supabase.rpc as unknown as Mock;
    h.getSessionResult = { data: { session: null } };
    h.profileResponder = () => Promise.resolve({ data: profileRow(), error: null });

    renderHook(() => useAuth(), { wrapper: providerWrapper });
    await waitFor(() => expect(h.authCallbacks.length).toBeGreaterThan(0));

    // Cold start for a signed-out visitor: INITIAL_SESSION carries no session.
    await emit("INITIAL_SESSION", null);
    expect(rpc).not.toHaveBeenCalled();

    // The MSG91 / magic-link paths land a session via `setSession`, which fans
    // out SIGNED_IN. THIS is the real sign-in.
    const session = { ...makeSession("u1"), access_token: "tok-1" } as Session;
    await emit("SIGNED_IN", session);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("claim_my_purchases");

    // Neither a re-emitted identical SIGNED_IN nor the hourly refresh may claim again.
    await emit("SIGNED_IN", session);
    await emit("TOKEN_REFRESHED", { ...session, access_token: "tok-2" } as Session);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("claims on ANY event that resolves a user — a returning student's TOKEN_REFRESHED must not be dropped", async () => {
    // THIS TEST WAS INVERTED. It previously asserted "SIGNED_IN only", which
    // locked in a silent failure for the exact population the feature exists
    // for. Verified against @supabase/auth-js 2.102.1 in node_modules:
    // `_recoverAndRefresh` computes `expiresWithMargin` (GoTrueClient.js:3508)
    // against EXPIRY_MARGIN_MS = 3 x 30s (lib/constants.js:13) and, when the
    // stored token is inside that margin, calls `_callRefreshToken` (:3512),
    // which emits ONLY TOKEN_REFRESHED — the SIGNED_IN emissions at :3530 and
    // :3545 are in the not-expired branches. Access tokens live 3600s, so every
    // cold start or Capacitor resume more than ~58.5 minutes after the last
    // issuance emits TOKEN_REFRESHED and never SIGNED_IN. Under the old gate
    // an already-signed-in student never claimed, the counters read zero, and
    // it was indistinguishable from success.
    //
    // The rate limit is the WATERMARK, not the event name, so the correct
    // assertion is: the first resolution carrying this user claims exactly
    // once, and further events in the same visit do not.
    const rpc = supabase.rpc as unknown as Mock;
    h.getSessionResult = { data: { session: null } };
    h.profileResponder = () => Promise.resolve({ data: profileRow(), error: null });

    renderHook(() => useAuth(), { wrapper: providerWrapper });
    await waitFor(() => expect(h.authCallbacks.length).toBeGreaterThan(0));

    const session = { ...makeSession("u1"), access_token: "tok-1" } as Session;
    await emit("TOKEN_REFRESHED", session);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("claim_my_purchases");

    // Same visit, more events for the same user: the per-visit guard and the
    // watermark both hold, so no second write.
    await emit("INITIAL_SESSION", { ...session, access_token: "tok-2" } as Session);
    await emit("SIGNED_IN", { ...session, access_token: "tok-3" } as Session);
    await emit("TOKEN_REFRESHED", { ...session, access_token: "tok-4" } as Session);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("never re-claims on a returning user's cold start, hourly refresh, or app resume", async () => {
    // The load-bearing case, in the REAL GoTrueClient emission order — which is
    // the opposite of the intuitive one. `_recoverAndRefresh()` emits SIGNED_IN
    // for the stored session from INSIDE `initialize()`; both `getSession()` and
    // `_emitInitialSession()` `await this.initializePromise` first, while
    // `onAuthStateChange` pushes the subscriber into `stateChangeEmitters`
    // synchronously. So the FIRST thing a subscriber sees on a returning user's
    // launch is SIGNED_IN, with the provider still holding nothing — which is
    // why an in-memory "signed-out → signed-in" transition check fails OPEN and
    // reinstates the write storm once per launch instead of once per hour.
    // Only the persisted watermark closes it.
    const rpc = supabase.rpc as unknown as Mock;
    const persisted = { ...makeSession("u1"), access_token: "tok-1" } as Session;
    // Their previous visit, minutes ago, already claimed.
    seedClaimWatermark("u1", 5 * 60 * 1000);
    const g = deferred<{ data: { session: unknown } }>();
    h.getSessionResponder = () => g.promise; // cannot resolve until initialize does
    h.profileResponder = () => Promise.resolve({ data: profileRow(), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper: providerWrapper });
    await waitFor(() => expect(h.authCallbacks.length).toBeGreaterThan(0));

    // 1. The recovery SIGNED_IN, before anything else can have resolved.
    await emit("SIGNED_IN", persisted);
    // 2. initialize() completes: getSession resolves, then INITIAL_SESSION.
    await act(async () => {
      g.resolve({ data: { session: persisted } });
      await Promise.resolve();
    });
    await emit("INITIAL_SESSION", persisted);
    await waitFor(() => expect(result.current.loading).toBe(false));
    // 3. ~Hourly rotation, then a tab focus / WebView background→foreground.
    const rotated = { ...persisted, access_token: "tok-2" } as Session;
    await emit("TOKEN_REFRESHED", rotated);
    await emit("SIGNED_IN", rotated);
    await emit("SIGNED_IN", { ...persisted, access_token: "tok-3" } as Session);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("persists the watermark, so the launch right after a sign-in does not re-claim", async () => {
    // The in-memory guard dies with the page. Only the persisted watermark can
    // stop the recovery SIGNED_IN on the NEXT launch from claiming again — this
    // drives a real sign-in, throws the provider away, and remounts it the way
    // a reload or a WebView restart would.
    const rpc = supabase.rpc as unknown as Mock;
    h.getSessionResult = { data: { session: null } };
    h.profileResponder = () => Promise.resolve({ data: profileRow(), error: null });

    const first = renderHook(() => useAuth(), { wrapper: providerWrapper });
    await waitFor(() => expect(h.authCallbacks.length).toBeGreaterThan(0));
    const session = { ...makeSession("u1"), access_token: "tok-1" } as Session;
    await emit("SIGNED_IN", session);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    first.unmount();

    // Relaunch minutes later: nothing in memory, the session comes back from
    // storage, and `_recoverAndRefresh()` announces it as SIGNED_IN.
    h.authCallbacks.length = 0;
    const g = deferred<{ data: { session: unknown } }>();
    h.getSessionResponder = () => g.promise;
    renderHook(() => useAuth(), { wrapper: providerWrapper });
    await waitFor(() => expect(h.authCallbacks.length).toBeGreaterThan(0));

    await emit("SIGNED_IN", { ...session, access_token: "tok-2" } as Session);
    await act(async () => {
      g.resolve({ data: { session } });
      await Promise.resolve();
    });

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("claims again when the same user signs out and back in inside the window", async () => {
    // The deliberate escape hatch: any resolution carrying no user drops the
    // watermark, so an explicit re-sign-in never waits out a window the
    // previous session already spent. It is also what makes an account switch
    // on a shared device claim for the second account immediately.
    const rpc = supabase.rpc as unknown as Mock;
    h.getSessionResult = { data: { session: null } };
    h.profileResponder = () => Promise.resolve({ data: profileRow(), error: null });

    renderHook(() => useAuth(), { wrapper: providerWrapper });
    await waitFor(() => expect(h.authCallbacks.length).toBeGreaterThan(0));

    const session = { ...makeSession("u1"), access_token: "tok-1" } as Session;
    await emit("SIGNED_IN", session);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));

    await emit("SIGNED_OUT", null);
    await emit("SIGNED_IN", { ...session, access_token: "tok-2" } as Session);

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  });

  it("claims again on the returning student's NEXT visit once the window has elapsed", async () => {
    // The reason the claim is idempotent rather than one-shot: a student who
    // signed up before their purchase was synced gets claimed on their next
    // visit. The returning majority never sign out, so a pure signed-out →
    // signed-in gate would never run for them a second time.
    const rpc = supabase.rpc as unknown as Mock;
    const persisted = { ...makeSession("u1"), access_token: "tok-1" } as Session;
    seedClaimWatermark("u1", CLAIM_MIN_INTERVAL_MS + 60 * 1000);
    const g = deferred<{ data: { session: unknown } }>();
    h.getSessionResponder = () => g.promise;
    h.profileResponder = () => Promise.resolve({ data: profileRow(), error: null });

    renderHook(() => useAuth(), { wrapper: providerWrapper });
    await waitFor(() => expect(h.authCallbacks.length).toBeGreaterThan(0));

    await emit("SIGNED_IN", persisted);
    await act(async () => {
      g.resolve({ data: { session: persisted } });
      await Promise.resolve();
    });

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));

    // ...and the rest of that visit is still quiet.
    await emit("INITIAL_SESSION", persisted);
    await emit("SIGNED_IN", { ...persisted, access_token: "tok-2" } as Session);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("claims on the emailed magic-link sign-in even though getSession resolved for that user first", async () => {
    // The guest-checkout buyer who just paid and signs in from the emailed
    // link. On the URL-callback path `initialize()` saves the session and then
    // DEFERS the notification (`setTimeout(… _notifyAllSubscribers('SIGNED_IN'),
    // 0)`) past the resolution of `initializePromise` — so the provider can
    // already be holding this exact user when the event lands. A transition
    // check reads that as "not a new user" and silently skips the one student
    // this whole phase exists for.
    const rpc = supabase.rpc as unknown as Mock;
    const signedIn = { ...makeSession("u1"), access_token: "tok-1" } as Session;
    h.getSessionResult = { data: { session: signedIn } };
    h.profileResponder = () => Promise.resolve({ data: profileRow(), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper: providerWrapper });
    // getSession lands FIRST, carrying the freshly signed-in user.
    await waitFor(() => expect(result.current.session).not.toBeNull());

    await emit("SIGNED_IN", signedIn);

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("claim_my_purchases");
  });

  it("cannot throw out of the auth callback for a session carrying no usable user", async () => {
    // auth-js hands back sessions whose `user` is absent or a proxy that throws
    // on access (`userNotAvailableProxy`), and `_isValidSession` does not
    // require one. Reading `nextSession.user.id` ahead of the null guard throws
    // SYNCHRONOUSLY inside the subscriber, which drops the event outright and
    // leaves the provider stuck in `loading`.
    const rpc = supabase.rpc as unknown as Mock;
    h.getSessionResult = { data: { session: null } };

    const { result } = renderHook(() => useAuth(), { wrapper: providerWrapper });
    await waitFor(() => expect(h.authCallbacks.length).toBeGreaterThan(0));

    await emit("SIGNED_IN", { access_token: "tok-1" } as unknown as Session);

    expect(rpc).not.toHaveBeenCalled();
    // The event still reached `syncAuthState`, which resolves it as the clean
    // signed-out state it is.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it("invalidates the entitlement caches only when the claim actually attached rows", async () => {
    // The claim races the post-sign-in navigation, so the enrolment queries can
    // already have cached an empty result (staleTime 5min, refetchOnWindowFocus
    // off). Without invalidation the student who this whole phase exists for
    // still sees no courses until a hard reload.
    const invalidate = queryClient.invalidateQueries as unknown as Mock;
    h.getSessionResult = { data: { session: null } };
    h.profileResponder = () => Promise.resolve({ data: profileRow(), error: null });
    h.rpcResponder = () => Promise.resolve({ data: { claimed: 2 }, error: null });

    renderHook(() => useAuth(), { wrapper: providerWrapper });
    await waitFor(() => expect(h.authCallbacks.length).toBeGreaterThan(0));

    await emit("SIGNED_IN", { ...makeSession("u1"), access_token: "tok-1" } as Session);

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["enrolled-offering-ids"] })
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["enrolled-progress"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["my-courses"] });

    // A no-op claim (the common case) must not churn the caches.
    invalidate.mockClear();
    h.rpcResponder = () => Promise.resolve({ data: { claimed: 0 }, error: null });
    await emit("SIGNED_OUT", null);
    await emit("SIGNED_IN", { ...makeSession("u2"), access_token: "tok-9" } as Session);
    await waitFor(() => expect(supabase.rpc as unknown as Mock).toHaveBeenCalledTimes(2));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("never blocks or breaks sign-in when the claim fails", async () => {
    const rpc = supabase.rpc as unknown as Mock;
    h.getSessionResult = { data: { session: null } };
    h.profileResponder = () => Promise.resolve({ data: profileRow(), error: null });
    h.rpcResponder = () => Promise.resolve({ data: null, error: { message: "boom" } });

    const { result } = renderHook(() => useAuth(), { wrapper: providerWrapper });
    await waitFor(() => expect(h.authCallbacks.length).toBeGreaterThan(0));

    await emit("SIGNED_IN", { ...makeSession("u1"), access_token: "tok-1" } as Session);

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    // Session + profile resolve exactly as they would with no claim at all.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).not.toBeNull();
    expect(result.current.profile?.id).toBe("u1");
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
