// QA HARNESS — NOT shipped. Mounts the REAL OtpEntryStep with a stubbed
// onVerify so the STEAL-8 digits-merge-to-check success choreography (P4-T9)
// can be captured with Playwright WITHOUT sending or verifying a real OTP.
// The stub resolves { ok: true } after a tick, exactly like Login.tsx's
// handleVerify does once a session is minted — so OtpEntryStep flips to its
// `verified` state and plays the real success animation. Wrapped in the same
// glass-card the login form uses so the frames read as the true surface.
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { OtpEntryStep } from "@/components/auth/OtpEntryStep";
import "@/index.css";

function Harness() {
  useEffect(() => {
    // Deterministic control surface for the Playwright driver.
    (window as unknown as Record<string, unknown>).__otpReady = true;
  }, []);

  return (
    <div className="w-full max-w-[400px]">
      <div className="glass-card rounded-3xl p-6 sm:p-7">
        <OtpEntryStep
          phone="+918888777666"
          channel="sms"
          otpLength={4}
          // Stubbed success: no widget, no edge fn, no session. Resolves ok on a
          // tick so `verified` flips and the digits-merge choreography plays.
          onVerify={async () => {
            await new Promise((r) => setTimeout(r, 30));
            return { ok: true };
          }}
          onResendSms={async () => ({ ok: true })}
          onBack={() => {}}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
