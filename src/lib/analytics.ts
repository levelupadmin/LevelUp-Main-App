// Thin client-side analytics layer.
//
// One module, four platforms. Loads platform scripts based on
// analytics_settings, then provides a single track() API that fans
// out the right call to each platform. Designed so callers don't
// need to know about specific platform APIs.
//
// Platforms supported:
//   - Microsoft Clarity      (session recording + heatmaps)
//   - Meta Pixel             (Facebook + Instagram ads)
//   - Google Analytics 4     (universal funnel)
//   - Twitter (X) Pixel      (X Ads)
//
// Conversions APIs (server-to-server) are deliberately not in this
// file - they belong in edge functions where the access tokens live.
// This module is browser-side only.

import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    twq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export interface AnalyticsSettings {
  clarity_project_id: string | null;
  meta_pixel_id: string | null;
  ga4_measurement_id: string | null;
  twitter_pixel_id: string | null;
  clarity_enabled: boolean;
  meta_pixel_enabled: boolean;
  ga4_enabled: boolean;
  twitter_pixel_enabled: boolean;
}

// In-memory cache of the loaded settings so events don't have to
// re-read DB on every fire.
let cached: AnalyticsSettings | null = null;

export async function loadSettings(): Promise<AnalyticsSettings | null> {
  if (cached) return cached;
  const { data } = await supabase
    .from("analytics_settings" as any)
    .select(
      "clarity_project_id, meta_pixel_id, ga4_measurement_id, twitter_pixel_id, clarity_enabled, meta_pixel_enabled, ga4_enabled, twitter_pixel_enabled",
    )
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  cached = data as AnalyticsSettings;
  return cached;
}

// Manual cache buster - called by admin after saving so the page
// can reload without a hard refresh.
export function clearSettingsCache() {
  cached = null;
}

// Idempotent script injection. Each loader checks for an existing
// script tag with a known marker attribute before injecting, so
// double-mount during HMR or fast-refresh doesn't double-fire pixels.

function injectScript(src: string, marker: string, async = true): HTMLScriptElement {
  const existing = document.querySelector<HTMLScriptElement>(`script[data-analytics="${marker}"]`);
  if (existing) return existing;
  const s = document.createElement("script");
  s.src = src;
  s.async = async;
  s.setAttribute("data-analytics", marker);
  document.head.appendChild(s);
  return s;
}

function loadClarity(projectId: string) {
  if (window.clarity) return;
  // Clarity's official snippet, inlined.
  // https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup
  /* eslint-disable */
  (function (c: any, l: any, a: any, r: any, i: any) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    const t = l.createElement(r);
    t.async = 1;
    t.src = "https://www.clarity.ms/tag/" + i;
    t.setAttribute("data-analytics", "clarity");
    const y = l.getElementsByTagName(r)[0];
    y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", projectId);
  /* eslint-enable */
}

function loadMetaPixel(pixelId: string) {
  if (window.fbq) return;
  // Meta's official snippet, inlined.
  /* eslint-disable */
  (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod
        ? n.callMethod.apply(n, arguments)
        : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    t.setAttribute("data-analytics", "meta-pixel");
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  window.fbq?.("init", pixelId);
  window.fbq?.("track", "PageView");
}

function loadGA4(measurementId: string) {
  if (window.gtag) return;
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`, "ga4");
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    (window.dataLayer as unknown[]).push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: true });
}

function loadTwitterPixel(pixelId: string) {
  if (window.twq) return;
  /* eslint-disable */
  (function (e: any, t: any, n: any, s: any, u: any, a: any) {
    e.twq || ((s = e.twq = function () {
      s.exe ? s.exe.apply(s, arguments) : s.queue.push(arguments);
    }), (s.version = "1.1"), (s.queue = []));
    const t2 = document.createElement("script");
    t2.async = !0;
    t2.src = "https://static.ads-twitter.com/uwt.js";
    t2.setAttribute("data-analytics", "twitter-pixel");
    const u2 = document.getElementsByTagName("script")[0];
    u2.parentNode!.insertBefore(t2, u2);
  })(window, document, "script");
  /* eslint-enable */
  window.twq?.("config", pixelId);
}

/**
 * Boot all enabled analytics platforms based on stored settings.
 * Idempotent - safe to call multiple times. Returns the loaded
 * settings so callers can branch on them if needed.
 */
export async function bootAnalytics(): Promise<AnalyticsSettings | null> {
  // Skip on localhost so dev work doesn't pollute production funnels.
  if (
    typeof window !== "undefined" &&
    /^(localhost|127\.|\[?::1)/.test(window.location.hostname)
  ) {
    return null;
  }

  const s = await loadSettings();
  if (!s) return null;

  if (s.clarity_enabled && s.clarity_project_id) {
    try { loadClarity(s.clarity_project_id); } catch (e) { console.warn("Clarity load failed", e); }
  }
  if (s.meta_pixel_enabled && s.meta_pixel_id) {
    try { loadMetaPixel(s.meta_pixel_id); } catch (e) { console.warn("Meta Pixel load failed", e); }
  }
  if (s.ga4_enabled && s.ga4_measurement_id) {
    try { loadGA4(s.ga4_measurement_id); } catch (e) { console.warn("GA4 load failed", e); }
  }
  if (s.twitter_pixel_enabled && s.twitter_pixel_id) {
    try { loadTwitterPixel(s.twitter_pixel_id); } catch (e) { console.warn("Twitter Pixel load failed", e); }
  }
  return s;
}

// ────────────────────────────────────────────────────────────────────
// Event firing.
//
// We normalise to a small vocabulary of e-commerce events and fan
// them out to whichever platforms are loaded. Each platform expects
// its own event names + payload shape, so we translate here.

export type AnalyticsEvent =
  | { name: "view_content"; content_id: string; content_name: string; value?: number; currency?: string }
  | { name: "initiate_checkout"; content_id: string; content_name: string; value: number; currency: string }
  | { name: "purchase"; transaction_id: string; content_id: string; content_name: string; value: number; currency: string }
  | { name: "lead"; method?: string }
  | { name: "sign_up"; method?: string };

// Generate a stable, unique event ID for each track() call. Meta's
// server-side CAPI (enabled via "Set up with Meta" in Events Manager)
// uses this to dedupe against the browser-side Pixel event - same
// eventID across both = counted once. Without it, Meta falls back to
// best-guess hashing on event_name + url + timestamp, which works
// but isn't bulletproof. crypto.randomUUID is supported in every
// modern browser + Capacitor WebView; fallback to a Math.random
// concat just in case.
function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* falls through */ }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// For purchase events specifically we use the transaction_id as the
// eventID base so a refresh of /thank-you doesn't create a second
// purchase signal - Meta will dedupe across the two fires.
function purchaseEventId(transactionId: string): string {
  return `purchase_${transactionId}`;
}

export function track(event: AnalyticsEvent) {
  if (typeof window === "undefined") return;
  try {
    const eventID =
      event.name === "purchase" ? purchaseEventId(event.transaction_id) : newEventId();
    switch (event.name) {
      case "view_content":
        window.fbq?.("track", "ViewContent", {
          content_ids: [event.content_id],
          content_name: event.content_name,
          content_type: "product",
          value: event.value,
          currency: event.currency || "INR",
        }, { eventID });
        window.gtag?.("event", "view_item", {
          items: [{ item_id: event.content_id, item_name: event.content_name }],
          value: event.value,
          currency: event.currency || "INR",
        });
        window.twq?.("event", "tw-content-view", { value: event.value });
        break;
      case "initiate_checkout":
        window.fbq?.("track", "InitiateCheckout", {
          content_ids: [event.content_id],
          content_name: event.content_name,
          value: event.value,
          currency: event.currency,
        }, { eventID });
        window.gtag?.("event", "begin_checkout", {
          items: [{ item_id: event.content_id, item_name: event.content_name }],
          value: event.value,
          currency: event.currency,
        });
        window.twq?.("event", "tw-begin-checkout", { value: event.value });
        break;
      case "purchase":
        window.fbq?.("track", "Purchase", {
          content_ids: [event.content_id],
          content_name: event.content_name,
          value: event.value,
          currency: event.currency,
        }, { eventID });
        window.gtag?.("event", "purchase", {
          transaction_id: event.transaction_id,
          items: [{ item_id: event.content_id, item_name: event.content_name }],
          value: event.value,
          currency: event.currency,
        });
        window.twq?.("event", "tw-purchase", { value: event.value });
        break;
      case "lead":
        window.fbq?.("track", "Lead", { method: event.method }, { eventID });
        window.gtag?.("event", "generate_lead", { method: event.method });
        break;
      case "sign_up":
        window.fbq?.("track", "CompleteRegistration", { method: event.method }, { eventID });
        window.gtag?.("event", "sign_up", { method: event.method });
        break;
    }
  } catch (e) {
    // Pixels failing should never break the user flow.
    console.warn("analytics track failed", e);
  }
}
