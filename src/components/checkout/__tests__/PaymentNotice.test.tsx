import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PaymentNotice from "@/components/checkout/PaymentNotice";

describe("PaymentNotice", () => {
  const base = { courseTitle: "Nelson Dilipkumar Teaches Filmmaking", onOpenCourse: vi.fn(), onSignIn: vi.fn() };

  it("renders nothing without an issue", () => {
    const { container } = render(<PaymentNotice {...base} issue={null} />);
    expect(container.textContent).toBe("");
  });

  it("tells a buyer who closed the sheet that nothing was charged", () => {
    render(<PaymentNotice {...base} issue={{ kind: "dismissed" }} />);
    expect(screen.getByText("Payment not completed")).toBeInTheDocument();
    expect(screen.getByText(/Nothing was charged/)).toBeInTheDocument();
  });

  it("warns against paying twice while a payment is being confirmed", () => {
    render(<PaymentNotice {...base} issue={{ kind: "verify_pending" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/don't pay again/i);
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
