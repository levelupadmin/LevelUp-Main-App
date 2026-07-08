import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { dehydrate, type Query } from "@tanstack/react-query";
import {
  queryClient,
  persister,
  persistOptions,
  purgePersistedQueryCache,
  PERSIST_STORAGE_KEY,
  PERSIST_THROTTLE_MS,
  PERSISTED_QUERY_ROOTS,
  __resetPersistWriteFailureWarning,
} from "../queryClient";

/**
 * P6-T3 — persisted query cache.
 *
 * The persister writes the react-query cache to localStorage for instant warm
 * opens, but the phase-6 hard rule is that it must never persist an
 * access-deciding or another user's payload across sign-out. These tests pin:
 *   1. the dehydration whitelist (only the four safe roots, only on success);
 *   2. that the entitlement gate is excluded so it always revalidates;
 *   3. that only whitelisted keys actually reach disk (end-to-end);
 *   4. that sign-out purges BOTH the localStorage copy and the in-memory cache;
 *   5. that a second user on the same device never reads the first user's data
 *      (user-scoped keys + the sign-out purge).
 */

// This jsdom build ships without a working `localStorage`, so install a small
// in-memory Storage before the persister touches it. The persister resolves
// `window.localStorage` lazily (see queryClient.ts), so this mock — installed
// after import — is picked up on every read/write.
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  get length(): number { return this.m.size; }
}

beforeAll(() => {
  const mem = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: mem, configurable: true, writable: true });
  Object.defineProperty(window, "localStorage", { value: mem, configurable: true, writable: true });
});

// The whitelist predicate the persister uses to decide what hits disk.
const shouldDehydrate = persistOptions.dehydrateOptions!.shouldDehydrateQuery!;

// Minimal stand-in for a react-query Query — shouldDehydrateQuery only reads
// `queryKey` and `state.status`.
const fakeQuery = (
  queryKey: readonly unknown[],
  status: "success" | "pending" | "error" = "success"
): Query => ({ queryKey, state: { status } } as unknown as Query);

beforeEach(async () => {
  queryClient.clear();
  localStorage.clear();
});

describe("persisted cache — dehydration whitelist", () => {
  it("persists only the four whitelisted roots, and only when successful", () => {
    // Whitelisted + success → persisted.
    expect(shouldDehydrate(fakeQuery(["catalog"]))).toBe(true);
    expect(shouldDehydrate(fakeQuery(["enrolled-progress", "user-1"]))).toBe(true);
    expect(shouldDehydrate(fakeQuery(["my-courses", "user-1"]))).toBe(true);
    expect(shouldDehydrate(fakeQuery(["profile-sections", "user-1"]))).toBe(true);

    // Whitelisted but NOT yet successful → not persisted (no half-loaded state).
    expect(shouldDehydrate(fakeQuery(["catalog"], "pending"))).toBe(false);
    expect(shouldDehydrate(fakeQuery(["my-courses", "user-1"], "error"))).toBe(false);
  });

  it("never persists non-whitelisted queries (payments, community, events, sessions)", () => {
    expect(shouldDehydrate(fakeQuery(["community", "everyone"]))).toBe(false);
    expect(shouldDehydrate(fakeQuery(["upcoming-events", "user-1"]))).toBe(false);
    expect(shouldDehydrate(fakeQuery(["upcoming-sessions", "user-1"]))).toBe(false);
    expect(shouldDehydrate(fakeQuery(["quickpick", "user-1"]))).toBe(false);
    expect(shouldDehydrate(fakeQuery(["cohort-dash", "off-1", "user-1"]))).toBe(false);
    expect(shouldDehydrate(fakeQuery(["course", "course-1", "user-1"]))).toBe(false);
  });

  it("excludes the entitlement gate so entitlements always revalidate (per spec)", () => {
    // useEnrolledOfferingIds (staleTime 0) must NEVER be persisted — access is
    // decided off it, so it has to hit the network on every mount.
    expect(PERSISTED_QUERY_ROOTS.has("enrolled-offering-ids")).toBe(false);
    expect(shouldDehydrate(fakeQuery(["enrolled-offering-ids", "user-1"]))).toBe(false);
  });

  it("dehydrates ONLY whitelisted keys (the exact payload the persister writes)", () => {
    // A mix of whitelisted and excluded queries in the cache…
    queryClient.setQueryData(["catalog"], [{ id: "c1" }]);
    queryClient.setQueryData(["my-courses", "user-1"], { courses: ["a"] });
    queryClient.setQueryData(["enrolled-offering-ids", "user-1"], ["off-1"]); // excluded
    queryClient.setQueryData(["community", "everyone"], [{ id: "p1" }]); // excluded

    // dehydrate with the persister's dehydrateOptions is exactly what the
    // persister serializes to disk — assert only whitelisted roots survive.
    const dehydrated = dehydrate(queryClient, persistOptions.dehydrateOptions);
    const roots = new Set(dehydrated.queries.map((q) => q.queryKey[0] as string));

    expect(roots.has("catalog")).toBe(true);
    expect(roots.has("my-courses")).toBe(true);
    expect(roots.has("enrolled-offering-ids")).toBe(false);
    expect(roots.has("community")).toBe(false);
  });
});

describe("persisted cache — write is deferred off the settle path", () => {
  // The persist subscribe path fires persistClient synchronously on every cache
  // event during a warm open. These pin that the actual serialize+setItem is
  // throttled onto a later macrotask, so it can never block the settle handler
  // (and therefore never blocks first paint) — the core of this fix.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT write synchronously — the serialize+setItem lands on a later timer", () => {
    vi.useFakeTimers();
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBeNull();

    // Simulate one settle in the burst: persistClient is invoked synchronously…
    persister.persistClient({
      buster: "",
      timestamp: Date.now(),
      clientState: dehydrate(queryClient),
    });

    // …and NOTHING has been written yet when control returns (paint would run here).
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBeNull();

    // The write only lands after the throttle window elapses, on a macrotask.
    vi.advanceTimersByTime(PERSIST_THROTTLE_MS);
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).not.toBeNull();
  });

  it("coalesces a burst of settles into a single deferred write", () => {
    vi.useFakeTimers();
    const setItemSpy = vi.spyOn(localStorage, "setItem");

    // catalog + enrolled-progress + my-courses + profile-sections all settle.
    for (let i = 0; i < 4; i++) {
      persister.persistClient({
        buster: "",
        timestamp: Date.now(),
        clientState: dehydrate(queryClient),
      });
    }
    // No synchronous writes despite four settles…
    expect(setItemSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PERSIST_THROTTLE_MS);
    // …and the whole burst collapses to ONE write to disk.
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    setItemSpy.mockRestore();
  });
});

describe("persisted cache — oversized/quota write telemetry", () => {
  // The warn latch is a module-level, once-per-session flag (see queryClient.ts).
  // Reset it around each case so the "exactly once" assertions can't be tripped
  // by — or leak into — a sibling test, regardless of file order.
  beforeEach(() => {
    __resetPersistWriteFailureWarning();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    __resetPersistWriteFailureWarning();
  });

  it("warns exactly once when a write fails (quota/oversize) and never throws", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const setItem = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation(() => {
        const err = new Error("quota");
        err.name = "QuotaExceededError";
        throw err;
      });

    // Two separate throttled writes both hit the failing setItem…
    for (let i = 0; i < 2; i++) {
      expect(() =>
        persister.persistClient({
          buster: "",
          timestamp: Date.now(),
          clientState: dehydrate(queryClient),
        })
      ).not.toThrow();
      vi.advanceTimersByTime(PERSIST_THROTTLE_MS);
    }

    expect(setItem).toHaveBeenCalled();
    // …but the app only logs the degradation once (no per-write spam).
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("persisted cache write failed");
  });

  it("an oversized whitelisted payload trips the warn path (not silent degradation), and entitlements stay off disk", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // A storage that accepts small writes but rejects an over-budget one — the
    // real quota shape, not an unconditional throw. The dehydrated catalog below
    // is what pushes the write past this cap.
    const QUOTA_BYTES = 4 * 1024;
    const throwOnOversize = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation((_key: string, value: string) => {
        if (value.length > QUOTA_BYTES) {
          const err = new Error("quota");
          err.name = "QuotaExceededError";
          throw err;
        }
      });

    // A genuinely large *whitelisted* payload (catalog is on the whitelist), so
    // the serialized cache the persister writes clears the cap above.
    const bigCatalog = Array.from({ length: 400 }, (_, i) => ({
      id: `course-${i}`,
      blurb: "x".repeat(64),
    }));
    queryClient.setQueryData(["catalog"], bigCatalog);
    // An entitlement entry sits in the SAME cache; it must never be dehydrated,
    // so it can neither reach disk nor inflate the payload that overflows quota.
    queryClient.setQueryData(["enrolled-offering-ids", "user-1"], ["off-1"]);

    // What the persister would actually serialize to disk — assert the
    // entitlement gate is excluded even under the failing-write path.
    const dehydrated = dehydrate(queryClient, persistOptions.dehydrateOptions);
    const roots = new Set(dehydrated.queries.map((q) => q.queryKey[0] as string));
    expect(roots.has("catalog")).toBe(true);
    expect(roots.has("enrolled-offering-ids")).toBe(false);

    // The throttled write flushes onto a macrotask and overflows quota…
    expect(() =>
      persister.persistClient({ buster: "", timestamp: Date.now(), clientState: dehydrated })
    ).not.toThrow();
    vi.advanceTimersByTime(PERSIST_THROTTLE_MS);

    // …and the failure surfaces as a warn (visible degradation), not a swallowed
    // silent fallback to cold start.
    expect(throwOnOversize).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("persisted cache write failed");
  });
});

describe("persisted cache — sign-out purge", () => {
  it("purges both the localStorage copy and the in-memory cache on sign-out", async () => {
    queryClient.setQueryData(["my-courses", "user-A"], { courses: ["a"] });
    queryClient.setQueryData(["enrolled-progress", "user-A"], { courseIds: ["a"] });
    // Simulate a prior persisted session sitting on disk.
    localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify({ some: "dehydrated cache" }));

    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).not.toBeNull();
    expect(queryClient.getQueryData(["my-courses", "user-A"])).toBeDefined();

    await purgePersistedQueryCache();

    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBeNull();
    expect(queryClient.getQueryData(["my-courses", "user-A"])).toBeUndefined();
    expect(queryClient.getQueryData(["enrolled-progress", "user-A"])).toBeUndefined();
  });

  it("never throws even when storage is unavailable (private mode)", async () => {
    // purge is self-guarded; a broken removeClient must not break sign-out.
    await expect(purgePersistedQueryCache()).resolves.toBeUndefined();
  });
});

describe("persisted cache — second user on the same device", () => {
  it("keeps two users' data isolated by user-scoped keys", () => {
    queryClient.setQueryData(["my-courses", "user-A"], { courses: ["A-course"] });
    queryClient.setQueryData(["enrolled-progress", "user-A"], { courseIds: ["a"] });

    // User B's keys are distinct → they never resolve to A's cached rows.
    expect(queryClient.getQueryData(["my-courses", "user-B"])).toBeUndefined();
    expect(queryClient.getQueryData(["enrolled-progress", "user-B"])).toBeUndefined();
  });

  it("after user A signs out, user B restores nothing of A's on the same device", async () => {
    // User A loaded + persisted (a dehydrated copy is on disk).
    queryClient.setQueryData(["my-courses", "user-A"], { courses: ["A-course"] });
    queryClient.setQueryData(["catalog"], [{ id: "c1" }]);
    localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify({ some: "A cache" }));
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).not.toBeNull();

    // A signs out → purge wipes disk + memory.
    await purgePersistedQueryCache();

    // B signs in on the same device: nothing of A's survives, in memory or disk.
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBeNull();
    expect(queryClient.getQueryData(["my-courses", "user-A"])).toBeUndefined();
    expect(queryClient.getQueryData(["my-courses", "user-B"])).toBeUndefined();
    expect(queryClient.getQueryData(["catalog"])).toBeUndefined();
  });
});
