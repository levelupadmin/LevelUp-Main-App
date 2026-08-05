import { describe, it, expect } from "vitest";
import { canSeePreview } from "../previewGate";

const ID = "5c25205d-bc27-45d6-b6a0-19478ef68560";

describe("canSeePreview", () => {
  it("admits by auth user id — the identifier a phone-OTP login always has", () => {
    expect(canSeePreview({ id: ID, email: null })).toBe(true);
  });

  it("admits by email when the id has not resolved yet", () => {
    expect(canSeePreview({ id: null, email: "avinash@leveluplearning.in" })).toBe(true);
  });

  it("is case- and whitespace-insensitive, because auth emails arrive dirty", () => {
    expect(canSeePreview({ email: "  Avinash@LevelUpLearning.in " })).toBe(true);
  });

  it("refuses everyone else, including other staff addresses", () => {
    expect(canSeePreview({ id: "someone-else", email: "someone@leveluplearning.in" })).toBe(false);
    expect(canSeePreview({ email: "student@gmail.com" })).toBe(false);
  });

  it("refuses a signed-out or empty identity instead of throwing", () => {
    expect(canSeePreview(null)).toBe(false);
    expect(canSeePreview(undefined)).toBe(false);
    expect(canSeePreview({})).toBe(false);
    expect(canSeePreview({ id: "", email: "" })).toBe(false);
  });
});
