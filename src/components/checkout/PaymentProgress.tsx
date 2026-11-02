import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Where a payment is, from the buyer's side:
 * - opening: Pay was tapped; the order is being made and Razorpay is loading;
 * - sheet: Razorpay's own window is up; this is only its dim backdrop;
 * - confirming: Razorpay took the money; we're confirming it before the course opens.
 */
export type PayProgress = "idle" | "opening" | "sheet" | "confirming";

/**
 * A clear "working" screen between tapping Pay and the payment window, and
 * after paying, so the buyer never sees a blank, frozen-looking page (founder,
 * 2 Nov 2026: "it was just blank… I would have closed it"). It sits under
 * Razorpay's window (lower z-index, and earlier in the page), so Razorpay
 * covers it as soon as it paints; until then this is what shows. Portalled to
 * <body> so no transformed ancestor can pin it inside the checkout card.
 */
export default function PaymentProgress({ step }: { step: PayProgress }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (step !== "opening" && step !== "confirming") return;
    const t = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(t);
  }, [step]);

  if (step === "idle") return null;
  const busy = step !== "sheet";
  return createPortal(
    <div className="fixed inset-0 z-[2147483000] grid place-items-center bg-black/80 px-6">
      {busy && (
        <div role="status" aria-live="polite" className="flex w-full max-w-[320px] flex-col items-center gap-3 rounded-2xl bg-[#15171a] p-6 text-center text-white">
          <span aria-hidden className="h-10 w-10 rounded-full border-2 border-white/20 border-t-white animate-spin motion-reduce:animate-none" />
          <p className="text-base font-semibold">{step === "confirming" ? "Confirming your payment" : "Opening secure payment"}</p>
          <p className="text-sm leading-relaxed text-white/70">
            {slow
              ? "Still working. A slow connection can take a little longer. Please keep this page open."
              : "This takes a few seconds. Please don't close this page."}
          </p>
        </div>
      )}
    </div>,
    document.body,
  );
}
