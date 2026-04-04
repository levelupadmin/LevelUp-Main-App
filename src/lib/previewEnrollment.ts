/**
 * Preview/dev-mode enrollment store.
 * Persists simulated enrollments in sessionStorage so the checkout flow
 * works end-to-end even without a real Supabase session.
 */

const STORE_KEY = "preview_enrollments";

function readStore(): Record<string, boolean> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, boolean>) {
  sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
}

export function isPreviewEnrolled(userId: string, courseId: string): boolean {
  return !!readStore()[`${userId}:${courseId}`];
}

export function setPreviewEnrolled(userId: string, courseId: string) {
  const store = readStore();
  store[`${userId}:${courseId}`] = true;
  writeStore(store);
}
