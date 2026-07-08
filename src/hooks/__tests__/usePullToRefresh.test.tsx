import { render, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MotionValue } from "framer-motion";
import { usePullToRefresh } from "../usePullToRefresh";

// Haptics poke navigator.vibrate, which jsdom doesn't implement — stub them out.
vi.mock("@/lib/haptics", () => ({ tapTick: vi.fn(), confirm: vi.fn() }));

/** Dispatch a synthetic touch on document with a single-finger clientY. */
function touch(type: "touchstart" | "touchmove" | "touchend", clientY = 0) {
  const ev = new Event(type, { bubbles: true }) as Event & {
    touches: Array<{ clientY: number }>;
  };
  ev.touches = [{ clientY }];
  document.dispatchEvent(ev);
}

let renderCount = 0;
let latest: {
  isRefreshing: boolean;
  pullDistance: MotionValue<number>;
  pullProgress: MotionValue<number>;
} | null = null;

function Host({ onRefresh }: { onRefresh: () => Promise<void> | void }) {
  renderCount += 1;
  latest = usePullToRefresh({ onRefresh, threshold: 80 });
  return <div data-testid="host" />;
}

describe("usePullToRefresh", () => {
  afterEach(() => {
    renderCount = 0;
    latest = null;
    vi.clearAllMocks();
  });

  it("writes the gesture MotionValue on touchmove WITHOUT re-rendering the host", () => {
    render(<Host onRefresh={vi.fn()} />);
    const baseline = renderCount; // renders committed by mount

    // A drag: start at the top (scrollY is 0 in jsdom → the June-14 guard engages),
    // then move the finger down. Resistance is 0.4, so 100px of travel → 40px pull.
    touch("touchstart", 0);
    touch("touchmove", 50);
    touch("touchmove", 100);

    // The whole point of the fix: 60fps of touchmove must NOT reconcile the tree.
    expect(renderCount).toBe(baseline);
    // …yet the animated value the indicator binds to tracked the finger 1:1.
    expect(latest!.pullDistance.get()).toBeCloseTo(40, 5);
  });

  it("collapses the pull to 0 when the finger returns above the start (no render)", () => {
    render(<Host onRefresh={vi.fn()} />);
    const baseline = renderCount;

    touch("touchstart", 0);
    touch("touchmove", 100);
    touch("touchmove", -20); // dragged back up past the origin

    expect(renderCount).toBe(baseline);
    expect(latest!.pullDistance.get()).toBe(0);
  });

  it("runs onRefresh and flips isRefreshing when released past the threshold", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<Host onRefresh={onRefresh} />);

    // 250px of travel → 100px pull, comfortably past the 80px threshold.
    touch("touchstart", 0);
    touch("touchmove", 250);

    await act(async () => {
      touch("touchend");
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    // isRefreshing settles back to false once the refresh promise resolves.
    expect(latest!.isRefreshing).toBe(false);
  });

  it("does NOT refresh when released below the threshold", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<Host onRefresh={onRefresh} />);

    touch("touchstart", 0);
    touch("touchmove", 100); // 40px pull — under threshold

    await act(async () => {
      touch("touchend");
      await Promise.resolve();
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
