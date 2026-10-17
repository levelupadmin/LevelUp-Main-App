import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The OTP widget script is loaded on demand (not from index.html). It must load
 * once, fall back to the mirror when the primary fails, and let a later call
 * retry after both fail.
 */
describe("loadMsg91Script", () => {
  const scripts = () => Array.from(document.head.querySelectorAll<HTMLScriptElement>("script[data-msg91-otp]"));

  beforeEach(() => {
    scripts().forEach((s) => s.remove());
    delete (window as { initSendOTP?: unknown }).initSendOTP;
  });

  const fresh = async () => {
    vi.resetModules();
    return (await import("@/lib/msg91-widget")).loadMsg91Script;
  };

  it("falls back to the mirror, then resolves once, with one script per URL", async () => {
    const loadMsg91Script = await fresh();
    const p = loadMsg91Script();
    expect(loadMsg91Script()).toBe(p);
    expect(scripts().map((s) => s.src)).toEqual(["https://verify.msg91.com/otp-provider.js"]);
    scripts()[0].onerror?.(new Event("error"));
    expect(scripts().map((s) => s.src)).toEqual(["https://verify.phone91.com/otp-provider.js"]);
    scripts()[0].onload?.(new Event("load"));
    await expect(p).resolves.toBeUndefined();
  });

  it("rejects when both URLs fail, and the next call tries again", async () => {
    const loadMsg91Script = await fresh();
    const p = loadMsg91Script();
    scripts()[0].onerror?.(new Event("error"));
    scripts()[0].onerror?.(new Event("error"));
    await expect(p).rejects.toThrow(/not loaded/);
    expect(scripts()).toHaveLength(0);
    void loadMsg91Script().catch(() => undefined);
    expect(scripts().map((s) => s.src)).toEqual(["https://verify.msg91.com/otp-provider.js"]);
  });

  it("adds no script when the widget is already present", async () => {
    const loadMsg91Script = await fresh();
    (window as { initSendOTP?: unknown }).initSendOTP = () => undefined;
    await expect(loadMsg91Script()).resolves.toBeUndefined();
    expect(scripts()).toHaveLength(0);
  });
});
