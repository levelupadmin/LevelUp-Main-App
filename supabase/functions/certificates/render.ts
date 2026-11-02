// Draws one certificate as a PDF: the uploaded design as the page, then each
// printed field on top. Pure (no network, no Supabase) so it can be tested
// with `deno run` against a local image.
//
// Positions are fractions of the design (0..1), so the same numbers drive the
// admin's live preview in the browser (src/lib/certificates.ts mirrors these
// types). A text field's `y` is the vertical centre of its line, placed the
// way CSS centres a `line-height: 1` box: baseline = centre + (ascent +
// descent) / 2, using the font's own metrics.
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import qrcode from "npm:qrcode-generator@1.4.4";

export type FieldKey = "name" | "date" | "number" | "line" | "verify" | "qr";
export type FontKey = "sans" | "sans-regular" | "serif" | "script" | "inter" | "inter-bold";

export interface DesignField {
  key: FieldKey;
  x: number;
  y: number;
  /** Text: font size as a fraction of the design's height. QR: side length. */
  size: number;
  color?: string;
  font?: FontKey;
  align?: "left" | "center" | "right";
  /** Fraction of the design's width; longer text shrinks to fit. */
  maxWidth?: number;
  upper?: boolean;
  prefix?: string;
}

export interface CertificateValues {
  name: string;
  date: string;
  number: string;
  line: string;
  verify: string;
  /** Full URL encoded in the QR code. */
  verifyUrl: string;
}

export const FONT_FILES: Record<FontKey, string> = {
  sans: "fonts/sans.ttf",
  "sans-regular": "fonts/sans-regular.ttf",
  serif: "fonts/serif.ttf",
  script: "fonts/script.ttf",
  inter: "fonts/inter.ttf",
  "inter-bold": "fonts/inter-bold.ttf",
};

export const FIELD_KEYS: FieldKey[] = ["name", "date", "number", "line", "verify", "qr"];
/** Distance between stacked lines, as a multiple of the font size. */
export const LINE_GAP = 1.4;
const FONT_KEYS = Object.keys(FONT_FILES) as FontKey[];

/** The bold face used for **marked** words inside a line. */
export function boldOf(font: FontKey): FontKey {
  if (font === "sans-regular") return "sans";
  if (font === "inter") return "inter-bold";
  return font;
}

/** Split "a **b** c" into [{text:"a ",bold:false},{text:"b",bold:true},{text:" c",bold:false}]. */
export function segments(line: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const parts = line.split("**");
  parts.forEach((text, i) => {
    if (text) out.push({ text, bold: i % 2 === 1 });
  });
  return out;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-02-01" → "February 2026" (month) or "1 February 2026" (day). */
export function formatBatchDate(iso: string, style: "month" | "day"): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return style === "day" && d ? `${d} ${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${y}`;
}

export const needsDates = (line: string) => /\{(start|end)\}/i.test(line);

/** Put the batch dates into the sentence. */
export function fillLine(line: string, period: { start: string | null; end: string | null; style: "month" | "day" }): string {
  return line
    .replace(/\{start\}/gi, period.start ? formatBatchDate(period.start, period.style) : "")
    .replace(/\{end\}/gi, period.end ? formatBatchDate(period.end, period.style) : "");
}

const clamp01 = (n: unknown, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;

/** Keep only well-formed fields; anything else in the stored JSON is dropped. */
export function cleanFields(raw: unknown): DesignField[] {
  if (!Array.isArray(raw)) return [];
  const out: DesignField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    if (!FIELD_KEYS.includes(f.key as FieldKey)) continue;
    const align = f.align === "left" || f.align === "right" ? f.align : "center";
    out.push({
      key: f.key as FieldKey,
      x: clamp01(f.x, 0.5),
      y: clamp01(f.y, 0.5),
      size: Math.min(0.5, Math.max(0.005, clamp01(f.size, 0.04))),
      color: typeof f.color === "string" && /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : "#111111",
      font: FONT_KEYS.includes(f.font as FontKey) ? (f.font as FontKey) : "sans",
      align,
      maxWidth: typeof f.maxWidth === "number" ? Math.min(1, Math.max(0.05, f.maxWidth)) : undefined,
      upper: f.upper === true,
      prefix: typeof f.prefix === "string" ? f.prefix.slice(0, 60) : undefined,
    });
  }
  return out;
}

function hexColor(hex: string | undefined) {
  const h = (hex ?? "#111111").replace("#", "");
  const n = parseInt(h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function textFor(field: DesignField, values: CertificateValues): string {
  const raw =
    field.key === "name" ? values.name
    : field.key === "date" ? values.date
    : field.key === "number" ? values.number
    : field.key === "line" ? values.line
    : field.key === "verify" ? values.verify
    : "";
  if (!(raw ?? "").trim()) return "";
  const text = `${field.prefix ?? ""}${raw}`.trim();
  return field.upper ? text.toUpperCase() : text;
}

const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

export async function renderCertificatePdf(opts: {
  image: Uint8Array;
  imageWidth: number;
  imageHeight: number;
  fields: DesignField[];
  values: CertificateValues;
  fonts: Partial<Record<FontKey, Uint8Array>>;
  title?: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  if (opts.title) doc.setTitle(opts.title);
  doc.setProducer("LevelUp Learning");
  doc.setCreator("LevelUp Learning");

  // A4 width on the long or short side, height from the design's own shape.
  const landscape = opts.imageWidth >= opts.imageHeight;
  const W = landscape ? 842 : 595;
  const H = (W * opts.imageHeight) / opts.imageWidth;
  const page = doc.addPage([W, H]);

  const img = isPng(opts.image) ? await doc.embedPng(opts.image) : await doc.embedJpg(opts.image);
  page.drawImage(img, { x: 0, y: 0, width: W, height: H });

  // deno-lint-ignore no-explicit-any
  const embedded = new Map<FontKey, { font: any; centreToBaseline: number }>();
  const fontFor = async (key: FontKey) => {
    const cached = embedded.get(key);
    if (cached) return cached;
    const bytes = opts.fonts[key] ?? opts.fonts.sans;
    if (!bytes) throw new Error(`font ${key} is missing`);
    const meta = fontkit.create(bytes);
    const centreToBaseline = (meta.ascent + meta.descent) / 2 / meta.unitsPerEm;
    const font = await doc.embedFont(bytes, { subset: true });
    const entry = { font, centreToBaseline };
    embedded.set(key, entry);
    return entry;
  };

  for (const field of opts.fields) {
    if (field.key === "qr") {
      if (!opts.values.verifyUrl) continue;
      const qr = qrcode(0, "M");
      qr.addData(opts.values.verifyUrl);
      qr.make();
      const n = qr.getModuleCount();
      const side = field.size * H;
      const cell = side / (n + 2);
      const left = field.x * W - side / 2;
      const top = H - field.y * H + side / 2;
      page.drawRectangle({ x: left, y: top - side, width: side, height: side, color: rgb(1, 1, 1) });
      const dark = hexColor(field.color === "#ffffff" ? "#111111" : field.color);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (!qr.isDark(r, c)) continue;
          page.drawRectangle({
            x: left + (c + 1) * cell,
            y: top - (r + 2) * cell,
            width: cell + 0.05,
            height: cell + 0.05,
            color: dark,
          });
        }
      }
      continue;
    }

    const text = textFor(field, opts.values);
    if (!text) continue;
    const regular = await fontFor(field.font ?? "sans");
    const bold = await fontFor(boldOf(field.font ?? "sans"));
    // Line breaks in the text (the batch sentence can be a short paragraph)
    // stack lines LINE_GAP apart; `y` is the centre of the whole block.
    // **marked** words print in the bold face.
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(segments);
    let size = field.size * H;
    const widthOf = (segs: { text: string; bold: boolean }[]) =>
      segs.reduce((w, sg) => w + (sg.bold ? bold : regular).font.widthOfTextAtSize(sg.text, size), 0);
    const widest = () => Math.max(...lines.map(widthOf));
    const max = field.maxWidth ? field.maxWidth * W : Infinity;
    while (widest() > max && size > 4) size *= 0.95;
    const anchor = field.x * W;
    const step = size * LINE_GAP;
    const firstCentre = H - field.y * H + ((lines.length - 1) * step) / 2;
    lines.forEach((segs, i) => {
      const width = widthOf(segs);
      let x = field.align === "left" ? anchor : field.align === "right" ? anchor - width : anchor - width / 2;
      const y = firstCentre - i * step - size * regular.centreToBaseline;
      for (const sg of segs) {
        const f = (sg.bold ? bold : regular).font;
        page.drawText(sg.text, { x, y, size, font: f, color: hexColor(field.color) });
        x += f.widthOfTextAtSize(sg.text, size);
      }
    });
  }

  return await doc.save();
}
