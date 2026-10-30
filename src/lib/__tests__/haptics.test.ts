import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const plugin = {
  impact: vi.fn().mockResolvedValue(undefined),
  notification: vi.fn().mockResolvedValue(undefined),
  selectionStart: vi.fn().mockResolvedValue(undefined),
  selectionChanged: vi.fn().mockResolvedValue(undefined),
};

describe("hapticSelection", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(plugin).forEach((fn) => fn.mockClear());
    (window as unknown as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: { Haptics: plugin },
    };
  });

  afterEach(() => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  });

  it("starts the selection generator before the first tick, then only ticks", async () => {
    const { hapticSelection } = await import("@/lib/haptics");
    await hapticSelection();
    await hapticSelection();
    expect(plugin.selectionStart).toHaveBeenCalledTimes(1);
    expect(plugin.selectionChanged).toHaveBeenCalledTimes(2);
    expect(plugin.selectionStart.mock.invocationCallOrder[0]).toBeLessThan(
      plugin.selectionChanged.mock.invocationCallOrder[0],
    );
  });

  it("does nothing on web", async () => {
    (window as unknown as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => false };
    const { hapticSelection } = await import("@/lib/haptics");
    await hapticSelection();
    expect(plugin.selectionStart).not.toHaveBeenCalled();
    expect(plugin.selectionChanged).not.toHaveBeenCalled();
  });
});
