import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COHORT_ROOMS_SURFACE_RPC,
  fetchCohortRoomsSurfaceEnabled,
  resolveCohortRoomsSurface,
} from "@/lib/runtimeFlags";

describe("resolveCohortRoomsSurface", () => {
  it.each([
    [false, false, false],
    [false, true, false],
    [true, false, false],
    [true, true, true],
    [true, "true", false],
    [true, null, false],
  ])("resolves local=%j remote=%j to %j", (local, remote, expected) => {
    expect(resolveCohortRoomsSurface(local, remote)).toBe(expected);
  });
});

describe("fetchCohortRoomsSurfaceEnabled", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts only a literal true from the named RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    await expect(fetchCohortRoomsSurfaceEnabled(100, { rpc })).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(COHORT_ROOMS_SURFACE_RPC);
  });

  it.each([
    [false, null],
    [null, null],
    [undefined, null],
    ["true", null],
    [true, { message: "permission denied" }],
  ])("fails closed for data=%j error=%j", async (data, error) => {
    const rpc = vi.fn().mockResolvedValue({ data, error });

    await expect(fetchCohortRoomsSurfaceEnabled(100, { rpc })).resolves.toBe(false);
  });

  it("fails closed when the RPC rejects", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(fetchCohortRoomsSurfaceEnabled(100, { rpc })).resolves.toBe(false);
  });

  it("fails closed at the bounded timeout", async () => {
    vi.useFakeTimers();
    const rpc = vi.fn().mockReturnValue(new Promise(() => {}));
    const answer = fetchCohortRoomsSurfaceEnabled(3_000, { rpc });

    await vi.advanceTimersByTimeAsync(3_000);

    await expect(answer).resolves.toBe(false);
  });
});
