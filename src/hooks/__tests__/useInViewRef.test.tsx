import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { useInViewRef } from "../useInViewRef";

/**
 * Controllable IntersectionObserver double: records every observed node and the
 * callback, and lets a test fire an intersection at will. jsdom ships no IO, so
 * the hook would otherwise no-op — this restores the branch under test.
 */
class MockIO {
  static observing: Element[] = [];
  static last: MockIO | null = null;
  cb: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  observed: Element[] = [];
  disconnected = false;
  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.cb = cb;
    this.options = options;
    MockIO.last = this;
  }
  observe(el: Element) {
    this.observed.push(el);
    MockIO.observing.push(el);
  }
  disconnect() {
    this.disconnected = true;
    MockIO.observing = MockIO.observing.filter((e) => !this.observed.includes(e));
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
  /** Fire the callback as the browser would when visibility changes. */
  fire(isIntersecting: boolean) {
    act(() => {
      this.cb(
        [{ isIntersecting, target: this.observed[0] } as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    });
  }
}

/**
 * Mirrors the checkout: the observed target is NOT in the DOM on first commit
 * (RevealOnMount paints a skeleton first) and only mounts on a later render —
 * exactly the case framer-motion's mount-only useInView silently drops.
 */
function DeferredTarget() {
  const [revealed, setRevealed] = useState(false);
  const [setRef, inView] = useInViewRef<HTMLButtonElement>({
    rootMargin: "0px 0px -96px 0px",
  });
  return (
    <div>
      <span data-testid="state">{inView ? "in" : "out"}</span>
      <button type="button" data-testid="reveal" onClick={() => setRevealed(true)}>
        reveal
      </button>
      {revealed && (
        <button ref={setRef} data-testid="target">
          Pay
        </button>
      )}
    </div>
  );
}

describe("useInViewRef", () => {
  beforeEach(() => {
    MockIO.observing = [];
    MockIO.last = null;
    vi.stubGlobal("IntersectionObserver", MockIO as unknown as typeof IntersectionObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not observe anything until the target actually mounts", () => {
    render(<DeferredTarget />);
    // First commit: no target in the DOM → nothing observed, gate is false.
    expect(MockIO.observing).toHaveLength(0);
    expect(screen.getByTestId("state").textContent).toBe("out");
  });

  it("re-subscribes when the target mounts after first commit and flips the gate", () => {
    render(<DeferredTarget />);

    // Reveal the target on a LATER render — the failure mode: a mount-only
    // observer bound on first commit (framer's useInView) would never see this
    // node and the gate would stay false forever.
    act(() => {
      screen.getByTestId("reveal").click();
    });

    const target = screen.getByTestId("target");
    expect(MockIO.observing).toContain(target);
    expect(MockIO.last).not.toBeNull();

    // Browser reports the button visible → gate flips true (sticky bar cedes).
    MockIO.last!.fire(true);
    expect(screen.getByTestId("state").textContent).toBe("in");

    // Scrolls back out of view → gate flips false again (sticky bar returns).
    MockIO.last!.fire(false);
    expect(screen.getByTestId("state").textContent).toBe("out");
  });

  it("passes the negative rootMargin through to the observer", () => {
    // Observe a stable node so we can read the constructor options off the IO.
    function Stable() {
      const [setRef] = useInViewRef<HTMLDivElement>({ rootMargin: "0px 0px -96px 0px" });
      return <div ref={setRef} data-testid="s" />;
    }
    render(<Stable />);
    expect(MockIO.last).not.toBeNull();
    expect(MockIO.last!.options).toEqual({
      rootMargin: "0px 0px -96px 0px",
      threshold: undefined,
    });
  });
});
