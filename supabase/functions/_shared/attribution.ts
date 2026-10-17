/**
 * Ad attribution carried from the landing page to the order row.
 *
 * The marketing site appends utm_*, fbclid, gclid and a landing event id to
 * every checkout link. The checkout reads them (plus the _fbp/_fbc cookies Meta's
 * pixel sets on .leveluplearning.in) and sends them with the order call; the
 * order functions keep them on `payment_orders` (utm_* columns, the rest under
 * `notes.attribution`) so a sale can be tied to an ad and the server Purchase
 * can carry fbc/fbp for Meta's matching.
 *
 * Pure and dependency-free: used by the browser (via `@shared`) and by Deno.
 * Everything here treats input as untrusted: unknown keys are dropped, values
 * are trimmed strings with a length cap, and nothing is ever thrown.
 */

export const ATTRIBUTION_URL_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "ic_eid",
  "mc_course",
  "mc_var",
] as const;

export type AttributionUrlKey = (typeof ATTRIBUTION_URL_KEYS)[number];

export type Attribution = Partial<Record<AttributionUrlKey, string>> & {
  /** Meta browser id, from the _fbp cookie. */
  fbp?: string;
  /** Meta click id, from the _fbc cookie, or built from fbclid. */
  fbc?: string;
  /** The checkout page the order came from (no query string). */
  event_source_url?: string;
};

/** Server-side additions, taken from the order request itself. */
export type AttributionRecord = Attribution & {
  client_ip?: string;
  client_user_agent?: string;
};

const MAX_LEN = 300;
const URL_MAX_LEN = 500;
const FB_ID_RE = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_.-]+$/;

function clean(v: unknown, max = MAX_LEN): string | undefined {
  if (typeof v !== "string") return undefined;
  // Strip control characters; keep everything else as typed by the ad platform.
  const s = Array.from(v)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join("")
    .trim();
  if (!s) return undefined;
  return s.slice(0, max);
}

/**
 * Whitelist and clean an attribution object from an untrusted body. `fallback`
 * holds values from older top-level body fields (guest-create-order has always
 * accepted top-level utm_*); explicit `attribution` values win.
 */
export function sanitizeAttribution(input: unknown, fallback: Record<string, unknown> = {}): Attribution {
  const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const out: Attribution = {};
  for (const key of ATTRIBUTION_URL_KEYS) {
    const v = clean(src[key]) ?? clean(fallback[key]);
    if (v) out[key] = v;
  }
  // The site used to call the landing event id mc_eid; accept both.
  if (!out.ic_eid) {
    const legacy = clean(src["mc_eid"]) ?? clean(fallback["mc_eid"]);
    if (legacy) out.ic_eid = legacy;
  }
  const fbp = clean(src.fbp);
  if (fbp && FB_ID_RE.test(fbp)) out.fbp = fbp;
  const fbc = clean(src.fbc);
  if (fbc && FB_ID_RE.test(fbc)) out.fbc = fbc;
  const url = clean(src.event_source_url, URL_MAX_LEN);
  if (url && /^https?:\/\//i.test(url)) out.event_source_url = url.split(/[?#]/)[0];
  return out;
}

/** Meta's documented fbc format when only the fbclid is known. */
export function fbcFromFbclid(fbclid: string, createdAtMs: number): string {
  return `fb.1.${Math.floor(createdAtMs)}.${fbclid}`;
}

type HeaderBag = { get(name: string): string | null };

/** Client IP and user agent of the order request, for Meta's matching. */
export function requestClientMeta(headers: HeaderBag): { client_ip?: string; client_user_agent?: string } {
  const xff = headers.get("x-forwarded-for");
  const ip = (xff ? xff.split(",")[0] : headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? "").trim();
  const ua = clean(headers.get("user-agent"), 400);
  const out: { client_ip?: string; client_user_agent?: string } = {};
  // An IPv4 or IPv6 literal only; anything else is not worth sending to Meta.
  if (ip && ip.length <= 45 && /^[0-9a-fA-F:.]+$/.test(ip)) out.client_ip = ip;
  if (ua) out.client_user_agent = ua;
  return out;
}

/** The utm_* columns of payment_orders, from a sanitized attribution. */
export function utmColumns(a: Attribution): Record<"utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term", string | null> {
  return {
    utm_source: a.utm_source ?? null,
    utm_medium: a.utm_medium ?? null,
    utm_campaign: a.utm_campaign ?? null,
    utm_content: a.utm_content ?? null,
    utm_term: a.utm_term ?? null,
  };
}
