import { describe, it, expect, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import { STOREFRONT_QUERY_ROOTS, refreshStorefront } from "@/lib/storefrontCache";

describe("refreshStorefront", () => {
  it("marks every shop-window list stale, so Home reads it again after an admin save", () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    refreshStorefront();
    expect(spy.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0])).toEqual([...STOREFRONT_QUERY_ROOTS]);
    spy.mockRestore();
  });

  it("covers the keys Home and Explore actually use", () => {
    expect(STOREFRONT_QUERY_ROOTS).toEqual(expect.arrayContaining(["stage-catalog", "stage-pages", "stage-landing-heads"]));
  });
});
