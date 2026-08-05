import { describe, it, expect } from "vitest";
import { canSeePreview } from "../previewGate";

describe("canSeePreview", () => {
  it("admits the allowlisted address", () => {
    expect(canSeePreview("avinash@leveluplearning.in")).toBe(true);
  });

  it("is case- and whitespace-insensitive, because auth emails arrive dirty", () => {
    expect(canSeePreview("  Avinash@LevelUpLearning.in ")).toBe(true);
  });

  it("refuses everyone else, including other staff addresses", () => {
    expect(canSeePreview("someone@leveluplearning.in")).toBe(false);
    expect(canSeePreview("student@gmail.com")).toBe(false);
  });

  it("refuses a signed-out or profile-less caller instead of throwing", () => {
    expect(canSeePreview(null)).toBe(false);
    expect(canSeePreview(undefined)).toBe(false);
    expect(canSeePreview("")).toBe(false);
  });
});
