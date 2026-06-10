import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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
 * Tapping an invoice row in the Account hub opens this. It shows a big ₹ header,
 * a Paid status pill, stacked info cards (order id, payment id, date,
 * masterclass) and two actions: Download PDF (via downloadInvoice, same
 * client-side jsPDF path used elsewhere, native-share-safe) and Email.
 *
 * Email is a mailto: hand-off to the buyer's mail client pre-filled with a
 * request to (re)send the invoice. There's no transactional-email edge function
 * for invoices, so this keeps the promise honest without inventing backend.
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

const InvoiceDetailSheet = ({ order, open, onOpenChange }: InvoiceDetailSheetProps) => {
  const [downloading, setDownloading] = useState(false);

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto rounded-t-3xl border-border bg-canvas pb-safe"
      >
        {order && (
          <div className="mx-auto w-full max-w-md">
            <SheetTitle className="sr-only">Invoice details</SheetTitle>
            <SheetDescription className="sr-only">
              Details and download options for invoice {invoiceNumber(order.id)}
            </SheetDescription>

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
              <Button
                onClick={handleDownload}
                disabled={downloading}
                className="btn-champagne h-12 gap-2 text-sm font-semibold"
              >
                <Download className="h-4 w-4" />
                {downloading ? "Preparing…" : "Download PDF"}
              </Button>
              <Button
                onClick={handleEmail}
                variant="outline"
                className="h-12 gap-2 border-border text-sm font-semibold"
              >
                <Mail className="h-4 w-4" />
                Email
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default InvoiceDetailSheet;
