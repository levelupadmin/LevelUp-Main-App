import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Thank-you: chips come from data only (no "4K video" / "Subtitles"), the
 * runtime is the measured one, and the main button opens lesson 1.
 */

vi.mock("@/lib/haptics", () => ({
  hapticNotification: vi.fn(() => Promise.resolve()),
  hapticImpact: vi.fn(() => Promise.resolve()),
  hapticSelection: vi.fn(() => Promise.resolve()),
  tapTick: vi.fn(() => Promise.resolve()),
  confirm: vi.fn(() => Promise.resolve()),
  celebrate: vi.fn(() => Promise.resolve()),
}));

const fixture = vi.hoisted(() => ({
  applicationId: null as string | null,
  chapterSeconds: [5000, 3400] as number[],
}));

function order() {
  return {
    id: "order_1",
    offering_id: "off_1",
    application_id: fixture.applicationId,
    total_inr: 2499,
    status: "captured",
    razorpay_payment_id: "pay_1",
    guest_email: null,
    guest_name: null,
    guest_phone: null,
    user_id: "user_1",
    created_at: new Date("2026-10-17T10:00:00.000Z").toISOString(),
    offerings: {
      title: "Nelson Dilipkumar Teaches Filmmaking",
      product_tier: "masterclass",
      subtitle: null,
      thumbnail_url: null,
      slug: "nelson",
      meta_pixel_id: null,
      google_ads_conversion: null,
      custom_tracking_script: null,
      thankyou_thumbnail_url: null,
      thankyou_headline: null,
      thankyou_body: null,
      thankyou_cta_label: null,
      thankyou_cta_url: null,
      thankyou_auto_redirect: false,
      thankyou_redirect_seconds: null,
      thankyou_show_calendly: false,
      calendly_url: null,
      validity_days: null,
      offering_courses: [{ course_id: "course_1", courses: { total_lessons: 29 } }],
    },
  };
}

vi.mock("@/integrations/supabase/client", () => {
  const builder = (result: () => unknown, terminal: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order"]) {
      b[m] = vi.fn(() => (m === terminal ? Promise.resolve(result()) : b));
    }
    b.single = vi.fn(() => Promise.resolve(result()));
    return b;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "payment_orders") return builder(() => ({ data: order(), error: null }), "single");
        if (table === "offering_upsells") return builder(() => ({ data: [] }), "order");
        if (table === "sections") {
          // .select().eq() resolves
          const b: Record<string, unknown> = {};
          b.select = vi.fn(() => b);
          b.eq = vi.fn(() => Promise.resolve({ data: [{ id: "sec_2", sort_order: 2 }, { id: "sec_1", sort_order: 1 }] }));
          return b;
        }
        if (table === "chapters") {
          const b: Record<string, unknown> = {};
          b.select = vi.fn(() => b);
          b.in = vi.fn(() =>
            Promise.resolve({
              data: [
                { id: "ch_later", section_id: "sec_2", sort_order: 1, content_type: "video", duration_seconds: fixture.chapterSeconds[1] },
                { id: "ch_first", section_id: "sec_1", sort_order: 1, content_type: "video", duration_seconds: fixture.chapterSeconds[0] },
              ],
            }),
          );
          return b;
        }
        return builder(() => ({ data: null }), "single");
      }),
      auth: { signInWithOtp: vi.fn() },
    },
  };
});

const navigateSpy = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: () => ({ paymentOrderId: "order_1" }),
    useNavigate: () => navigateSpy,
    Link: ({ to, children, ...rest }: { to: unknown; children?: unknown }) =>
      createElement("a", { href: typeof to === "string" ? to : "#", ...rest }, children as never),
  };
});

// One stable session object: the page refetches the order whenever `session`
// changes identity.
const authState = vi.hoisted(() => ({
  session: { user: { id: "user_1", email: "buyer@example.com", user_metadata: {} } },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ session: authState.session }),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/platform", () => ({
  isNative: () => false,
  isAndroid: () => false,
  isIOS: () => false,
  isWeb: () => true,
}));

import ThankYou from "@/pages/ThankYou";

describe("ThankYou course facts and lesson 1", () => {
  beforeEach(() => {
    navigateSpy.mockClear();
    fixture.applicationId = null;
    fixture.chapterSeconds = [5000, 3400];
  });

  it("shows lessons, the measured runtime and lifetime access, and no unchecked chips", async () => {
    render(createElement(ThankYou));
    expect(await screen.findByText("29 lessons")).toBeInTheDocument();
    expect(await screen.findByText("2 h 20 min")).toBeInTheDocument();
    expect(screen.getByText("Lifetime access")).toBeInTheDocument();
    expect(screen.queryByText("4K video")).not.toBeInTheDocument();
    expect(screen.queryByText("Subtitles")).not.toBeInTheDocument();
    expect(screen.queryByText(/\+ hrs/)).not.toBeInTheDocument();
  });

  it("opens lesson 1 from the main button", async () => {
    render(createElement(ThankYou));
    const button = await screen.findByRole("button", { name: /Start lesson 1/ });
    fireEvent.click(button);
    expect(navigateSpy).toHaveBeenCalledWith("/chapters/ch_first");
  });

  it("prints no runtime when a lesson has no measured length", async () => {
    fixture.chapterSeconds = [5000, 0];
    render(createElement(ThankYou));
    expect(await screen.findByText("29 lessons")).toBeInTheDocument();
    await screen.findByRole("button", { name: /Start lesson 1/ });
    expect(screen.queryByText(/\d+ h|\d+ min/)).not.toBeInTheDocument();
  });

  it("keeps an application payment off the course chips and lesson link", async () => {
    fixture.applicationId = "app_1";
    render(createElement(ThankYou));
    const button = await screen.findByRole("button", { name: /Start watching/ });
    expect(screen.queryByText("29 lessons")).not.toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/home"));
  });
});
