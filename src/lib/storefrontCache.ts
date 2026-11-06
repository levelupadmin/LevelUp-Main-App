import { queryClient } from "@/lib/queryClient";

/**
 * What students see in the shop window (Home rows, the carousel, Explore) is
 * read once and kept for 5 minutes (queryClient staleTime), and the admin and
 * student screens are the same app. So after an admin changes an offering or
 * the Explore order, Home in the same tab kept showing the old list until the
 * 5 minutes ran out or the page was reloaded: a new offering looked missing
 * (founder, 6 Nov 2026, "Executive Presence"). Call this after any such save
 * so the next visit to Home or Explore reads the list again.
 */
export const STOREFRONT_QUERY_ROOTS = ["stage-catalog", "stage-pages", "stage-landing-heads", "catalog"] as const;

export function refreshStorefront(): void {
  for (const root of STOREFRONT_QUERY_ROOTS) {
    void queryClient.invalidateQueries({ queryKey: [root] });
  }
}
