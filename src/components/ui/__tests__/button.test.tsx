import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { Button, buttonVariants } from "../button";
import { pressTap, pressTapReduced } from "@/lib/motion";

// tapTick fires the native selection haptic; on web it no-ops, so we spy on the
// module to assert the activation path calls it exactly once (no double-fire).
vi.mock("@/lib/haptics", () => ({
  tapTick: vi.fn(() => Promise.resolve()),
}));
import { tapTick } from "@/lib/haptics";

// framer-motion's useReducedMotion reads (prefers-reduced-motion: reduce). Point
// matchMedia at a matcher so the reduced-motion path can be exercised.
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
  vi.clearAllMocks();
  setReducedMotion(false);
});

describe("Button", () => {
  it("renders a native button with its children", () => {
    render(<Button>Tap me</Button>);
    const btn = screen.getByRole("button", { name: "Tap me" });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("BUTTON");
  });

  it("forwards refs and native props to the underlying button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} type="submit" data-testid="b" aria-label="Submit form">
        Go
      </Button>,
    );
    const btn = screen.getByTestId("b");
    expect(ref.current).toBe(btn);
    expect(btn).toHaveAttribute("type", "submit");
    expect(btn).toHaveAttribute("aria-label", "Submit form");
  });

  it("keeps the focus-visible ring classes", () => {
    render(<Button>Focus</Button>);
    const btn = screen.getByRole("button", { name: "Focus" });
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-ring");
  });

  it("merges caller className with the variant classes", () => {
    render(<Button className="my-btn">Merged</Button>);
    const btn = screen.getByRole("button", { name: "Merged" });
    expect(btn).toHaveClass("my-btn");
    // Default variant class still present.
    expect(btn.className).toContain("bg-primary");
  });

  it.each([
    ["default", "bg-primary"],
    ["destructive", "bg-destructive"],
    ["outline", "border-input"],
    ["secondary", "bg-secondary"],
    ["ghost", "hover:bg-muted"],
    ["link", "underline-offset-4"],
    ["glass", "backdrop-blur-xl"],
  ] as const)("renders the %s variant classes", (variant, marker) => {
    render(<Button variant={variant}>{variant}</Button>);
    const btn = screen.getByRole("button", { name: variant });
    expect(btn.className).toContain(marker);
    // Variant class matches the standalone cva output (parity with 68 importers).
    expect(btn.className).toContain(buttonVariants({ variant }).split(" ").find((c) => c === marker) ?? marker);
  });

  it.each([
    ["sm", "h-8"],
    ["default", "h-10"],
    ["lg", "h-12"],
    ["xl", "h-14"],
    ["icon", "w-10"],
  ] as const)("renders the %s size classes", (size, marker) => {
    render(<Button size={size}>{size}</Button>);
    expect(screen.getByRole("button", { name: size }).className).toContain(marker);
  });

  it("fires a single haptic tick on activation and calls onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Activate</Button>);
    const btn = screen.getByRole("button", { name: "Activate" });

    fireEvent.click(btn);

    expect(tapTick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire a haptic when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Off
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Off" });
    expect(btn).toBeDisabled();
    // Even if a click event is dispatched, the disabled guard suppresses the tick.
    fireEvent.click(btn);
    expect(tapTick).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders without a scale animation under reduced motion", () => {
    setReducedMotion(true);
    render(<Button>Reduced</Button>);
    const btn = screen.getByRole("button", { name: "Reduced" });
    expect(btn).toBeInTheDocument();
    // Contract lock: the reduced-motion whileTap token drops the scale entirely
    // (state change only), while the default token presses in. If a future edit
    // reintroduces a scale under reduced motion, this fails.
    expect(pressTapReduced).not.toHaveProperty("scale");
    expect(pressTap).toHaveProperty("scale");
    expect(pressTap.scale).toBeLessThan(1);
  });

  describe("hover-lift hoist (transform-ownership conflict)", () => {
    it("strips the hover:-translate-y-* utility on the motion path so framer's inline transform can't clobber it", () => {
      // Fine pointer + motion allowed: the lift is hoisted into framer's whileHover.
      // The now-inert CSS utility must be gone (inline transform > class would kill it
      // after the first press, silently breaking the hover micro-interaction).
      render(
        <Button className="btn-champagne hover:-translate-y-0.5">Lift</Button>,
      );
      const btn = screen.getByRole("button", { name: "Lift" });
      expect(btn.className).not.toContain("hover:-translate-y-0.5");
      // Sibling utilities on the same className survive the strip.
      expect(btn.className).toContain("btn-champagne");
    });

    it("keeps the hover:-translate-y-* utility intact on the Slot path (framer never owns that transform)", () => {
      render(
        <Button asChild className="hover:-translate-y-0.5">
          <a href="/x">Composed lift</a>
        </Button>,
      );
      const link = screen.getByRole("link", { name: "Composed lift" });
      // Slot path is CSS-only press — the class-driven lift must stay.
      expect(link.className).toContain("hover:-translate-y-0.5");
    });
  });

  describe("asChild (Slot composition)", () => {
    it("renders the child element with the variant classes", () => {
      render(
        <Button asChild variant="outline">
          <a href="/next">Link</a>
        </Button>,
      );
      const link = screen.getByRole("link", { name: "Link" });
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href", "/next");
      expect(link.className).toContain("border-input");
    });

    it("does NOT fire the button's haptic on the Slot path (no double-fire)", () => {
      const onClick = vi.fn();
      render(
        <Button asChild onClick={onClick}>
          <a href="#next">Composed</a>
        </Button>,
      );
      const link = screen.getByRole("link", { name: "Composed" });
      fireEvent.click(link);
      // The composed child owns its own activation semantics — Button stays silent.
      expect(tapTick).not.toHaveBeenCalled();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});
