import { describe, it, expect, beforeEach } from "vitest";
import {
  fbcFromFbclid,
  requestClientMeta,
  sanitizeAttribution,
  utmColumns,
} from "@shared/attribution";
import { attributionForOrder, captureCheckoutAttribution } from "@/lib/attribution";

const OFFERING = "190a09ee-3f34-4242-ad9f-70ddedcc8eae";

describe("sanitizeAttribution", () => {
  it("keeps only known keys, trims, and caps length", () => {
    const out = sanitizeAttribution({
      utm_source: "  meta ",
      utm_campaign: "x".repeat(400),
      evil: "drop me",
      fbclid: "IwAR123",
    });
    expect(out).toEqual({ utm_source: "meta", utm_campaign: "x".repeat(300), fbclid: "IwAR123" });
  });

  it("reads old top-level utm_* as a fallback, explicit attribution wins", () => {
    const out = sanitizeAttribution({ utm_source: "meta" }, { utm_source: "old", utm_medium: "paid" });
    expect(out.utm_source).toBe("meta");
    expect(out.utm_medium).toBe("paid");
  });

  it("accepts the legacy mc_eid name for the landing event id", () => {
    expect(sanitizeAttribution({ mc_eid: "abc-1" }).ic_eid).toBe("abc-1");
    expect(sanitizeAttribution({ mc_eid: "abc-1", ic_eid: "new" }).ic_eid).toBe("new");
  });

  it("only keeps well-formed fbp/fbc and strips the query from the page URL", () => {
    const out = sanitizeAttribution({
      fbp: "fb.1.1596403881668.1116446470",
      fbc: "not-a-cookie",
      event_source_url: "https://app.leveluplearning.in/checkout/abc?fbclid=1#x",
    });
    expect(out.fbp).toBe("fb.1.1596403881668.1116446470");
    expect(out.fbc).toBeUndefined();
    expect(out.event_source_url).toBe("https://app.leveluplearning.in/checkout/abc");
  });

  it("never throws on junk", () => {
    expect(sanitizeAttribution(null)).toEqual({});
    expect(sanitizeAttribution("x")).toEqual({});
    expect(sanitizeAttribution([1, 2])).toEqual({});
    expect(sanitizeAttribution({ utm_source: 5 })).toEqual({});
  });
});

describe("server helpers", () => {
  it("builds fbc from fbclid in Meta's format", () => {
    expect(fbcFromFbclid("IwAR1", 1700000000123)).toBe("fb.1.1700000000123.IwAR1");
  });

  it("reads the first forwarded IP and the user agent", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "Mozilla/5.0 Instagram" });
    expect(requestClientMeta(h)).toEqual({ client_ip: "203.0.113.9", client_user_agent: "Mozilla/5.0 Instagram" });
    expect(requestClientMeta(new Headers({ "x-forwarded-for": "unknown" }))).toEqual({});
  });

  it("maps utm columns with nulls", () => {
    expect(utmColumns({ utm_source: "meta" })).toEqual({
      utm_source: "meta",
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    });
  });
});

describe("checkout attribution capture", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    document.cookie = "_fbp=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "_fbc=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("keeps the link's parameters for the visit and adds cookies at order time", () => {
    captureCheckoutAttribution(
      "?utm_source=meta&utm_campaign=nelson&fbclid=IwAR9&mc_eid=tap-1&mc_course=nelson-dilipkumar",
      OFFERING,
    );
    document.cookie = "_fbp=fb.1.1596403881668.1116446470";
    const a = attributionForOrder(OFFERING);
    expect(a.utm_source).toBe("meta");
    expect(a.utm_campaign).toBe("nelson");
    expect(a.ic_eid).toBe("tap-1");
    expect(a.mc_course).toBe("nelson-dilipkumar");
    expect(a.fbp).toBe("fb.1.1596403881668.1116446470");
    // No _fbc cookie: built from the fbclid.
    expect(a.fbc).toMatch(/^fb\.1\.\d{13}\.IwAR9$/);
  });

  it("survives a reload without the query string", () => {
    captureCheckoutAttribution("?utm_source=meta", OFFERING);
    captureCheckoutAttribution("", OFFERING);
    expect(attributionForOrder(OFFERING).utm_source).toBe("meta");
  });

  it("replaces the old click's values when a new click arrives", () => {
    captureCheckoutAttribution("?utm_source=meta&utm_campaign=nelson&fbclid=IwAR9", OFFERING);
    captureCheckoutAttribution("?utm_source=google&gclid=G1", OFFERING);
    const a = attributionForOrder(OFFERING);
    expect(a.utm_source).toBe("google");
    expect(a.gclid).toBe("G1");
    expect(a.utm_campaign).toBeUndefined();
    expect(a.fbclid).toBeUndefined();
  });

  it("keeps the last click when a later link carries only the course", () => {
    captureCheckoutAttribution("?utm_source=meta&fbclid=IwAR9", OFFERING);
    captureCheckoutAttribution("?mc_course=nelson-dilipkumar", OFFERING);
    const a = attributionForOrder(OFFERING);
    expect(a.utm_source).toBe("meta");
    expect(a.fbclid).toBe("IwAR9");
    expect(a.mc_course).toBe("nelson-dilipkumar");
  });

  it("does not reuse one course's landing event id for another", () => {
    captureCheckoutAttribution("?ic_eid=tap-nelson", OFFERING);
    captureCheckoutAttribution("", "other-offering");
    expect(attributionForOrder("other-offering").ic_eid).toBeUndefined();
    expect(attributionForOrder(OFFERING).ic_eid).toBe("tap-nelson");
  });
});
