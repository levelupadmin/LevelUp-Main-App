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

// jsdom does not implement ResizeObserver, which is universally available in
// the browsers this app targets (Safari 13.1+, Chrome 64+), so a component is
// right to use it unguarded — the gap is jsdom's, not the code's.
//
// IntersectionObserver is DELIBERATELY not stubbed here. A no-op stub that
// never fires is worse than its absence: components that fall back to
// "render immediately" when the API is missing instead wait forever for a
// callback that never comes (it silently broke YourWeek's CountUp). Tests that
// need it stub it locally, with the firing behaviour that test wants.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopObserver;
}
