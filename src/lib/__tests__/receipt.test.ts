import { describe, it, expect, vi } from "vitest";
import {
  receiptRecipient,
  receiptVariables,
  renderReceipt,
  safeUrl,
  sendPurchaseReceipt,
  type ReceiptEmailDeps,
  type ReceiptOrder,
} from "@shared/receipt";
import { runPostCapture } from "@shared/postCapture";

// The same rule as _shared/email.ts sanitizeVar (which this test cannot import:
// that file pulls supabase-js from a URL).
const sanitizeVar = (v: unknown, maxLen = 500) =>
  v == null
    ? ""
    : String(v)
        .slice(0, maxLen)
        .replace(/[\r\n]+/g, " ")
        .replace(/[<>]/g, "")
        .replace(/https?:\/\/\S+/gi, "");

const APP = "https://app.leveluplearning.in";
const STORAGE = "https://ivkvluezuiojovpotlyb.supabase.co";

const order: ReceiptOrder = {
  id: "po_1",
  user_id: "11111111-2222-3333-4444-555555555555",
  offering_id: "190a09ee-3f34-4242-ad9f-70ddedcc8eae",
  total_inr: "2499.00",
  razorpay_payment_id: "pay_ABC",
  captured_at: "2026-10-17T10:00:00.000Z",
  guest_name: "Asha",
  guest_email: "Asha@Example.com",
  guest_phone: "919876543210",
};

const template = {
  subject: "You're in — receipt for {{offering_name}}",
  html_body:
    '<p>Hi {{student_name}}</p><p>₹{{amount}} · {{payment_id}} · {{date}}</p><a href="{{app_url}}/home">Start</a><a href="{{invoice_url}}">Invoice</a>',
  text_body: "Hi {{student_name}}, ₹{{amount}} for {{offering_name}}.",
};

describe("receipt recipient", () => {
  it("mails a guest at the address typed at checkout, never a matched profile", () => {
    expect(receiptRecipient(order, { email: "owner@example.com", full_name: "Owner", phone: null })).toEqual({
      email: "asha@example.com",
      name: "Asha",
    });
    // A guest order whose typed address is the phone placeholder: no receipt,
    // not the matched account's inbox.
    expect(
      receiptRecipient({ guest_email: "919876543210@phone.leveluplearning.in", guest_name: "A" }, { email: "owner@example.com", full_name: null, phone: null }),
    ).toBeNull();
  });

  it("mails a signed-in buyer at the account email", () => {
    expect(receiptRecipient({ guest_email: null, guest_name: null }, { email: "me@example.com", full_name: "Me", phone: null })).toEqual({
      email: "me@example.com",
      name: "Me",
    });
    expect(receiptRecipient({ guest_email: null, guest_name: null }, { email: "91987@phone.leveluplearning.in", full_name: null, phone: null })).toBeNull();
  });
});

describe("receipt rendering", () => {
  it("keeps the invoice link (sanitizeVar would strip it) and checks its origin", () => {
    const vars = receiptVariables(
      order,
      { offeringTitle: "Nelson Dilipkumar Teaches Filmmaking", productTier: "masterclass", appUrl: APP, invoiceUrl: `${STORAGE}/storage/v1/object/sign/invoices/u/po_1.pdf?token=abc`, allowedUrlOrigins: [APP, STORAGE] },
      "Asha",
    );
    const out = renderReceipt(template, vars, sanitizeVar);
    expect(out.subject).toBe("You're in — receipt for Nelson Dilipkumar Teaches Filmmaking");
    expect(out.html).toContain('href="https://ivkvluezuiojovpotlyb.supabase.co/storage/v1/object/sign/invoices/u/po_1.pdf?token=abc"');
    expect(out.html).toContain(`href="${APP}/home"`);
    expect(out.html).toContain("₹2,499 · pay_ABC · 17 Oct 2026");
    expect(out.text).toBe("Hi Asha, ₹2,499 for Nelson Dilipkumar Teaches Filmmaking.");
    expect(vars.refund_policy).toBe("Full refund within 7 days of buying, if you have watched less than a quarter of the course.");
    expect(vars.sign_in_hint).toContain("ending 3210");
  });

  it("falls back to the profile page for a missing or foreign invoice link", () => {
    expect(safeUrl("https://evil.example/x", [APP, STORAGE])).toBeNull();
    expect(safeUrl(`${APP}.evil.example/x`, [APP])).toBeNull();
    expect(safeUrl('https://app.leveluplearning.in/x"onmouseover=1', [APP])).toBeNull();
    const vars = receiptVariables(order, { offeringTitle: null, productTier: "live_cohort", appUrl: APP, invoiceUrl: "https://evil.example/x", allowedUrlOrigins: [APP] }, "Asha");
    expect(vars.invoice_url).toBe(`${APP}/profile`);
    expect(vars.refund_policy).toBe("");
  });

  it("strips markup from a name typed at checkout", () => {
    const out = renderReceipt(template, { student_name: "<b>Asha</b> http://x.y" }, sanitizeVar);
    expect(out.html).toContain("<p>Hi bAsha/b </p>");
  });
});

function deps(overrides: Partial<ReceiptEmailDeps> = {}) {
  return {
    enqueueEmail: vi.fn(async () => ({ error: null })),
    isEmailSuppressed: vi.fn(async () => false),
    sanitizeVar,
    ...overrides,
  };
}

function adminWithTemplate(tpl: unknown = template) {
  return {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: table === "email_templates" ? tpl : null, error: null });
      return q;
    },
  };
}

describe("sendPurchaseReceipt", () => {
  const ctx = { offeringTitle: "Nelson", productTier: "masterclass", appUrl: APP, allowedUrlOrigins: [APP] };

  it("queues one email keyed to the order", async () => {
    const d = deps();
    const res = await sendPurchaseReceipt(adminWithTemplate(), order, ctx, d);
    expect(res).toMatchObject({ sent: true, to_domain: "example.com" });
    expect(d.enqueueEmail).toHaveBeenCalledTimes(1);
    const [, opts] = d.enqueueEmail.mock.calls[0] as unknown as [unknown, Record<string, string>];
    expect(opts.to).toBe("asha@example.com");
    expect(opts.label).toBe("payment_receipt");
    expect(opts.idempotencyKey).toBe("payment_receipt:po_1");
  });

  it("skips a suppressed address, a missing template and a missing inbox", async () => {
    expect(await sendPurchaseReceipt(adminWithTemplate(), order, ctx, deps({ isEmailSuppressed: vi.fn(async () => true) }))).toEqual({ sent: false, skipped: "suppressed" });
    expect(await sendPurchaseReceipt(adminWithTemplate(null), order, ctx, deps())).toEqual({ sent: false, skipped: "no_template" });
    expect(await sendPurchaseReceipt(adminWithTemplate(), { ...order, guest_email: null }, { ...ctx, user: null }, deps())).toEqual({ sent: false, skipped: "no_email" });
  });

  it("reports a queue error without throwing", async () => {
    const res = await sendPurchaseReceipt(adminWithTemplate(), order, ctx, deps({ enqueueEmail: vi.fn(async () => ({ error: { message: "queue down" } })) }));
    expect(res).toEqual({ sent: false, error: "queue down" });
  });
});

describe("runPostCapture receipt step", () => {
  function fakeAdmin(row: Record<string, unknown>) {
    const state = { row: { ...row } };
    const from = (table: string) => {
      const q: Record<string, unknown> & { _update?: Record<string, unknown>; _guard?: boolean } = {};
      q.select = () => q;
      q.eq = () => q;
      q.limit = () => q;
      q.is = (c: string) => {
        if (c === "notes->>post_capture") q._guard = true;
        return q;
      };
      q.update = (u: Record<string, unknown>) => {
        q._update = u;
        return q;
      };
      q.maybeSingle = async () => {
        if (table === "payment_orders") return { data: { ...state.row }, error: null };
        if (table === "email_templates") return { data: template, error: null };
        if (table === "offerings") return { data: { title: "Nelson", product_tier: "masterclass", refund_policy_days: 7 }, error: null };
        return { data: null, error: null };
      };
      q.then = (resolve: (v: unknown) => void) => {
        if (table === "payment_orders" && q._update) {
          const notes = (state.row.notes ?? {}) as Record<string, unknown>;
          if (q._guard && notes.post_capture) return resolve({ data: [], error: null });
          state.row = { ...state.row, ...q._update };
          return resolve({ data: [{ id: state.row.id }], error: null });
        }
        return resolve({ data: null, error: null });
      };
      return q;
    };
    return { admin: { from }, state };
  }

  const captured = { ...order, status: "captured", payment_type: null, application_id: null, notes: {} };

  it("sends the receipt once, whichever path calls first, and records it", async () => {
    const { admin, state } = fakeAdmin(captured);
    const d = deps();
    await runPostCapture(admin, "po_1", { source: "razorpay-webhook", email: d });
    await runPostCapture(admin, "po_1", { source: "verify", email: d });
    expect(d.enqueueEmail).toHaveBeenCalledTimes(1);
    const post = (state.row.notes as { post_capture: { receipt: { sent: boolean }; capi: { skipped?: string } } }).post_capture;
    expect(post.receipt.sent).toBe(true);
    expect(post.capi.skipped).toBe("no_token");
  });

  it("sends nothing for a staged cohort payment", async () => {
    const { admin } = fakeAdmin({ ...captured, payment_type: "app_fee", application_id: "app_1" });
    const d = deps();
    await runPostCapture(admin, "po_1", { source: "verify", email: d });
    expect(d.enqueueEmail).not.toHaveBeenCalled();
  });
});
