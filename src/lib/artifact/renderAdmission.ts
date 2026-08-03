/**
 * renderAdmission.ts — the pure geometry behind the shareable admission
 * artifact (phase DC, task D-2 · REQ-DEC-3).
 *
 * Everything here is arithmetic: sizes, baselines, wrap points, font fitting,
 * palette resolution and the reveal timeline. NOTHING in this module touches a
 * canvas, the DOM or the network, so the composition can be unit-tested headless
 * (`src/lib/__tests__/renderAdmission.test.ts`) while `ShareArtifact.tsx` stays a
 * thin painter that walks the layout this file returns.
 *
 * NFR-COPY-1 — the artifact is personalised from STRUCTURED fields only: the
 * applicant's name, the cohort, their craft and their city. The 100-word
 * application answer is never an input to this module (see `AdmissionFields`:
 * there is no field that could carry it) and therefore can never reach a pixel.
 *
 * RENDER-1 — v1 ships a PNG floor plus an on-device WebM. The constants below
 * (`ARTIFACT_BUDGET_MS`, `ARTIFACT_CLIP_MS`, `ARTIFACT_FPS`) are the contract the
 * component's capture loop honours; there is no server-rendered MP4 path.
 */

import { easings } from "@/lib/motion";

// ── Canvas geometry ────────────────────────────────────────────────────────
// 1080×1350 (4:5) — the same portrait frame the certificate share card uses
// (certificate-generator.ts:227). It posts full-bleed to a LinkedIn feed and
// letterboxes cleanly inside a 9:16 story, so one render serves both surfaces.
export const ARTIFACT_WIDTH = 1080;
export const ARTIFACT_HEIGHT = 1350;

/** Uniform safe inset. Story UI chrome eats the outer ~8%; keep type inside it. */
export const ARTIFACT_SAFE_INSET = 96;

/** Baseline of the "LevelUp" wordmark, measured up from the bottom edge. */
const WORDMARK_MARK_UP = 148;
/** Baseline of the "LEARNING" sub-wordmark, measured up from the bottom edge. */
const WORDMARK_SUB_UP = 108;
/** Top of the band reserved for the wordmark — content is centred above it. */
const FOOTER_BAND_UP = 200;

// ── Delivery budget ────────────────────────────────────────────────────────
/** The whole artifact (PNG floor + WebM where supported) must land inside 60s. */
export const ARTIFACT_BUDGET_MS = 60_000;
/** Frames per second for the on-device WebM capture. */
export const ARTIFACT_FPS = 30;
/** Length of the animated reveal — matches REQ-DEC-2's ≤2.6s on-screen reveal. */
export const ARTIFACT_CLIP_MS = 2600;
/** Extra tail after the reveal settles, so the clip does not cut on the last beat. */
export const ARTIFACT_HOLD_MS = 900;

/**
 * Grace added to the clip length before the wall-clock backstop fires.
 *
 * The capture loop is driven by `requestAnimationFrame`, which a backgrounded
 * Android WebView (or a hidden tab) throttles to ZERO. A timer therefore has to
 * own the stop as well, or a user who backgrounds the app mid-capture leaves a
 * live recorder and a live capture-stream track behind and the 60s budget below
 * is never consulted. The slack only exists so a merely SLOW device — where rAF
 * still ticks, just late — gets to finish its own clip rather than being cut off
 * a frame early by the backstop.
 */
export const ARTIFACT_CAPTURE_SLACK_MS = 1500;

/**
 * How often the budget watchdog re-checks `withinBudget`. Timer-driven, for the
 * same reason: `setInterval` still fires (clamped to ~1s) in a backgrounded
 * WebView, `requestAnimationFrame` does not.
 */
export const ARTIFACT_BUDGET_POLL_MS = 1000;

/**
 * How long a delivered object URL stays alive after the render that owns it is
 * replaced. Revoking synchronously in an effect cleanup kills the URL the
 * `<img>` is still pointing at (and the one a share in flight is holding), which
 * is why `src/lib/invoice.ts:207` defers its revoke the same way.
 */
export const ARTIFACT_URL_REVOKE_DELAY_MS = 15_000;

/**
 * WebM codecs in preference order; the first the recorder admits wins.
 *
 * VP8 leads deliberately. `isTypeSupported('video/webm;codecs=vp9')` answers
 * true in the Android System WebView, but hardware VP9 *encoders* are
 * effectively nonexistent on Android, so picking VP9 there hands a 3.5s
 * decorative clip to a real-time libvpx SOFTWARE encode on the same thread that
 * is painting the celebration. VP8 realtime is roughly 2-3x cheaper and every
 * surface that takes a WebM at all takes VP8. CLAUDE.md names Android WebView
 * compositing as the budget that matters; this is that budget.
 */
export const ARTIFACT_MIME_CANDIDATES = [
  "video/webm;codecs=vp8",
  "video/webm;codecs=vp9",
  "video/webm",
] as const;

// ── Capture cost ───────────────────────────────────────────────────────────

/**
 * How long the capture waits after the PNG lands before opening the encoder.
 *
 * The still is delivered on the celebration screen, where the reveal is still
 * settling and the applicant is reading. Opening a recorder into that frame is
 * the one moment we can most afford to skip: the brief's own edge case is "slow
 * device → PNG immediately, WebM when ready", and nothing about the clip is
 * urgent inside a 60s budget.
 */
export const ARTIFACT_CAPTURE_DEFER_MS = 700;

/** Upper bound on the idle slot the capture waits for after that delay. */
export const ARTIFACT_CAPTURE_IDLE_TIMEOUT_MS = 1500;

/** What the runtime will tell us about the device it is encoding on. */
export interface DeviceHints {
  /** `navigator.hardwareConcurrency`, or null where it is not reported. */
  hardwareConcurrency?: number | null;
  /** `navigator.deviceMemory` in GB (Chromium only), or null. */
  deviceMemory?: number | null;
}

/** How hard this device is allowed to work for a decorative clip. */
export interface CaptureProfile {
  /** Multiplier on the 1080×1350 frame for the CAPTURED canvas. */
  scale: number;
  /** Encoder target, sized for the scaled frame. */
  videoBitsPerSecond: number;
  /** Capture frame rate. */
  fps: number;
}

/**
 * Back the capture off on a constrained device.
 *
 * A 1080×1350 realtime encode at 6 Mbps is a desktop budget; on a midrange
 * Android it is a software encoder, a full-canvas blit and a full-canvas
 * gradient fill competing with the reveal for one thread. Scale and bitrate come
 * down together (bitrate roughly with pixel count) so the clip stays legible at
 * every tier rather than becoming a block-artefact smear at a size nobody asked
 * for.
 *
 * Unknown hints resolve to the MIDDLE tier, not the top one: a runtime that
 * reports neither core count nor memory is more likely an older WebView than a
 * workstation.
 */
export function pickCaptureProfile(hints: DeviceHints = {}): CaptureProfile {
  const cores = hints.hardwareConcurrency ?? null;
  const memory = hints.deviceMemory ?? null;
  if ((cores !== null && cores <= 4) || (memory !== null && memory <= 2)) {
    return { scale: 0.5, videoBitsPerSecond: 1_200_000, fps: 24 };
  }
  if (cores === null || cores <= 6 || (memory !== null && memory <= 4)) {
    return { scale: 0.75, videoBitsPerSecond: 2_400_000, fps: ARTIFACT_FPS };
  }
  return { scale: 1, videoBitsPerSecond: 3_600_000, fps: ARTIFACT_FPS };
}

/**
 * Pixel dimensions of the captured canvas for a profile. Both axes are forced
 * EVEN because block-based video encoders reject (or silently pad) odd
 * dimensions, and the layout is painted through a uniform scale transform, so
 * the composition is identical at every tier.
 */
export function captureDimensions(profile: CaptureProfile): { width: number; height: number } {
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  return {
    width: even(ARTIFACT_WIDTH * profile.scale),
    height: even(ARTIFACT_HEIGHT * profile.scale),
  };
}

// ── Inputs ─────────────────────────────────────────────────────────────────

/**
 * The ONLY personalisation this artifact accepts. Four structured columns, each
 * a short label — no free-text answer from the application form is modelled
 * here, by design (NFR-COPY-1).
 */
export interface AdmissionFields {
  /** Applicant's display name. */
  name: string;
  /** Cohort they were admitted to, e.g. "Creator Academy · Batch 04". */
  cohort: string;
  /** Their craft, e.g. "Filmmaking". Optional — the meta line adapts. */
  craft?: string | null;
  /** Their city, e.g. "Chennai". Optional — the meta line adapts. */
  city?: string | null;
}

/** The verdict value that unlocks the artifact. Read, never written (SOR-1). */
export const ADMITTED_VERDICT = "accepted";

/**
 * The artifact renders for an admitted applicant behind an enabled flag, and in
 * no other case. A rejected (or still-pending, or unknown) verdict returns false
 * so the celebratory surface can never appear on a dignified decline screen.
 */
export function canRenderArtifact(input: {
  verdict: string | null | undefined;
  flagEnabled: boolean;
}): boolean {
  if (!input.flagEnabled) return false;
  return (input.verdict ?? "").trim().toLowerCase() === ADMITTED_VERDICT;
}

// ── Text hygiene ───────────────────────────────────────────────────────────

/**
 * Replace C0/C1 control characters — which would otherwise draw as tofu on the
 * canvas — with spaces. Written as a scan rather than a regex because a literal
 * control range inside a regex trips eslint's `no-control-regex`.
 */
function stripControlChars(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    out += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? " " : char;
  }
  return out;
}

/**
 * Collapse a structured field to one drawable line: strip control characters,
 * collapse runs of whitespace, trim, and hard-cap the length so a pathological
 * value cannot blow the layout before font-fitting even runs.
 */
export function sanitizeField(value: string | null | undefined, maxChars = 80): string {
  if (!value) return "";
  return stripControlChars(value).replace(/\s+/g, " ").trim().slice(0, maxChars).trim();
}

/**
 * Comparison key for two structured labels: sanitized, generously capped (so a
 * per-line display cap cannot make two identical values look different) and
 * case-folded.
 */
function labelKey(value: string | null | undefined): string {
  return sanitizeField(value, 160).toLowerCase();
}

/**
 * The lower meta line: craft and city, upper-cased and separated by a middot.
 * Either side may be absent — a missing field simply drops out rather than
 * leaving a dangling separator.
 *
 * The craft is dropped when it is just the cohort again. `useDecision` defines
 * `craft` as `occupation || cohort`, so every applicant who left the occupation
 * blank — plus everyone whose answer the Tally fuzzy match missed, which
 * `supabase/functions/_shared/tally.ts` documents as a real and recurring class
 * — arrives here with `craft === cohort`. Without this the card prints the
 * cohort line and then an upper-cased echo of the same words directly beneath
 * it, on the surface the brief calls the most visible in the programme.
 */
export function buildMetaLine(
  fields: Pick<AdmissionFields, "craft" | "city"> & { cohort?: string | null },
): string {
  const craftEchoesCohort = labelKey(fields.craft) === labelKey(fields.cohort);
  return [craftEchoesCohort ? "" : sanitizeField(fields.craft, 32), sanitizeField(fields.city, 32)]
    .filter(Boolean)
    .map((part) => part.toUpperCase())
    .join(" · ");
}

/**
 * Average glyph advance as a fraction of the em, per brand face. These let the
 * module estimate a string's width WITHOUT a canvas `measureText`, which is what
 * keeps the layout unit-testable; the painter then draws at the size we picked.
 * Values are deliberately a touch generous so the estimate errs toward "too
 * wide" and text stays inside the safe inset rather than kissing it.
 */
export const GLYPH_RATIO = {
  /** Instrument Serif italic — narrow, high-contrast display face. */
  serif: 0.44,
  /** Inter 500/600 — the name and body face. */
  sans: 0.56,
  /** JetBrains Mono — fixed pitch, used for the tracked eyebrow/meta lines. */
  mono: 0.62,
} as const;

/** Metrics needed to estimate a run of text at a given size. */
export interface TextMetricsInput {
  fontPx: number;
  ratio: number;
  /** Extra letter-spacing in em, matching the canvas `letterSpacing` we set. */
  trackingEm?: number;
}

/** Estimated drawn width of `text`, in px. */
export function estimateTextWidth(text: string, metrics: TextMetricsInput): number {
  const perGlyph = metrics.ratio + (metrics.trackingEm ?? 0);
  return text.length * metrics.fontPx * perGlyph;
}

/**
 * Largest integer font size at which `text` fits `maxWidth` on one line,
 * clamped to [minFontPx, maxFontPx]. Returning the clamp floor (rather than
 * shrinking without limit) is what tells the caller to wrap or ellipsize.
 */
export function fitFontSize(
  text: string,
  opts: { maxWidth: number; maxFontPx: number; minFontPx: number; ratio: number; trackingEm?: number },
): number {
  const perGlyph = opts.ratio + (opts.trackingEm ?? 0);
  const span = text.length * perGlyph;
  if (span <= 0) return opts.maxFontPx;
  const ideal = Math.floor(opts.maxWidth / span);
  return Math.max(opts.minFontPx, Math.min(opts.maxFontPx, ideal));
}

/** Trim `text` until it fits `maxWidth`, appending an ellipsis when it had to. */
export function ellipsizeToWidth(text: string, metrics: TextMetricsInput & { maxWidth: number }): string {
  if (estimateTextWidth(text, metrics) <= metrics.maxWidth) return text;
  let out = text;
  while (out.length > 1 && estimateTextWidth(`${out}…`, metrics) > metrics.maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.replace(/\s+$/, "")}…`;
}

/**
 * Greedy word wrap against the estimated width. The final line absorbs any
 * remainder and is ellipsized if it overflows — the same shape as the
 * certificate card's `wrapLines`, minus the canvas dependency.
 *
 * The "last line absorbs the remainder" rule is what makes the ellipsis honest:
 * every word is accounted for, so the only text ever dropped is text the
 * ellipsis explicitly marks as dropped. The line budget is checked BEFORE the
 * push (`lines.length + 1 >= maxLines`) rather than after, so `maxLines: 1` is a
 * legal budget that produces one absorbed, ellipsized line — checking after the
 * push made 1 unreachable and silently returned the first line while
 * ellipsizing the last.
 */
export function wrapToWidth(
  text: string,
  opts: TextMetricsInput & { maxWidth: number; maxLines: number },
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const maxLines = Math.max(1, Math.floor(opts.maxLines));
  const lines: string[] = [];
  let current = "";
  let idx = 0;
  for (; idx < words.length; idx++) {
    const candidate = current ? `${current} ${words[idx]}` : words[idx];
    if (!current || estimateTextWidth(candidate, opts) <= opts.maxWidth) {
      current = candidate;
      continue;
    }
    // `current` is full. If it would be the last line we may open, stop here and
    // let the absorb loop below fold every remaining word into it.
    if (lines.length + 1 >= maxLines) break;
    lines.push(current);
    current = words[idx];
  }
  for (; idx < words.length; idx++) current = `${current} ${words[idx]}`;
  if (current) lines.push(current);
  const last = lines.length - 1;
  if (last >= 0) lines[last] = ellipsizeToWidth(lines[last], opts);
  return lines;
}

// ── Layout ─────────────────────────────────────────────────────────────────

/** A drawable run of text: what to paint, how big, and where the baselines sit. */
export interface TextBlock {
  lines: string[];
  fontPx: number;
  lineHeightPx: number;
  /** Baseline of the first line, in canvas px from the top edge. */
  firstBaseline: number;
  /** Letter-spacing in em, applied by the painter where the engine supports it. */
  trackingEm: number;
}

/** The complete painting instruction set for one admission card. */
export interface AdmissionLayout {
  width: number;
  height: number;
  /** Radial champagne bloom behind the composition. */
  glow: { cx: number; cy: number; radius: number };
  eyebrow: TextBlock;
  headline: TextBlock;
  name: TextBlock | null;
  /** Champagne hairline under the name. */
  rule: { y: number; halfWidth: number };
  cohort: TextBlock | null;
  meta: TextBlock | null;
  wordmark: { markBaseline: number; markFontPx: number; subBaseline: number; subFontPx: number };
}

/** Copy constants — the artifact's own words, none of them applicant-authored. */
export const ARTIFACT_COPY = {
  eyebrow: "ADMISSION CONFIRMED",
  headline: "You're in.",
  wordmark: "LevelUp",
  wordmarkSub: "LEARNING",
} as const;

// Type sizes (px on the 1080-wide canvas).
const EYEBROW_FONT = 26;
const HEADLINE_MAX_FONT = 116;
const HEADLINE_MIN_FONT = 72;
const NAME_MAX_FONT = 62;
const NAME_MIN_FONT = 36;
const COHORT_MAX_FONT = 42;
const COHORT_MIN_FONT = 28;
const META_FONT = 24;

// Baseline-to-baseline rhythm, all relative to the eyebrow baseline.
const EYEBROW_TO_HEADLINE = 168;
const HEADLINE_LINE_H = 118;
const HEADLINE_TO_NAME = 116;
const NAME_LINE_H = 76;
const NAME_TO_RULE = 62;
const RULE_TO_COHORT = 78;
const COHORT_TO_META = 52;

/** Tracking for the two mono lines, mirroring the certificate card's values. */
const EYEBROW_TRACKING = 0.3;
const META_TRACKING = 0.24;

/**
 * Compose the card. The eyebrow → headline → name → rule → cohort → meta group
 * is measured first and then centred as ONE block between the top inset and the
 * wordmark band, so a one-line name and a wrapped two-line name both sit
 * optically centred instead of leaving a dead band above the footer.
 */
export function layoutAdmissionCard(fields: AdmissionFields): AdmissionLayout {
  const W = ARTIFACT_WIDTH;
  const H = ARTIFACT_HEIGHT;
  const maxWidth = W - ARTIFACT_SAFE_INSET * 2;

  // Headline — fixed copy, but still fitted so a future translation cannot clip.
  const headlineFont = fitFontSize(ARTIFACT_COPY.headline, {
    maxWidth,
    maxFontPx: HEADLINE_MAX_FONT,
    minFontPx: HEADLINE_MIN_FONT,
    ratio: GLYPH_RATIO.serif,
  });
  const headlineLines = wrapToWidth(ARTIFACT_COPY.headline, {
    maxWidth,
    fontPx: headlineFont,
    ratio: GLYPH_RATIO.serif,
    maxLines: 2,
  });

  // Name — shrink to fit one line; only wrap to a second line once we have hit
  // the minimum size, so most names stay a single confident statement.
  const name = sanitizeField(fields.name, 80);
  const nameFont = fitFontSize(name, {
    maxWidth,
    maxFontPx: NAME_MAX_FONT,
    minFontPx: NAME_MIN_FONT,
    ratio: GLYPH_RATIO.sans,
  });
  const nameMetrics = { fontPx: nameFont, ratio: GLYPH_RATIO.sans };
  const nameLines = name
    ? estimateTextWidth(name, nameMetrics) <= maxWidth
      ? [name]
      : wrapToWidth(name, { ...nameMetrics, maxWidth, maxLines: 2 })
    : [];

  // Cohort — one fitted, ellipsized line.
  const cohort = sanitizeField(fields.cohort, 64);
  const cohortFont = fitFontSize(cohort, {
    maxWidth,
    maxFontPx: COHORT_MAX_FONT,
    minFontPx: COHORT_MIN_FONT,
    ratio: GLYPH_RATIO.serif,
  });
  const cohortLines = cohort
    ? [ellipsizeToWidth(cohort, { maxWidth, fontPx: cohortFont, ratio: GLYPH_RATIO.serif })]
    : [];

  // Meta — craft · city, ellipsized against the tracked mono advance.
  const metaMetrics = { fontPx: META_FONT, ratio: GLYPH_RATIO.mono, trackingEm: META_TRACKING };
  const metaText = buildMetaLine(fields);
  const metaLines = metaText ? [ellipsizeToWidth(metaText, { ...metaMetrics, maxWidth })] : [];

  // Offsets relative to the eyebrow baseline (0).
  const headlineTopRel = EYEBROW_TO_HEADLINE;
  const headlineBottomRel = headlineTopRel + (headlineLines.length - 1) * HEADLINE_LINE_H;
  const nameTopRel = headlineBottomRel + HEADLINE_TO_NAME;
  const nameBottomRel = nameTopRel + (Math.max(nameLines.length, 1) - 1) * NAME_LINE_H;
  const ruleRel = (nameLines.length ? nameBottomRel : headlineBottomRel) + NAME_TO_RULE;
  const cohortRel = ruleRel + RULE_TO_COHORT;
  const metaRel = cohortRel + COHORT_TO_META;

  // Visual extent of the group: eyebrow cap height down to the lowest descender.
  const groupTopRel = -EYEBROW_FONT * 0.8;
  const groupBottomRel = metaLines.length
    ? metaRel + META_FONT * 0.3
    : cohortLines.length
      ? cohortRel + cohortFont * 0.3
      : ruleRel + 2;

  const footerTop = H - FOOTER_BAND_UP;
  const groupCenter = (ARTIFACT_SAFE_INSET + footerTop) / 2;
  const eyebrowBaseline = Math.round(groupCenter - (groupTopRel + groupBottomRel) / 2);

  const block = (
    lines: string[],
    fontPx: number,
    lineHeightPx: number,
    rel: number,
    trackingEm = 0,
  ): TextBlock => ({
    lines,
    fontPx,
    lineHeightPx,
    firstBaseline: eyebrowBaseline + rel,
    trackingEm,
  });

  return {
    width: W,
    height: H,
    glow: { cx: W / 2, cy: eyebrowBaseline + headlineTopRel, radius: W * 0.72 },
    eyebrow: block([ARTIFACT_COPY.eyebrow], EYEBROW_FONT, EYEBROW_FONT * 1.4, 0, EYEBROW_TRACKING),
    headline: block(headlineLines, headlineFont, HEADLINE_LINE_H, headlineTopRel),
    name: nameLines.length ? block(nameLines, nameFont, NAME_LINE_H, nameTopRel) : null,
    rule: { y: eyebrowBaseline + ruleRel, halfWidth: 64 },
    cohort: cohortLines.length ? block(cohortLines, cohortFont, cohortFont * 1.3, cohortRel) : null,
    meta: metaLines.length ? block(metaLines, META_FONT, META_FONT * 1.4, metaRel, META_TRACKING) : null,
    wordmark: {
      markBaseline: H - WORDMARK_MARK_UP,
      markFontPx: 44,
      subBaseline: H - WORDMARK_SUB_UP,
      subFontPx: 20,
    },
  };
}

// ── Palette ────────────────────────────────────────────────────────────────

/** Reads one CSS custom property's raw value, e.g. `--cream` → `"40 60% 87%"`. */
export type TokenReader = (token: string) => string | undefined;

/** Canvas-ready colour strings for the artifact. */
export interface ArtifactPalette {
  field: string;
  glow: string;
  cream: string;
  gold: string;
  foreground: string;
  muted: string;
}

/**
 * Fallbacks mirror `src/index.css` :root exactly, so a canvas rendered before
 * the stylesheet resolves (or inside a test) paints the same brand colours the
 * live tokens would give it. No raw hex: every value is a token triplet.
 */
const PALETTE_FALLBACKS = {
  field: "0 0% 0%", // --canvas
  glow: "40 61% 63%", // --gold
  cream: "40 60% 87%", // --cream
  gold: "40 61% 63%", // --gold
  foreground: "40 30% 96%", // --foreground
  muted: "240 3% 66%", // --muted-foreground
} as const;

const PALETTE_TOKENS = {
  field: "--canvas",
  glow: "--gold",
  cream: "--cream",
  gold: "--gold",
  foreground: "--foreground",
  muted: "--muted-foreground",
} as const;

/** Resolve the artifact palette from the live token values, with brand fallbacks. */
export function resolveArtifactPalette(read: TokenReader): ArtifactPalette {
  const pick = (key: keyof typeof PALETTE_TOKENS): string => {
    const raw = read(PALETTE_TOKENS[key])?.trim();
    return `hsl(${raw || PALETTE_FALLBACKS[key]})`;
  };
  return {
    field: pick("field"),
    glow: pick("glow"),
    cream: pick("cream"),
    gold: pick("gold"),
    foreground: pick("foreground"),
    muted: pick("muted"),
  };
}

// ── Reveal timeline ────────────────────────────────────────────────────────

/** One staggered beat of the reveal. `riseP x` is the distance it travels up. */
interface RevealStage {
  startMs: number;
  durationMs: number;
  risePx: number;
}

/**
 * The staggered choreography, ending exactly on ARTIFACT_CLIP_MS. Opacity and a
 * vertical offset only — the same discipline the DOM reveal is held to, so the
 * clip reads as the same motion language rather than a second, louder one.
 */
export const REVEAL_STAGES = {
  glow: { startMs: 0, durationMs: 700, risePx: 0 },
  eyebrow: { startMs: 260, durationMs: 520, risePx: 18 },
  headline: { startMs: 560, durationMs: 680, risePx: 42 },
  name: { startMs: 960, durationMs: 720, risePx: 34 },
  rule: { startMs: 1440, durationMs: 520, risePx: 0 },
  cohort: { startMs: 1680, durationMs: 560, risePx: 22 },
  meta: { startMs: 1900, durationMs: 560, risePx: 16 },
  wordmark: { startMs: 2080, durationMs: 520, risePx: 12 },
} as const satisfies Record<string, RevealStage>;

export type RevealStageKey = keyof typeof REVEAL_STAGES;

/** Per-element animation state at one instant. */
export interface StageState {
  progress: number;
  opacity: number;
  translateY: number;
}

/** Evaluate one axis of a cubic Bézier at parameter `u`. */
function bezierAxis(u: number, a1: number, a2: number): number {
  const c = 3 * a1;
  const b = 3 * (a2 - a1) - c;
  const a = 1 - c - b;
  return ((a * u + b) * u + c) * u;
}

/**
 * Evaluate a CSS-style cubic-bezier easing. Control points come from the shared
 * `easings` tokens — this function never invents a curve of its own. Solved by
 * bisection (24 halvings ⇒ ~1e-7 on x), which is deterministic and immune to the
 * zero-derivative case Newton–Raphson stalls on.
 */
export function bezierEase(
  t: number,
  points: readonly [number, number, number, number] = easings.out,
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const [x1, y1, x2, y2] = points;
  let lo = 0;
  let hi = 1;
  let u = t;
  for (let i = 0; i < 24; i++) {
    const x = bezierAxis(u, x1, x2);
    if (Math.abs(x - t) < 1e-6) break;
    if (x < t) lo = u;
    else hi = u;
    u = (lo + hi) / 2;
  }
  return bezierAxis(u, y1, y2);
}

/** Linear 0→1 progress of one stage at `tMs`, clamped at both ends. */
export function stageProgress(tMs: number, stage: RevealStage): number {
  if (stage.durationMs <= 0) return tMs >= stage.startMs ? 1 : 0;
  const raw = (tMs - stage.startMs) / stage.durationMs;
  return raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
}

/**
 * The full frame at `tMs`: eased opacity and rise for every element. The painter
 * consumes this directly, which means the animation is fully described by pure
 * numbers and can be asserted in a test without ever creating a canvas.
 */
export function admissionFrameAt(tMs: number): Record<RevealStageKey, StageState> {
  const out = {} as Record<RevealStageKey, StageState>;
  (Object.keys(REVEAL_STAGES) as RevealStageKey[]).forEach((key) => {
    const stage = REVEAL_STAGES[key];
    const progress = stageProgress(tMs, stage);
    const eased = bezierEase(progress);
    out[key] = {
      progress: eased,
      opacity: Math.min(1, Math.max(0, eased)),
      translateY: stage.risePx * (1 - eased),
    };
  });
  return out;
}

/**
 * The instant every stage has settled — i.e. the frame the PNG floor is drawn
 * at. Derived from the choreography rather than hard-coded, so re-timing a beat
 * moves the still with it instead of quietly freezing it mid-reveal.
 */
export const REVEAL_SETTLED_MS = (Object.keys(REVEAL_STAGES) as RevealStageKey[]).reduce(
  (latest, key) => Math.max(latest, REVEAL_STAGES[key].startMs + REVEAL_STAGES[key].durationMs),
  0,
);

/** Whether there is still room in the 60s post-accept budget to keep encoding. */
export function withinBudget(elapsedMs: number, budgetMs = ARTIFACT_BUDGET_MS): boolean {
  return elapsedMs >= 0 && elapsedMs < budgetMs;
}

/** First candidate container the platform's recorder admits, or null for none. */
export function pickRecorderMimeType(
  candidates: readonly string[],
  isSupported: (mimeType: string) => boolean,
): string | null {
  for (const candidate of candidates) {
    try {
      if (isSupported(candidate)) return candidate;
    } catch {
      // A recorder that throws on probing is a recorder we cannot use.
    }
  }
  return null;
}

// ── Delivery naming ────────────────────────────────────────────────────────

/** Lowercase, hyphenated, ASCII-safe slug for use inside a file name. */
export function slugify(value: string, maxChars = 40): string {
  return sanitizeField(value, maxChars)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Download/share file name, e.g. `levelup-admission-rahul-srinivas.png`. */
export function admissionFileName(fields: Pick<AdmissionFields, "name">, ext: "png" | "webm"): string {
  const slug = slugify(fields.name);
  return slug ? `levelup-admission-${slug}.${ext}` : `levelup-admission.${ext}`;
}

/** Share-sheet copy. Structured fields only — never the applicant's own words. */
export function admissionShareText(fields: Pick<AdmissionFields, "cohort">): string {
  const cohort = sanitizeField(fields.cohort, 64);
  return cohort ? `I'm in. ${cohort}. LevelUp.` : "I'm in. LevelUp.";
}

// ── Delivery policy ────────────────────────────────────────────────────────
// Which rendered asset a CTA hands over, and which platform mechanisms can
// actually carry it. Both are pure decisions, so the divergence between the
// three shells is asserted in the test file rather than discovered on a device.

/** The two things this module knows how to produce. */
export type ArtifactKind = "still" | "clip";

/**
 * Order the assets a CTA may hand over, best first.
 *
 * The PNG is the FLOOR, not the fallback: "Share my card" always hands over the
 * still, because the two surfaces the brief names — Instagram Stories and
 * LinkedIn — reject WebM. Only the explicit clip CTA prefers the clip, and even
 * then the still trails it so a refused container still delivers something.
 * Nothing here consults wall-clock time, so which asset a tap yields can never
 * depend on whether the encode happened to have finished.
 */
export function orderShareAssets<T>(
  assets: { still: T | null; clip: T | null },
  prefer: ArtifactKind,
): T[] {
  const queue = prefer === "clip" ? [assets.clip, assets.still] : [assets.still];
  return queue.filter((asset): asset is T => asset !== null && asset !== undefined);
}

/** A mechanism that can put a rendered asset into the applicant's hands. */
export type DeliveryMethod = "share-file" | "download" | "clipboard-image";

/** What the current runtime can actually do with ONE asset. */
export interface DeliveryCapabilities {
  /** `navigator.canShare({ files })` accepted this file. */
  canShareFiles: boolean;
  /**
   * An `<a download>` click really writes a file. FALSE inside a Capacitor
   * WebView: Android registers no `DownloadListener`, so a blob download is a
   * silent no-op there rather than a save.
   */
  canDownload: boolean;
  /** `navigator.clipboard.write` + `ClipboardItem` both exist. */
  canCopyImage: boolean;
  /** Only a raster still can go on the clipboard; a WebM cannot. */
  isImage: boolean;
}

/**
 * The ordered mechanisms to try for one asset. An EMPTY plan is a real, expected
 * answer — it is what a Capacitor Android shell returns, because none of the
 * three mechanisms exists there:
 *
 *  - `navigator.share` is not implemented in Android System WebView;
 *  - `<a download>` needs a `DownloadListener` the shell does not register;
 *  - `@capacitor/share` carries `file://` URLs only, and writing one needs
 *    `@capacitor/filesystem`, which is not a dependency.
 *
 * The caller must treat `[]` as "nothing was delivered" and say so. The previous
 * shape of this path opened the native sheet with the caption text alone and
 * reported success, which handed the applicant an empty share and called it a
 * win — the exact opposite of the PNG floor.
 */
export function planDelivery(caps: DeliveryCapabilities): DeliveryMethod[] {
  const plan: DeliveryMethod[] = [];
  if (caps.canShareFiles) plan.push("share-file");
  if (caps.canDownload) plan.push("download");
  if (caps.canCopyImage && caps.isImage) plan.push("clipboard-image");
  return plan;
}

/** What actually happened, as the applicant needs it described. */
export interface DeliveryOutcome {
  /** The mechanism that returned. */
  method: DeliveryMethod;
  /** True when the clip CTA was tapped and the STILL is what went out. */
  substituted: boolean;
}

/**
 * The confirmation line for a delivery, or null where the OS already gave the
 * applicant one (the share sheet is its own receipt).
 *
 * The substitution notice is carried by EVERY mechanism, not just the share.
 * Substitution is in fact commonest on the rungs that used to shadow it: on a
 * native shell "Share clip" finds no mechanism at all for a WebM (no Web Share
 * API, no download, and the clipboard takes images only), so it falls to the
 * still and lands on the clipboard — precisely the case where the applicant
 * would otherwise be told "Card copied" with no hint the clip never went.
 *
 * The download line describes the click, not the file system. A programmatic
 * `<a download>` click is not an observable save, so promising one would be the
 * same false success this ladder exists to avoid.
 */
export function describeDelivery(outcome: DeliveryOutcome): string | null {
  if (outcome.method === "share-file") {
    return outcome.substituted
      ? "Shared the still card. This device cannot share the clip."
      : null;
  }
  if (outcome.method === "download") {
    return outcome.substituted
      ? "Downloading the still card. This device cannot save the clip."
      : "Downloading your card. Check your downloads.";
  }
  return outcome.substituted
    ? "Still card copied. This device cannot share the clip."
    : "Card copied. Paste it into your story.";
}
