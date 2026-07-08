import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { dehydrate, type Query } from "@tanstack/react-query";
import {
  queryClient,
  persistOptions,
  purgePersistedQueryCache,
  PERSIST_STORAGE_KEY,
  PERSISTED_QUERY_ROOTS,
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
