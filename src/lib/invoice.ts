// Client-side invoice generation + native-safe delivery.
//
// Why client-side: the app's Razorpay integration uses the Orders/Checkout
// flow, which does NOT produce a downloadable Razorpay invoice PDF (that only
// exists for Razorpay's separate Invoices product). So we render our own
// branded GST invoice. Doing it in the browser (vs a server edge function +
// Storage + signed URL) removes every fragile link and — crucially — lets us
// hand the file to the OS share sheet, which is the only reliable way to
// "download" inside the iOS/Android Capacitor WebView (window.open is a no-op
// there). jsPDF is lazy-imported so it stays out of the main bundle.
//
// NOTE: jsPDF's built-in Helvetica has no Rupee glyph (₹), so amounts in the
// PDF are printed as "INR 1,234.00". The on-screen UI can still use ₹.

export interface InvoiceOrder {
  id: string;
  total_inr: number;
  subtotal_inr?: number | null;
  discount_inr?: number | null;
  gst_inr?: number | null;
  captured_at?: string | null;
  created_at?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_order_id?: string | null;
  offering_title: string;
  instructor_name?: string | null;
  buyer_name?: string | null;
  buyer_email?: string | null;
  buyer_phone?: string | null;
}

// Registered seller details (from the Terms of Service legal block). Add the
// GSTIN here to upgrade the document from "Invoice" to a full GST "Tax Invoice"
// with the CGST/SGST split shown automatically.
const SELLER = {
  legalName: "LEVEL UP EDU PVT. LTD",
  brand: "LevelUp Learning",
  address: [
    "Old No. 9, New No. 17, Seethammal Road",
    "Seethammal Colony, Alwarpet",
    "Chennai, Tamil Nadu 600018",
  ],
  email: "admin@leveluplearning.in",
  gstin: "" as string, // e.g. "33AABCL1234M1Z5" — leave blank if not registered
};

export const invoiceNumber = (orderId: string) => `LU-${orderId.slice(0, 8).toUpperCase()}`;

const amt = (n: number | null | undefined) =>
  "INR " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso));
  } catch { return iso; }
};

/** Build the invoice as a PDF Blob. */
export async function buildInvoiceBlob(o: InvoiceOrder): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 42; // margin
  const cream: [number, number, number] = [242, 224, 191];
  const dark: [number, number, number] = [15, 15, 15];
  const grey: [number, number, number] = [120, 120, 120];
  const hasGstin = !!SELLER.gstin;
  const title = hasGstin ? "TAX INVOICE" : "INVOICE";

  // ── Header band ──
  doc.setFillColor(...dark);
  doc.rect(0, 0, W, 84, "F");
  doc.setTextColor(...cream);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(SELLER.brand, M, 46);
  doc.setFontSize(13);
  doc.text(title, W - M, 46, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("by " + SELLER.legalName, M, 62);

  // ── Seller (From) + Invoice meta ──
  let y = 116;
  doc.setTextColor(...grey); doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
  doc.text("FROM", M, y);
  doc.setTextColor(...dark); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(SELLER.legalName, M, y + 15);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...grey);
  let sy = y + 29;
  for (const ln of SELLER.address) { doc.text(ln, M, sy); sy += 12; }
  doc.text(SELLER.email, M, sy); sy += 12;
  if (hasGstin) { doc.setTextColor(...dark); doc.text("GSTIN: " + SELLER.gstin, M, sy); }

  // Invoice meta (right column)
  const rx = W - M;
  const meta: [string, string][] = [
    ["Invoice No.", invoiceNumber(o.id)],
    ["Date", fmtDate(o.captured_at || o.created_at)],
    ["Payment ID", o.razorpay_payment_id || "—"],
    ["Order ID", o.razorpay_order_id || "—"],
  ];
  let my = y + 15;
  doc.setFontSize(9);
  for (const [k, v] of meta) {
    doc.setFont("helvetica", "normal"); doc.setTextColor(...grey);
    doc.text(k, rx - 150, my);
    doc.setFont("helvetica", "bold"); doc.setTextColor(...dark);
    doc.text(v, rx, my, { align: "right" });
    my += 15;
  }

  // ── Billed to ──
  y = Math.max(sy, my) + 26;
  doc.setDrawColor(225, 225, 225); doc.line(M, y, W - M, y); y += 22;
  doc.setTextColor(...grey); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  doc.text("BILLED TO", M, y); y += 15;
  doc.setTextColor(...dark); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(o.buyer_name || "Customer", M, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...grey);
  if (o.buyer_email) { doc.text(o.buyer_email, M, y); y += 12; }
  if (o.buyer_phone) { doc.text(o.buyer_phone, M, y); y += 12; }

  // ── Line-item table ──
  y += 18;
  doc.setFillColor(...dark); doc.rect(M, y - 13, W - 2 * M, 22, "F");
  doc.setTextColor(...cream); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("DESCRIPTION", M + 10, y + 2);
  doc.text("AMOUNT", W - M - 10, y + 2, { align: "right" });
  y += 26;
  doc.setTextColor(...dark); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
  doc.text(o.offering_title, M + 10, y);
  doc.text(amt(o.subtotal_inr ?? o.total_inr), W - M - 10, y, { align: "right" });
  if (o.instructor_name) {
    y += 13; doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...grey);
    doc.text("Masterclass · " + o.instructor_name, M + 10, y);
  }

  // ── Totals ──
  y += 26; doc.setDrawColor(225, 225, 225); doc.line(W / 2, y, W - M, y); y += 18;
  const totalRow = (label: string, value: string, bold = false, big = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(big ? 12 : 9.5);
    doc.setTextColor(...(bold ? dark : grey));
    doc.text(label, W / 2, y);
    doc.setTextColor(...dark);
    doc.text(value, W - M - 10, y, { align: "right" });
    y += big ? 22 : 16;
  };
  totalRow("Subtotal", amt(o.subtotal_inr ?? o.total_inr));
  if (Number(o.discount_inr) > 0) totalRow("Discount", "- " + amt(o.discount_inr));
  totalRow("Total Paid", amt(o.total_inr), true, true);
  if (Number(o.gst_inr) > 0) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...grey);
    doc.text("Inclusive of GST: " + amt(o.gst_inr), W - M - 10, y, { align: "right" }); y += 14;
  }

  // ── Paid badge ──
  y += 6;
  doc.setFillColor(232, 245, 233); doc.roundedRect(M, y - 11, 120, 22, 4, 4, "F");
  doc.setTextColor(34, 139, 60); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
  doc.text("PAID · Razorpay", M + 12, y + 3);

  // ── Footer ──
  const fy = doc.internal.pageSize.getHeight() - 70;
  doc.setDrawColor(225, 225, 225); doc.line(M, fy, W - M, fy);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...grey);
  doc.text("Thank you for learning with LevelUp. Questions? " + SELLER.email, M, fy + 16);
  doc.text("This is a computer-generated invoice and does not require a signature.", M, fy + 28);
  if (!hasGstin) doc.text("Amounts are inclusive of applicable taxes.", M, fy + 40);

  return doc.output("blob");
}

/**
 * Generate + deliver the invoice. Prefers the OS share sheet (the only reliable
 * way to save a file from the Capacitor WebView on iOS/Android); falls back to a
 * normal browser download on web / where Web Share files aren't supported.
 * Returns "shared" | "downloaded" | "cancelled".
 */
export async function downloadInvoice(o: InvoiceOrder): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await buildInvoiceBlob(o);
  const fileName = `LevelUp-Invoice-${invoiceNumber(o.id)}.pdf`;
  const file = new File([blob], fileName, { type: "application/pdf" });

  const navAny = navigator as any;
  if (typeof navAny.canShare === "function" && navAny.canShare({ files: [file] })) {
    try {
      await navAny.share({ files: [file], title: fileName });
      return "shared";
    } catch (e: any) {
      if (e?.name === "AbortError") return "cancelled";
      // otherwise fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return "downloaded";
}
