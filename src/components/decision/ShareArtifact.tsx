import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clapperboard, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { hapticImpact, hapticNotification } from "@/lib/haptics";
import { isNative } from "@/lib/platform";
import { DECISION_FLOW, flag } from "@/lib/flags";
import { useDecision } from "@/hooks/useDecision";
import { durations, easings, instant, useMotionSafe } from "@/lib/motion";
import {
  ARTIFACT_BUDGET_POLL_MS,
  ARTIFACT_CAPTURE_DEFER_MS,
  ARTIFACT_CAPTURE_IDLE_TIMEOUT_MS,
  ARTIFACT_CAPTURE_SLACK_MS,
  ARTIFACT_CLIP_MS,
  ARTIFACT_COPY,
  ARTIFACT_HEIGHT,
  ARTIFACT_HOLD_MS,
  ARTIFACT_MIME_CANDIDATES,
  ARTIFACT_URL_REVOKE_DELAY_MS,
  ARTIFACT_WIDTH,
  REVEAL_SETTLED_MS,
  admissionFileName,
  admissionFrameAt,
  admissionShareText,
  canRenderArtifact,
  captureDimensions,
  describeDelivery,
  layoutAdmissionCard,
  orderShareAssets,
  pickCaptureProfile,
  pickRecorderMimeType,
  planDelivery,
  resolveArtifactPalette,
  withinBudget,
  type AdmissionFields,
  type AdmissionLayout,
  type ArtifactKind,
  type ArtifactPalette,
  type CaptureProfile,
  type DeliveryMethod,
  type DeviceHints,
  type RevealStageKey,
  type StageState,
  type TextBlock,
} from "@/lib/artifact/renderAdmission";

/**
 * ShareArtifact — the shareable admission artifact (phase DC, task D-2 ·
 * REQ-DEC-3).
 *
 * Delivery contract:
 *  - **PNG floor, always.** The still is rendered and handed to the user first,
 *    and it is what every "share" CTA carries: Instagram Stories and LinkedIn,
 *    the two surfaces the brief names, both reject WebM. The clip is a separate,
 *    explicitly labelled action, so which asset a tap yields never depends on
 *    whether the encode happened to have finished.
 *  - **On-device WebM where supported**, started only after the PNG exists, held
 *    back until the celebration screen has given the main thread up, sized to
 *    what the device can actually encode, and abandoned — not merely stopped —
 *    the moment it would breach the 60s post-accept budget. RENDER-1 defers the
 *    server-rendered MP4; there is no worker to fall back to.
 *  - **Reduced motion → the still only.** We never encode a clip the user has
 *    asked not to be shown.
 *  - **Never a false success.** Delivery walks the mechanisms `planDelivery`
 *    says this runtime actually has, and reports success only for the one that
 *    returned. Where the plan is empty — the Capacitor Android shell, which has
 *    no Web Share API, no `DownloadListener`, and no `@capacitor/filesystem` to
 *    mint the `file://` URL `@capacitor/share` would need — the applicant is
 *    told plainly instead of being handed an empty share sheet.
 *
 * NFR-COPY-1: everything painted here comes from `useDecision`'s four structured
 * fields — name, cohort, craft, city. The component takes an application id and
 * nothing else, so there is no prop through which free-text could ever be handed
 * in, and it adds no read of its own: `useDecision` is a react-query hook, so a
 * parent that already called it shares the same cached row.
 *
 * The OS share path deliberately MIRRORS `certificate-generator.ts`'s mechanism
 * (the `navigator.share` File path) rather than importing it: that module's
 * signature is certificate-shaped (`courseName` + a hosted `imageUrl`) and
 * cannot carry a locally-generated WebM, and widening it would ripple into the
 * certificates surface. Its `@capacitor/share` branch is deliberately NOT
 * mirrored — it works only because it passes a HOSTED `imageUrl`, and a
 * locally-rendered artifact has none.
 *
 * INTEGRATION — this component has no importer inside task D-2's file scope.
 * The surface it belongs on is the acceptance card (`AcceptanceCard.tsx`, task
 * D-3), so the integration pass must mount it there as
 * `<ShareArtifact applicationId={applicationId} />` behind the same
 * `VITE_DECISION_FLOW` gate. Until that happens the D-2 acceptance criteria
 * ("PNG always produced", "WebM where supported within 60s") can only be
 * exercised through the pure module's tests, never end to end.
 */

export interface ShareArtifactProps {
  /**
   * `cohort_applications.id` — the same route param the reveal was opened with.
   * The verdict behind it is READ, never written (SOR-1); anything other than
   * `accepted` renders nothing, so a decline screen stays dignified and carries
   * no celebratory artifact.
   */
  applicationId: string | undefined;
  className?: string;
}

type ArtifactStatus = "idle" | "rendering" | "ready" | "failed";

interface RenderedAsset {
  blob: Blob;
  url: string;
  fileName: string;
  mimeType: string;
}

// ── Canvas painting ────────────────────────────────────────────────────────
// All of the geometry arrives pre-computed from renderAdmission.ts; the helpers
// below only turn numbers into pixels.

const monoFont = (px: number) => `500 ${px}px 'JetBrains Mono', monospace`;
const serifFont = (px: number) => `italic ${px}px 'Instrument Serif', serif`;
const sansFont = (px: number) => `600 ${px}px 'Inter', sans-serif`;

/** Preload the brand faces, or the canvas paints system fallbacks (mirrors the
 *  certificate card's `ensureShareCardFonts`). Failure is non-fatal. */
async function ensureArtifactFonts(): Promise<void> {
  try {
    const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      await Promise.all([
        fonts.load(monoFont(26)),
        fonts.load(monoFont(24)),
        fonts.load(serifFont(116)),
        fonts.load(serifFont(42)),
        fonts.load(sansFont(62)),
      ]);
    }
    if (fonts?.ready) await fonts.ready;
  } catch {
    /* Fonts failed to preload — the draw still proceeds with fallbacks. */
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load artifact layer"));
    img.src = src;
  });
}

/** Canvas has no letter-spacing in older engines; use it where present. */
function withLetterSpacing(ctx: CanvasRenderingContext2D, spacing: string, draw: () => void): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  const supported = "letterSpacing" in c;
  const prev = supported ? c.letterSpacing : undefined;
  if (supported) c.letterSpacing = spacing;
  draw();
  if (supported && prev !== undefined) c.letterSpacing = prev;
}

/**
 * The static bed — field colour plus the app's fractal grain — rasterized ONCE
 * and blitted at the top of every frame. Painting the grain per-frame is what
 * would make the capture loop stutter on an Android WebView.
 */
async function buildBaseLayer(palette: ArtifactPalette): Promise<HTMLCanvasElement> {
  const base = document.createElement("canvas");
  base.width = ARTIFACT_WIDTH;
  base.height = ARTIFACT_HEIGHT;
  const ctx = base.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = palette.field;
  ctx.fillRect(0, 0, ARTIFACT_WIDTH, ARTIFACT_HEIGHT);
  try {
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${ARTIFACT_WIDTH}' height='${ARTIFACT_HEIGHT}'>` +
      `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter>` +
      `<rect width='100%' height='100%' filter='url(#n)'/></svg>`;
    const grain = await loadImage(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.drawImage(grain, 0, 0, ARTIFACT_WIDTH, ARTIFACT_HEIGHT);
    ctx.restore();
  } catch {
    /* Grain is decorative; a clean field is a perfectly good card. */
  }
  return base;
}

function paintBlock(
  ctx: CanvasRenderingContext2D,
  block: TextBlock | null,
  state: StageState,
  font: (px: number) => string,
  color: string,
): void {
  if (!block || block.lines.length === 0 || state.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = state.opacity;
  ctx.fillStyle = color;
  ctx.font = font(block.fontPx);
  withLetterSpacing(ctx, `${block.trackingEm}em`, () => {
    block.lines.forEach((line, i) => {
      ctx.fillText(
        line,
        ARTIFACT_WIDTH / 2,
        block.firstBaseline + i * block.lineHeightPx + state.translateY,
      );
    });
  });
  ctx.restore();
}

/** Strength of the champagne bloom over the field, at full reveal. */
const GLOW_ALPHA = 0.16;

/**
 * Build the settled bed: the field, the grain and the bloom at full strength,
 * rasterized once at the TARGET pixel size. The bloom reaches full opacity 700ms
 * into a 3.5s clip, so most frames can blit this single layer instead of blitting
 * the base and then filling the whole canvas with a gradient again.
 */
function buildGlowBed(
  base: HTMLCanvasElement,
  layout: AdmissionLayout,
  palette: ArtifactPalette,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  try {
    const bed = document.createElement("canvas");
    bed.width = width;
    bed.height = height;
    const ctx = bed.getContext("2d");
    if (!ctx) return null;
    const scale = width / ARTIFACT_WIDTH;
    if (scale !== 1) ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(base, 0, 0, ARTIFACT_WIDTH, ARTIFACT_HEIGHT);
    const { cx, cy, radius } = layout.glow;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, palette.glow);
    gradient.addColorStop(1, palette.field);
    ctx.globalAlpha = GLOW_ALPHA;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, ARTIFACT_WIDTH, ARTIFACT_HEIGHT);
    return bed;
  } catch {
    /* Decorative layer; the per-frame path below is a perfectly good fallback. */
    return null;
  }
}

/**
 * Everything one paint needs, resolved ONCE.
 *
 * The champagne bloom's geometry never changes across the reveal, so its
 * gradient is built here rather than inside the frame loop, which was allocating
 * a new gradient and filling the whole canvas with it 30 times a second on the
 * same thread that drives the celebration screen. Once the bloom has settled the
 * loop stops filling altogether and blits `glowBed` instead.
 *
 * `scale` lets a constrained device capture a smaller frame while the layout
 * stays in 1080-space arithmetic — the transform is set once and every baseline,
 * font size and rule width comes along with it.
 */
interface ArtifactPainter {
  ctx: CanvasRenderingContext2D;
  base: HTMLCanvasElement;
  layout: AdmissionLayout;
  palette: ArtifactPalette;
  glow: CanvasGradient | null;
  glowBed: HTMLCanvasElement | null;
}

function createPainter(
  ctx: CanvasRenderingContext2D,
  base: HTMLCanvasElement,
  layout: AdmissionLayout,
  palette: ArtifactPalette,
  opts: { target?: { width: number; height: number }; precomposeGlow?: boolean } = {},
): ArtifactPainter {
  const target = opts.target ?? { width: ARTIFACT_WIDTH, height: ARTIFACT_HEIGHT };
  const scale = target.width / ARTIFACT_WIDTH;
  if (scale !== 1) ctx.setTransform(scale, 0, 0, scale, 0, 0);
  let glow: CanvasGradient | null = null;
  try {
    const { cx, cy, radius } = layout.glow;
    glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    glow.addColorStop(0, palette.glow);
    glow.addColorStop(1, palette.field);
  } catch {
    /* Gradient unsupported/degenerate — the bloom is decorative, skip it. */
  }
  // Only the capture pays for the extra layer: a single still would spend a
  // whole canvas to save one gradient fill it makes exactly once.
  const glowBed = opts.precomposeGlow
    ? buildGlowBed(base, layout, palette, target.width, target.height)
    : null;
  return { ctx, base, layout, palette, glow, glowBed };
}

/** Paint one frame of the reveal. */
function paintAdmissionFrame(
  painter: ArtifactPainter,
  frame: Record<RevealStageKey, StageState>,
): void {
  const { ctx, base, layout, palette } = painter;
  ctx.globalAlpha = 1;

  if (painter.glowBed && frame.glow.opacity >= 1) {
    // Settled bloom: one 1:1 blit, no gradient fill. Drawn in DEVICE space (the
    // bed is already at the canvas's own pixel size) so it never resamples.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(painter.glowBed, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(base, 0, 0, ARTIFACT_WIDTH, ARTIFACT_HEIGHT);
    // Champagne bloom behind the composition, still fading in.
    if (painter.glow && frame.glow.opacity > 0) {
      ctx.save();
      ctx.globalAlpha = GLOW_ALPHA * frame.glow.opacity;
      ctx.fillStyle = painter.glow;
      ctx.fillRect(0, 0, ARTIFACT_WIDTH, ARTIFACT_HEIGHT);
      ctx.restore();
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  paintBlock(ctx, layout.eyebrow, frame.eyebrow, monoFont, palette.muted);
  paintBlock(ctx, layout.headline, frame.headline, serifFont, palette.cream);
  paintBlock(ctx, layout.name, frame.name, sansFont, palette.foreground);

  // Champagne hairline, drawn out from the centre.
  if (frame.rule.progress > 0) {
    ctx.save();
    ctx.globalAlpha = 0.55 * frame.rule.opacity;
    ctx.strokeStyle = palette.gold;
    ctx.lineWidth = 2;
    const half = layout.rule.halfWidth * frame.rule.progress;
    ctx.beginPath();
    ctx.moveTo(ARTIFACT_WIDTH / 2 - half, layout.rule.y);
    ctx.lineTo(ARTIFACT_WIDTH / 2 + half, layout.rule.y);
    ctx.stroke();
    ctx.restore();
  }

  paintBlock(ctx, layout.cohort, frame.cohort, serifFont, palette.cream);
  paintBlock(ctx, layout.meta, frame.meta, monoFont, palette.muted);

  // Wordmark — pinned to the footer band.
  ctx.save();
  ctx.globalAlpha = frame.wordmark.opacity;
  ctx.fillStyle = palette.cream;
  ctx.font = serifFont(layout.wordmark.markFontPx);
  ctx.fillText(ARTIFACT_COPY.wordmark, ARTIFACT_WIDTH / 2, layout.wordmark.markBaseline);
  ctx.fillStyle = palette.muted;
  ctx.font = monoFont(layout.wordmark.subFontPx);
  withLetterSpacing(ctx, "0.32em", () => {
    ctx.fillText(ARTIFACT_COPY.wordmarkSub, ARTIFACT_WIDTH / 2, layout.wordmark.subBaseline);
  });
  ctx.restore();
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to render admission card"))),
      "image/png",
      1.0,
    );
  });
}

/** Read a design token off the document root for the canvas palette. */
function readToken(token: string): string | undefined {
  if (typeof window === "undefined" || !window.getComputedStyle) return undefined;
  return window.getComputedStyle(document.documentElement).getPropertyValue(token);
}

// ── Recording ──────────────────────────────────────────────────────────────

interface RecorderCtor {
  new (stream: MediaStream, options?: { mimeType?: string; videoBitsPerSecond?: number }): MediaRecorder;
  isTypeSupported(mimeType: string): boolean;
}

/** The platform's MediaRecorder, or null where the WebView has none. */
function getRecorderCtor(): RecorderCtor | null {
  const ctor = (window as unknown as { MediaRecorder?: RecorderCtor }).MediaRecorder;
  return typeof ctor === "function" && typeof ctor.isTypeSupported === "function" ? ctor : null;
}

/** What this runtime will admit about the hardware it is encoding on. */
function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
  };
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Hold the encoder back until the celebration screen has finished with the main
 * thread: a fixed delay, then the first idle slot (bounded, so a permanently
 * busy thread still gets its clip). Resolves immediately on abort, so an
 * unmount never waits out the delay before tearing down.
 */
function waitForCaptureSlot(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const view = window as IdleWindow;
    let timer = 0;
    let idle = 0;
    const finish = () => {
      window.clearTimeout(timer);
      if (idle && view.cancelIdleCallback) view.cancelIdleCallback(idle);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    signal.addEventListener("abort", finish);
    timer = window.setTimeout(() => {
      if (typeof view.requestIdleCallback === "function") {
        idle = view.requestIdleCallback(finish, { timeout: ARTIFACT_CAPTURE_IDLE_TIMEOUT_MS });
      } else {
        finish();
      }
    }, ARTIFACT_CAPTURE_DEFER_MS);
  });
}

/**
 * Drive the capture window and resolve exactly once, whichever of these lands
 * first: the clip finishing, the 60s budget running out, the view going away,
 * or the WebView being backgrounded.
 *
 * The rAF loop paints; it does NOT own the stop. A backgrounded Android WebView
 * throttles `requestAnimationFrame` to zero, so a loop-only design simply stops
 * ticking — the budget is never re-checked, the promise never resolves, and the
 * recorder and its capture-stream track stay live until the app is foregrounded
 * again, minutes outside the budget. The `setTimeout` backstop and the
 * `setInterval` watchdog both keep firing there, so the stop always happens.
 */
function awaitCaptureWindow(opts: {
  totalMs: number;
  /** `performance.now()` at the start of the whole 60s artifact budget. */
  startedAt: number;
  signal: AbortSignal;
  onFrame: (clipTimeMs: number) => void;
}): Promise<void> {
  return new Promise<void>((resolve) => {
    const clipStartedAt = performance.now();
    let raf: number | null = null;
    let backstop = 0;
    let watchdog = 0;
    let settled = false;

    function teardown() {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      window.clearTimeout(backstop);
      window.clearInterval(watchdog);
      opts.signal.removeEventListener("abort", finish);
      document.removeEventListener("visibilitychange", onVisibility);
    }

    function finish() {
      if (settled) return;
      settled = true;
      teardown();
      resolve();
    }

    function onVisibility() {
      // Hidden means rAF has stopped. Close the clip now and keep whatever has
      // already been encoded rather than leaving a live recorder behind.
      if (document.visibilityState === "hidden") finish();
    }

    function step() {
      raf = null;
      if (settled) return;
      const elapsed = performance.now() - clipStartedAt;
      opts.onFrame(Math.min(elapsed, ARTIFACT_CLIP_MS));
      if (elapsed >= opts.totalMs || !withinBudget(performance.now() - opts.startedAt)) {
        finish();
        return;
      }
      raf = requestAnimationFrame(step);
    }

    opts.signal.addEventListener("abort", finish);
    document.addEventListener("visibilitychange", onVisibility);
    backstop = window.setTimeout(finish, opts.totalMs + ARTIFACT_CAPTURE_SLACK_MS);
    watchdog = window.setInterval(() => {
      if (!withinBudget(performance.now() - opts.startedAt)) finish();
    }, ARTIFACT_BUDGET_POLL_MS);

    if (opts.signal.aborted) {
      finish();
      return;
    }
    step();
  });
}

/**
 * Encode the animated reveal on-device. Resolves to null on ANY problem — an
 * unsupported container, a recorder that errors mid-clip, an abort, or a budget
 * breach — because the PNG floor has already been delivered by the time this
 * runs. The recorder and the capture-stream track are released on every one of
 * those paths, not just the happy one.
 */
async function captureAdmissionWebm(opts: {
  base: HTMLCanvasElement;
  layout: AdmissionLayout;
  palette: ArtifactPalette;
  profile: CaptureProfile;
  startedAt: number;
  signal: AbortSignal;
}): Promise<{ blob: Blob; mimeType: string } | null> {
  const Recorder = getRecorderCtor();
  if (!Recorder) return null;

  const { width, height } = captureDimensions(opts.profile);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof canvas.captureStream !== "function") return null;

  const mimeType = pickRecorderMimeType(ARTIFACT_MIME_CANDIDATES, (type) =>
    Recorder.isTypeSupported(type),
  );
  if (!mimeType) return null;

  // Paint the opening frame before the stream starts so the clip never opens on
  // a transparent canvas.
  const painter = createPainter(ctx, opts.base, opts.layout, opts.palette, {
    target: { width, height },
    precomposeGlow: true,
  });
  paintAdmissionFrame(painter, admissionFrameAt(0));

  const stream = canvas.captureStream(opts.profile.fps);
  let recorder: MediaRecorder;
  try {
    recorder = new Recorder(stream, {
      mimeType,
      videoBitsPerSecond: opts.profile.videoBitsPerSecond,
    });
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    return null;
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  const finished = new Promise<Blob | null>((resolve) => {
    recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
    recorder.onerror = () => resolve(null);
  });

  // `stopped` gates the await below: `finished` only settles once the recorder
  // has actually been asked to stop, so awaiting it after a failed start (or a
  // recorder the platform already tore down) would hang forever.
  let stopped = false;
  // Once every beat has settled the composition is identical frame to frame, so
  // the hold tail repaints nothing: `captureStream` simply holds the last frame,
  // and the encoder gets ~27 free frames instead of 27 redundant full-canvas
  // redraws on the device least able to afford them.
  let settledPainted = false;
  try {
    recorder.start();
    await awaitCaptureWindow({
      totalMs: ARTIFACT_CLIP_MS + ARTIFACT_HOLD_MS,
      startedAt: opts.startedAt,
      signal: opts.signal,
      onFrame: (clipTimeMs) => {
        if (clipTimeMs >= REVEAL_SETTLED_MS) {
          if (settledPainted) return;
          settledPainted = true;
        }
        paintAdmissionFrame(painter, admissionFrameAt(clipTimeMs));
      },
    });
  } finally {
    try {
      if (recorder.state !== "inactive") {
        recorder.stop();
        stopped = true;
      }
    } catch {
      /* Platform already tore the recorder down; nothing left to stop. */
    }
    stream.getTracks().forEach((track) => track.stop());
  }

  if (!stopped) return null;
  const blob = await finished;
  if (opts.signal.aborted) return null;
  // The budget governs DELIVERY, not just the stop. A backgrounded Android
  // WebView suspends the whole JS context, so `onstop` can resolve minutes after
  // the watchdog asked the recorder to stop — and a clip surfaced then is
  // outside the 60s post-accept budget however promptly we stopped encoding it.
  if (!withinBudget(performance.now() - opts.startedAt)) return null;
  return blob && blob.size > 0 ? { blob, mimeType } : null;
}

// ── Share delivery ─────────────────────────────────────────────────────────
// One ladder, walked in the order `planDelivery` returns, where every rung is
// feature-detected BEFORE it is claimed and only a rung that returned counts as
// a delivery. There is no rung that opens a sheet carrying the caption alone.

const isShareCancel = (e: unknown): boolean => {
  const err = e as { name?: string; message?: string } | undefined;
  if (err?.name === "AbortError") return true;
  return /cancel/i.test(err?.message ?? "");
};

type ShareCapableNavigator = Navigator & {
  canShare?: (data?: unknown) => boolean;
  share?: (data?: unknown) => Promise<void>;
};

/** True only where the Web Share API will take THIS file. Android System WebView
 *  implements neither method, so this is false in the Capacitor Android shell. */
function canShareFile(file: File): boolean {
  const nav = navigator as ShareCapableNavigator;
  if (typeof nav.canShare !== "function" || typeof nav.share !== "function") return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

type ClipboardItemCtor = new (items: Record<string, Blob>) => ClipboardItem;

/**
 * The async-clipboard image path — the one mechanism the Android shell may still
 * have, and the reason it is worth walking to. That shell sets `FLAG_SECURE`
 * app-wide (`MainActivity.onCreate`, for Widevine L3), so the applicant cannot
 * even screenshot the card off the screen; without this rung there would be no
 * way at all to get the PNG out of the app. Strictly feature-detected, and a
 * rejected write counts as a failure, never a delivery.
 */
function clipboardImageCtor(): ClipboardItemCtor | null {
  const ctor = (window as unknown as { ClipboardItem?: ClipboardItemCtor }).ClipboardItem;
  if (typeof ctor !== "function") return null;
  return typeof navigator.clipboard?.write === "function" ? ctor : null;
}

type ActivationNavigator = Navigator & { userActivation?: { isActive?: boolean } };

/**
 * Whether a programmatic `<a download>` click can plausibly write a file HERE.
 *
 * A click that the engine ignores throws nothing, so "it did not throw" is not
 * evidence of a download — that is the false-success class this ladder exists to
 * avoid, and narrowing it to non-native runtimes did not remove it. Two things
 * are checkable and both matter:
 *
 *  - the `download` attribute exists at all (absent in some in-app webviews,
 *    where a blob anchor navigates or is dropped instead of saving);
 *  - the page still HAS transient activation. A download issued without it is
 *    blocked, and activation is exactly what an awaited `navigator.share`
 *    rejection earlier in the same plan consumes.
 *
 * Where `navigator.userActivation` is not implemented we cannot ask, so we do
 * not claim more than the attribute check gives us.
 */
function canDownloadBlob(): boolean {
  if (isNative()) return false;
  if (typeof document === "undefined") return false;
  if (!("download" in document.createElement("a"))) return false;
  return (navigator as ActivationNavigator).userActivation?.isActive !== false;
}

/** Blob download. Returns false rather than pretending — inside a Capacitor
 *  WebView the anchor click is a silent no-op, which is why `planDelivery` only
 *  offers this rung off-native, and the activation check above is re-run right
 *  before the click so a rung that consumed the gesture cannot claim this one. */
function downloadAsset(asset: RenderedAsset): boolean {
  if (!canDownloadBlob()) return false;
  try {
    const anchor = document.createElement("a");
    anchor.href = asset.url;
    anchor.download = asset.fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    return false;
  }
}

async function copyImageToClipboard(asset: RenderedAsset, Item: ClipboardItemCtor): Promise<boolean> {
  try {
    await navigator.clipboard.write([new Item({ [asset.mimeType]: asset.blob })]);
    return true;
  } catch {
    return false;
  }
}

interface DeliveryResult {
  status: "delivered" | "cancelled" | "unavailable";
  method?: DeliveryMethod;
  asset?: RenderedAsset;
}

/**
 * Hand `candidates[0]` over by the best mechanism this runtime has, falling to
 * the next candidate only when the first one has no mechanism at all. Returns
 * `"unavailable"` — never a false `"delivered"` — when nothing works.
 *
 * `allowShare: false` is how the Save CTA keeps its promise: it drops the share
 * rung so a "save" never opens a share sheet, and lands on the download (web) or
 * the clipboard (native) instead.
 */
async function deliverArtifact(
  candidates: RenderedAsset[],
  text: string,
  opts: { allowShare: boolean },
): Promise<DeliveryResult> {
  const title = "I'm in. LevelUp.";

  for (const asset of candidates) {
    const file = new File([asset.blob], asset.fileName, { type: asset.mimeType });
    const clipboardCtor = clipboardImageCtor();
    const plan = planDelivery({
      canShareFiles: opts.allowShare && canShareFile(file),
      canDownload: canDownloadBlob(),
      canCopyImage: clipboardCtor !== null,
      isImage: asset.mimeType.startsWith("image/"),
    });

    for (const method of plan) {
      if (method === "share-file") {
        // Bound rather than optional-chained: an absent `share` must not fall
        // through to a resolved promise and be reported as a delivery.
        const share = (navigator as ShareCapableNavigator).share;
        if (typeof share !== "function") continue;
        try {
          await share.call(navigator, { files: [file], title, text });
          return { status: "delivered", method, asset };
        } catch (e) {
          // A cancel is the applicant's choice, not a failure to deliver: stop
          // here rather than silently downloading a card they declined to share.
          if (isShareCancel(e)) return { status: "cancelled" };
        }
      } else if (method === "download") {
        if (downloadAsset(asset)) return { status: "delivered", method, asset };
      } else if (clipboardCtor && (await copyImageToClipboard(asset, clipboardCtor))) {
        return { status: "delivered", method, asset };
      }
    }
  }

  return { status: "unavailable" };
}

// ── Component ──────────────────────────────────────────────────────────────

const ShareArtifact = ({ applicationId, className }: ShareArtifactProps) => {
  const { reduced } = useMotionSafe();
  const { decision } = useDecision(applicationId);
  const eligible = canRenderArtifact({
    verdict: decision?.verdict,
    flagEnabled: flag(DECISION_FLOW),
  });

  const [status, setStatus] = useState<ArtifactStatus>("idle");
  const [still, setStill] = useState<RenderedAsset | null>(null);
  const [clip, setClip] = useState<RenderedAsset | null>(null);
  const [busy, setBusy] = useState(false);

  // The FOUR structured fields, and nothing else off the decision row. Held in a
  // memo keyed on the primitives so the render effect re-runs when a value
  // changes rather than on every new object identity react-query hands back.
  const name = decision?.name ?? "";
  const cohort = decision?.cohort ?? "";
  const craft = decision?.craft ?? null;
  const city = decision?.city ?? null;
  const stableFields = useMemo<AdmissionFields>(
    () => ({ name, cohort, craft, city }),
    [name, cohort, craft, city],
  );

  useEffect(() => {
    // Drop the previous render's assets FIRST. Their object URLs belong to the
    // run that is being replaced, and the `<img>` below paints `still.url`
    // unconditionally — leaving them mounted across a re-run (reduced motion
    // settling, `eligible` flapping, a field changing) would show a dead blob
    // URL for the whole async re-render, and hand a revoked URL to any share or
    // save tapped in that window.
    setStill(null);
    setClip(null);
    if (!eligible) {
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    const created: string[] = [];
    const startedAt = performance.now();
    setStatus("rendering");

    const run = async () => {
      let base: HTMLCanvasElement;
      let layout: AdmissionLayout;
      let palette: ArtifactPalette;

      // 1. The PNG floor — always produced, always first.
      try {
        await ensureArtifactFonts();
        if (controller.signal.aborted) return;
        palette = resolveArtifactPalette(readToken);
        layout = layoutAdmissionCard(stableFields);
        base = await buildBaseLayer(palette);
        const canvas = document.createElement("canvas");
        canvas.width = ARTIFACT_WIDTH;
        canvas.height = ARTIFACT_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported");
        paintAdmissionFrame(
          createPainter(ctx, base, layout, palette),
          admissionFrameAt(REVEAL_SETTLED_MS),
        );
        const blob = await canvasToPngBlob(canvas);
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        created.push(url);
        setStill({
          blob,
          url,
          fileName: admissionFileName(stableFields, "png"),
          mimeType: "image/png",
        });
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) setStatus("failed");
        return;
      }

      // 2. The WebM, best-effort. Skipped entirely under reduced motion.
      if (reduced || controller.signal.aborted) return;
      try {
        // The still is already in their hands; the clip yields to the
        // celebration screen before it takes the thread, and is sized to what
        // this device can encode rather than to a desktop budget.
        await waitForCaptureSlot(controller.signal);
        if (controller.signal.aborted) return;
        if (!withinBudget(performance.now() - startedAt)) return;
        const recorded = await captureAdmissionWebm({
          base,
          layout,
          palette,
          profile: pickCaptureProfile(readDeviceHints()),
          startedAt,
          signal: controller.signal,
        });
        if (controller.signal.aborted || !recorded) return;
        // Same budget, checked at the point of DELIVERY: a suspended WebView can
        // resolve the encode long after the stop, and a clip that appears then
        // is outside the 60s the brief promises.
        if (!withinBudget(performance.now() - startedAt)) return;
        const url = URL.createObjectURL(recorded.blob);
        created.push(url);
        setClip({
          blob: recorded.blob,
          url,
          fileName: admissionFileName(stableFields, "webm"),
          mimeType: recorded.mimeType,
        });
      } catch {
        /* The still already shipped — a missing clip is not a failure state. */
      }
    };

    void run();

    return () => {
      // Aborting stops the capture loop AND releases the recorder + stream (see
      // `captureAdmissionWebm`'s finally). The URLs are revoked on a delay, not
      // synchronously, so a share sheet or save already in flight still resolves
      // — the same grace `src/lib/invoice.ts` gives its invoice blob.
      controller.abort();
      window.setTimeout(() => {
        created.forEach((url) => URL.revokeObjectURL(url));
      }, ARTIFACT_URL_REVOKE_DELAY_MS);
    };
  }, [eligible, reduced, stableFields]);

  const deliver = useCallback(
    async (prefer: ArtifactKind, allowShare: boolean) => {
      const candidates = orderShareAssets({ still, clip }, prefer);
      if (candidates.length === 0 || busy) return;
      setBusy(true);
      void hapticImpact("light");
      try {
        const result = await deliverArtifact(candidates, admissionShareText(stableFields), {
          allowShare,
        });
        if (result.status === "delivered" && result.method) {
          void hapticNotification("success");
          // The substitution is carried by whichever rung delivered, not only by
          // the share: on a native shell the clip has NO mechanism at all, so
          // "Share clip" lands on the still via the clipboard — the one place
          // the applicant most needs to be told the clip did not go.
          const notice = describeDelivery({
            method: result.method,
            substituted: prefer === "clip" && result.asset !== candidates[0],
          });
          if (notice) toast.success(notice);
        } else if (result.status === "unavailable") {
          toast.error("This app cannot save files. Open your card in a browser to share it.");
        }
      } catch {
        toast.error("Could not share your card. Try again in a moment.");
      } finally {
        setBusy(false);
      }
    },
    [still, clip, busy, stableFields],
  );

  const handleShareStill = useCallback(() => void deliver("still", true), [deliver]);
  const handleShareClip = useCallback(() => void deliver("clip", true), [deliver]);
  const handleSave = useCallback(() => void deliver("still", false), [deliver]);

  if (!eligible) return null;

  const statusLine =
    status === "failed"
      ? "We could not build your card. Your seat is unaffected."
      : status !== "ready"
        ? "Making your card…"
        : clip
          ? "Still and motion versions ready"
          : "Ready to share";

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-surface p-4 sm:p-5",
        className,
      )}
      aria-label="Your admission card"
    >
      <div className="relative overflow-hidden rounded-xl bg-canvas">
        <div className="aspect-[4/5] w-full">
          {still ? (
            <motion.img
              key={still.url}
              src={still.url}
              alt={`${ARTIFACT_COPY.headline} ${name}, ${cohort}`}
              className="h-full w-full object-cover"
              initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reduced ? instant : { duration: durations.slow, ease: easings.out }}
            />
          ) : (
            <div
              className={cn(
                "h-full w-full bg-surface-2",
                status !== "failed" && "animate-pulse",
              )}
              aria-hidden
            />
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground" role="status">
        {statusLine}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {/* The PNG is what shares. Stories and LinkedIn refuse WebM, so the clip
            never rides this button — it gets its own, below, once it exists. */}
        <Button
          variant="champagne"
          size="lg"
          haptic={false}
          disabled={!still || busy}
          onClick={handleShareStill}
          className="flex-1 min-w-[10rem]"
        >
          <Share2 className="h-4 w-4" />
          Share my card
        </Button>
        {clip ? (
          <Button
            variant="outline"
            size="lg"
            haptic={false}
            disabled={busy}
            onClick={handleShareClip}
            className="min-h-[44px]"
          >
            <Clapperboard className="h-4 w-4" />
            Share clip
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="lg"
          haptic={false}
          disabled={!still || busy}
          onClick={handleSave}
          className="min-h-[44px]"
        >
          <Download className="h-4 w-4" />
          Save
        </Button>
      </div>
    </section>
  );
};

export default ShareArtifact;
