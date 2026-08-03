import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  localIntent: false,
  fetchRemote: vi.fn<() => Promise<boolean>>(),
  removeQueries: vi.fn(),
}));

vi.mock("@/lib/flags", () => ({
  COHORT_ROOMS: "VITE_COHORT_ROOMS",
  flag: () => h.localIntent,
}));

vi.mock("@/lib/runtimeFlags", () => ({
  fetchCohortRoomsSurfaceEnabled: () => h.fetchRemote(),
  resolveCohortRoomsSurface: (localIntent: boolean, remoteAnswer: unknown) =>
    localIntent === true && remoteAnswer === true,
}));

vi.mock("@/lib/queryClient", () => ({
  queryClient: { removeQueries: h.removeQueries },
}));

import {
  COHORT_ROOMS_SURFACE_REFRESH_MS,
  useCohortRoomsSurface,
} from "@/hooks/useCohortRoomsSurface";

const flush = () => act(async () => {
  await Promise.resolve();
});

describe("useCohortRoomsSurface", () => {
  beforeEach(() => {
    h.localIntent = false;
    h.fetchRemote.mockReset();
    h.removeQueries.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("makes no RPC when local rollout intent is false", async () => {
    const { result, unmount } = renderHook(() => useCohortRoomsSurface());
    await flush();

    expect(result.current).toEqual({ enabled: false, pending: false });
    expect(h.fetchRemote).not.toHaveBeenCalled();
    unmount();
  });

  it("stays pending for the first opted-in read, then enables only on true", async () => {
    h.localIntent = true;
    let resolveRemote!: (enabled: boolean) => void;
    h.fetchRemote.mockReturnValueOnce(new Promise((resolve) => {
      resolveRemote = resolve;
    }));

    const { result, unmount } = renderHook(() => useCohortRoomsSurface());
    expect(result.current).toEqual({ enabled: false, pending: true });

    await act(async () => resolveRemote(true));

    expect(result.current).toEqual({ enabled: true, pending: false });
    unmount();
  });

  it("fails closed on a false/error/timeout result", async () => {
    h.localIntent = true;
    h.fetchRemote.mockResolvedValueOnce(false);

    const { result, unmount } = renderHook(() => useCohortRoomsSurface());
    await flush();

    expect(result.current).toEqual({ enabled: false, pending: false });
    expect(h.removeQueries).toHaveBeenCalledWith({ queryKey: ["cohort-rooms"] });
    unmount();
  });

  it("fails closed if the runtime reader unexpectedly rejects", async () => {
    h.localIntent = true;
    h.fetchRemote.mockRejectedValueOnce(new Error("network failed"));

    const { result, unmount } = renderHook(() => useCohortRoomsSurface());
    await flush();

    expect(result.current).toEqual({ enabled: false, pending: false });
    expect(h.removeQueries).toHaveBeenCalledWith({ queryKey: ["cohort-rooms"] });
    unmount();
  });

  it("turns a live surface off on a failed foreground refresh and clears room data", async () => {
    h.localIntent = true;
    h.fetchRemote.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const { result, unmount } = renderHook(() => useCohortRoomsSurface());
    await flush();
    expect(result.current).toEqual({ enabled: true, pending: false });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(result.current).toEqual({ enabled: false, pending: false });
    expect(h.removeQueries).toHaveBeenCalledWith({ queryKey: ["cohort-rooms"] });
    unmount();
  });

  it("withdraws a local opt-in without another RPC", async () => {
    h.localIntent = true;
    h.fetchRemote.mockResolvedValueOnce(true);

    const { result, unmount } = renderHook(() => useCohortRoomsSurface());
    await flush();
    expect(result.current.enabled).toBe(true);

    h.localIntent = false;
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "VITE_COHORT_ROOMS" }));
      await Promise.resolve();
    });

    expect(result.current).toEqual({ enabled: false, pending: false });
    expect(h.fetchRemote).toHaveBeenCalledOnce();
    expect(h.removeQueries).toHaveBeenCalledWith({ queryKey: ["cohort-rooms"] });
    unmount();
  });

  it("cannot be revived by a true answer after local intent is withdrawn mid-request", async () => {
    h.localIntent = true;
    let resolveRemote!: (enabled: boolean) => void;
    h.fetchRemote.mockReturnValueOnce(new Promise((resolve) => {
      resolveRemote = resolve;
    }));

    const { result, unmount } = renderHook(() => useCohortRoomsSurface());
    expect(result.current.pending).toBe(true);

    h.localIntent = false;
    await act(async () => resolveRemote(true));

    expect(result.current).toEqual({ enabled: false, pending: false });
    expect(h.fetchRemote).toHaveBeenCalledOnce();
    unmount();
  });

  it("refreshes the direct RPC every 60 seconds", async () => {
    vi.useFakeTimers();
    h.localIntent = true;
    h.fetchRemote.mockResolvedValue(true);

    const { unmount } = renderHook(() => useCohortRoomsSurface());
    await flush();
    expect(h.fetchRemote).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COHORT_ROOMS_SURFACE_REFRESH_MS);
    });

    expect(h.fetchRemote).toHaveBeenCalledTimes(2);
    unmount();
  });
});
