import { describe, it, expect } from "vitest";
import {
  ACCENT_LIGHTNESS_FLOOR,
  ACCENT_MIN_CONTRAST,
  ACCENT_VIOLET_TOKEN,
  contrastOnCanvas,
  contrastOnRoomSurface,
  DEFAULT_ROOM_ACCENT,
  isRoomModuleKey,
  moduleEnabled,
  resolveTheme,
  ROOM_MODULE_DEFAULTS,
  ROOM_MODULE_KEYS,
  type RoomModuleKey,
  ROOM_MONOGRAM_MAX_CHARS,
  ROOM_TAGLINE_MAX_CHARS,
  ROOM_WORDMARK_MAX_CHARS,
  sessionTimeState,
  SESSION_DEFAULT_DURATION_MINUTES,
  SESSION_TONIGHT_MINUTES,
} from "@/lib/room";

/**
 * R-5 — the proof for the three pure room decisions. No network, no mocking, no
 * component: `src/lib/room.ts` is the whole surface under test.
 *
 * The things this file exists to pin down:
 *   · the CONTRAST FLOOR, because `cohort_room_configs.theme` is admin-entered
 *     data and an unreadable accent must be corrected, never rendered — measured
 *     on the LIGHTEST room surface, not the flattering canvas;
 *   · `sessionTimeState` at its BOUNDARY MINUTES, because the T-24h and T-60m
 *     triggers from ROOMS-ARCHITECTURE §7 moment 3 are exactly where an
 *     off-by-one shows a member a join button that does not work (or hides one
 *     that does), and because every state on that ladder has to be REACHABLE —
 *     plus BOTH edges of `tonight`, the one state that claims a calendar day;
 *   · the two silent failures: a hero URL that only LOOKS same-origin to a
 *     prefix test, and a module key typo that would hide a whole room surface.
 */

/* ── resolveTheme ─────────────────────────────────────────────────────────── */

describe("resolveTheme() defaults", () => {
  it("fills every field from an empty config", () => {
    const theme = resolveTheme({ theme: {} });

    expect(theme.accentH).toBe(DEFAULT_ROOM_ACCENT.h);
    expect(theme.accentS).toBe(DEFAULT_ROOM_ACCENT.s);
    expect(theme.accentL).toBe(DEFAULT_ROOM_ACCENT.l);
    expect(theme.accentTextL).toBe(DEFAULT_ROOM_ACCENT.l);
    expect(theme.texture).toBe("none");
    expect(theme.heroUrl).toBeNull();
    expect(theme.wordmarkText).toBeNull();
    expect(theme.monogram).toBeNull();
    expect(theme.tagline).toBeNull();
    expect(theme.contrastFloorApplied).toBe(false);
  });

  it("the default accent clears AA on the LIGHTEST room surface, not just the canvas", () => {
    // `accentContrast` reports the worst case (`--surface-2`), so this one
    // assertion covers the cards and the canvas too.
    expect(resolveTheme(null).accentContrast).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);
    expect(contrastOnRoomSurface(258, 90, DEFAULT_ROOM_ACCENT.l)).toBeGreaterThanOrEqual(
      ACCENT_MIN_CONTRAST,
    );
  });

  it("is `--accent-violet`, lifted by the minimum that clears AA on a card", () => {
    // The default MUST arrive pre-corrected, or `contrastFloorApplied` would fire
    // on every room that never set a theme. It is still the token's violet: only
    // the lightness moved, and by the smallest step that works.
    expect(DEFAULT_ROOM_ACCENT.h).toBe(ACCENT_VIOLET_TOKEN.h);
    expect(DEFAULT_ROOM_ACCENT.s).toBe(ACCENT_VIOLET_TOKEN.s);
    expect(DEFAULT_ROOM_ACCENT.l).toBeGreaterThanOrEqual(ACCENT_VIOLET_TOKEN.l);
    // The token itself is the reason the lift exists: 4.26:1 on `--surface-2`.
    expect(
      contrastOnRoomSurface(ACCENT_VIOLET_TOKEN.h, ACCENT_VIOLET_TOKEN.s, ACCENT_VIOLET_TOKEN.l),
    ).toBeLessThan(ACCENT_MIN_CONTRAST);
    // …and it is the MINIMUM lift: one point lower still fails.
    expect(
      contrastOnRoomSurface(DEFAULT_ROOM_ACCENT.h, DEFAULT_ROOM_ACCENT.s, DEFAULT_ROOM_ACCENT.l - 1),
    ).toBeLessThan(ACCENT_MIN_CONTRAST);
  });

  it("measures the floor on the worst room surface, which the canvas flatters", () => {
    // The whole point of moving the reference background off `--canvas`: an
    // accent tuned to exactly AA on black is ~11% weaker inside a week card.
    expect(contrastOnCanvas(258, 90, 66)).toBeGreaterThan(ACCENT_MIN_CONTRAST);
    expect(contrastOnRoomSurface(258, 90, 66)).toBeLessThan(ACCENT_MIN_CONTRAST);
  });

  it("survives a null / undefined / malformed config row", () => {
    for (const input of [null, undefined, {}, { theme: null }, { theme: "nope" }, { theme: [] }]) {
      expect(resolveTheme(input as never).accentL).toBe(DEFAULT_ROOM_ACCENT.l);
    }
  });

  it("carries a well-formed theme through untouched", () => {
    const theme = resolveTheme({
      theme: {
        accent_h: 38,
        accent_s: 92,
        accent_l: 50,
        hero_url: "  https://cdn.example/hero.webp  ",
        wordmark_text: "BREAKTHROUGH FILMMAKERS",
        monogram: "BF",
        texture: "grain",
        tagline: "Twelve weeks. One film.",
      },
    });

    expect(theme.accentVar).toBe("38 92% 50%");
    expect(theme.accentTextVar).toBe("38 92% 50%");
    expect(theme.contrastFloorApplied).toBe(false);
    expect(theme.heroUrl).toBe("https://cdn.example/hero.webp");
    expect(theme.wordmarkText).toBe("BREAKTHROUGH FILMMAKERS");
    expect(theme.monogram).toBe("BF");
    expect(theme.texture).toBe("grain");
    expect(theme.tagline).toBe("Twelve weeks. One film.");
  });

  it("whitelists texture and drops empty strings", () => {
    expect(resolveTheme({ theme: { texture: "parallax-video" } }).texture).toBe("none");
    expect(resolveTheme({ theme: { tagline: "   " } }).tagline).toBeNull();
    expect(resolveTheme({ theme: { monogram: 42 } }).monogram).toBeNull();
  });

  it("falls back to the default accent for out-of-range or non-numeric hsl", () => {
    const theme = resolveTheme({
      theme: { accent_h: "258", accent_s: 900, accent_l: Number.NaN },
    });
    expect(theme.accentH).toBe(DEFAULT_ROOM_ACCENT.h);
    expect(theme.accentS).toBe(DEFAULT_ROOM_ACCENT.s);
    expect(theme.accentL).toBe(DEFAULT_ROOM_ACCENT.l);
  });
});

describe("resolveTheme() contrast floor", () => {
  it("lifts a deliberately low-contrast accent until it clears AA", () => {
    // 258 90% 20% is 1.10:1 inside a room card — unreadable, and exactly the
    // kind of value an admin picks off a brand deck without checking.
    expect(contrastOnRoomSurface(258, 90, 20)).toBeLessThan(ACCENT_MIN_CONTRAST);

    const theme = resolveTheme({ theme: { accent_h: 258, accent_s: 90, accent_l: 20 } });

    expect(theme.contrastFloorApplied).toBe(true);
    expect(theme.accentL).toBeGreaterThanOrEqual(ACCENT_LIGHTNESS_FLOOR);
    expect(theme.accentContrast).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);
    expect(theme.accentVar).toBe(`258 90% ${theme.accentL}%`);
    // Hue and saturation are the cohort's identity — only lightness moves.
    expect(theme.accentH).toBe(258);
    expect(theme.accentS).toBe(90);
  });

  it("keeps climbing past the floor when the floor alone still fails", () => {
    // `--accent-violet-deep` (258 90% 60%) was tuned for WHITE TEXT ON the
    // accent; as text ON a room card it is only 3.27:1, so the floor is a first
    // step, not the answer. Proving this is the whole reason the lift loops.
    expect(contrastOnRoomSurface(258, 90, ACCENT_LIGHTNESS_FLOOR)).toBeLessThan(
      ACCENT_MIN_CONTRAST,
    );

    const theme = resolveTheme({ theme: { accent_h: 258, accent_s: 90, accent_l: 60 } });

    expect(theme.accentL).toBe(68);
    expect(theme.contrastFloorApplied).toBe(true);
    expect(theme.accentContrast).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);
  });

  it("corrects an accent that passes on the canvas but fails on a card", () => {
    // The exact gap the canvas-only bar hid: 258 90% 66% reads 4.87:1 on
    // `--canvas` and 4.26:1 on `--surface-2`. Reporting that row as compliant is
    // how sub-AA accent text ships inside week cards.
    expect(contrastOnCanvas(258, 90, 66)).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);

    const theme = resolveTheme({ theme: { accent_h: 258, accent_s: 90, accent_l: 66 } });

    expect(theme.accentL).toBeGreaterThan(66);
    expect(theme.contrastFloorApplied).toBe(true);
    expect(contrastOnRoomSurface(258, 90, theme.accentL)).toBeGreaterThanOrEqual(
      ACCENT_MIN_CONTRAST,
    );
  });

  it("never lowers an accent that already passes", () => {
    const theme = resolveTheme({ theme: { accent_h: 45, accent_s: 100, accent_l: 50 } });
    expect(theme.accentL).toBe(50);
    expect(theme.contrastFloorApplied).toBe(false);
  });

  it("holds accent_text_l to the same bar as the accent", () => {
    const theme = resolveTheme({
      theme: { accent_h: 45, accent_s: 100, accent_l: 50, accent_text_l: 15 },
    });
    expect(theme.accentL).toBe(50);
    expect(theme.accentTextL).toBeGreaterThanOrEqual(ACCENT_LIGHTNESS_FLOOR);
    expect(contrastOnRoomSurface(45, 100, theme.accentTextL)).toBeGreaterThanOrEqual(
      ACCENT_MIN_CONTRAST,
    );
    // A safe accent with an unreadable TEXT lightness is still a corrected row,
    // and the flag is the only way the admin editor / QA lens learns that.
    expect(theme.contrastFloorApplied).toBe(true);
  });

  it("reports a clean row as untouched even with an explicit accent_text_l", () => {
    const theme = resolveTheme({
      theme: { accent_h: 45, accent_s: 100, accent_l: 50, accent_text_l: 70 },
    });
    expect(theme.accentTextL).toBe(70);
    expect(theme.contrastFloorApplied).toBe(false);
  });

  it("clears AA for every hue at full saturation", () => {
    for (let h = 0; h < 360; h += 15) {
      const theme = resolveTheme({ theme: { accent_h: h, accent_s: 100, accent_l: 5 } });
      expect(theme.accentContrast).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);
      expect(theme.accentL).toBeLessThanOrEqual(100);
    }
  });
});

describe("resolveTheme() free-text sanitisation", () => {
  it("caps the monogram at badge length", () => {
    expect(resolveTheme({ theme: { monogram: "X".repeat(500) } })?.monogram).toBe(
      "X".repeat(ROOM_MONOGRAM_MAX_CHARS),
    );
    // A legitimate 1–2 character monogram is untouched.
    expect(resolveTheme({ theme: { monogram: "BF" } }).monogram).toBe("BF");
  });

  it("caps the wordmark and the tagline", () => {
    const wordmark = resolveTheme({ theme: { wordmark_text: "W".repeat(400) } }).wordmarkText;
    const tagline = resolveTheme({ theme: { tagline: "T".repeat(4000) } }).tagline;
    expect(wordmark).toHaveLength(ROOM_WORDMARK_MAX_CHARS);
    expect(tagline).toHaveLength(ROOM_TAGLINE_MAX_CHARS);
  });

  it("drops a hero_url whose scheme is not one we render", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "blob:https://app.example/9f2",
      "//cdn.example/hero.webp",
      "cdn.example/hero.webp",
      "x".repeat(3000),
    ]) {
      expect(resolveTheme({ theme: { hero_url: bad } }).heroUrl).toBeNull();
    }
  });

  it("drops a path that only LOOKS same-origin to a prefix test", () => {
    // Every one of these resolves cross-origin under the WHATWG URL parser that
    // both WebViews ship — `\` is `/` in a special scheme, and tab/CR/LF are
    // stripped before parsing. Verified against the parser itself:
    //   new URL("/\\evil.com/x.png", "https://app.leveluplearning.in").href
    //     === "https://evil.com/x.png"
    // A hero silently loaded from a third party hands it every member's IP and
    // user-agent the moment the room opens.
    for (const smuggled of [
      "/\\evil.com/hero.webp",
      "/\\\\evil.com/hero.webp",
      "/\t/evil.com/hero.webp",
      "/\n/evil.com/hero.webp",
      "/\r/evil.com/hero.webp",
      "https://cdn.example\\@evil.com/hero.webp",
      "/room-art/two words.webp",
    ]) {
      expect(resolveTheme({ theme: { hero_url: smuggled } }).heroUrl).toBeNull();
    }
  });

  it("keeps the hero_url shapes a room actually ships", () => {
    const kept = [
      "https://cdn.example/hero.webp",
      "http://cdn.example/hero.webp",
      "/room-art/breakthrough.webp",
      "data:image/svg+xml;base64,PHN2Zy8+",
    ];
    for (const url of kept) {
      expect(resolveTheme({ theme: { hero_url: url } }).heroUrl).toBe(url);
    }
  });
});

/* ── sessionTimeState ─────────────────────────────────────────────────────── */

// 2026-08-05T14:30:00Z = 20:00 IST on Wed 5 Aug. 90-minute session → ends 16:00Z.
const START = "2026-08-05T14:30:00.000Z";
const START_MS = Date.parse(START);
const MINUTE = 60_000;
const session = (over: Record<string, unknown> = {}) => ({
  scheduled_at: START,
  duration_minutes: 90,
  recording_url: null,
  ...over,
});

describe("sessionTimeState() boundary minutes", () => {
  it("T-61m is tonight, T-60m exactly is soon", () => {
    expect(sessionTimeState(session(), START_MS - 61 * MINUTE)).toBe("tonight");
    expect(sessionTimeState(session(), START_MS - 60 * MINUTE)).toBe("soon");
  });

  it("stays soon right up to the last millisecond before doors", () => {
    expect(sessionTimeState(session(), START_MS - 1)).toBe("soon");
  });

  it("is live at exactly scheduled_at", () => {
    expect(sessionTimeState(session(), START_MS)).toBe("live");
  });

  it("stays live to the last millisecond of the duration, then ends", () => {
    expect(sessionTimeState(session(), START_MS + 90 * MINUTE - 1)).toBe("live");
    expect(sessionTimeState(session(), START_MS + 90 * MINUTE)).toBe("ended");
  });

  it("ends → recorded the moment a recording_url exists", () => {
    const withRecording = session({ recording_url: "https://vdo.example/r.m3u8" });
    expect(sessionTimeState(withRecording, START_MS + 90 * MINUTE)).toBe("recorded");
    // A recording pasted in early never overrides the live/soon states.
    expect(sessionTimeState(withRecording, START_MS + MINUTE)).toBe("live");
    expect(sessionTimeState(withRecording, START_MS - 30 * MINUTE)).toBe("soon");
  });

  it("treats a blank recording_url as no recording", () => {
    expect(sessionTimeState(session({ recording_url: "   " }), START_MS + 3 * 60 * MINUTE)).toBe(
      "ended",
    );
  });
});

describe("sessionTimeState() tonight window — both bounds", () => {
  // 00:00 IST on Wed 5 Aug, the moment the session's own IST day begins.
  const IST_MIDNIGHT_OF_SESSION_DAY = Date.parse("2026-08-04T18:30:00.000Z");

  it("flips to tonight at IST midnight of the session's own day", () => {
    expect(sessionTimeState(session(), IST_MIDNIGHT_OF_SESSION_DAY)).toBe("tonight");
    // 23:59:59.999 IST on Tue — the session is TOMORROW, and says so.
    expect(sessionTimeState(session(), IST_MIDNIGHT_OF_SESSION_DAY - 1)).toBe("scheduled");
  });

  it("never says tonight on the preceding IST evening, even inside T-24h", () => {
    // 21:00 IST on Tue about a 20:00 IST Wed session: 23 hours out, and inside a
    // naive rolling-24h window. A consumer renders this state as "TONIGHT, 8:00
    // PM", so a pure T-24h rule mislabels every session, every evening.
    expect(sessionTimeState(session(), Date.parse("2026-08-04T15:30:00.000Z"))).toBe("scheduled");
    // T-24h exactly (20:00 IST Tue) is the ceiling, not the trigger.
    expect(sessionTimeState(session(), START_MS - SESSION_TONIGHT_MINUTES * MINUTE)).toBe(
      "scheduled",
    );
  });

  it("stays scheduled well outside the window", () => {
    expect(sessionTimeState(session(), START_MS - 48 * 60 * MINUTE)).toBe("scheduled");
  });

  it("holds a morning session to the same IST day rule", () => {
    // 2026-08-06T04:30:00Z = 10:00 IST Thu — a MORNING session. At 23:59:59 IST
    // on Wed it is tomorrow; at 00:00 IST Thu it becomes today's, and the
    // consumer labels it by the clock ("TODAY, 10:00 AM"), not the word tonight.
    const morning = session({ scheduled_at: "2026-08-06T04:30:00.000Z" });
    expect(sessionTimeState(morning, Date.parse("2026-08-05T18:29:59.999Z"))).toBe("scheduled");
    expect(sessionTimeState(morning, Date.parse("2026-08-05T18:30:00.000Z"))).toBe("tonight");
    expect(sessionTimeState(morning, Date.parse("2026-08-06T00:00:00.000Z"))).toBe("tonight");
  });

  it("reaches tonight for a session just after IST midnight", () => {
    // 2026-08-05T19:00:00Z = 00:30 IST on Thu 6 Aug. Under a strict same-IST-day
    // rule this session's `tonight` state is unreachable — its IST day begins 30
    // minutes before it does, by which point `soon` has already won. The small
    // hours belong to the previous evening, which is how members read them.
    const afterMidnight = session({ scheduled_at: "2026-08-05T19:00:00.000Z" });
    const startMs = Date.parse("2026-08-05T19:00:00.000Z");
    expect(sessionTimeState(afterMidnight, startMs - 23 * 60 * MINUTE)).toBe("tonight");
    expect(sessionTimeState(afterMidnight, startMs - 90 * MINUTE)).toBe("tonight");
    expect(sessionTimeState(afterMidnight, startMs - 61 * MINUTE)).toBe("tonight");
    expect(sessionTimeState(afterMidnight, startMs - 60 * MINUTE)).toBe("soon");
    // …and the T-24h ceiling still caps that extension.
    expect(sessionTimeState(afterMidnight, startMs - SESSION_TONIGHT_MINUTES * MINUTE - 1)).toBe(
      "scheduled",
    );
  });

  it("ends the post-midnight extension at 04:00 IST", () => {
    const wednesdayEvening = Date.parse("2026-08-05T15:30:00.000Z"); // 21:00 IST Wed
    // 03:59 IST Thu is still the night that began on Wednesday…
    const lateNight = session({ scheduled_at: "2026-08-05T22:29:00.000Z" });
    expect(sessionTimeState(lateNight, wednesdayEvening)).toBe("tonight");
    // …04:00 IST Thu is Thursday's early session, not tonight's.
    const dawn = session({ scheduled_at: "2026-08-05T22:30:00.000Z" });
    expect(sessionTimeState(dawn, wednesdayEvening)).toBe("scheduled");
  });

  it("answers on IST instants, so a device timezone cannot move a boundary", () => {
    // Every input is an INSTANT and the day arithmetic is a fixed +05:30 offset,
    // so a member in Dubai and a member in Chennai see the same room. Expressing
    // the same two instants in three notations must give the same state.
    const spellings = [
      "2026-08-04T18:30:00.000Z",
      "2026-08-05T00:00:00.000+05:30",
      "2026-08-04T13:30:00.000-05:00",
    ];
    for (const spelling of spellings) {
      expect(sessionTimeState(session(), Date.parse(spelling))).toBe("tonight");
      expect(sessionTimeState(session(), new Date(spelling))).toBe("tonight");
    }
  });

  it("walks the whole ladder in order for one session", () => {
    const withRecording = session({ recording_url: "https://vdo.example/r.m3u8" });
    expect(sessionTimeState(withRecording, START_MS - 25 * 60 * MINUTE)).toBe("scheduled");
    expect(sessionTimeState(withRecording, START_MS - 10 * 60 * MINUTE)).toBe("tonight");
    expect(sessionTimeState(withRecording, START_MS - 30 * MINUTE)).toBe("soon");
    expect(sessionTimeState(withRecording, START_MS + 30 * MINUTE)).toBe("live");
    expect(sessionTimeState(session(), START_MS + 3 * 60 * MINUTE)).toBe("ended");
    expect(sessionTimeState(withRecording, START_MS + 3 * 60 * MINUTE)).toBe("recorded");
  });
});

describe("sessionTimeState() defaults and bad input", () => {
  it("defaults a missing duration to the live_sessions default", () => {
    const noDuration = session({ duration_minutes: null });
    const endMs = START_MS + SESSION_DEFAULT_DURATION_MINUTES * MINUTE;
    expect(sessionTimeState(noDuration, endMs - 1)).toBe("live");
    expect(sessionTimeState(noDuration, endMs)).toBe("ended");
  });

  it("ignores a zero or negative duration", () => {
    expect(sessionTimeState(session({ duration_minutes: 0 }), START_MS + MINUTE)).toBe("live");
    expect(sessionTimeState(session({ duration_minutes: -30 }), START_MS + MINUTE)).toBe("live");
  });

  it("returns the inert scheduled state for a missing or unparseable date", () => {
    expect(sessionTimeState(null, START_MS)).toBe("scheduled");
    expect(sessionTimeState({}, START_MS)).toBe("scheduled");
    expect(sessionTimeState({ scheduled_at: "" }, START_MS)).toBe("scheduled");
    expect(sessionTimeState({ scheduled_at: "not a date" }, START_MS)).toBe("scheduled");
  });

  it("accepts a Date as well as epoch ms for now", () => {
    expect(sessionTimeState(session(), new Date(START_MS))).toBe("live");
  });
});

/* ── moduleEnabled ────────────────────────────────────────────────────────── */

describe("moduleEnabled()", () => {
  it("an absent key reads the documented module default, not false", () => {
    for (const key of ROOM_MODULE_KEYS) {
      expect(moduleEnabled({ modules: {} }, key)).toBe(ROOM_MODULE_DEFAULTS[key]);
    }
    expect(moduleEnabled({ modules: {} }, "weeks")).toBe(true);
    expect(moduleEnabled({ modules: {} }, "leaderboard")).toBe(false);
    expect(moduleEnabled({ modules: {} }, "demo_day")).toBe(false);
  });

  it("an explicit value wins in both directions", () => {
    expect(moduleEnabled({ modules: { leaderboard: true } }, "leaderboard")).toBe(true);
    expect(moduleEnabled({ modules: { feed: false } }, "feed")).toBe(false);
  });

  it("an opt-in does not disturb the other modules", () => {
    const config = { modules: { leaderboard: true } };
    expect(moduleEnabled(config, "weeks")).toBe(true);
    expect(moduleEnabled(config, "recordings")).toBe(true);
    expect(moduleEnabled(config, "demo_day")).toBe(false);
  });

  it("a non-boolean jsonb value falls back to the default rather than guessing", () => {
    expect(moduleEnabled({ modules: { feed: "false" } }, "feed")).toBe(true);
    expect(moduleEnabled({ modules: { leaderboard: 1 } }, "leaderboard")).toBe(false);
    expect(moduleEnabled({ modules: { roster: null } }, "roster")).toBe(true);
  });

  it("does not compile for a typo'd module key", () => {
    // THIS LINE IS THE TEST. `@ts-expect-error` fails `tsc` if the error ever
    // disappears, so it pins the strict key type in place. It has to be strict:
    // a disabled module renders as ABSENT (ROOMS-ARCHITECTURE §5), so
    // `moduleEnabled(cfg, "recordigns")` would hide the Screening Shelf on every
    // cohort room with no error, no warning and nothing on screen to notice.
    // @ts-expect-error — "recordigns" is not a RoomModuleKey.
    expect(moduleEnabled({ modules: {} }, "recordigns")).toBe(false);
    // @ts-expect-error — a bare string is not narrow enough either.
    expect(moduleEnabled({ modules: { chat: true } }, "chat")).toBe(false);
  });

  it("still answers false for an unknown key forced through a cast", () => {
    // Defence in depth for the one way a bad key can still arrive.
    expect(moduleEnabled({ modules: { chat: true } }, "chat" as RoomModuleKey)).toBe(false);
    expect(moduleEnabled({ modules: {} }, "" as RoomModuleKey)).toBe(false);
    expect(moduleEnabled({ modules: {} }, null as unknown as RoomModuleKey)).toBe(false);
  });

  it("isRoomModuleKey is the escape hatch for a runtime string", () => {
    expect(isRoomModuleKey("recordings")).toBe(true);
    expect(isRoomModuleKey("recordigns")).toBe(false);
    expect(isRoomModuleKey(null)).toBe(false);
    expect(isRoomModuleKey(7)).toBe(false);

    // The narrowing a config-driven call site does, with no cast in sight.
    const fromConfigRow: string = "leaderboard";
    expect(isRoomModuleKey(fromConfigRow) && moduleEnabled({ modules: {} }, fromConfigRow)).toBe(
      false,
    );
  });

  it("survives a null or malformed config row", () => {
    expect(moduleEnabled(null, "weeks")).toBe(true);
    expect(moduleEnabled({}, "weeks")).toBe(true);
    expect(moduleEnabled({ modules: "weeks" }, "weeks")).toBe(true);
    expect(moduleEnabled({ modules: ["weeks"] }, "leaderboard")).toBe(false);
  });
});
