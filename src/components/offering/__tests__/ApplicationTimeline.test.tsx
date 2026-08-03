import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/motion/Reveal", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import ApplicationTimeline from "@/components/offering/ApplicationTimeline";

describe("ApplicationTimeline", () => {
  it("states the application review fee policy without the legacy refund contradiction", () => {
    render(<ApplicationTimeline />);

    expect(
      screen.getByText("Pay the non-refundable application review fee"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Pay a refundable application fee"),
    ).not.toBeInTheDocument();
  });
});
