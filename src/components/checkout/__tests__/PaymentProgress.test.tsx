import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import PaymentProgress from "@/components/checkout/PaymentProgress";

afterEach(() => vi.useRealTimers());

describe("PaymentProgress", () => {
  it("shows nothing when idle", () => {
    render(<PaymentProgress step="idle" />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says it's opening the payment, then that it's still working after 8 seconds", () => {
    vi.useFakeTimers();
    render(<PaymentProgress step="opening" />);
    expect(screen.getByRole("status")).toHaveTextContent("Opening secure payment");
    expect(screen.getByRole("status")).toHaveTextContent("This takes a few seconds");
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByRole("status")).toHaveTextContent("Still working");
  });

  it("is only a backdrop while Razorpay's window is up", () => {
    const { baseElement } = render(<PaymentProgress step="sheet" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(baseElement.querySelector(".fixed.inset-0")).not.toBeNull();
  });

  it("says it's confirming once the payment is made", () => {
    render(<PaymentProgress step="confirming" />);
    expect(screen.getByRole("status")).toHaveTextContent("Confirming your payment");
  });
});
