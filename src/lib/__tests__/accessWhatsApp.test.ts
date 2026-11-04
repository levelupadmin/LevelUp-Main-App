import { describe, it, expect, vi } from "vitest";
import { indianMobile, sendAccessWhatsApp } from "@shared/accessWhatsApp";

describe("access WhatsApp after a purchase", () => {
  it("sends nothing until the template is configured", async () => {
    const fetchImpl = vi.fn();
    const r = await sendAccessWhatsApp({ phone: "9884012345", fullName: "Asha Rao", courseTitle: "Nelson" }, { apiKey: "k", template: null, fetchImpl });
    expect(r).toEqual({ sent: false, skipped: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips numbers outside India (they get the receipt email)", async () => {
    const fetchImpl = vi.fn();
    const r = await sendAccessWhatsApp({ phone: "+447911123456", fullName: "Jo", courseTitle: "Nelson" }, { apiKey: "k", template: "t", fetchImpl });
    expect(r).toEqual({ sent: false, skipped: "no_indian_phone" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the template with the first name and course title", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 201 }));
    const r = await sendAccessWhatsApp({ phone: "+91 98840 12345", fullName: "Asha Rao", courseTitle: "Nelson Dilipkumar Teaches Filmmaking" }, { apiKey: "k", template: "lu_course_access", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({ sent: true });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({
      countryCode: "+91",
      phoneNumber: "9884012345",
      template: { name: "lu_course_access", languageCode: "en", bodyValues: ["Asha", "Nelson Dilipkumar Teaches Filmmaking"] },
    });
  });

  it("retries with the encoded key on a 401, and reports a failure without throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 401 }));
    const r = await sendAccessWhatsApp({ phone: "9884012345", fullName: "A", courseTitle: "C" }, { apiKey: "k", template: "t", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ sent: false });
  });

  it("reads Indian mobiles only", () => {
    expect(indianMobile("919884012345")).toBe("9884012345");
    expect(indianMobile("1234567890")).toBeNull();
    expect(indianMobile(null)).toBeNull();
  });
});
