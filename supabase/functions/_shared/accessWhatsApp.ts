/**
 * "Your course is ready" on WhatsApp, straight after a paid single purchase
 * (2026-11-04, the pay-first checkout). Runs once per order inside
 * runPostCapture (_shared/postCapture.ts), next to the receipt email.
 *
 * It sends nothing until it is switched on: the Interakt template must be
 * approved by Meta first, then its name set as the INTERAKT_ACCESS_TEMPLATE
 * secret (INTERAKT_API_KEY is already set). Until then the step records
 * `skipped: "not_configured"` on the order.
 *
 * Template (UTILITY, English), two body values:
 *   {{1}} first name, {{2}} course title; one static URL button to the app.
 *
 * Indian numbers only: Interakt wants the country code apart from the number,
 * and buyers outside India already get the receipt email. Dependency-free so
 * vitest can drive it with a stubbed fetch.
 */

export type AccessWhatsAppInput = {
  phone: string | null | undefined;
  fullName: string | null | undefined;
  courseTitle: string | null | undefined;
};

export type AccessWhatsAppConfig = {
  apiKey: string | null;
  template: string | null;
  fetchImpl?: typeof fetch;
};

export type AccessWhatsAppResult =
  | { sent: true }
  | { sent: false; skipped: "not_configured" | "no_indian_phone" }
  | { sent: false; error: string };

/** The 10-digit Indian mobile number, or null for anything else. */
export function indianMobile(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  const national = d.length === 12 && d.startsWith("91") ? d.slice(2) : d;
  return /^[6-9]\d{9}$/.test(national) ? national : null;
}

function firstName(full: string | null | undefined): string {
  const f = (full ?? "").trim().split(/\s+/)[0];
  return f || "there";
}

export async function sendAccessWhatsApp(
  input: AccessWhatsAppInput,
  cfg: AccessWhatsAppConfig,
): Promise<AccessWhatsAppResult> {
  if (!cfg.apiKey || !cfg.template) return { sent: false, skipped: "not_configured" };
  const mobile = indianMobile(input.phone);
  if (!mobile) return { sent: false, skipped: "no_indian_phone" };
  const doFetch = cfg.fetchImpl ?? fetch;
  try {
    const body = JSON.stringify({
        countryCode: "+91",
        phoneNumber: mobile,
        type: "Template",
        callbackData: "course_access",
        template: {
          name: cfg.template,
          languageCode: "en",
          bodyValues: [firstName(input.fullName), (input.courseTitle ?? "").trim() || "your course"],
        },
      });
    const post = (auth: string) =>
      doFetch("https://api.interakt.ai/v1/public/message/", {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body,
      });
    // Interakt's secret key is already base64; an older copy of the key may be
    // the raw form (notify-cohort encodes it). Try as given, then encoded.
    let res = await post(cfg.apiKey);
    if (res.status === 401) res = await post(btoa(`${cfg.apiKey}:`));
    if (!res.ok) return { sent: false, error: `interakt ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
