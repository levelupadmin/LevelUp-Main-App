import { supabase, supabaseUrl } from "@/integrations/supabase/client";

/**
 * Certificates v2. Every certificate is made, emailed and handed out by the
 * `certificates` edge function; this file is the browser's side of it: the
 * call wrapper, the download helper, and the design types the preview draws.
 *
 * DesignField mirrors supabase/functions/certificates/render.ts. Positions are
 * fractions (0..1) of the design so the same numbers place text in the PDF and
 * in the on-screen preview. Keep the two files in step.
 */

export type FieldKey = "name" | "date" | "number" | "line" | "verify" | "qr";
export type FontKey = "sans" | "sans-regular" | "serif" | "script" | "inter" | "inter-bold";

export interface DesignField {
  key: FieldKey;
  x: number;
  y: number;
  size: number;
  color?: string;
  font?: FontKey;
  align?: "left" | "center" | "right";
  maxWidth?: number;
  upper?: boolean;
  prefix?: string;
}

export interface CertificateRender {
  image_url: string;
  width: number;
  height: number;
  fields: DesignField[];
  values: { name: string; date: string; number: string; line: string; verify: string };
}

export const LINE_GAP = 1.4;

/** The bold face used for **marked** words (mirrors render.ts). */
export const boldOf = (font: FontKey | undefined): FontKey =>
  !font || font === "sans-regular" ? "sans" : font === "inter" ? "inter-bold" : font;

export function segments(line: string): { text: string; bold: boolean }[] {
  return line.split("**").map((text, i) => ({ text, bold: i % 2 === 1 })).filter((sg) => sg.text);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type DateStyle = "month" | "day";

/** "2026-02-01" → "February 2026" (month) or "1 February 2026" (day). */
export function formatBatchDate(iso: string | null | undefined, style: DateStyle): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return style === "day" && d ? `${d} ${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${y}`;
}

export const needsDates = (line: string | null | undefined) => /\{(start|end)\}/i.test(line ?? "");

export function fillLine(line: string, period: { start: string | null; end: string | null; style: DateStyle }): string {
  return line
    .replace(/\{start\}/gi, formatBatchDate(period.start, period.style))
    .replace(/\{end\}/gi, formatBatchDate(period.end, period.style));
}

export const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Name",
  date: "Completion date",
  number: "Certificate number",
  line: "Batch line",
  verify: "Check link",
  qr: "QR code",
};

export const FONT_LABELS: Record<FontKey, string> = {
  sans: "Sans bold",
  "sans-regular": "Sans",
  serif: "Serif",
  script: "Script",
  inter: "Inter",
  "inter-bold": "Inter bold",
};

export const DESIGN_BUCKET = "certificate-designs";

export const designPublicUrl = (path: string) =>
  `${supabaseUrl}/storage/v1/object/public/${DESIGN_BUCKET}/${path}`;

const FONT_FAMILY: Record<FontKey, string> = {
  sans: "LUCertSans",
  "sans-regular": "LUCertSansRegular",
  serif: "LUCertSerif",
  script: "LUCertScript",
  inter: "LUCertInter",
  "inter-bold": "LUCertInterBold",
};

export const fontFamilyFor = (font: FontKey | undefined) => `'${FONT_FAMILY[font ?? "sans"]}', sans-serif`;

let fontsInjected = false;
/** The preview uses the same font files the PDF uses. */
export function ensureCertificateFonts() {
  if (fontsInjected || typeof document === "undefined") return;
  fontsInjected = true;
  const css = (Object.keys(FONT_FAMILY) as FontKey[])
    .map((k) => `@font-face{font-family:'${FONT_FAMILY[k]}';src:url('${designPublicUrl(`fonts/${k}.ttf`)}') format('truetype');font-display:swap;}`)
    .join("");
  const style = document.createElement("style");
  style.dataset.certFonts = "1";
  style.textContent = css;
  document.head.appendChild(style);
}

export const DEFAULT_FIELDS: DesignField[] = [
  { key: "name", x: 0.5, y: 0.5, size: 0.04, color: "#111111", font: "serif", align: "center", maxWidth: 0.6 },
  { key: "number", x: 0.5, y: 0.9, size: 0.014, color: "#333333", font: "sans-regular", align: "center", prefix: "Certificate No. " },
  { key: "verify", x: 0.5, y: 0.93, size: 0.011, color: "#555555", font: "sans-regular", align: "center", prefix: "Check it at " },
];

export const DEFAULT_FIELD: Record<FieldKey, DesignField> = {
  name: DEFAULT_FIELDS[0],
  date: { key: "date", x: 0.5, y: 0.8, size: 0.018, color: "#333333", font: "sans-regular", align: "center", prefix: "Completed on " },
  number: DEFAULT_FIELDS[1],
  line: { key: "line", x: 0.5, y: 0.6, size: 0.016, color: "#333333", font: "sans-regular", align: "center", maxWidth: 0.8 },
  verify: DEFAULT_FIELDS[2],
  qr: { key: "qr", x: 0.88, y: 0.88, size: 0.08, color: "#111111" },
};

export interface CertificateFnError {
  error: string;
  code?: string;
  [key: string]: unknown;
}

/** Call the certificates function. Throws an Error whose message is the
 *  function's own sentence (safe to show), with `.code` and `.data` attached. */
export async function callCertificates<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("certificates", { body });
  if (error) {
    let payload: CertificateFnError | null = null;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      payload = await ctx.json().catch(() => null);
    }
    const err = new Error(payload?.error ?? "Something went wrong. Try again in a minute.") as Error & {
      code?: string;
      data?: CertificateFnError | null;
    };
    err.code = payload?.code;
    err.data = payload;
    throw err;
  }
  return data as T;
}

/** Ask for a 5-minute link and open it; the browser saves the PDF. */
export async function downloadCertificate(certificateId: string, opts: { admin?: boolean } = {}) {
  const res = await callCertificates<{ url: string; filename: string }>({
    action: opts.admin ? "admin_download" : "download",
    certificate_id: certificateId,
  });
  const a = document.createElement("a");
  a.href = res.url;
  a.download = res.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Admin preview: the real PDF drawn by the server, opened in a new tab. */
export async function previewDesignPdf(design: {
  image_path: string;
  image_width: number;
  image_height: number;
  fields: DesignField[];
}, extra: { line_text?: string; sample_name?: string; start?: string; end?: string; style?: DateStyle } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${supabaseUrl}/functions/v1/certificates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ action: "admin_preview", design, ...extra }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error ?? "Couldn't make the preview.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export interface StudentCertificateView {
  ready: boolean;
  mode: "auto" | "manual" | null;
  threshold: number;
  done: number;
  total: number;
  needed: number;
  eligible: boolean;
  profile_name: string | null;
  name_ok: boolean;
  has_email: boolean;
  email: string | null;
  certificate: null | {
    id: string;
    number: string;
    name: string | null;
    status: "valid" | "revoked";
    completed_on: string | null;
    verify_code: string | null;
    verify_url: string | null;
    email_status: string;
    email_to: string | null;
    last_emailed_at: string | null;
    resends_left: number;
    next_resend_at: string | null;
    render: CertificateRender | null;
  };
}

export const SAMPLE_VALUES: CertificateRender["values"] = {
  name: "Priya Raman",
  date: "2 November 2026",
  number: "LU-CERT-000000",
  line: "",
  verify: "app.leveluplearning.in/v/SAMPLE23",
};

export function formatDay(iso: string | null | undefined) {
  if (!iso) return "";
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00+05:30`) : new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}
