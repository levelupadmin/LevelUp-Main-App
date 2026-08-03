// QA HARNESS — NOT shipped. Mounts the REAL <RoomMasthead> + <RoomEntrance>
// (R1-T3) against the two cohort-room fixtures from
// qa-harness/cohort-room-fixtures.sql, through the REAL resolveTheme(), inside
// the exact wrapper div RoomThemeProvider (R1-T2) is specified to render in
// design/cohorts/ROOMS-ARCHITECTURE.md §4.2. No auth, no RPC, no network.
//
//   ?room=a    themed + hero art + grain, phase=live, week 4 of 12
//   ?room=b    no hero (crest path), 48-char wordmark, phase=pre_start
//   ?room=c    room A's theme with a hero URL that 404s (broken-art path)
//   ?reduced=1 forces the reduced-motion branch (see room-masthead.html)
//
// window.__masthead exposes the measurements the R1-T3 acceptance asks for:
// entrance total (ms, first paint → visually at rest), CLS, frame trace.
import { useEffect, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import RoomMasthead from "@/components/room/RoomMasthead";
import { RoomEntrance, useRoomEntranceContext } from "@/components/room/RoomEntrance";
import { useMotionSafe } from "@/lib/motion";
import { resolveTheme, type RoomConfigInput } from "@/lib/room";
import "@/index.css";

// A stand-in landscape hero. Inline so the harness has zero network deps; the
// real path is a CDN webp through ArtworkImage, which this exercises verbatim.
const HERO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
     <defs>
       <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="#241a3a"/><stop offset="0.55" stop-color="#0d0b16"/><stop offset="1" stop-color="#3b2a12"/>
       </linearGradient>
     </defs>
     <rect width="1600" height="900" fill="url(#g)"/>
     <circle cx="1180" cy="260" r="180" fill="#e8d9b0" opacity="0.28"/>
     <rect x="0" y="640" width="1600" height="260" fill="#000" opacity="0.45"/>
     <rect x="120" y="470" width="420" height="230" fill="#0a0a0a" opacity="0.7"/>
   </svg>`,
)}`;

interface Fixture {
  slug: string;
  config: RoomConfigInput;
  phase: "pre_start" | "live" | "wrap" | "alumni";
  weekNumber?: number;
  weekCount?: number;
  startsAt?: string;
  title: string;
}

const FIXTURES: Record<string, Fixture> = {
  // Fixture A — cohort-room-fixtures.sql `room-qa-a` accents, with the art,
  // monogram, tagline and grain the masthead spec asks for.
  a: {
    slug: "room-qa-a",
    config: {
      theme: {
        accent_h: 268,
        accent_s: 72,
        accent_l: 58,
        texture: "grain",
        wordmark_text: "BREAKTHROUGH FILMMAKERS",
        monogram: "BF",
        tagline: "Twelve weeks. One film.",
        hero_url: HERO,
      },
    },
    phase: "live",
    weekNumber: 4,
    weekCount: 12,
    title: "Breakthrough Filmmakers Programme",
  },
  // Fixture B — `room-qa-b` accents. No hero (crest path), a wordmark at the
  // ROOM_WORDMARK_MAX_CHARS ceiling (48), and the pre_start status line.
  b: {
    slug: "room-qa-b",
    config: {
      theme: {
        accent_h: 190,
        accent_s: 65,
        accent_l: 52,
        texture: "none",
        wordmark_text: "THE CREATOR ACADEMY INTENSIVE MONSOON EDITION",
        monogram: "CA",
        tagline: "Show up every week. Leave with an audience.",
      },
    },
    phase: "pre_start",
    startsAt: "2026-08-12T04:30:00.000Z", // 10:00 IST on 12 Aug
    title: "Creator Academy",
  },
  // Fixture C — fixture A with art that 404s: proves the broken-hero path keeps
  // the full layout (no void, no shift) once ArtworkImage swaps to its fallback.
  c: {
    slug: "room-qa-c",
    config: {
      theme: {
        accent_h: 268,
        accent_s: 72,
        accent_l: 58,
        texture: "grain",
        wordmark_text: "BREAKTHROUGH FILMMAKERS",
        monogram: "BF",
        tagline: "Twelve weeks. One film.",
        hero_url: "/qa-harness/__missing-hero__.webp",
      },
    },
    phase: "live",
    weekNumber: 4,
    weekCount: 12,
    title: "Breakthrough Filmmakers Programme",
  },
};

const params = new URLSearchParams(location.search);
const fixture = FIXTURES[params.get("room") ?? "a"] ?? FIXTURES.a;
const theme = resolveTheme(fixture.config);

/** Vertical translate (px) out of a computed transform, matrix or matrix3d. */
function translateY(transform: string): number {
  if (!transform || transform === "none") return 0;
  const nums = transform
    .slice(transform.indexOf("(") + 1, -1)
    .split(",")
    .map((n) => parseFloat(n));
  if (transform.startsWith("matrix3d")) return nums[13] ?? 0;
  return nums[5] ?? 0;
}

/**
 * Two honest numbers, both measured rather than assumed:
 *  - `visualDoneMs` — the frame after which nothing on screen changes to the
 *    eye (opacity within 1%, translate within half a CSS px).
 *  - `totalMs` — the frame framer actually hands the element back to CSS.
 */
function useSettleProbe() {
  const [, force] = useState(0);
  useEffect(() => {
    const startedAt = performance.now();
    const w = window as unknown as Record<string, unknown>;
    let stable = 0;
    let raf = 0;
    const probe = () => {
      const plate = document.querySelector<HTMLElement>('[data-testid="room-masthead-plate"]');
      const art = document.querySelector<HTMLElement>('[data-testid="room-masthead-art"]');
      if (plate && art) {
        const p = getComputedStyle(plate);
        const a = getComputedStyle(art);
        const visuallyDone =
          Number(p.opacity) >= 0.99 &&
          Number(a.opacity) >= 0.99 &&
          Math.abs(translateY(p.transform)) <= 0.5;
        if (visuallyDone && w.__entranceVisualDoneMs === undefined) {
          w.__entranceVisualDoneMs = Math.round(performance.now() - startedAt);
        }
        const atRest =
          Number(p.opacity) >= 0.999 &&
          Number(a.opacity) >= 0.999 &&
          Math.abs(translateY(p.transform)) < 0.01;
        stable = atRest ? stable + 1 : 0;
        if (stable >= 2) {
          w.__entranceStartedAt = startedAt;
          w.__entranceSettledAt = performance.now();
          w.__entranceTotalMs = Math.round(performance.now() - startedAt);
          w.__entranceSettled = true;
          force((n) => n + 1);
          return;
        }
      }
      raf = requestAnimationFrame(probe);
    };
    raf = requestAnimationFrame(probe);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/**
 * Reads the entrance the provider actually handed out, so the driver can tell
 * "played and finished fast" apart from "did not play at all".
 */
function EntranceProbe() {
  const stages = useRoomEntranceContext();
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__entrancePlaying = Boolean(stages?.playing);
  }, [stages]);
  return null;
}

function Harness() {
  useSettleProbe();
  const motionSafe = useMotionSafe();

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__masthead = {
      playing: () => Boolean(w.__entrancePlaying),
      reduced: () => motionSafe.reduced,
      fixture: params.get("room") ?? "a",
      slug: fixture.slug,
      theme,
      entranceTotalMs: () => w.__entranceTotalMs ?? null,
      settled: () => Boolean(w.__entranceSettled),
      cls: () => w.__cls,
      shifts: () => w.__shifts,
      frames: () => w.__frames,
      // Every backdrop-filter in the subtree — the acceptance wants this at 0.
      backdropFilters: () =>
        Array.from(document.querySelectorAll<HTMLElement>("[data-testid='room-masthead'] *"))
          .map((el) => getComputedStyle(el).backdropFilter)
          .filter((v) => v && v !== "none"),
      height: () =>
        document.querySelector('[data-testid="room-masthead"]')?.getBoundingClientRect().height,
      enteredKeys: () =>
        Object.keys(sessionStorage).filter((k) => k.startsWith("lu_room_entered_")),
    };
    w.__mastheadReady = true;
  });

  return (
    // RoomThemeProvider's exact wrapper (ROOMS-ARCHITECTURE §4.2) — R1-T2 owns
    // the real component; this is the two CSS vars it is specified to set.
    <div
      data-room-theme
      style={
        {
          "--room-accent": theme.accentVar,
          "--room-accent-text": theme.accentTextVar,
        } as CSSProperties
      }
    >
      <RoomEntrance slug={fixture.slug}>
        <EntranceProbe />
        <RoomMasthead
          slug={fixture.slug}
          theme={theme}
          phase={fixture.phase}
          weekNumber={fixture.weekNumber}
          weekCount={fixture.weekCount}
          startsAt={fixture.startsAt}
          title={fixture.title}
        />
      </RoomEntrance>
      <div style={{ height: "140vh" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
