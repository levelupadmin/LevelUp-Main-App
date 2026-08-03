/**
 * room.ts — the pure client foundation for cohort rooms (R0 task R-5).
 *
 * PURE HELPERS ONLY. R0 ships zero client-visible change, so nothing here
 * renders, fetches, or reads a store — these are the three deterministic
 * decisions every room surface will later need:
 *
 *   1. `resolveTheme(config)`   — turn the admin-entered `cohort_room_configs.theme`
 *                                 jsonb into a render-safe theme, with a WCAG
 *                                 contrast floor that is never negotiable.
 *   2. `sessionTimeState(s)`    — the six session states from
 *                                 `design/cohorts/ROOMS-ARCHITECTURE.md` §7 moment 3,
 *                                 on that document's T-24h / T-60m triggers, bounded
 *                                 by the IST calendar day members actually live in.
 *   3. `moduleEnabled(cfg,key)` — the per-cohort feature matrix (§5) with the
 *                                 documented module defaults.
 *
 * Deliberately NOT imported: `src/integrations/supabase/types.ts`. R0 does not
 * apply its migrations, so the generated `Database` type has no
 * `cohort_room_configs` row yet. The shapes below are hand-written against the
 * migration in `design/cohorts/migrations-draft/0001_cohort_room_configs.sql`
 * and swap over to generated types once R-1 lands on prod.
 *
 * Every input is treated as UNTRUSTED: `theme` and `modules` are jsonb columns
 * an admin types into a form, not a validated contract.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Tokens mirrored from src/index.css
 * `src/index.css` is Tier 1 and out of scope for this task, so the values below
 * are mirrored here as named constants, each carrying the line it came from. If
 * a token moves, this file moves with it — they are meant to be diffable by eye.
 * ──────────────────────────────────────────────────────────────────────────── */

/** `--canvas: 0 0% 0%` — src/index.css:223. The page behind the room. */
export const ROOM_CANVAS_HSL = { h: 0, s: 0, l: 0 } as const;

/**
 * `--surface-2: 0 0% 8%` — src/index.css:225. The LIGHTEST surface a room draws
 * on, and therefore the background the contrast floor is enforced against.
 *
 * The canvas is the most forgiving background in the token system (a pure black
 * denominator of 0.05), but room content renders on `--card`/`--surface` (both
 * `0 0% 4%`) and `--surface-2` — an accent tuned to exactly 4.5:1 on the canvas
 * lands near 4.0:1 inside a week card, i.e. below AA everywhere it is actually
 * drawn. Clearing AA here clears it on every darker surface by construction.
 */
export const ROOM_SURFACE_HSL = { h: 0, s: 0, l: 8 } as const;

/**
 * `--accent-violet-deep: 258 90% 60%` — src/index.css:298. The lightness of that
 * token is the room accent's floor: an accent below it is lifted before it ever
 * reaches a style attribute.
 */
export const ACCENT_LIGHTNESS_FLOOR = 60;

/** `--accent-violet: 258 90% 66%` — src/index.css:293. The token, verbatim. */
export const ACCENT_VIOLET_TOKEN = { h: 258, s: 90, l: 66 } as const;

/**
 * The default room accent: `--accent-violet`, lifted two points.
 *
 * The token is tuned for fills, and on `--surface-2` it measures 4.26:1 — under
 * AA for text, which is what a room uses an accent for. 68 is the first lightness
 * of that same violet that clears the bar (4.68:1), so the default arrives
 * already safe and `contrastFloorApplied` stays honest: it means "a config row
 * was corrected", never "the default needed correcting".
 * (`resolveTheme.defaults` in the test file pins this derivation.)
 */
export const DEFAULT_ROOM_ACCENT = { h: 258, s: 90, l: 68 } as const;

/**
 * WCAG 2.1 AA for normal text. Rooms hold accents to it for every text usage,
 * measured against `ROOM_SURFACE_HSL` (the worst case), not the canvas.
 */
export const ACCENT_MIN_CONTRAST = 4.5;

/* ────────────────────────────────────────────────────────────────────────────
 * Length caps for the free-text theme fields
 * `theme` is a jsonb column an admin types into a form, and the table's CHECK
 * constraints police shape, not length. A 500-character "monogram" is a broken
 * room at 360px, so the caps live here — the one place that claims to hand back
 * render-safe values.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The monogram is a 1–3 character badge (ROOMS-ARCHITECTURE §4.1 nameplate). */
export const ROOM_MONOGRAM_MAX_CHARS = 3;

/** The wordmark is the nameplate line — one short title, not a paragraph. */
export const ROOM_WORDMARK_MAX_CHARS = 48;

/** The tagline sits under the nameplate; two lines at 360px, no more. */
export const ROOM_TAGLINE_MAX_CHARS = 120;

/** Enough for any CDN URL; an inline hero past this belongs in storage. */
export const ROOM_HERO_URL_MAX_CHARS = 2048;

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────── */

/** The one licensed flourish (ROOMS-ARCHITECTURE §4.1) — the existing grain util. */
export type RoomTexture = "grain" | "none";

/**
 * A `cohort_room_configs` row as far as these helpers care. `theme` and
 * `modules` are `unknown` on purpose: they are jsonb, and the CHECK constraints
 * on the table guarantee less than the TypeScript would imply.
 */
export interface RoomConfigInput {
  theme?: unknown;
  modules?: unknown;
}

/**
 * The resolved, render-safe theme. Every field is populated and sanitised: the
 * accent clears AA, `texture` is whitelisted, `hero_url` is scheme-checked, and
 * every free-text field is trimmed AND length-capped. A consumer can render any
 * field of this object without re-validating or re-truncating it.
 */
export interface RoomTheme {
  /** Accent hue 0–359. */
  accentH: number;
  /** Accent saturation 0–100. */
  accentS: number;
  /** Accent lightness 0–100, already lifted past the contrast floor. */
  accentL: number;
  /** Lightness for small-text usages (the `--accent-*-text` pattern), also lifted. */
  accentTextL: number;
  /** Ready for `style={{ "--room-accent": accentVar }}` — e.g. `"258 90% 66%"`. */
  accentVar: string;
  /** Ready for `--room-accent-text`. */
  accentTextVar: string;
  /**
   * Contrast of the resolved accent on `--surface-2` (`0 0% 8%`), rounded to
   * 2dp. Never < `ACCENT_MIN_CONTRAST`.
   *
   * `--surface-2` is the LIGHTEST surface a room draws on, so this is the worst
   * case: an accent that clears AA here also clears it on `--card`, `--surface`
   * and `--canvas`. A consumer may put accent text on any of those without
   * re-checking.
   */
  accentContrast: number;
  /**
   * True when the config row's own lightness failed AA and had to be lifted —
   * for EITHER `accent_l` or `accent_text_l`. A row whose accent is fine but
   * whose text lightness is unreadable still trips this, because the admin
   * editor and the QA lens need to be told about every correction, not the
   * first one.
   */
  contrastFloorApplied: boolean;
  heroUrl: string | null;
  wordmarkText: string | null;
  monogram: string | null;
  texture: RoomTexture;
  tagline: string | null;
}

/** The module keys of the feature matrix (ROOMS-ARCHITECTURE §5), canonical order. */
export const ROOM_MODULE_KEYS = [
  "weeks",
  "sessions",
  "recordings",
  "assignments",
  "peer_review",
  "announcements",
  "feed",
  "resources",
  "roster",
  "leaderboard",
  "demo_day",
  "certificates",
] as const;

export type RoomModuleKey = (typeof ROOM_MODULE_KEYS)[number];

/** `cohort_room_configs.modules` — an ABSENT key means "use the default". */
export type RoomModules = Partial<Record<RoomModuleKey, boolean>>;

/**
 * The documented per-module defaults (ROOMS-ARCHITECTURE §5). `leaderboard` is
 * off by per-cohort opt-in (R-D3); `demo_day` turns on for the wrap phase.
 */
export const ROOM_MODULE_DEFAULTS: Readonly<Record<RoomModuleKey, boolean>> = {
  weeks: true,
  sessions: true,
  recordings: true,
  assignments: true,
  peer_review: true,
  announcements: true,
  feed: true,
  resources: true,
  roster: true,
  leaderboard: false,
  demo_day: false,
  certificates: true,
};

/** The six session states from ROOMS-ARCHITECTURE §7 moment 3. */
export type SessionTimeState =
  | "scheduled"
  | "tonight"
  | "soon"
  | "live"
  | "ended"
  | "recorded";

/** A `live_sessions` row as far as `sessionTimeState` cares. */
export interface RoomSessionInput {
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  recording_url?: string | null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Colour maths — hsl → contrast on the canvas
 * ──────────────────────────────────────────────────────────────────────────── */

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = lig - c / 2;

  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}

/** WCAG relative luminance of an hsl triple (channels 0–1, sRGB). */
function relativeLuminance(h: number, s: number, l: number): number {
  const [r, g, b] = hslToRgb(h, s, l).map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const CANVAS_LUMINANCE = relativeLuminance(
  ROOM_CANVAS_HSL.h,
  ROOM_CANVAS_HSL.s,
  ROOM_CANVAS_HSL.l,
);

const SURFACE_LUMINANCE = relativeLuminance(
  ROOM_SURFACE_HSL.h,
  ROOM_SURFACE_HSL.s,
  ROOM_SURFACE_HSL.l,
);

function contrastAgainst(backgroundLuminance: number, h: number, s: number, l: number): number {
  const accent = relativeLuminance(h, s, l);
  const lighter = Math.max(accent, backgroundLuminance);
  const darker = Math.min(accent, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG contrast ratio of an hsl accent against `--canvas` (`0 0% 0%`).
 *
 * This is the number the brief names, and the most FORGIVING one — the canvas is
 * the darkest background in the token system. Use it to explain a value; use
 * `contrastOnRoomSurface` to decide whether a value is acceptable.
 */
export function contrastOnCanvas(h: number, s: number, l: number): number {
  return contrastAgainst(CANVAS_LUMINANCE, h, s, l);
}

/**
 * WCAG contrast ratio of an hsl accent against `--surface-2` (`0 0% 8%`), the
 * lightest surface a room draws on — the WORST case, and the bar the contrast
 * floor actually enforces. Exported because the eventual admin theme editor must
 * show the same number this file enforces — one implementation, no second
 * opinion. Always ≤ `contrastOnCanvas` for the same accent.
 */
export function contrastOnRoomSurface(h: number, s: number, l: number): number {
  return contrastAgainst(SURFACE_LUMINANCE, h, s, l);
}

/* ────────────────────────────────────────────────────────────────────────────
 * resolveTheme
 * ──────────────────────────────────────────────────────────────────────────── */

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** A finite number in range, else null. JSON numbers only — no string coercion. */
function num(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/** A trimmed non-empty string, else null. */
function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A trimmed non-empty string, hard-capped at `max` characters. Truncation is
 * silent on purpose: a room that renders a shortened wordmark is a small design
 * compromise, a room whose nameplate pushes the layout off a 360px screen is a
 * broken room. The admin editor is where an over-long value gets argued with.
 */
function cappedStr(value: unknown, max: number): string | null {
  const trimmed = str(value);
  if (trimmed === null) return null;
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trimEnd();
}

/**
 * Characters that make a prefix test lie about a URL.
 *
 * The WHATWG URL parser (Blink AND WebKit) treats `\` as equivalent to `/` in a
 * special scheme, and STRIPS tab/LF/CR anywhere in the string before parsing. So
 * `"/\\evil.com/x.png"` and `"/\tevil.com/x.png"` both start with a single `/`
 * by `String.startsWith`, and both resolve to `https://evil.com/x.png` against
 * an app origin — a cross-origin hero that leaks every member's IP and UA on
 * room open, admitted by the very check that claims to keep it same-origin.
 *
 * Rejecting outright (rather than stripping) is deliberate: none of these can
 * appear in a URL a room legitimately ships, and a silently rewritten URL is a
 * second thing to reason about. C0 controls and a raw space are in the set for
 * the same reason.
 */
// eslint-disable-next-line no-control-regex
const URL_SMUGGLING_CHARS = /[\u0000-\u0020\u007f\\]/;

/**
 * A hero image reference we are willing to hand to `src` / `background-image`.
 *
 * Whitelist, not blacklist: absolute http(s), a same-origin path, or an inline
 * `data:image/`. Anything else (a `javascript:` URL an admin pasted, a `blob:`
 * from a dev console, a bare `example.com`) resolves to null and the room falls
 * back to its no-hero treatment. Inert in an `img`/CSS context on both WebView
 * engines either way — this is about never rendering a broken or surprising
 * source, and about the consumer not having to ask.
 */
function heroUrl(value: unknown): string | null {
  const trimmed = str(value);
  if (trimmed === null || trimmed.length > ROOM_HERO_URL_MAX_CHARS) return null;
  // Run BEFORE the prefix tests below — they are string matching against a URL
  // grammar, and these characters are exactly what breaks that equivalence.
  if (URL_SMUGGLING_CHARS.test(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  const allowed =
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("data:image/") ||
    (trimmed.startsWith("/") && !trimmed.startsWith("//"));
  return allowed ? trimmed : null;
}

/**
 * Lift a lightness until the accent clears AA on `--surface-2` (and therefore on
 * every darker room surface). The first step is straight to
 * `ACCENT_LIGHTNESS_FLOOR` (the `--accent-violet-deep` precedent); darker hues
 * that still fail there keep climbing in 1% steps. Terminates: at l=100 every
 * hue is white, which is 19.4:1 on `--surface-2`.
 */
function liftToContrastFloor(h: number, s: number, l: number): number {
  if (contrastOnRoomSurface(h, s, l) >= ACCENT_MIN_CONTRAST) return l;
  let lifted = Math.max(l, ACCENT_LIGHTNESS_FLOOR);
  while (lifted < 100 && contrastOnRoomSurface(h, s, lifted) < ACCENT_MIN_CONTRAST) {
    lifted += 1;
  }
  return lifted;
}

/**
 * Resolve a room config's `theme` jsonb into a render-safe `RoomTheme`.
 *
 * Defaults fill every missing or malformed field, and the accent is held to
 * `ACCENT_MIN_CONTRAST` on `--surface-2`, the lightest surface a room draws on
 * (and therefore on the canvas and the cards too) — the config row is
 * admin-entered data,
 * so a theme that would render unreadable accent text is corrected here rather
 * than trusted. `contrastFloorApplied` records that it happened (for either
 * lightness) so the admin editor and the QA lens can say so out loud.
 *
 * The free-text fields come back trimmed, length-capped and — for `hero_url` —
 * scheme-checked, so a consumer renders them as-is.
 */
export function resolveTheme(config: RoomConfigInput | null | undefined): RoomTheme {
  const theme = asRecord(asRecord(config).theme);

  const h = num(theme.accent_h, 0, 360) ?? DEFAULT_ROOM_ACCENT.h;
  const s = num(theme.accent_s, 0, 100) ?? DEFAULT_ROOM_ACCENT.s;
  const rawL = num(theme.accent_l, 0, 100) ?? DEFAULT_ROOM_ACCENT.l;

  const accentH = ((h % 360) + 360) % 360;
  const accentL = liftToContrastFloor(accentH, s, rawL);
  // The text lightness is a small-text usage, so it clears the same bar. An
  // absent override simply reuses the (already safe) accent lightness.
  const rawTextL = num(theme.accent_text_l, 0, 100) ?? accentL;
  const accentTextL = liftToContrastFloor(accentH, s, rawTextL);

  const texture = theme.texture === "grain" ? "grain" : "none";

  return {
    accentH,
    accentS: s,
    accentL,
    accentTextL,
    accentVar: `${accentH} ${s}% ${accentL}%`,
    accentTextVar: `${accentH} ${s}% ${accentTextL}%`,
    accentContrast: Math.round(contrastOnRoomSurface(accentH, s, accentL) * 100) / 100,
    contrastFloorApplied: accentL !== rawL || accentTextL !== rawTextL,
    heroUrl: heroUrl(theme.hero_url),
    wordmarkText: cappedStr(theme.wordmark_text, ROOM_WORDMARK_MAX_CHARS),
    monogram: cappedStr(theme.monogram, ROOM_MONOGRAM_MAX_CHARS),
    texture,
    tagline: cappedStr(theme.tagline, ROOM_TAGLINE_MAX_CHARS),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * sessionTimeState
 * ──────────────────────────────────────────────────────────────────────────── */

/** Doors open (join link + countdown) at T-60m — ROOMS-ARCHITECTURE §7 moment 3. */
export const SESSION_SOON_MINUTES = 60;

/**
 * The OUTER bound of the `tonight` window — §7 moment 3's T-24h trigger. It is a
 * ceiling, not the trigger on its own: see `isTonightInIst`.
 */
export const SESSION_TONIGHT_MINUTES = 24 * 60;

/**
 * `live_sessions.duration_minutes` default when the row does not say.
 *
 * 60, matching the two authorities for that column — the schema default
 * (`supabase/migrations/20260408140000_create_live_sessions.sql:8`,
 * `duration_minutes integer DEFAULT 60`) and the server-side zoom-link gate
 * (`supabase/migrations/20260408151600_live_sessions_zoom_link_gating.sql:93`,
 * `COALESCE(v_session.duration_minutes, 60)`). NULL is reachable on the client —
 * `live_sessions_safe.duration_minutes` is nullable — and a client that assumed a
 * longer default would hold the crimson LIVE treatment and the join affordance
 * open after Postgres had already closed the link.
 */
export const SESSION_DEFAULT_DURATION_MINUTES = 60;

/** IST is a fixed UTC+05:30 with no DST — the whole reason this can be arithmetic. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sessions before this IST hour belong to the PREVIOUS evening's "tonight" — a
 * 00:30 IST session is tonight for a member sitting in the room at 21:00, not
 * something to call tomorrow.
 */
export const SESSION_TONIGHT_LATE_IST_HOUR = 4;

/** Which IST calendar day an instant falls on, as a day number (IST midnights). */
function istDayIndex(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
}

/** Hours since IST midnight for an instant, e.g. 20.0 for 20:00 IST. */
function istHourOfDay(ms: number): number {
  return (ms + IST_OFFSET_MS - istDayIndex(ms) * DAY_MS) / (60 * 60 * 1000);
}

/**
 * Is `startMs` "tonight" from `nowMs`, on the IST calendar members live in?
 *
 * BOTH bounds matter, and each one alone is wrong:
 *   · a pure T-24h window says TONIGHT to a member on Tuesday evening about a
 *     Wednesday 20:00 session — every evening, for every session;
 *   · a pure same-IST-day rule makes `tonight` unreachable for a 00:30 IST
 *     session, whose IST day starts 30 minutes before it does, by which point
 *     `soon` has already won.
 *
 * So: the session is on the member's own IST day, OR it is in the small hours of
 * the next IST day (before `SESSION_TONIGHT_LATE_IST_HOUR`) — and, in either
 * case, no more than `SESSION_TONIGHT_MINUTES` away, which is what stops a
 * 03:30-IST session being called tonight from 00:00 the previous day.
 */
function isTonightInIst(startMs: number, nowMs: number): boolean {
  if (startMs - nowMs > SESSION_TONIGHT_MINUTES * 60_000) return false;
  const dayDelta = istDayIndex(startMs) - istDayIndex(nowMs);
  if (dayDelta === 0) return true;
  return dayDelta === 1 && istHourOfDay(startMs) < SESSION_TONIGHT_LATE_IST_HOUR;
}

/**
 * Which of the six states a session is in, relative to `now`.
 *
 * ```
 * scheduled → tonight (IST day, ≤T-24h) → soon (T-60m) → live → ended → recorded
 * ```
 *
 * The trigger points are the ones ROOMS-ARCHITECTURE.md §7 moment 3 names:
 * `soon` exactly at T-60m, `live` exactly at `scheduled_at`, `ended` exactly at
 * `scheduled_at + duration`. Every boundary is half-open, so no instant belongs
 * to two states.
 *
 * `tonight` is the one state that is NOT a plain rolling window, because it is
 * the one state that makes a claim about the calendar — a consumer renders it as
 * "TONIGHT, 8:00 PM", so a session 23 hours out must not reach it. It needs both
 * an IST-day bound and the T-24h ceiling; `isTonightInIst` above is where that is
 * argued. A session further out than that stays `scheduled` (date + ICS), which
 * is the honest treatment for something that is not today.
 *
 * IST-safe by construction: every comparison is on INSTANTS (epoch ms) with a
 * fixed +05:30 offset for the day arithmetic, so the answer is identical under
 * every device timezone — a member travelling does not see a different room from
 * the cohort-mate beside them. Rendering the IST clock time is the consuming
 * component's formatting job, not this function's — and so is the word: a 10:00
 * session in this state is "TODAY, 10:00 AM", an evening one is "TONIGHT".
 *
 * A missing or unparseable `scheduled_at` returns `scheduled` — the inert state.
 * A slot with no date renders a date, never a false LIVE badge.
 */
export function sessionTimeState(
  session: RoomSessionInput | null | undefined,
  now: Date | number = Date.now(),
): SessionTimeState {
  const startMs = session?.scheduled_at ? Date.parse(session.scheduled_at) : NaN;
  if (!Number.isFinite(startMs)) return "scheduled";

  const nowMs = typeof now === "number" ? now : now.getTime();
  const durationMinutes =
    typeof session?.duration_minutes === "number" &&
    Number.isFinite(session.duration_minutes) &&
    session.duration_minutes > 0
      ? session.duration_minutes
      : SESSION_DEFAULT_DURATION_MINUTES;
  const endMs = startMs + durationMinutes * 60_000;

  if (nowMs >= endMs) {
    return str(session?.recording_url) ? "recorded" : "ended";
  }
  if (nowMs >= startMs) return "live";
  if (startMs - nowMs <= SESSION_SOON_MINUTES * 60_000) return "soon";
  if (isTonightInIst(startMs, nowMs)) return "tonight";
  return "scheduled";
}

/* ────────────────────────────────────────────────────────────────────────────
 * moduleEnabled
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The ONE escape hatch for a runtime string (a key read out of a config row, a
 * route param, an admin form field). `moduleEnabled` takes a strict
 * `RoomModuleKey`, so narrow through this first:
 *
 * ```ts
 * if (isRoomModuleKey(key) && moduleEnabled(config, key)) { … }
 * ```
 *
 * Type-guarding is a deliberate speed bump: it keeps the typo case a COMPILE
 * error at the literal call sites (the common ones) without forcing a cast.
 */
export function isRoomModuleKey(key: unknown): key is RoomModuleKey {
  return typeof key === "string" && (ROOM_MODULE_KEYS as readonly string[]).includes(key);
}

/**
 * Is a module turned on for this room?
 *
 * An ABSENT key means the documented module default (ROOMS-ARCHITECTURE §5), not
 * `false` — a config row that only says `{"leaderboard": true}` still gets weeks,
 * sessions, recordings and the rest. Anything that is not a JSON boolean (a
 * string, a null, a number typed into the admin form) also falls back to the
 * default rather than guessing. An unknown key is `false`.
 *
 * ⚠️ UX ONLY — NEVER A SECURITY GATE (NFR-CONFIG-2). RLS never reads `modules`;
 * access is membership-gated in the database regardless of what this returns.
 * Turning a module on must never be a privilege escalation, so no later phase may
 * use this function to decide whether a user is ALLOWED to see data — only
 * whether this room DOES that thing.
 *
 * `key` is the strict `RoomModuleKey` union, so a typo at a call site
 * (`"recordigns"`) does not compile — a silently hidden room surface is the worst
 * failure available here, since a disabled module renders as ABSENT (§5), with no
 * error and nothing on screen to notice. A runtime string narrows through
 * `isRoomModuleKey` first; the guard below is defence in depth for a value that
 * reached this function through a cast.
 */
export function moduleEnabled(
  config: RoomConfigInput | null | undefined,
  key: RoomModuleKey,
): boolean {
  if (!isRoomModuleKey(key)) return false;
  const modules = asRecord(asRecord(config).modules);
  const value = modules[key];
  return typeof value === "boolean" ? value : ROOM_MODULE_DEFAULTS[key];
}
