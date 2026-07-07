import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/platform";

export interface VariablePosition {
  key: string;
  label: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  fontWeight: string;
  textAlign: CanvasTextAlign;
  maxWidth: number;
  value?: string; // for custom_text type
}

export interface CertificateVariableValues {
  student_name: string;
  member_id: string;
  batch_number: string;
  course_name: string;
  completion_date: string;
  certificate_number: string;
  [key: string]: string;
}

// Canonical canvas size: A4 landscape at 150 DPI
export const CANVAS_WIDTH = 2480;
export const CANVAS_HEIGHT = 1754;

export const AVAILABLE_VARIABLES: { key: string; label: string }[] = [
  { key: "student_name", label: "Student Name" },
  { key: "member_id", label: "Member ID" },
  { key: "batch_number", label: "Batch Number" },
  { key: "course_name", label: "Course Name" },
  { key: "completion_date", label: "Completion Date" },
  { key: "certificate_number", label: "Certificate Number" },
  { key: "custom_text", label: "Custom Text" },
];

export const DEFAULT_FONT_OPTIONS = {
  fontSize: 48,
  fontFamily: "serif",
  fontColor: "#1a1a1a",
  fontWeight: "bold",
  textAlign: "center" as CanvasTextAlign,
  maxWidth: 800,
};

export const FONT_FAMILIES = [
  "serif",
  "sans-serif",
  "Georgia",
  "Times New Roman",
  "Palatino",
  "Arial",
  "Helvetica",
  "Verdana",
  "monospace",
];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load certificate template image"));
    img.src = url;
  });
}

export async function generateCertificateImage(
  templateImageUrl: string,
  variablePositions: VariablePosition[],
  variableValues: CertificateVariableValues
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Draw background
  const bgImg = await loadImage(templateImageUrl);
  ctx.drawImage(bgImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw each variable
  for (const vp of variablePositions) {
    const text = vp.key === "custom_text" ? (vp.value ?? "") : (variableValues[vp.key] ?? "");
    if (!text) continue;

    ctx.font = `${vp.fontWeight} ${vp.fontSize}px ${vp.fontFamily}`;
    ctx.fillStyle = vp.fontColor;
    ctx.textAlign = vp.textAlign;
    ctx.textBaseline = "top";
    ctx.fillText(text, vp.x, vp.y, vp.maxWidth);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to create certificate image"))),
      "image/png",
      1.0
    );
  });
}

export async function uploadCertificate(
  blob: Blob,
  userId: string,
  courseId: string
): Promise<string> {
  const path = `${userId}/${courseId}.png`;
  const { error } = await supabase.storage
    .from("certificates")
    .upload(path, blob, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from("certificates").getPublicUrl(path);
  return data.publicUrl;
}

export async function generateAndSaveCertificate(opts: {
  templateId: string;
  templateImageUrl: string;
  variablePositions: VariablePosition[];
  variableValues: CertificateVariableValues;
  userId: string;
  courseId: string;
  generatedBy: "auto" | "admin_manual";
}): Promise<{ certificateUrl: string; certificateNumber: string } | null> {
  // Check if certificate already exists. If yes, return the stored URL.
  // we'd still get there via the RPC's idempotency path, but short-circuiting
  // here skips the placeholder image upload entirely on re-runs.
  const { data: existing } = await (supabase as any)
    .from("certificates")
    .select("id, image_url, certificate_number")
    .eq("user_id", opts.userId)
    .eq("course_id", opts.courseId)
    .maybeSingle();

  if (existing) return { certificateUrl: existing.image_url, certificateNumber: existing.certificate_number };

  // Two paths:
  //   - auto:          student-triggered. Go through issue_certificate RPC
  //                    (SECURITY DEFINER) which verifies enrolment + completion
  //                    and generates the number server-side.
  //   - admin_manual:  admin-triggered on behalf of a student. The issue_cert
  //                    RPC only supports self-issuance (uses auth.uid()), so
  //                    admins fall back to the direct INSERT path which is
  //                    privileged via the `certificates_admin FOR ALL` RLS
  //                    policy. Number comes from next_certificate_number()
  //                    (already an RPC with the right grants).
  if (opts.generatedBy === "admin_manual") {
    const { data: certNum, error: numErr } = await (supabase as any).rpc("next_certificate_number");
    if (numErr || !certNum) throw new Error(numErr?.message || "Failed to generate certificate number");
    const certificateNumber = certNum as string;

    const finalBlob = await generateCertificateImage(
      opts.templateImageUrl,
      opts.variablePositions,
      { ...opts.variableValues, certificate_number: certificateNumber }
    );
    const imageUrl = await uploadCertificate(finalBlob, opts.userId, opts.courseId);

    const { error: insertErr } = await (supabase as any)
      .from("certificates")
      .insert({
        user_id: opts.userId,
        course_id: opts.courseId,
        template_id: opts.templateId,
        image_url: imageUrl,
        certificate_number: certificateNumber,
        generated_by: "admin_manual",
        metadata: opts.variableValues,
      });
    if (insertErr) throw new Error(`Failed to save certificate: ${insertErr.message}`);

    return { certificateUrl: imageUrl, certificateNumber };
  }

  // Student auto-generate path, two-step because issue_certificate generates
  // the cert number server-side but the image we store needs that number
  // painted on. Upload a placeholder first, call the RPC, then re-render
  // with the real number and upsert (Supabase storage upsert overwrites the
  // same path).
  const placeholderBlob = await generateCertificateImage(
    opts.templateImageUrl,
    opts.variablePositions,
    { ...opts.variableValues, certificate_number: "" }
  );
  const imageUrl = await uploadCertificate(placeholderBlob, opts.userId, opts.courseId);

  const { data: issued, error: rpcErr } = await (supabase as any).rpc("issue_certificate", {
    p_course_id: opts.courseId,
    p_template_id: opts.templateId,
    p_image_url: imageUrl,
    p_variable_values: opts.variableValues,
  });
  if (rpcErr || !issued) {
    throw new Error(rpcErr?.message || "Failed to issue certificate");
  }

  const certificateNumber = issued.certificate_number as string;

  const finalBlob = await generateCertificateImage(
    opts.templateImageUrl,
    opts.variablePositions,
    { ...opts.variableValues, certificate_number: certificateNumber }
  );
  await uploadCertificate(finalBlob, opts.userId, opts.courseId);

  return { certificateUrl: imageUrl, certificateNumber };
}

// ────────────────────────────────────────────────────────────────────────────
// Share card (P4-T6)
//
// A self-contained 1080×1350 portrait card for the OS/Web share sheet — no
// template-image dependency, drawn from primitives so it renders identically on
// web and inside the Capacitor WebView. The colours below are the exact hex
// values from the P4-T6 spec (a canvas needs concrete colours; these mirror the
// cream/champagne/muted tokens used across the app).
// ────────────────────────────────────────────────────────────────────────────

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

export interface ShareCardValues {
  courseName: string;
  studentName: string;
}

// Load the three brand faces (imported globally via the Google Fonts @import in
// index.css) before measuring/drawing, or the canvas paints system fallbacks.
async function ensureShareCardFonts(): Promise<void> {
  try {
    const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      await Promise.all([
        fonts.load("500 28px 'JetBrains Mono'"),
        fonts.load("500 20px 'JetBrains Mono'"),
        fonts.load("italic 64px 'Instrument Serif'"),
        fonts.load("italic 40px 'Instrument Serif'"),
        fonts.load("600 44px 'Inter'"),
      ]);
    }
    if (fonts?.ready) await fonts.ready;
  } catch {
    /* Fonts failed to preload — the draw still proceeds with fallbacks. */
  }
}

// Canvas has no letter-spacing property in older engines; use it where present
// (Chromium/WebKit both support ctx.letterSpacing since 2022) and degrade to a
// plain draw otherwise.
function withLetterSpacing(ctx: CanvasRenderingContext2D, spacing: string, draw: () => void): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  const supported = "letterSpacing" in c;
  const prev = supported ? c.letterSpacing : undefined;
  if (supported) c.letterSpacing = spacing;
  draw();
  if (supported && prev !== undefined) c.letterSpacing = prev;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.replace(/\s+$/, "")}…`;
}

// Greedy word-wrap capped at `maxLines`; the final line absorbs any remainder
// and is ellipsized if it overflows.
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let cur = "";
  let idx = 0;
  for (; idx < words.length; idx++) {
    const word = words[idx];
    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !cur) {
      cur = test;
    } else {
      lines.push(cur);
      cur = word;
      if (lines.length === maxLines - 1) {
        idx++;
        break;
      }
    }
  }
  for (; idx < words.length; idx++) cur = `${cur} ${words[idx]}`;
  if (cur) lines.push(cur);
  const last = lines.length - 1;
  if (last >= 0 && ctx.measureText(lines[last]).width > maxWidth) {
    lines[last] = ellipsize(ctx, lines[last], maxWidth);
  }
  return lines.slice(0, maxLines);
}

// The same fractal-noise grain used across the app, rasterized onto the card at
// 4%. Decorative and fully guarded — a WebView that refuses SVG-filter draws
// just gets a clean black field.
async function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number): Promise<void> {
  try {
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
      `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter>` +
      `<rect width='100%' height='100%' filter='url(#n)'/></svg>`;
    const img = await loadImage(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
  } catch {
    /* Grain is decorative; skip silently on failure. */
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to create share card"))),
      "image/png",
      1.0,
    );
  });
}

/** Render the 1080×1350 share card from drawn primitives. */
export async function generateShareCard(values: ShareCardValues): Promise<Blob> {
  const W = SHARE_CARD_WIDTH;
  const H = SHARE_CARD_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  await ensureShareCardFonts();

  // Pure black field + grain.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);
  await drawGrain(ctx, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Eyebrow — JetBrains Mono 28px, tracking-widest, muted.
  ctx.font = "500 28px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#A6A6AA";
  withLetterSpacing(ctx, "0.28em", () => {
    ctx.fillText("CERTIFICATE OF COMPLETION", W / 2, 372);
  });

  // Course title — Instrument Serif italic 64px, cream, ≤2 lines.
  ctx.font = "italic 64px 'Instrument Serif', serif";
  ctx.fillStyle = "#F3E5C8";
  const titleLines = wrapLines(ctx, values.courseName || "Your masterclass", W - 220, 2);
  const lineHeight = 80;
  const titleTop = 540;
  titleLines.forEach((line, i) => ctx.fillText(line, W / 2, titleTop + i * lineHeight));

  // Champagne hairline divider.
  const dividerY = titleTop + (titleLines.length - 1) * lineHeight + 62;
  ctx.strokeStyle = "rgba(242, 224, 191, 0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 64, dividerY);
  ctx.lineTo(W / 2 + 64, dividerY);
  ctx.stroke();

  // Student name — Inter 600 44px, warm white.
  const name = values.studentName?.trim();
  if (name) {
    ctx.font = "600 44px 'Inter', sans-serif";
    ctx.fillStyle = "#F7F4EC";
    ctx.fillText(name, W / 2, dividerY + 100);
  }

  // Wordmark — bottom-centre.
  ctx.font = "italic 44px 'Instrument Serif', serif";
  ctx.fillStyle = "#F2E0BF";
  ctx.fillText("LevelUp", W / 2, H - 148);
  ctx.font = "500 20px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#A6A6AA";
  withLetterSpacing(ctx, "0.32em", () => {
    ctx.fillText("LEARNING", W / 2, H - 108);
  });

  return canvasToPngBlob(canvas);
}

// ────────────────────────────────────────────────────────────────────────────
// Share delivery (P4-T6)
//
// Reuses InvoiceDetailSheet's mechanism: hand a File to the OS/Web share sheet
// via navigator.share (the only reliable file-share path inside the iOS/Android
// Capacitor WebView, and native on web where supported). When no File-share
// surface exists we fall to @capacitor/share on native (sharing the hosted
// image URL + text through the system sheet). If nothing is available we return
// "unavailable" so the caller can open the intent-link menu.
// ────────────────────────────────────────────────────────────────────────────

interface SharePlugin {
  share(options: { title?: string; text?: string; url?: string; files?: string[] }): Promise<unknown>;
}

// Resolve the native Share plugin the same way haptics.ts resolves its plugin:
// the bridge proxy first (works inside the WebView regardless of bundling), a
// Vite-visible dynamic import as the fallback.
const loadShare = async (): Promise<SharePlugin | null> => {
  const cap =
    typeof window !== "undefined"
      ? (window as unknown as { Capacitor?: { Plugins?: { Share?: SharePlugin } } }).Capacitor
      : undefined;
  const proxy = cap?.Plugins?.Share;
  if (proxy) return proxy;
  try {
    const mod = (await import("@capacitor/share")) as { Share?: SharePlugin };
    return mod?.Share ?? null;
  } catch {
    return null;
  }
};

const isShareCancel = (e: unknown): boolean => {
  const err = e as { name?: string; message?: string } | undefined;
  if (err?.name === "AbortError") return true;
  return /cancel/i.test(err?.message ?? "");
};

export interface ShareCertificateOptions {
  blob: Blob;
  fileName: string;
  courseName: string;
  imageUrl: string;
}

export async function shareCertificateImage(
  opts: ShareCertificateOptions,
): Promise<"shared" | "cancelled" | "unavailable"> {
  const file = new File([opts.blob], opts.fileName, { type: "image/png" });
  const title = `${opts.courseName} — LevelUp certificate`;
  const text = `I just completed ${opts.courseName} on LevelUp.`;

  // 1. File-based Web Share (invoice mechanism) — native on device + web.
  const navAny = navigator as Navigator & {
    canShare?: (data?: unknown) => boolean;
    share?: (data?: unknown) => Promise<void>;
  };
  if (typeof navAny.canShare === "function" && typeof navAny.share === "function" && navAny.canShare({ files: [file] })) {
    try {
      await navAny.share({ files: [file], title, text });
      return "shared";
    } catch (e) {
      if (isShareCancel(e)) return "cancelled";
      /* otherwise fall through to the native plugin / menu */
    }
  }

  // 2. Native fallback — the @capacitor/share sheet with the hosted image URL.
  if (isNative()) {
    const Share = await loadShare();
    if (Share) {
      try {
        await Share.share({ title, text, url: opts.imageUrl });
        return "shared";
      } catch (e) {
        if (isShareCancel(e)) return "cancelled";
      }
    }
  }

  return "unavailable";
}
