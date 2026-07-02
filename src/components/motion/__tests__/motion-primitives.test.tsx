import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { MotionButton } from "../MotionButton";
import { MotionCard } from "../MotionCard";

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
});
