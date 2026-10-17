import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import GuaranteeBadge from "@/components/offering/GuaranteeBadge";
import { MASTERCLASS_REFUND_SENTENCE, masterclassRefundSentence } from "@shared/refundPolicy";

function renderBadge(props: Parameters<typeof GuaranteeBadge>[0]) {
  return render(
    <MemoryRouter>
      <GuaranteeBadge {...props} />
    </MemoryRouter>,
  );
}

describe("GuaranteeBadge", () => {
  it("states the site's masterclass rule word for word, with the policy link", () => {
    renderBadge({ days: 7, productTier: "masterclass" });
    expect(
      screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent?.startsWith(MASTERCLASS_REFUND_SENTENCE) === true),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Refund policy" })).toHaveAttribute("href", "/refunds#masterclasses");
    expect(screen.queryByText(/money-back guarantee/i)).not.toBeInTheDocument();
  });

  it("matches the marketing site's sentence exactly", () => {
    expect(MASTERCLASS_REFUND_SENTENCE).toBe(
      "Full refund within 7 days of buying, if you have watched less than a quarter of the course.",
    );
    expect(masterclassRefundSentence(14)).toBe(
      "Full refund within 14 days of buying, if you have watched less than a quarter of the course.",
    );
  });

  it("leaves other tiers on their own short pill", () => {
    renderBadge({ days: 7, productTier: "live_cohort" });
    expect(screen.getByText("7-day money-back guarantee")).toBeInTheDocument();
  });

  it("renders nothing without a refund window", () => {
    const { container } = renderBadge({ days: 0, productTier: "masterclass" });
    expect(container).toBeEmptyDOMElement();
  });
});
