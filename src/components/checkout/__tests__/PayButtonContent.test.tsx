import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PayButtonContent from "../PayButtonContent";

// framer-motion's useReducedMotion does not reliably flip off the matchMedia
// query in jsdom, so drive the reduced-motion branch deterministically by
// mocking useMotionSafe (durations/easings/springs stay real via importActual).
let reducedMotion = false;
vi.mock("@/lib/motion", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/motion")>();
  return {
    ...actual,
    useMotionSafe: () => ({
      enabled: !reducedMotion,
      reduced: reducedMotion,
      springs: reducedMotion
        ? { snap: actual.instant, glide: actual.instant, bounce: actual.instant }
        : actual.springs,
      pressTap: reducedMotion ? actual.pressTapReduced : actual.pressTap,
    }),
  };
});

const setReducedMotion = (reduced: boolean) => {
  reducedMotion = reduced;
};

afterEach(() => setReducedMotion(false));

describe("PayButtonContent (motion path)", () => {
  it("keeps the label as the accessible text at rest (idle)", () => {
    render(<PayButtonContent status="idle" label="Pay ₹4,999" />);
    // Two copies exist by design (invisible sizer + visible layer) so the
    // container can't resize; both carry the same text.
    expect(screen.getAllByText("Pay ₹4,999").length).toBeGreaterThanOrEqual(1);
  });

  it("reserves the label footprint in every state so the container never resizes", () => {
    // The invisible sizer copy of the label is present regardless of status —
    // this is what pins the button's width/height across the crossfade.
    const { rerender, container } = render(
      <PayButtonContent status="idle" label="Pay ₹4,999" />,
    );
    const sizer = container.querySelector(".invisible");
    expect(sizer).not.toBeNull();
    expect(sizer).toHaveTextContent("Pay ₹4,999");

    rerender(<PayButtonContent status="processing" label="Pay ₹4,999" />);
    const sizerProcessing = container.querySelector(".invisible");
    expect(sizerProcessing).toHaveTextContent("Pay ₹4,999");

    rerender(<PayButtonContent status="success" label="Pay ₹4,999" />);
    const sizerSuccess = container.querySelector(".invisible");
    expect(sizerSuccess).toHaveTextContent("Pay ₹4,999");
  });

  it("does NOT mount a spinner on the pay path in any state", () => {
    const { rerender, container } = render(
      <PayButtonContent status="processing" label="Pay ₹4,999" />,
    );
    // The old spinner used lucide's animate-spin; the processing arc must not.
    expect(container.querySelector(".animate-spin")).toBeNull();
    rerender(<PayButtonContent status="success" label="Pay ₹4,999" />);
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("keeps the label in the a11y tree while processing (name stays stable)", () => {
    render(<PayButtonContent status="processing" label="Pay ₹4,999" />);
    // Opacity-hidden (not display:none) → still queryable / still the name.
    expect(screen.getAllByText("Pay ₹4,999").length).toBeGreaterThanOrEqual(1);
  });
});

describe("PayButtonContent (reduced motion)", () => {
  it("swaps to plain 'Processing…' text with no pulsing dot", () => {
    setReducedMotion(true);
    const { container } = render(
      <PayButtonContent status="processing" label="Pay ₹4,999" />,
    );
    expect(screen.getByText("Processing…")).toBeInTheDocument();
    // No absolute layers / no pulsing dot node under reduced motion.
    expect(container.querySelector(".rounded-full")).toBeNull();
    expect(container.querySelector(".invisible")).toBeNull();
  });

  it("shows the label at rest and a check on success (instant, text-only)", () => {
    setReducedMotion(true);
    const { rerender, container } = render(
      <PayButtonContent status="idle" label="Enrol free" />,
    );
    expect(screen.getByText("Enrol free")).toBeInTheDocument();

    rerender(<PayButtonContent status="success" label="Enrol free" />);
    // Success renders the decorative check glyph, but the label is retained as
    // an sr-only node so the button keeps its accessible name (parity with the
    // motion path, whose opacity-0 label layer stays in the a11y tree).
    const srLabel = screen.getByText("Enrol free");
    expect(srLabel).toHaveClass("sr-only");
    // The visible glyph is the aria-hidden check, not the label.
    expect(container.querySelector("svg[aria-hidden]")).not.toBeNull();
  });
});
