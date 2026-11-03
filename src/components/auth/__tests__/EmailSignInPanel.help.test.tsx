import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The email sign-in code screen says what to do when no code comes (founder,
 * 3 Nov 2026): the server answers "sent" for every address, so without this a
 * student with no account under that email just waits.
 */

const { sendEmailOtp } = vi.hoisted(() => ({ sendEmailOtp: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/hooks/useClaimApplication", () => ({ sendEmailOtp, verifyEmailOtpForSession: vi.fn() }));
vi.mock("@/lib/haptics", () => ({ hapticNotification: vi.fn(), tapTick: vi.fn() }));
// input-otp polls document.elementFromPoint, which jsdom does not implement.
vi.mock("@/components/ui/input-otp", () => ({
  InputOTP: () => <input aria-label="Code" />,
  InputOTPGroup: () => null,
  InputOTPSlot: () => null,
}));

import { EmailOtpPanel, EmailSignInPanel } from "../OtpTabs";

afterEach(cleanup);

async function sendTo(email: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByText("Sent to", { exact: false });
}

describe("Email sign-in: Didn't get a code?", () => {
  it("shows the help once the code is sent", async () => {
    render(<EmailSignInPanel onSession={async () => ({ ok: true })} />);
    expect(screen.queryByText("Didn't get a code?")).toBeNull();
    await sendTo("buyer@example.com");
    expect(screen.getByText("Didn't get a code?")).toBeInTheDocument();
    expect(screen.getByText(/Use the email you bought with/)).toBeInTheDocument();
    expect(screen.getByText(/admin@leveluplearning\.in/)).toBeInTheDocument();
  });

  it("is not shown on other uses of the panel", async () => {
    render(
      <EmailOtpPanel heading="Claim" description="" successCaption="Done" onSend={sendEmailOtp} onVerify={vi.fn()} />,
    );
    await sendTo("buyer@example.com");
    expect(screen.queryByText("Didn't get a code?")).toBeNull();
  });
});
