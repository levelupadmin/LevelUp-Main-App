import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { RevealOnMount } from "../LoadingState";
import * as motion from "@/lib/motion";

// Drive reduced-motion deterministically. framer-motion caches its MediaQueryList
// at module scope, so flipping matchMedia between tests is flaky; mocking the
// app's own `useMotionSafe` gives a clean per-test switch instead.
let mockReduced = false;

beforeEach(() => {
  mockReduced = false;
  // LoadingSwap and RevealOnMount only read `reduced`; the rest satisfies the type.
  vi.spyOn(motion, "useMotionSafe").mockImplementation(() => ({
    enabled: !mockReduced,
    reduced: mockReduced,
    springs: {} as never,
    pressTap: {} as never,
  }));
});

describe("RevealOnMount", () => {
  it("paints the skeleton first, then reveals the content on the next frame (the crossfade)", async () => {
    mockReduced = false;
    render(
      <RevealOnMount skeleton={<div data-testid="sk">skeleton</div>}>
        <div data-testid="content">real content</div>
      </RevealOnMount>,
    );

    // First frame: skeleton mounted, content NOT — the crossfade "from" state
    // that the dead constant-true LoadingSwap never produced.
    expect(screen.getByTestId("sk")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();

    // requestAnimationFrame flips `revealed`; LoadingSwap crossfades to content.
    await waitFor(() => expect(screen.getByTestId("content")).toBeInTheDocument());
  });

  it("reduced motion: content is shown immediately with no skeleton re-flash", () => {
    mockReduced = true;
    render(
      <RevealOnMount skeleton={<div data-testid="sk">skeleton</div>}>
        <div data-testid="content">real content</div>
      </RevealOnMount>,
    );

    // Resolved content present on the very first render; skeleton never mounts.
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.queryByTestId("sk")).not.toBeInTheDocument();
  });

  it("stacks both layers in one grid cell so they overlap (crossfade), not jump-cut", async () => {
    mockReduced = false;
    const { container } = render(
      <RevealOnMount skeleton={<div>skeleton</div>}>
        <div>real content</div>
      </RevealOnMount>,
    );
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(container.querySelector(".grid.grid-cols-1")).not.toBeNull();
  });
});
