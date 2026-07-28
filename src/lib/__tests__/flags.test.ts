import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flag, FUNNEL_RECON, INSTALL_NUDGE, REMINDER_LADDER } from "@/lib/flags";

// This jsdom build ships without a working `localStorage` (same gap the
// queryClient persist test papers over). Install a memory-backed mock so the
// override branch of `flag()` is exercised for real.
function installLocalStorageMock() {
  const store = new Map<string, string>();
  const mem = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: mem, configurable: true, writable: true });
  Object.defineProperty(window, "localStorage", { value: mem, configurable: true, writable: true });
}

beforeEach(() => {
  installLocalStorageMock();
});

afterEach(() => {
  localStorage.clear();
});

describe("flag()", () => {
  it("VITE_FUNNEL_RECON defaults off (dark) with no override or env", () => {
    expect(flag(FUNNEL_RECON)).toBe(false);
  });

  it("VITE_REMINDER_LADDER defaults off (dark) with no override or env", () => {
    expect(flag(REMINDER_LADDER)).toBe(false);
  });

  // The install nudge's default is load-bearing beyond this file: with it false
  // the app attaches no `beforeinstallprompt` listener and never preventDefaults
  // the browser's own install bar. If this ever defaults true, install promotion
  // for every web visitor changes with it.
  it("VITE_INSTALL_NUDGE defaults off (dark) with no override or env", () => {
    expect(flag(INSTALL_NUDGE)).toBe(false);
  });

  it("unknown flags read false", () => {
    expect(flag("VITE_NOT_A_REAL_FLAG")).toBe(false);
  });

  it("a localStorage override turns a flag on", () => {
    localStorage.setItem(FUNNEL_RECON, "true");
    expect(flag(FUNNEL_RECON)).toBe(true);
  });

  it("accepts 1 / on as truthy overrides", () => {
    localStorage.setItem(FUNNEL_RECON, "1");
    expect(flag(FUNNEL_RECON)).toBe(true);
    localStorage.setItem(FUNNEL_RECON, "on");
    expect(flag(FUNNEL_RECON)).toBe(true);
  });

  it("a falsey override wins over any default", () => {
    localStorage.setItem(FUNNEL_RECON, "false");
    expect(flag(FUNNEL_RECON)).toBe(false);
  });

  it("an override is per-name and does not leak to other flags", () => {
    localStorage.setItem(FUNNEL_RECON, "true");
    expect(flag("VITE_SOMETHING_ELSE")).toBe(false);
  });
});
