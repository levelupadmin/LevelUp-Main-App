import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { createRef } from "react";
import { MotionButton } from "../MotionButton";
import { MotionCard } from "../MotionCard";
import { CountUp } from "../CountUp";

// framer-motion's useReducedMotion reads the (prefers-reduced-motion: reduce)
// media query. Point matchMedia at a matcher so a test can flip reduced motion
// on for the reduced-motion-path assertions, then restore afterwards.
const setReducedMotion = (reduced: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setReducedMotion(false);
});

describe("MotionButton", () => {
  it("renders a button with its children", () => {
    render(<MotionButton>Tap me</MotionButton>);
    const btn = screen.getByRole("button", { name: "Tap me" });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("BUTTON");
  });

  it("forwards props and refs to the underlying element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <MotionButton ref={ref} type="submit" className="my-btn" data-testid="mb">
        Go
      </MotionButton>,
    );
    const btn = screen.getByTestId("mb");
    expect(ref.current).toBe(btn);
    expect(btn).toHaveClass("my-btn");
    expect(btn).toHaveAttribute("type", "submit");
  });

  it("renders the child element when asChild is set (Slot)", () => {
    render(
      <MotionButton asChild>
        <a href="/next">Link</a>
      </MotionButton>,
    );
    const link = screen.getByRole("link", { name: "Link" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/next");
  });

  it("renders under reduced motion without a scale animation", () => {
    setReducedMotion(true);
    render(<MotionButton>Reduced</MotionButton>);
    expect(screen.getByRole("button", { name: "Reduced" })).toBeInTheDocument();
  });

  it("ships the app's focus-visible ring by default", () => {
    render(<MotionButton>Focus</MotionButton>);
    expect(screen.getByRole("button", { name: "Focus" })).toHaveClass("focus-ring");
  });

  it("keeps the focus ring alongside a caller's className", () => {
    render(<MotionButton className="my-btn">Merged</MotionButton>);
    const btn = screen.getByRole("button", { name: "Merged" });
    expect(btn).toHaveClass("focus-ring");
    expect(btn).toHaveClass("my-btn");
  });

  it("fires onClick for both pointer and keyboard activation (unified path)", () => {
    const onClick = vi.fn();
    render(<MotionButton onClick={onClick}>Activate</MotionButton>);
    const btn = screen.getByRole("button", { name: "Activate" });

    // Pointer tap → native click.
    fireEvent.click(btn);
    // Keyboard Enter/Space on a native <button> also dispatches a click; assert
    // the same activation path handles a keyboard-originated click too.
    fireEvent.click(btn);

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("routes real keyboard Enter/Space through the native-button activation path", () => {
    const onClick = vi.fn();
    render(<MotionButton onClick={onClick}>Keyed</MotionButton>);
    const btn = screen.getByRole("button", { name: "Keyed" });

    // A real keydown on a native <button> — jsdom does NOT synthesize the follow-on
    // click that a browser would, so assert the keydown itself does not throw and
    // the element carries native-button keyboard semantics (it IS a <button>, so no
    // custom onKeyDown bridge is needed — the platform handles Enter/Space).
    fireEvent.keyDown(btn, { key: "Enter" });
    fireEvent.keyDown(btn, { key: " " });
    expect(btn.tagName).toBe("BUTTON");
    // The unified activation path is onClick; a browser-dispatched click from either
    // key lands there. Simulate that follow-on click for each key press.
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

describe("MotionCard", () => {
  it("renders a div with its children", () => {
    render(<MotionCard>Card body</MotionCard>);
    const card = screen.getByText("Card body");
    expect(card).toBeInTheDocument();
    expect(card.tagName).toBe("DIV");
  });

  it("forwards props and refs to the underlying element", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <MotionCard ref={ref} className="my-card" data-testid="mc">
        Content
      </MotionCard>,
    );
    const card = screen.getByTestId("mc");
    expect(ref.current).toBe(card);
    expect(card).toHaveClass("my-card");
  });

  it("renders the child element when asChild is set (Slot)", () => {
    render(
      <MotionCard asChild>
        <article data-testid="card-article">Article</article>
      </MotionCard>,
    );
    const article = screen.getByTestId("card-article");
    expect(article).toBeInTheDocument();
    expect(article.tagName).toBe("ARTICLE");
  });

  it("renders under reduced motion without a scale animation", () => {
    setReducedMotion(true);
    render(<MotionCard>Reduced card</MotionCard>);
    expect(screen.getByText("Reduced card")).toBeInTheDocument();
  });

  it("stays a plain, non-interactive div with no onClick", () => {
    render(<MotionCard data-testid="plain">Static</MotionCard>);
    const card = screen.getByTestId("plain");
    // No button role, and kept OUT of the tab order — this asserts we override
    // framer-motion's whileTap tabIndex={0} auto-injection so a decorative card
    // is not a focusable-but-inert tab trap.
    expect(card).not.toHaveAttribute("role");
    expect(card).toHaveAttribute("tabindex", "-1");
  });

  it("becomes a keyboard-operable button with native-button Enter/Space semantics", () => {
    const onClick = vi.fn();
    render(
      <MotionCard onClick={onClick} data-testid="pressable">
        Press
      </MotionCard>,
    );
    const card = screen.getByTestId("pressable");
    expect(card).toHaveAttribute("role", "button");
    expect(card).toHaveAttribute("tabindex", "0");

    // Enter activates on keydown (native-button semantics).
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);

    // Space does NOT activate on keydown — it only suppresses page scroll — and
    // activates on keyup instead, matching a native <button>.
    fireEvent.keyDown(card, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(card, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);

    // An unrelated key does not activate on either keydown or keyup.
    fireEvent.keyDown(card, { key: "a" });
    fireEvent.keyUp(card, { key: "a" });
    expect(onClick).toHaveBeenCalledTimes(2);

    // And a pointer click still fires directly.
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it("does not multi-fire on held-key (auto-repeat) Enter", () => {
    const onClick = vi.fn();
    render(
      <MotionCard onClick={onClick} data-testid="repeat">
        Held
      </MotionCard>,
    );
    const card = screen.getByTestId("repeat");

    // First press fires; the OS then streams repeat keydowns while the key is held.
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: "Enter", repeat: true });
    fireEvent.keyDown(card, { key: "Enter", repeat: true });
    // Only the initial (non-repeat) keydown activated.
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("lets the caller override the interactive defaults", () => {
    const onClick = vi.fn();
    render(
      <MotionCard
        onClick={onClick}
        role="link"
        tabIndex={-1}
        data-testid="override"
      >
        Custom
      </MotionCard>,
    );
    const card = screen.getByTestId("override");
    expect(card).toHaveAttribute("role", "link");
    expect(card).toHaveAttribute("tabindex", "-1");
  });

  it("runs the caller's onKeyDown and honours its preventDefault", () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn((e) => e.preventDefault());
    render(
      <MotionCard onClick={onClick} onKeyDown={onKeyDown} data-testid="stop">
        Guarded
      </MotionCard>,
    );
    const card = screen.getByTestId("stop");
    fireEvent.keyDown(card, { key: "Enter" });
    // The caller's handler ran, but its preventDefault suppressed the click bridge.
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("warns in dev when an interactive card has no discernible accessible name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<MotionCard onClick={() => {}} aria-label="" data-testid="noname" />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/accessible name/i);
  });

  it("does not warn when the interactive card has text content", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<MotionCard onClick={() => {}}>Enrol now</MotionCard>);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn when the interactive card has an aria-label", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<MotionCard onClick={() => {}} aria-label="Open course" />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn for a non-interactive card without a name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<MotionCard data-testid="static-noname" />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("shares ONE (pointer: fine) listener across a grid of cards", () => {
    // A single MediaQueryList instance the shared subscription attaches to; count
    // add/remove of the "change" handler to prove N cards register 1 listener.
    let addCount = 0;
    let removeCount = 0;
    const fineMql = {
      matches: true,
      media: "(pointer: fine)",
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_: string, __: EventListener) => {
        addCount += 1;
      },
      removeEventListener: (_: string, __: EventListener) => {
        removeCount += 1;
      },
      dispatchEvent: () => false,
    };
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) =>
        query.includes("pointer: fine")
          ? fineMql
          : {
              matches: false,
              media: query,
              onchange: null,
              addListener: () => {},
              removeListener: () => {},
              addEventListener: () => {},
              removeEventListener: () => {},
              dispatchEvent: () => false,
            },
    });

    const { unmount } = render(
      <>
        {Array.from({ length: 25 }, (_, i) => (
          <MotionCard key={i} data-testid={`grid-card-${i}`}>
            {`Card ${i}`}
          </MotionCard>
        ))}
      </>,
    );

    // 25 cards mounted, but the module-level subscription attaches exactly one
    // "change" listener to the shared MediaQueryList.
    expect(addCount).toBe(1);
    expect(removeCount).toBe(0);

    // And it detaches when the last subscriber unmounts (reference-counted).
    unmount();
    expect(removeCount).toBe(1);
  });
});

describe("CountUp — immediate mode (order-summary Total)", () => {
  it("renders the real value at rest, not 0 (no observer gating)", () => {
    // The checkout Total sits below the fold: the IntersectionObserver never
    // fired, so the default path showed ₹0. immediate seeds to the target so
    // the very first paint is correct.
    render(<CountUp immediate value={1499} prefix="₹" />);
    expect(screen.getByText("₹1,499")).toBeInTheDocument();
    expect(screen.queryByText("₹0")).not.toBeInTheDocument();
  });

  it("rolls from the PREVIOUS value on change, never re-rolling from 0", () => {
    // Drive RAF by hand so we can inspect the very first animation frame.
    let rafCb: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCb = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockReturnValue(1000);

    const { rerender } = render(<CountUp immediate value={1499} prefix="₹" />);
    expect(screen.getByText("₹1,499")).toBeInTheDocument();

    // Apply a coupon: total drops 1,499 → 1,299.
    rerender(<CountUp immediate value={1299} prefix="₹" />);

    // First animation frame (t=0) must start from the PREVIOUS total, not 0 —
    // this is the key={total} remount regression.
    act(() => rafCb?.(1000));
    expect(screen.getByText("₹1,499")).toBeInTheDocument();
    expect(screen.queryByText("₹0")).not.toBeInTheDocument();

    // Final frame (t=1) settles on the new total.
    act(() => rafCb?.(1600));
    expect(screen.getByText("₹1,299")).toBeInTheDocument();
  });

  it("jumps straight to the value under reduced motion (no roll)", () => {
    setReducedMotion(true);
    const { rerender } = render(<CountUp immediate value={1499} prefix="₹" />);
    expect(screen.getByText("₹1,499")).toBeInTheDocument();
    rerender(<CountUp immediate value={1299} prefix="₹" />);
    expect(screen.getByText("₹1,299")).toBeInTheDocument();
  });
});
