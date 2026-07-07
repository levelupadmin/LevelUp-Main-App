import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import CompletionTakeover from "../CompletionTakeover";
import { CompletionRecap } from "@/components/progress/CompletionRecap";

/**
 * Body-lock regression guard for the sequenced completion arc (T2, AC#3).
 *
 * The arc's HARD INVARIANT is that <CompletionTakeover> is the app's SOLE
 * writer of `document.body.style.overflow` — the double-lock race it replaced
 * shipped as the wedged-scroll prod outage. These tests pin two things:
 *
 *   1. The takeover locks body scroll while open and RESTORES it after EVERY
 *      dismissal path — CTA, backdrop, close button, Escape, and an unmount
 *      standing in for a route change / Android back mid-arc.
 *   2. <CompletionRecap> — which follows the takeover in the arc — NEVER
 *      touches `document.body.style.overflow`, so the invariant holds while the
 *      two overlays sequence.
 *
 * `open` is driven by a tiny stateful harness so each dismissal flips it false
 * exactly as ChapterViewer does; the assertion is on the real body style.
 */

// Stateful wrapper: mirrors ChapterViewer's usage where every dismissal handler
// flips `open` to false. Exposes whether a close affordance is wired.
function TakeoverHarness({ withClose = true }: { withClose?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <CompletionTakeover
      open={open}
      variant="course"
      title="Test Course"
      subtitle="You've finished every lesson."
      onContinue={() => setOpen(false)}
      onShare={() => {}}
      onClose={withClose ? () => setOpen(false) : undefined}
    />
  );
}

beforeEach(() => {
  // Start from a known, unlocked baseline every test.
  document.body.style.overflow = "";
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("CompletionTakeover — body-lock invariant across dismissal paths (AC#3)", () => {
  it("locks body scroll while open", () => {
    render(<TakeoverHarness />);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores body scroll after the CTA dismissal", async () => {
    render(<TakeoverHarness />);
    expect(document.body.style.overflow).toBe("hidden");

    // Default course CTA label.
    fireEvent.click(screen.getByRole("button", { name: /back to course/i }));

    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  it("restores body scroll after a backdrop dismissal", async () => {
    render(<TakeoverHarness />);
    // Clicking the dialog surface itself (not its inner content) is the backdrop.
    fireEvent.click(screen.getByRole("dialog"));

    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  it("restores body scroll after the close-button dismissal", async () => {
    render(<TakeoverHarness />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  it("restores body scroll after an Escape dismissal", async () => {
    render(<TakeoverHarness />);
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  it("restores body scroll when unmounted mid-arc (route change / Android back)", async () => {
    const { unmount } = render(<TakeoverHarness />);
    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  it("leaves body scroll untouched when it never opens", () => {
    render(
      <CompletionTakeover
        open={false}
        variant="course"
        title="Test Course"
        onContinue={() => {}}
        onShare={() => {}}
      />,
    );
    expect(document.body.style.overflow).toBe("");
  });
});

describe("CompletionRecap — must NOT write body.style.overflow (sole-owner invariant)", () => {
  it("never locks body scroll while open", () => {
    render(
      <CompletionRecap
        open
        onClose={() => {}}
        courseTitle="Test Course"
        instructorName="Ada Lovelace"
        lessonsCompleted={3}
        minutesWatched={42}
      />,
    );
    // The takeover is the only permitted writer; the recap leaves body as-is.
    expect(document.body.style.overflow).toBe("");
  });

  it("leaves a pre-existing lock in place and untouched on unmount", () => {
    // Simulate the recap opening while some OTHER owner holds the lock: the
    // recap must neither clear it nor restore a captured value on unmount.
    document.body.style.overflow = "hidden";
    const { unmount } = render(
      <CompletionRecap
        open
        onClose={() => {}}
        courseTitle="Test Course"
        lessonsCompleted={1}
        minutesWatched={5}
      />,
    );
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    // Still exactly what the real owner set — the recap did not write it.
    expect(document.body.style.overflow).toBe("hidden");
  });
});
