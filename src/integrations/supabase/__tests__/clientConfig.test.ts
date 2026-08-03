import { describe, expect, it } from "vitest";
import { resolveSupabaseClientConfig } from "@/integrations/supabase/clientConfig";

const MODERN_TEST_KEY = "sb_publishable_test_public_key_1234567890";

describe("resolveSupabaseClientConfig", () => {
  it("accepts and trims a modern publishable key", () => {
    expect(
      resolveSupabaseClientConfig({
        VITE_SUPABASE_URL: " https://project-ref.supabase.co/ ",
        VITE_SUPABASE_PUBLISHABLE_KEY: ` ${MODERN_TEST_KEY} `,
      }),
    ).toEqual({
      url: "https://project-ref.supabase.co",
      publishableKey: MODERN_TEST_KEY,
    });
  });

  it("fails clearly when the publishable key is missing", () => {
    expect(() =>
      resolveSupabaseClientConfig({
        VITE_SUPABASE_URL: "https://project-ref.supabase.co",
      }),
    ).toThrow("VITE_SUPABASE_PUBLISHABLE_KEY is required");
  });

  it("rejects a legacy cloud JWT without echoing it", () => {
    const legacyTestJwt = "header.payload.signature";
    let message = "";

    try {
      resolveSupabaseClientConfig({
        VITE_SUPABASE_URL: "https://project-ref.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: legacyTestJwt,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("modern sb_publishable_ key");
    expect(message).not.toContain(legacyTestJwt);
  });

  it("allows a Supabase CLI JWT only for a loopback URL", () => {
    expect(
      resolveSupabaseClientConfig({
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_SUPABASE_PUBLISHABLE_KEY: "local.header.signature",
      }),
    ).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "local.header.signature",
    });
  });

  it("rejects retired project URLs instead of silently redirecting requests", () => {
    expect(() =>
      resolveSupabaseClientConfig({
        VITE_SUPABASE_URL: "https://yblyccthpqduyajgynsq.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: MODERN_TEST_KEY,
      }),
    ).toThrow("VITE_SUPABASE_URL points to a retired project");
  });
});
