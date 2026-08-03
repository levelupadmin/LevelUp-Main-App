import "@testing-library/jest-dom";
import { vi } from "vitest";

// The production client intentionally has no committed credential fallback.
// Tests that import the real client receive a fake, loopback-only public config
// here so they stay hermetic and never depend on a developer or deployment env.
vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv(
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "sb_publishable_test_public_key_1234567890",
);

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
