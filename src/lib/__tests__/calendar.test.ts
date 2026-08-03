import { afterEach, describe, expect, it, vi } from "vitest";
import { buildICS, googleCalendarUrl } from "@/lib/calendar";

/**
 * R2-T2 — the proof for `src/lib/calendar.ts`, the ICS builder the room's
 * "Add to calendar" runs on.
 *
 * WHY THIS FILE EXISTS AT ALL. `calendar.ts` shipped untested and is already
 * consumed by `src/pages/MySessionsPage.tsx`. R2-T2 puts a second consumer on
 * it (`SessionSlot`), and the failure mode is silent by nature: a wrong
 * DTSTART does not throw, it just puts a ₹40k cohort's live session in the
 * student's calendar at the wrong hour, on a device we never see. So the
 * behaviour is pinned here rather than re-implemented in a second module.
 *
 * THE ONE THING THAT MUST NOT BE "FIXED". `toICSDate` emits the compact UTC
 * form with a trailing `Z` (`20260814T143000Z`). That is CORRECT and it is
 * what makes an IST session land at 8:00 PM in a student's Google or Apple
 * calendar. The tempting "fix" — writing the +05:30 wall clock into DTSTART
 * with no TZID or Z — is precisely the bug that would shift every session by
 * five and a half hours for anyone whose device is not on IST. The IST tests
 * below exist to make that regression fail loudly.
 */

afterEach(() => {
  vi.useRealTimers();
});

/** The lines of an ICS payload, split on its (required) CRLF terminators. */
const linesOf = (ics: string): string[] => ics.split("\r\n");

/** The value half of `KEY:value`, for the first line with that key. */
const valueOf = (ics: string, key: string): string | undefined => {
  const line = linesOf(ics).find((candidate) => candidate.startsWith(`${key}:`));
  return line?.slice(key.length + 1);
};

/* ── IST → UTC ────────────────────────────────────────────────────────────── */

describe("buildICS() times", () => {
  it("writes an 8:00 PM IST session as its UTC instant, not its local wall clock", () => {
    const ics = buildICS({
      title: "Week 4 · The edit",
      startsAt: "2026-08-14T20:00:00+05:30",
      durationMin: 90,
    });

    // 20:00 IST is 14:30 UTC. A naive-local or +05:30-shifted DTSTART would
    // read 20260814T200000Z here and land the session at 1:30 AM IST.
    expect(valueOf(ics, "DTSTART")).toBe("20260814T143000Z");
    expect(valueOf(ics, "DTEND")).toBe("20260814T160000Z");
  });

  it("is identical however the same instant is expressed", () => {
    const stamps = [
      "2026-08-14T20:00:00+05:30",
      "2026-08-14T14:30:00Z",
      "2026-08-14T14:30:00.000Z",
    ].map((startsAt) => valueOf(buildICS({ title: "Same moment", startsAt }), "DTSTART"));

    const fromDate = valueOf(
      buildICS({ title: "Same moment", startsAt: new Date("2026-08-14T14:30:00Z") }),
      "DTSTART",
    );

    expect(new Set([...stamps, fromDate]).size).toBe(1);
    expect(fromDate).toBe("20260814T143000Z");
  });

  it("keeps a small-hours IST session on the UTC day it actually falls on", () => {
    // 00:30 IST on the 15th is 19:00 UTC on the 14th. Getting this wrong is how
    // a late-night session lands a day out in a non-IST calendar.
    const ics = buildICS({ title: "Late screening", startsAt: "2026-08-15T00:30:00+05:30" });
    expect(valueOf(ics, "DTSTART")).toBe("20260814T190000Z");
    expect(valueOf(ics, "DTEND")).toBe("20260814T200000Z");
  });

  it("drops sub-second precision rather than emitting an invalid stamp", () => {
    const ics = buildICS({ title: "Precise", startsAt: "2026-08-14T20:00:00.750+05:30" });
    expect(valueOf(ics, "DTSTART")).toBe("20260814T143000Z");
  });

  it("stamps DTSTAMP in the same UTC form", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T06:15:30Z"));

    const ics = buildICS({ title: "Stamped", startsAt: "2026-08-14T20:00:00+05:30" });
    expect(valueOf(ics, "DTSTAMP")).toBe("20260729T061530Z");
  });
});

/* ── Duration fallback (calendar.ts:38-39) ────────────────────────────────── */

describe("buildICS() duration", () => {
  const start = "2026-08-14T20:00:00+05:30";

  it.each([
    ["absent", undefined],
    ["null", null],
    ["zero", 0],
    ["negative", -30],
    ["NaN", Number.NaN],
  ])("falls back to 60 minutes when durationMin is %s", (_label, durationMin) => {
    const ics = buildICS({ title: "Fallback", startsAt: start, durationMin });
    expect(valueOf(ics, "DTSTART")).toBe("20260814T143000Z");
    expect(valueOf(ics, "DTEND")).toBe("20260814T153000Z");
  });

  it("honours a real duration", () => {
    const ics = buildICS({ title: "Long one", startsAt: start, durationMin: 150 });
    expect(valueOf(ics, "DTEND")).toBe("20260814T170000Z");
  });
});

/* ── RFC 5545 text escaping ───────────────────────────────────────────────── */

describe("buildICS() escaping", () => {
  const start = "2026-08-14T20:00:00+05:30";

  it("escapes backslash, semicolon and comma in SUMMARY, in that order", () => {
    const ics = buildICS({
      title: String.raw`Week 4; the hook, the promise \ the payoff`,
      startsAt: start,
    });

    // The backslash must be doubled FIRST, or the escapes it introduces would
    // themselves be escaped and the title would arrive mangled.
    expect(valueOf(ics, "SUMMARY")).toBe(
      String.raw`Week 4\; the hook\, the promise \\ the payoff`,
    );
  });

  it("escapes newlines in DESCRIPTION as literal \\n, never as real line breaks", () => {
    const ics = buildICS({
      title: "Notes",
      startsAt: start,
      description: "Bring:\n- a rough cut\r\n- one question, honestly",
    });

    const description = valueOf(ics, "DESCRIPTION");
    expect(description).toBe(String.raw`Bring:\n- a rough cut\n- one question\, honestly`);
    // A raw newline here would split DESCRIPTION into an unparseable line.
    expect(description).not.toContain("\n");
    expect(linesOf(ics).filter((line) => line.startsWith("DESCRIPTION:"))).toHaveLength(1);
  });

  it("joins description and url into one escaped DESCRIPTION and mirrors the url", () => {
    const ics = buildICS({
      title: "Joined",
      startsAt: start,
      description: "Filmmaking cohort",
      url: "https://zoom.us/j/123?pwd=abc",
    });

    expect(valueOf(ics, "DESCRIPTION")).toBe(
      String.raw`Filmmaking cohort\n\nhttps://zoom.us/j/123?pwd=abc`,
    );
    expect(valueOf(ics, "LOCATION")).toBe("https://zoom.us/j/123?pwd=abc");
    expect(valueOf(ics, "URL")).toBe("https://zoom.us/j/123?pwd=abc");
  });

  it("omits DESCRIPTION, LOCATION and URL entirely when there is nothing to say", () => {
    const ics = buildICS({ title: "Bare", startsAt: start });
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("URL:");
  });
});

/* ── File shape ───────────────────────────────────────────────────────────── */

describe("buildICS() file shape", () => {
  const start = "2026-08-14T20:00:00+05:30";

  it("terminates every line with CRLF and no bare LF or CR", () => {
    const ics = buildICS({
      title: "Line endings",
      startsAt: start,
      description: "one\ntwo",
      url: "https://example.com/join",
    });

    expect(ics).toContain("\r\n");
    const withoutCrlf = ics.replace(/\r\n/g, "");
    expect(withoutCrlf).not.toContain("\n");
    expect(withoutCrlf).not.toContain("\r");
  });

  it("is a single VEVENT inside a single VCALENDAR", () => {
    const ics = buildICS({ title: "One event", startsAt: start });
    const lines = linesOf(ics);

    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.filter((line) => line === "END:VEVENT")).toHaveLength(1);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines.indexOf("BEGIN:VEVENT")).toBeLessThan(lines.indexOf("END:VEVENT"));
  });

  it("mints the same UID for the same session and a different one for another slot", () => {
    const first = valueOf(buildICS({ title: "Week 4 · The edit", startsAt: start }), "UID");
    const again = valueOf(buildICS({ title: "Week 4 · The edit", startsAt: start }), "UID");
    const later = valueOf(
      buildICS({ title: "Week 4 · The edit", startsAt: "2026-08-21T20:00:00+05:30" }),
      "UID",
    );

    // Re-downloading the same session must UPDATE the calendar entry, not add a
    // second copy of it, which is what a stable UID buys.
    expect(first).toBe(again);
    expect(first).toBe("20260814T143000Z-week-4-the-edit@leveluplearning.in");
    expect(later).not.toBe(first);
  });
});

/* ── The Google fallback agrees with the file ─────────────────────────────── */

describe("googleCalendarUrl()", () => {
  it("uses the same UTC stamps as the .ics, so both paths land on one hour", () => {
    const event = {
      title: "Week 4 · The edit",
      startsAt: "2026-08-14T20:00:00+05:30",
      durationMin: 90,
    };
    const url = new URL(googleCalendarUrl(event));
    const ics = buildICS(event);

    expect(url.searchParams.get("dates")).toBe(
      `${valueOf(ics, "DTSTART")}/${valueOf(ics, "DTEND")}`,
    );
    expect(url.searchParams.get("text")).toBe(event.title);
  });
});
