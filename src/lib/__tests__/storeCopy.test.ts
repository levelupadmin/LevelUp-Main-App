import { afterEach, describe, expect, it, vi } from "vitest";

const platform = { value: "web" };
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => platform.value },
}));

import { nativePaymentNote } from "@/lib/storeCopy";

describe("nativePaymentNote", () => {
  afterEach(() => {
    platform.value = "web";
  });

  it("points Android readers to a web browser", () => {
    platform.value = "android";
    expect(nativePaymentNote()).toBe("Complete this step from a web browser.");
  });

  it("never points iOS readers outside the app", () => {
    platform.value = "ios";
    const note = nativePaymentNote();
    expect(note).toBe("This step isn't available in the app.");
    expect(note).not.toMatch(/browser|web|website/i);
  });
});
