import { useEffect, useRef, useState } from "react";
import { MorphSheet, MorphButton } from "@/components/motion/MorphSheet";
import { Button } from "@/components/ui/button";
import { useMotionSafe } from "@/lib/motion";
import {
  Download,
  Mail,
  CheckCircle2,
  Hash,
  CreditCard,
  Calendar,
  GraduationCap,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { hapticImpact, hapticSelection } from "@/lib/haptics";
import { downloadInvoice, invoiceNumber, type InvoiceOrder } from "@/lib/invoice";

/**
 * Invoice detail bottom sheet (item 19).
 *
 * Tapping an invoice row in the profile opens this. It shows a big ₹ header,
 * a Paid status pill, stacked info cards (order id, payment id, date,
 * masterclass) and two actions: Download PDF (via downloadInvoice, same
 * client-side jsPDF path used elsewhere, native-share-safe) and Email.
 *
 * Email is a mailto: hand-off to the buyer's mail client pre-filled with a
 * request to (re)send the invoice. There's no transactional-email edge function
 * for invoices, so this keeps the promise honest without inventing backend.
 *
 * P4-T1: rebuilt on the vaul drawer via MorphSheet — drag-to-dismiss with spring
 * settle, focus trap/restore (Radix Dialog under vaul), body-lock-safe. Pass a
 * `ctaLayoutId` and P4-T10 can render a matching on-page twin so the Download CTA
 * FLIP-morphs from/into it (STEAL-10); without it the CTA is unchanged.
 */

export interface InvoiceSheetData extends InvoiceOrder {
  /** Buyer fields are required for a complete invoice; merged into InvoiceOrder. */
  buyer_name?: string | null;
  buyer_email?: string | null;
  buyer_phone?: string | null;
}

interface InvoiceDetailSheetProps {
  order: InvoiceSheetData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * STEAL-10 seam (P4-T1 ↔ P4-T10). When supplied, the Download CTA renders as a
   * MorphButton carrying this `layoutId`; P4-T10 renders the on-page invoice-row
   * twin with the same id inside a `<LayoutGroup>` so the button FLIP-morphs
   * from/into the sheet. Omitted by default → the CTA is the plain champagne
   * Button, byte-identical to before.
   */
  ctaLayoutId?: string;
  /**
   * STEAL-10 morph gate. The CTA lives inside a vaul DrawerContent that
   * CSS-slides up from off-screen (`translate3d(0,100%,0)`→`0`, ~0.5s) on open —
   * a transform framer's layout projection can't observe. So the morph is held
   * until the slide settles: while `false` the CTA cell renders a same-size
   * spacer (the champagne element is the on-page twin chip) and while `true` the
   * CTA mounts fresh carrying the shared `layoutId`, so framer runs the chip→CTA
   * morph from the twin's now-stationary, correctly measured box. Mounting the
   * element WITH the id (rather than granting the id to an already-measured
   * element, which framer treats as a no-op) is what makes the morph actually
   * play. Defaults to `true` (no gating) for consumers that don't animate a twin.
   */
  morphReady?: boolean;
  /**
   * STEAL-10 settle signal. Fired once vaul's slide-up reaches identity — its real
   * slide-end event (`slideFromBottom` keyframe `animationend`, or `transitionend`
   * for drag/snap configs) — so the parent can flip `morphReady` on the actual end
   * of the slide instead of a hardcoded duration. Only wired alongside
   * `ctaLayoutId`; ignored under reduced motion (the parent resolves synchronously).
   */
  onSlideSettle?: () => void;
}

const fmtFullDate = (iso?: string | null): string => {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

const InfoRow = ({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--cream))]/10 text-[hsl(var(--cream))]">
      <Icon className="h-4 w-4" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`truncate text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  </div>
);

const InvoiceDetailSheet = ({
  order,
  open,
  onOpenChange,
  ctaLayoutId,
  morphReady = true,
  onSlideSettle,
}: InvoiceDetailSheetProps) => {
  const [downloading, setDownloading] = useState(false);
  const motionSafe = useMotionSafe();
  // Anchors us inside the portaled DrawerContent so we can listen for vaul's real
  // slide-settle event (see below) without threading a ref through MorphSheet.
  const settleRef = useRef<HTMLDivElement>(null);

  // STEAL-10: report when vaul's slide-up actually finishes so the parent flips
  // `morphReady` on the real end of the slide, not a hardcoded duration.
  //
  // vaul (no snap points) drives the open slide with a CSS KEYFRAME animation
  // (`slideFromBottom`, verified against vaul 0.9.9's style.css), which fires
  // `animationend` — NOT `transitionend`. The `transition: transform` rule only
  // runs for drag/snap. So we listen for BOTH on the `[data-vaul-drawer]` node
  // (animationend is what actually fires here; transitionend covers any future
  // config) and settle on whichever lands. Two subtleties the live run exposed:
  //   • vaul portals the content a frame AFTER `open` flips, so a one-shot
  //     `closest()` misses the node — we retry on rAF until it mounts.
  //   • only the node's OWN slide counts, so we gate on `event.target === node`
  //     (the overlay's fade is a different element).
  // The parent keeps a generous fallback timer so a missed event can never leave
  // the CTA stuck as a spacer.
  useEffect(() => {
    if (!open || !ctaLayoutId || morphReady || motionSafe.reduced || !onSlideSettle) return;
    let raf = 0;
    let node: Element | null = null;
    const onAnimEnd = (event: Event) => {
      if (event.target === node) onSlideSettle();
    };
    const onTransEnd = (event: Event) => {
      if (event.target === node && (event as TransitionEvent).propertyName === "transform") {
        onSlideSettle();
      }
    };
    const attach = () => {
      node = settleRef.current?.closest("[data-vaul-drawer]") ?? null;
      if (node) {
        node.addEventListener("animationend", onAnimEnd);
        node.addEventListener("transitionend", onTransEnd);
      } else {
        raf = requestAnimationFrame(attach);
      }
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      if (node) {
        node.removeEventListener("animationend", onAnimEnd);
        node.removeEventListener("transitionend", onTransEnd);
      }
    };
  }, [open, ctaLayoutId, morphReady, motionSafe.reduced, onSlideSettle]);

  const handleDownload = async () => {
    if (!order) return;
    void hapticImpact("medium");
    setDownloading(true);
    try {
      const res = await downloadInvoice(order);
      if (res === "downloaded") toast.success("Invoice downloaded");
    } catch {
      toast.error("Couldn't generate the invoice. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handleEmail = () => {
    if (!order) return;
    void hapticSelection();
    const num = invoiceNumber(order.id);
    const to = order.buyer_email ?? "";
    const subject = encodeURIComponent(`LevelUp invoice ${num}`);
    const body = encodeURIComponent(
      `Hi LevelUp team,\n\nPlease email me a copy of invoice ${num} for "${order.offering_title}".\n\nThank you.`,
    );
    const support = "admin@leveluplearning.in";
    // Pre-fill the buyer's mail client addressed to support, cc'ing themselves.
    const cc = to ? `&cc=${encodeURIComponent(to)}` : "";
    window.location.href = `mailto:${support}?subject=${subject}&body=${body}${cc}`;
  };

  const downloadInner = (
    <>
      <Download className="h-4 w-4" />
      {downloading ? "Preparing…" : "Download PDF"}
    </>
  );

  return (
    <MorphSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Invoice details"
      description={
        order ? `Details and download options for invoice ${invoiceNumber(order.id)}` : undefined
      }
    >
      {order && (
        <div ref={settleRef} className="mx-auto w-full max-w-md">
          {/* Big ₹ header */}
          <div className="pt-2 text-center">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Amount paid
            </p>
            <p className="mt-1 text-[40px] font-bold leading-none text-foreground">
              ₹{order.total_inr.toLocaleString("en-IN")}
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--accent-emerald))]/30 bg-[hsl(var(--accent-emerald))]/10 px-3 py-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--accent-emerald))]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--accent-emerald))]">
                Paid
              </span>
            </div>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {invoiceNumber(order.id)}
            </p>
          </div>

          {/* Stacked info cards */}
          <div className="mt-6 space-y-2.5">
            <InfoRow
              icon={GraduationCap}
              label="Masterclass"
              value={order.offering_title}
            />
            {order.instructor_name && (
              <InfoRow
                icon={GraduationCap}
                label="Instructor"
                value={order.instructor_name}
              />
            )}
            <InfoRow
              icon={Calendar}
              label="Date"
              value={fmtFullDate(order.captured_at ?? order.created_at)}
            />
            <InfoRow
              icon={Hash}
              label="Order ID"
              value={order.razorpay_order_id ?? "-"}
              mono
            />
            <InfoRow
              icon={CreditCard}
              label="Payment ID"
              value={order.razorpay_payment_id ?? "-"}
              mono
            />
          </div>

          {/* Actions */}
          <div className="mt-6 grid grid-cols-2 gap-3 pb-2">
            {/* Primary CTA. With a `ctaLayoutId` (P4-T10 wires the on-page twin),
                render the champagne CTA as a MorphButton so it FLIP-morphs to/from
                its twin (STEAL-10); without it, keep the exact champagne Button so
                the shipped path is byte-identical. Both suppress the default tapTick
                because handleDownload fires a deliberate hapticImpact("medium").

                While the slide is in flight (`!morphReady`, motion on) the CTA cell
                is a same-size spacer — the champagne element is the on-page twin
                chip — so nothing here can be snapshotted mid-slide. The MorphButton
                MOUNTS (fresh) with the layoutId only at/after settle, which is what
                makes framer run the chip→CTA morph. Under reduced motion morphReady
                is resolved synchronously, so the button renders immediately with the
                layoutId dropped inside MorphButton (instant, no morph). */}
            {ctaLayoutId ? (
              morphReady || motionSafe.reduced ? (
                <MorphButton
                  layoutId={ctaLayoutId}
                  onClick={handleDownload}
                  disabled={downloading}
                  haptic={false}
                  className="btn-champagne inline-flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold [&_svg]:size-4 [&_svg]:shrink-0"
                >
                  {downloadInner}
                </MorphButton>
              ) : (
                <div aria-hidden="true" className="h-12" />
              )
            ) : (
              <Button
                onClick={handleDownload}
                disabled={downloading}
                haptic={false}
                className="btn-champagne h-12 gap-2 text-sm font-semibold"
              >
                {downloadInner}
              </Button>
            )}
            <Button
              onClick={handleEmail}
              variant="outline"
              // handleEmail fires its own hapticSelection() (the same tick the
              // Button would emit); suppress the default tapTick to avoid an
              // identical double-buzz.
              haptic={false}
              className="h-12 gap-2 border-border text-sm font-semibold"
            >
              <Mail className="h-4 w-4" />
              Email
            </Button>
          </div>
        </div>
      )}
    </MorphSheet>
  );
};

export default InvoiceDetailSheet;
