import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PaymentNotice from "@/components/checkout/PaymentNotice";

describe("PaymentNotice", () => {
  const base = { courseTitle: "Nelson Dilipkumar Teaches Filmmaking", onOpenCourse: vi.fn(), onSignIn: vi.fn() };

  it("renders nothing without an issue", () => {
    const { container } = render(<PaymentNotice {...base} issue={null} />);
    expect(container.textContent).toBe("");
  });

  it("never tells a buyer who closed the sheet that nothing was charged", () => {
    const onCheckStatus = vi.fn();
    render(<PaymentNotice {...base} onCheckStatus={onCheckStatus} issue={{ kind: "dismissed" }} />);
    expect(screen.getByText("Payment not finished")).toBeInTheDocument();
    expect(screen.queryByText(/nothing was charged/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
    expect(onCheckStatus).toHaveBeenCalledTimes(1);
  });

  it("warns against paying twice while a payment is being confirmed, and offers a status check", () => {
    const onCheckStatus = vi.fn();
    render(<PaymentNotice {...base} onCheckStatus={onCheckStatus} issue={{ kind: "verify_pending" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/don't pay again/i);
    fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
    expect(onCheckStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /WhatsApp us/ })).toBeInTheDocument();
  });

  it("shows the status check as busy while it runs", () => {
    render(<PaymentNotice {...base} onCheckStatus={vi.fn()} checking issue={{ kind: "check_needed", reason: "unknown", locked: true }} />);
    expect(screen.getByRole("button", { name: /Checking/ })).toBeDisabled();
    expect(screen.getByText("We couldn't check your last payment")).toBeInTheDocument();
  });

  it("offers no status check when there is no order to check", () => {
    render(<PaymentNotice {...base} issue={{ kind: "dismissed" }} />);
    expect(screen.queryByRole("button", { name: "Check payment status" })).toBeNull();
  });

  it("sends a guest who already owns the course to sign in", () => {
    const onSignIn = vi.fn();
    render(<PaymentNotice {...base} onSignIn={onSignIn} issue={{ kind: "already_enrolled", guest: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in to watch" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("opens the library for a signed-in owner", () => {
    const onOpenCourse = vi.fn();
    render(<PaymentNotice {...base} onOpenCourse={onOpenCourse} issue={{ kind: "already_enrolled", guest: false }} />);
    fireEvent.click(screen.getByRole("button", { name: "Open your course" }));
    expect(onOpenCourse).toHaveBeenCalledTimes(1);
  });

  it("shows the card issuer's reason and a WhatsApp help link on a failure", () => {
    render(<PaymentNotice {...base} issue={{ kind: "failed", detail: "Your card was declined" }} />);
    expect(screen.getByText(/Your card was declined\./)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /WhatsApp us/ });
    expect(link.getAttribute("href")).toContain("api.whatsapp.com/send?phone=919791520177");
  });
});
