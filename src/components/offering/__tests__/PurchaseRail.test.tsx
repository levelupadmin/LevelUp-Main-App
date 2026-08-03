import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import PurchaseRail from "@/components/offering/PurchaseRail";

const commonProps = {
  offeringId: "offering-1",
  slug: "creator-academy-edition-2",
  price: 40_000,
  mrp: null,
  highlights: [],
  refundPolicyDays: 7,
  isStaged: true,
  proof: { avg: null, enrolled: null },
};

describe("PurchaseRail fee policy", () => {
  it("does not imply the application review fee is covered by the program guarantee", () => {
    render(
      <MemoryRouter>
        <PurchaseRail {...commonProps} applyUrl="https://tally.so/r/example" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Application-only")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /apply for an invite/i })).toBeInTheDocument();
    expect(screen.queryByText(/money-back guarantee/i)).not.toBeInTheDocument();
  });

  it("keeps the configured guarantee on direct program purchases", () => {
    render(
      <MemoryRouter>
        <PurchaseRail {...commonProps} applyUrl={null} />
      </MemoryRouter>,
    );

    expect(screen.getByText("7-day money-back guarantee")).toBeInTheDocument();
  });
});
