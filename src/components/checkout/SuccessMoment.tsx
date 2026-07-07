import { useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2 } from "lucide-react";
import ChampagneDust from "@/components/ChampagneDust";
import { downloadInvoice, type InvoiceOrder } from "@/lib/invoice";
import { hapticNotification } from "@/lib/haptics";
import { toast } from "@/lib/toast";

/**
 * The celebration "moment" for the ThankYou page.
 *
 * Two pieces, deliberately scoped so ThankYou can drop them in without
 * reinventing motion:
 *  1. A ONE-SHOT champagne-dust burst (rising golden bokeh; fires once on
 *     mount, then stillness) plus a static cream radial-glow orb sitting behind
 *     the check mark. This is the brand's calm-luxury answer to confetti —
 *     celebration as light, not litter (design/vision/60FPS-IDEAS.md Idea #1).
 *  2. A "Download invoice" affordance for the receipt strip, wired to the
 *     shared `downloadInvoice` helper (OS share sheet on native, file download
 *     on web).
 *
 * Both honour prefers-reduced-motion: the dust is suppressed and the orb
 * renders without animation.
 */

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── Check mark + one-shot champagne dust + cream glow orb ── */
export function SuccessCheck() {
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    // Defer one frame so the dust animation starts after first paint.
    const t = window.setTimeout(() => setBurst(true), 80);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="relative inline-flex items-center justify-center h-24 w-24 mx-auto">
      {/* One-shot champagne dust: fixed full-screen overlay of rising golden
          bokeh, fires a single burst then unmounts. */}
      <ChampagneDust active={burst} duration={3200} />

      {/* Cream radial-glow orb behind the check (replaces the infinite ping).
          Static, soft, on-brand, reads as a warm spotlight, not a pulse. */}
      <span
        aria-hidden
        className="absolute -inset-6 rounded-full blur-2xl opacity-70"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--cream) / 0.45) 0%, hsl(var(--cream) / 0.12) 45%, transparent 70%)",
        }}
      />
      <span className="relative inline-flex items-center justify-center h-24 w-24 rounded-full bg-[hsl(var(--accent-emerald)/0.15)] ring-1 ring-[hsl(var(--accent-emerald)/0.3)]">
        <CheckCircle2
          className="h-12 w-12 text-[hsl(var(--accent-emerald))]"
          strokeWidth={1.75}
        />
      </span>
    </div>
  );
}

/* ── Download invoice button for the receipt strip ── */
export function DownloadInvoiceButton({ order }: { order: InvoiceOrder }) {
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await downloadInvoice(order);
      if (result === "shared") {
        void hapticNotification("success");
      } else if (result === "downloaded") {
        toast.success("Invoice downloaded");
      }
      // "cancelled" → user backed out of the share sheet; stay quiet.
    } catch {
      toast.error("Couldn't generate the invoice. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={busy}
      className="inline-flex items-center gap-1.5 min-h-[44px] -my-3 text-[hsl(var(--cream))] hover:underline disabled:opacity-60 disabled:no-underline transition-opacity rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      Download invoice
    </button>
  );
}
