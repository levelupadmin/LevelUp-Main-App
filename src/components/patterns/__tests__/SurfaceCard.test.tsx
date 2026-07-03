import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { SurfaceCard } from "../SurfaceCard";

// tapTick is a native-haptics no-op on web; spy on it so we can assert activation
// fires the tick without depending on the Capacitor bridge.
vi.mock("@/lib/haptics", () => ({
  tapTick: vi.fn(),
}));
import { tapTick } from "@/lib/haptics";

const renderInRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

afterEach(() => {
  vi.clearAllMocks();
});

describe("SurfaceCard — interactive Link", () => {
  it("renders a real anchor with link semantics (NOT role=button)", () => {
    renderInRouter(<SurfaceCard to="/foo">Go</SurfaceCard>);
    // Announced as a link, with a working href — native link affordances intact.
    const link = screen.getByRole("link", { name: "Go" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/foo");
    // Must NOT be mislabeled as a button.
    expect(link).not.toHaveAttribute("role", "button");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("stays keyboard-focusable (native anchor tab stop preserved)", () => {
    renderInRouter(<SurfaceCard to="/foo">Go</SurfaceCard>);
    const link = screen.getByRole("link", { name: "Go" });
    // A non-interactive MotionCard would force tabIndex=-1; the Link path keeps 0.
    expect(link).not.toHaveAttribute("tabindex", "-1");
  });

  it("does NOT preventDefault on Enter, so the browser's synthesized click navigates", () => {
    renderInRouter(<SurfaceCard to="/foo">Go</SurfaceCard>);
    const link = screen.getByRole("link", { name: "Go" });
    // The critical regression probe: a cancelable Enter keydown must NOT be
    // defaultPrevented, or the anchor's synthesized activation click is cancelled
    // and react-router never navigates for keyboard users.
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
  });

  it("fires tapTick on click activation (mouse and Enter-synthesized click)", () => {
    renderInRouter(<SurfaceCard to="/foo">Go</SurfaceCard>);
    const link = screen.getByRole("link", { name: "Go" });
    fireEvent.click(link);
    expect(tapTick).toHaveBeenCalledTimes(1);
  });

  it("forwards the ref to the anchor element", () => {
    const ref = createRef<HTMLAnchorElement>();
    renderInRouter(
      <SurfaceCard ref={ref as React.Ref<HTMLElement>} to="/foo">
        Go
      </SurfaceCard>,
    );
    expect(ref.current?.tagName).toBe("A");
  });
});

describe("SurfaceCard — interactive button", () => {
  it("exposes button semantics and fires both tapTick and onClick on activation", () => {
    const onClick = vi.fn();
    render(<SurfaceCard onClick={onClick}>Press</SurfaceCard>);
    const btn = screen.getByRole("button", { name: "Press" });
    fireEvent.click(btn);
    expect(tapTick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("activates via keyboard Enter (fires tapTick + onClick)", () => {
    const onClick = vi.fn();
    render(<SurfaceCard onClick={onClick}>Press</SurfaceCard>);
    const btn = screen.getByRole("button", { name: "Press" });
    fireEvent.keyDown(btn, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(tapTick).toHaveBeenCalledTimes(1);
  });
});

describe("SurfaceCard — static / muted", () => {
  it("renders a plain, motion-free div with no interactive semantics", () => {
    render(<SurfaceCard variant="static">Static</SurfaceCard>);
    const el = screen.getByText("Static");
    expect(el.tagName).toBe("DIV");
    expect(el).not.toHaveAttribute("role", "button");
    expect(el).not.toHaveAttribute("tabindex", "0");
  });
});
