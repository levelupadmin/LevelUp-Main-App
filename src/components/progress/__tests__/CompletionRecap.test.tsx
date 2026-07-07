import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { CompletionRecap } from "@/components/progress/CompletionRecap";

/**
 * Glide-out reachability guard for the completion recap's only dismissal path.
 *
 * REGRESSION: the recap used to dismiss with `setArcPhase('idle')` AND
 * `navigate('/')` in the SAME handler. `navigate` unmounts the portal
 * synchronously, so AnimatePresence never played the exit — the glide-out was
 * unreachable. The fix splits it: `onClose` merely flips the recap closed (so
 * the exit can play) and navigation is deferred to `onExited`, which fires only
 * AFTER the exit animation has fully completed. These tests pin that contract:
 *
 *   1. Dismissing the recap does NOT navigate synchronously.
 *   2. The deferred handler (`onExited`) DOES fire once the exit has played,
 *      so navigation still happens — just after the animation, not instead of it.
 *
 * A tiny state machine mirrors ChapterViewer's arc: `recap` → (dismiss) →
 * `recapOut` → (onExited) → navigate. `navigate` is a spy standing in for the
 * router so we can assert exactly when it runs relative to the exit.
 */

type Phase = "recap" | "recapOut" | "done";

function RecapArcHarness({ navigate }: { navigate: () => void }) {
  const [phase, setPhase] = useState<Phase>("recap");
  return (
    <CompletionRecap
      open={phase === "recap"}
      onClose={() => setPhase("recapOut")}
      onExited={() => {
        setPhase("done");
        navigate();
      }}
      courseTitle="Test Course"
      instructorName="Ada Lovelace"
      lessonsCompleted={3}
      minutesWatched={42}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("CompletionRecap — glide-out exit is reachable on dismissal (deferred nav)", () => {
  it("does not navigate synchronously when the recap is dismissed", () => {
    const navigate = vi.fn();
    render(<RecapArcHarness navigate={navigate} />);

    // Close the recap (the X affordance is one of the dismissal paths).
    fireEvent.click(screen.getByRole("button", { name: /close recap/i }));

    // The old bug navigated here, in the same tick as the close — which killed
    // the exit. Navigation must NOT have run yet; the exit needs to play first.
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates only after the exit animation has fully played (onExited)", async () => {
    const navigate = vi.fn();
    render(<RecapArcHarness navigate={navigate} />);

    fireEvent.click(screen.getByRole("button", { name: /close recap/i }));

    // Once AnimatePresence finishes the glide-out, onExited fires the deferred
    // navigation. Proves the exit lifecycle runs to completion (not unmounted
    // out from under it) and navigation is preserved.
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  });
});
