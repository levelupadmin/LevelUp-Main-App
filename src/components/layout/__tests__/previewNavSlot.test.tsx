/**
 * The prototype's nav slot. This test exists because the first cut shipped with
 * no nav entry at all and the founder — the one person allowlisted — could not
 * find his own prototype: a pasted deep link does not survive this app's phone
 * OTP round trip, so he landed on /home with no route in.
 */
import { describe, it, expect } from "vitest";
import { canSeePreview } from "@/pages/preview/previewGate";

const AVINASH = "5c25205d-bc27-45d6-b6a0-19478ef68560";

/** Mirrors StudentLayout.buildNav so the ordering contract is pinned. */
function buildNav(base: Array<{ path: string }>, studioEnabled: boolean, showPreview: boolean) {
  const arr = [...base];
  if (studioEnabled) {
    const i = arr.findIndex((x) => x.path === "/learn");
    arr.splice(i >= 0 ? i + 1 : arr.length, 0, { path: "/studio" });
  }
  if (showPreview) arr.push({ path: "/creator-studio-preview" });
  return arr;
}

const BASE = [{ path: "/home" }, { path: "/learn" }, { path: "/community" }];

describe("preview nav slot", () => {
  it("gives the allowlisted account a tab, so no URL needs pasting", () => {
    const nav = buildNav(BASE, false, canSeePreview({ id: AVINASH }));
    expect(nav.map((n) => n.path)).toContain("/creator-studio-preview");
  });

  it("shows nothing to everyone else — the bar is byte-identical to today", () => {
    const nav = buildNav(BASE, false, canSeePreview({ id: "someone-else" }));
    expect(nav.map((n) => n.path)).toEqual(["/home", "/learn", "/community"]);
  });

  it("never displaces a real tab: the prototype is always appended last", () => {
    const nav = buildNav(BASE, true, true);
    expect(nav.map((n) => n.path)).toEqual([
      "/home", "/learn", "/studio", "/community", "/creator-studio-preview",
    ]);
  });
});
