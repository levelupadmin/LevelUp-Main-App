/**
 * Build a polished PDF of the docs Flows tab.
 *
 * Layout (per flow):
 *   • Cover page: brand wordmark + "LevelUp Main App - Flows" title + generated date
 *   • One flow per section, sections separated by a flow-title page
 *   • For each step: title (H2) + description (wrapped prose) + screenshot
 *     (centered, scaled to fit, full-width on landscape; falls back to a
 *     bordered placeholder when no screenshot exists)
 *
 * Implementation notes:
 *   - jsPDF only. No html2canvas. We load each screenshot URL into an
 *     <img>, draw it to a canvas, then read the dataURL, fast + clean.
 *   - Footer on every content page: "<flow title> · page n of N".
 *   - Portrait A4 (595×842 pt). 50pt margins. Cream + indigo accent
 *     swatches keep the brand consistent with the in-app UI.
 *   - Single PDF; downloads in the user's browser.
 */
import { jsPDF } from "jspdf";
import type { Flow, FlowStep } from "./types";

const A4 = { w: 595, h: 842 };
const M = 50;                              // page margin
const CONTENT_W = A4.w - 2 * M;            // 495
const CONTENT_H = A4.h - 2 * M;            // 742

// Brand colors (matched to /admin/docs styling)
const CREAM = [232, 220, 199] as [number, number, number];
const INK   = [240, 240, 240] as [number, number, number];
const MUTED = [160, 160, 160] as [number, number, number];
const DIM   = [110, 110, 110] as [number, number, number];
const BG    = [16, 16, 18] as [number, number, number];   // canvas
const BG2   = [30, 30, 34] as [number, number, number];   // surface-2
const AMBER = [200, 145, 47] as [number, number, number];
const EMERALD = [76, 190, 132] as [number, number, number];
const ROSE = [228, 99, 110] as [number, number, number];

/** Load an image URL into a data-URL via canvas. */
function loadImageAsDataUrl(url: string, maxW = 1400): Promise<{ data: string; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const ratio = img.height / img.width;
        const targetW = Math.min(img.width, maxW);
        const targetH = Math.round(targetW * ratio);
        const c = document.createElement("canvas");
        c.width = targetW;
        c.height = targetH;
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve({ data: c.toDataURL("image/jpeg", 0.85), w: targetW, h: targetH });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function audienceColor(a: Flow["audience"]) {
  switch (a) {
    case "student":    return CREAM;
    case "admin":      return AMBER;
    case "instructor": return EMERALD;
    case "marketing":  return ROSE;
    default:           return INK;
  }
}

function fillBackground(doc: jsPDF) {
  doc.setFillColor(BG[0], BG[1], BG[2]);
  doc.rect(0, 0, A4.w, A4.h, "F");
}

function setMono(doc: jsPDF) { doc.setFont("courier", "normal"); }
function setSans(doc: jsPDF) { doc.setFont("helvetica", "normal"); }
function setSansBold(doc: jsPDF) { doc.setFont("helvetica", "bold"); }
function setSansItalic(doc: jsPDF) { doc.setFont("helvetica", "italic"); }

function footer(doc: jsPDF, flowTitle: string, page: number, total: number) {
  setMono(doc);
  doc.setFontSize(8);
  doc.setTextColor(DIM[0], DIM[1], DIM[2]);
  doc.text(`${flowTitle.toUpperCase()} · ${page} / ${total}`, M, A4.h - 24);
  doc.text("LEVELUP MAIN APP · DOCS", A4.w - M, A4.h - 24, { align: "right" });
}

function drawCover(doc: jsPDF, flowCount: number, stepCount: number) {
  fillBackground(doc);
  // Big cream wordmark
  setSansBold(doc);
  doc.setFontSize(48);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text("Level", M, 280);
  doc.setTextColor(CREAM[0], CREAM[1], CREAM[2]);
  setSansItalic(doc);
  doc.text("Up", M + 130, 280);

  setMono(doc);
  doc.setFontSize(11);
  doc.setTextColor(CREAM[0], CREAM[1], CREAM[2]);
  doc.text("THE LEVELUP MAIN APP · USER FLOWS", M, 330);

  setSansBold(doc);
  doc.setFontSize(36);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  const heroLines = doc.splitTextToSize("Every screen, every step,\nevery persona.", CONTENT_W);
  doc.text(heroLines, M, 400);

  setSans(doc);
  doc.setFontSize(11);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  const summary = doc.splitTextToSize(
    `Comprehensive walkthrough of ${flowCount} flows across ${stepCount} steps. Screenshots captured live from the running application. Generated ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`,
    CONTENT_W,
  );
  doc.text(summary, M, 510);

  // Bottom strip
  setMono(doc);
  doc.setFontSize(9);
  doc.setTextColor(DIM[0], DIM[1], DIM[2]);
  doc.text("Generated from /admin/docs · Single source of truth for every feature", M, A4.h - M);
}

function drawFlowTitlePage(doc: jsPDF, flow: Flow) {
  fillBackground(doc);

  // Persona pill at top
  const pillColor = audienceColor(flow.audience);
  setMono(doc);
  doc.setFontSize(9);
  doc.setTextColor(pillColor[0], pillColor[1], pillColor[2]);
  doc.text(flow.audience.toUpperCase(), M, M + 20);

  // Title
  setSansBold(doc);
  doc.setFontSize(32);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  const titleLines = doc.splitTextToSize(flow.title, CONTENT_W);
  doc.text(titleLines, M, M + 70);

  // Summary
  setSans(doc);
  doc.setFontSize(12);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  const summaryLines = doc.splitTextToSize(flow.summary, CONTENT_W);
  doc.text(summaryLines, M, M + 70 + titleLines.length * 36 + 30);

  // Step list
  setMono(doc);
  doc.setFontSize(9);
  doc.setTextColor(CREAM[0], CREAM[1], CREAM[2]);
  doc.text(`${flow.steps.length} STEPS`, M, A4.h - M - 200);

  setSans(doc);
  doc.setFontSize(11);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  let y = A4.h - M - 180;
  flow.steps.forEach((s, i) => {
    if (y > A4.h - M - 20) return;
    const text = `${i + 1}.  ${s.title}`;
    const lines = doc.splitTextToSize(text, CONTENT_W);
    doc.text(lines[0], M, y);
    y += 18;
  });
}

async function drawStepPage(doc: jsPDF, flow: Flow, step: FlowStep, stepIdx: number, totalSteps: number, device: "desktop" | "mobile") {
  fillBackground(doc);

  // Step counter
  setMono(doc);
  doc.setFontSize(9);
  doc.setTextColor(CREAM[0], CREAM[1], CREAM[2]);
  doc.text(`STEP ${stepIdx + 1} OF ${totalSteps}`, M, M + 20);

  // Step title
  setSansBold(doc);
  doc.setFontSize(20);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  const titleLines = doc.splitTextToSize(step.title, CONTENT_W);
  doc.text(titleLines, M, M + 50);
  let y = M + 50 + titleLines.length * 22 + 14;

  // Description
  setSans(doc);
  doc.setFontSize(10.5);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  const descLines = doc.splitTextToSize(step.description, CONTENT_W);
  // Cap description height to 180pt so we always have room for the screenshot
  const maxDescLines = 14;
  const trimmedDesc = descLines.slice(0, maxDescLines);
  doc.text(trimmedDesc, M, y);
  y += trimmedDesc.length * 14 + 24;

  // Screenshot
  const src = device === "mobile" ? step.screenshot?.mobile : step.screenshot?.desktop;
  if (src) {
    const img = await loadImageAsDataUrl(src);
    if (img) {
      const ratio = img.h / img.w;
      let drawW = CONTENT_W;
      let drawH = drawW * ratio;
      // Cap so screenshot fits below the description
      const maxH = A4.h - y - M - 30;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH / ratio;
      }
      // Cap mobile screenshots narrower (don't stretch tiny phone shots)
      if (device === "mobile") {
        const maxMobileW = 280;
        if (drawW > maxMobileW) {
          drawW = maxMobileW;
          drawH = drawW * ratio;
          if (drawH > maxH) {
            drawH = maxH;
            drawW = drawH / ratio;
          }
        }
      }
      const x = M + (CONTENT_W - drawW) / 2;
      // Subtle rounded background card behind the screenshot
      doc.setFillColor(BG2[0], BG2[1], BG2[2]);
      doc.roundedRect(x - 6, y - 6, drawW + 12, drawH + 12, 8, 8, "F");
      doc.addImage(img.data, "JPEG", x, y, drawW, drawH);
    } else {
      // Image failed to load
      drawPlaceholder(doc, M, y, CONTENT_W, A4.h - y - M - 30, "Screenshot failed to load");
    }
  } else if (step.screenshot?.placeholder) {
    drawPlaceholder(doc, M, y, CONTENT_W, A4.h - y - M - 30, step.screenshot.placeholder);
  }

  footer(doc, flow.title, stepIdx + 1, totalSteps);
}

function drawPlaceholder(doc: jsPDF, x: number, y: number, w: number, h: number, text: string) {
  const capped = Math.min(h, 200);
  doc.setDrawColor(80, 80, 84);
  doc.setLineDashPattern([4, 4], 0);
  doc.roundedRect(x, y, w, capped, 8, 8);
  doc.setLineDashPattern([], 0);
  setMono(doc);
  doc.setFontSize(8);
  doc.setTextColor(DIM[0], DIM[1], DIM[2]);
  doc.text("PLACEHOLDER", x + w / 2, y + capped / 2 - 6, { align: "center" });
  setSans(doc);
  doc.setFontSize(10);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  const lines = doc.splitTextToSize(text, w - 20);
  doc.text(lines.slice(0, 3), x + w / 2, y + capped / 2 + 10, { align: "center" });
}

export async function buildFlowsPdf(
  flows: Flow[],
  opts: { device?: "desktop" | "mobile" } = {},
): Promise<Blob> {
  const device = opts.device ?? "desktop";
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });

  // Cover
  const totalSteps = flows.reduce((s, f) => s + f.steps.length, 0);
  drawCover(doc, flows.length, totalSteps);

  for (const flow of flows) {
    // Flow title page
    doc.addPage();
    drawFlowTitlePage(doc, flow);

    // One page per step
    for (let i = 0; i < flow.steps.length; i++) {
      doc.addPage();
      await drawStepPage(doc, flow, flow.steps[i], i, flow.steps.length, device);
    }
  }

  return doc.output("blob");
}

export async function downloadFlowsPdf(
  flows: Flow[],
  device: "desktop" | "mobile" = "desktop",
) {
  const blob = await buildFlowsPdf(flows, { device });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `levelup-flows-${device}-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
