/**
 * Checkout-side attribution: read what the landing page put on the checkout
 * link, keep it for the visit, and hand a clean object to the order call.
 *
 * Why sessionStorage: the buyer can bounce to /login (Sign in) and back, or the
 * page can re-render without the query string. Values are kept for the tab's
 * life only. Every storage access is wrapped: a private window or blocked
 * storage must never break the checkout, it only loses attribution.
 *
 * The landing event id (ic_eid) is stored PER OFFERING: it names one tap on one
 * course's button, so it must not be reused as the event id for another course
 * opened later in the same tab.
 */
import {
  ATTRIBUTION_URL_KEYS,
  fbcFromFbclid,
  sanitizeAttribution,
  type Attribution,
} from "@shared/attribution";

const STORE_KEY = "lu_attr_v1";
const IC_KEY_PREFIX = "lu_ic_eid_v1:";

function readStore(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* storage blocked: attribution is best-effort */
  }
}

export function readCookie(name: string): string | null {
  try {
    const parts = document.cookie ? document.cookie.split(";") : [];
    for (const part of parts) {
      const i = part.indexOf("=");
      if (i < 0) continue;
      if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
    }
  } catch {
    /* no cookie access */
  }
  return null;
}

// The keys that name one ad click. They are kept or replaced as a set: a link
// from a new click must not inherit the campaign or click id of an older one.
const CLICK_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];

/**
 * Call once when the checkout mounts. A link that carries any click key
 * (utm_*, fbclid, gclid) replaces the click keys this tab held; a link without
 * them (a reload, a /login round trip, an organic visit) keeps the last click.
 * Other keys (mc_course, mc_var) are replaced one by one. Also remembers this
 * offering's landing event id. Returns the merged values.
 */
export function captureCheckoutAttribution(search: string, offeringId: string): Attribution {
  let stored: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(readStore(STORE_KEY) || "{}");
    stored = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    stored = {};
  }
  const params = new URLSearchParams(search);
  const fromUrl: Record<string, string> = {};
  for (const key of [...ATTRIBUTION_URL_KEYS, "mc_eid"]) {
    const v = params.get(key);
    if (v) fromUrl[key] = v;
  }
  if (CLICK_KEYS.some((k) => k in fromUrl)) {
    stored = { ...stored };
    for (const k of CLICK_KEYS) delete stored[k];
  }
  const merged = sanitizeAttribution({ ...stored, ...fromUrl });
  // The landing event id belongs to this offering's visit only.
  const ic = merged.ic_eid;
  delete merged.ic_eid;
  writeStore(STORE_KEY, JSON.stringify(merged));
  if (ic && offeringId) writeStore(IC_KEY_PREFIX + offeringId, ic);
  return merged;
}

function newVisitId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* falls through */
  }
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The event id for this checkout visit's InitiateCheckout: the landing page's
 * id when the link carried one (the site fires its own copy on the tap with that
 * id, so Meta keeps one), else an id minted on first use and kept for the tab,
 * so a reload or a /login round trip does not count a second checkout.
 */
export function checkoutVisitEventId(offeringId: string): string {
  const key = IC_KEY_PREFIX + offeringId;
  const existing = readStore(key);
  if (existing) return existing;
  const id = newVisitId();
  writeStore(key, id);
  return id;
}

/**
 * The attribution object to send with guest-create-order / create-razorpay-order.
 * Cookies are read now, not at mount: the pixel may set _fbp/_fbc after load.
 */
export function attributionForOrder(offeringId: string): Attribution {
  let stored: Record<string, unknown> = {};
  try {
    stored = JSON.parse(readStore(STORE_KEY) || "{}") ?? {};
  } catch {
    stored = {};
  }
  const fbp = readCookie("_fbp") ?? undefined;
  let fbc = readCookie("_fbc") ?? undefined;
  const fbclid = typeof stored.fbclid === "string" ? stored.fbclid : undefined;
  if (!fbc && fbclid) fbc = fbcFromFbclid(fbclid, Date.now());
  const ic = readStore(IC_KEY_PREFIX + offeringId) ?? undefined;
  let eventSourceUrl: string | undefined;
  try {
    eventSourceUrl = `${window.location.origin}${window.location.pathname}`;
  } catch {
    eventSourceUrl = undefined;
  }
  return sanitizeAttribution({ ...stored, fbp, fbc, ic_eid: ic, event_source_url: eventSourceUrl });
}

/**
 * The www masterclass page this visit came from, when the checkout link named
 * it (mc_course). The landing page opens checkout in a new tab, so the browser
 * has no history to go back to; "Back" uses this instead of the app's own sales
 * page, which the buyer has never seen.
 */
export function landingPageUrl(): string | null {
  try {
    const stored = JSON.parse(readStore(STORE_KEY) || "{}") as Record<string, unknown>;
    const slug = typeof stored.mc_course === "string" ? stored.mc_course : "";
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return null;
    return `https://www.leveluplearning.in/masterclass/${slug}`;
  } catch {
    return null;
  }
}
