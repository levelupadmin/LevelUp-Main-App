// generate-invoice-pdf
// ----------------------------------------------------------------------------
// Generates a PDF invoice for a given payment_order_id and uploads it to
// Supabase Storage at invoices/<user_id>/<order_id>.pdf. Returns the storage
// path so callers (verify-razorpay-payment, the user dashboard) can mint a
// signed URL when they need one.
//
// Authentication: this function is called server-to-server (from
// verify-razorpay-payment) AND from the client (user dashboard download).
// - Server callers use the service_role key in the Authorization header
//   and pass any payment_order_id.
// - Client callers use a regular Bearer JWT; they can ONLY generate the
//   PDF for an order belonging to them.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { corsHeaders } from "../_shared/cors.ts";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { payment_order_id } = await req.json();
    if (!payment_order_id || typeof payment_order_id !== "string") {
      return jsonRes({ error: "payment_order_id required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load order + offering + user details
    const { data: po, error: poErr } = await admin
      .from("payment_orders")
      .select(
        "id, user_id, guest_name, guest_email, guest_phone, subtotal_inr, discount_inr, gst_inr, total_inr, razorpay_payment_id, razorpay_order_id, created_at, captured_at, status, offering_id, offerings(title, instructor_name)"
      )
      .eq("id", payment_order_id)
      .single();
    if (poErr || !po) return jsonRes({ error: "Order not found" }, 404);
    if (po.status !== "captured") {
      return jsonRes({ error: "Order is not captured; cannot invoice yet" }, 400);
    }

    // Authorization: client calls must own this order. Server callers pass the
    // service_role key as a Bearer token and bypass this check. Use an exact,
    // constant-time compare of the token — NOT authHeader.includes(key), which
    // would also pass if the key appeared as a substring anywhere in the header.
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let keyDiff = bearer.length === serviceKey.length ? 0 : 1;
    for (let i = 0; i < bearer.length && i < serviceKey.length; i++) {
      keyDiff |= bearer.charCodeAt(i) ^ serviceKey.charCodeAt(i);
    }
    const isServerCall = keyDiff === 0;
    if (!isServerCall) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user || user.id !== po.user_id) {
        return jsonRes({ error: "Forbidden" }, 403);
      }
    }

    // Look up the buyer's display name + email from public.users when
    // possible (logged-in checkout). Fall back to guest_ fields if the
    // order was a guest checkout.
    let buyerName = po.guest_name ?? "";
    let buyerEmail = po.guest_email ?? "";
    let buyerPhone = po.guest_phone ?? "";
    if (po.user_id) {
      const { data: u } = await admin
        .from("users")
        .select("full_name, email, phone")
        .eq("id", po.user_id)
        .maybeSingle();
      if (u) {
        buyerName = u.full_name || buyerName;
        buyerEmail = u.email || buyerEmail;
        buyerPhone = u.phone || buyerPhone;
      }
    }

    const offering = (po as any).offerings;
    const offeringTitle = offering?.title ?? "LevelUp masterclass";
    const instructor = offering?.instructor_name ?? "";

    // ── Compose PDF ───────────────────────────────────────────────────
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const cream = rgb(0.95, 0.88, 0.75);
    const dark = rgb(0.06, 0.06, 0.06);
    const grey = rgb(0.4, 0.4, 0.4);
    const line = rgb(0.85, 0.85, 0.85);

    // Header band
    page.drawRectangle({
      x: 0,
      y: height - 90,
      width,
      height: 90,
      color: dark,
    });
    page.drawText("LevelUp Learning", {
      x: 40,
      y: height - 50,
      size: 22,
      font: fontBold,
      color: cream,
    });
    page.drawText("TAX INVOICE", {
      x: width - 180,
      y: height - 50,
      size: 14,
      font: fontBold,
      color: cream,
    });

    // Issuer block (right-aligned data, left label)
    let y = height - 130;
    const drawRow = (label: string, value: string, opts: { bold?: boolean; size?: number } = {}) => {
      page.drawText(label, {
        x: 40,
        y,
        size: opts.size ?? 10,
        font,
        color: grey,
      });
      page.drawText(value, {
        x: 200,
        y,
        size: opts.size ?? 10,
        font: opts.bold ? fontBold : font,
        color: dark,
      });
      y -= 16;
    };

    drawRow("Invoice number", po.id.slice(0, 8).toUpperCase());
    drawRow("Payment ID", po.razorpay_payment_id || "—");
    drawRow("Issued", formatDate(po.captured_at || po.created_at));

    y -= 12;
    page.drawLine({
      start: { x: 40, y },
      end: { x: width - 40, y },
      thickness: 0.5,
      color: line,
    });
    y -= 24;

    // Buyer block
    page.drawText("BILLED TO", {
      x: 40,
      y,
      size: 9,
      font: fontBold,
      color: grey,
    });
    y -= 16;
    page.drawText(buyerName || "Customer", {
      x: 40,
      y,
      size: 12,
      font: fontBold,
      color: dark,
    });
    y -= 14;
    if (buyerEmail) {
      page.drawText(buyerEmail, {
        x: 40,
        y,
        size: 10,
        font,
        color: grey,
      });
      y -= 12;
    }
    if (buyerPhone) {
      page.drawText(buyerPhone, {
        x: 40,
        y,
        size: 10,
        font,
        color: grey,
      });
      y -= 12;
    }

    y -= 24;
    page.drawLine({
      start: { x: 40, y },
      end: { x: width - 40, y },
      thickness: 0.5,
      color: line,
    });
    y -= 24;

    // Item rows
    page.drawText("ITEM", { x: 40, y, size: 9, font: fontBold, color: grey });
    page.drawText("AMOUNT (INR)", {
      x: width - 140,
      y,
      size: 9,
      font: fontBold,
      color: grey,
    });
    y -= 18;
    page.drawText(offeringTitle, { x: 40, y, size: 11, font: fontBold, color: dark });
    page.drawText(formatInr(Number(po.subtotal_inr)), {
      x: width - 140,
      y,
      size: 11,
      font,
      color: dark,
    });
    if (instructor) {
      y -= 13;
      page.drawText(`Instructor: ${instructor}`, {
        x: 40,
        y,
        size: 9,
        font,
        color: grey,
      });
    }
    y -= 28;

    const discountInr = Number(po.discount_inr || 0);
    if (discountInr > 0) {
      page.drawText("Discount", { x: 40, y, size: 10, font, color: grey });
      page.drawText(`- ${formatInr(discountInr)}`, {
        x: width - 140,
        y,
        size: 10,
        font,
        color: grey,
      });
      y -= 16;
    }

    const gstInr = Number(po.gst_inr || 0);
    if (gstInr > 0) {
      page.drawText("GST", { x: 40, y, size: 10, font, color: grey });
      page.drawText(formatInr(gstInr), {
        x: width - 140,
        y,
        size: 10,
        font,
        color: grey,
      });
      y -= 16;
    }

    y -= 4;
    page.drawLine({
      start: { x: 40, y },
      end: { x: width - 40, y },
      thickness: 0.5,
      color: line,
    });
    y -= 18;

    // Total
    page.drawText("TOTAL", { x: 40, y, size: 12, font: fontBold, color: dark });
    page.drawText(`Rs. ${formatInr(Number(po.total_inr))}`, {
      x: width - 140,
      y,
      size: 14,
      font: fontBold,
      color: dark,
    });

    // Footer
    page.drawText(
      "Thank you for learning with LevelUp.",
      {
        x: 40,
        y: 80,
        size: 10,
        font: fontBold,
        color: dark,
      }
    );
    page.drawText(
      "Questions about this invoice? Email ceo@leveluplearning.in or WhatsApp +91 97915 20177.",
      {
        x: 40,
        y: 62,
        size: 8,
        font,
        color: grey,
      }
    );
    page.drawText(
      "LevelUp Learning Pvt Ltd, Chennai, India  |  https://leveluplearning.in",
      {
        x: 40,
        y: 48,
        size: 8,
        font,
        color: grey,
      }
    );

    const pdfBytes = await doc.save();

    // ── Upload to Supabase Storage ───────────────────────────────────
    // Folder is the user_id so RLS policies can scope reads by owner.
    // For guest orders without a linked user_id (rare; guest checkout
    // creates the user record on verify), fall back to a "guest"
    // folder readable only via signed URL.
    const folder = po.user_id ?? "guest";
    const objectPath = `${folder}/${po.id}.pdf`;
    const { error: upErr } = await admin.storage
      .from("invoices")
      .upload(objectPath, new Uint8Array(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
        cacheControl: "31536000",
      });
    if (upErr) {
      console.error("invoice upload failed", upErr);
      return jsonRes({ error: "Failed to store invoice" }, 500);
    }

    return jsonRes({
      success: true,
      path: objectPath,
      bucket: "invoices",
    });
  } catch (err) {
    console.error("generate-invoice-pdf error:", err);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
