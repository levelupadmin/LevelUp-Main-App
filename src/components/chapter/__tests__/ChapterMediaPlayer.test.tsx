import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

// The app-owned <video> reads chapter markers for the STEAL-4 scrub caption from
// `chapter_moments`. Stub the client so the fetch never hits the network; each
// test can override what the chainable query resolves to via `momentsRows`.
let momentsRows: Array<{ id: string; label: string; seconds: number }> = [];
vi.mock("@/integrations/supabase/client", () => {
  const makeQuery = () => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order"]) {
      query[method] = vi.fn(() => query);
    }
    query.then = (resolve: (value: { data: unknown[] }) => unknown) =>
      resolve({ data: momentsRows });
    return query;
  };
  return { supabase: { from: vi.fn(() => makeQuery()) } };
});

import ChapterMediaPlayer from "../ChapterMediaPlayer";
import type { Chapter } from "../types";

// Minimal chapter shapes. `content_type: "video"` with an `.m3u8` media_url is
// the ONE app-owned playback surface (a first-party <video>), so it's the only
// path that carries the double-tap ±10s seek. Everything else is a cross-origin
// iframe and must NOT receive our gesture handlers.
const baseChapter: Chapter = {
  id: "c1",
  title: "Lesson One",
  description: null,
  content_type: "video",
  media_url: "https://cdn.example.com/stream/index.m3u8",
  embed_url: null,
  article_body: null,
  make_free: true,
  section_id: "s1",
  sort_order: 0,
  duration_seconds: 600,
  thumbnail_url: null,
  vdocipher_thumbnail_url: null,
};

// jsdom lays elements out to a zero-size rect and doesn't model the media
// timeline, so we plant a real bounding box + writable currentTime/duration to
// exercise the zone maths and the seek deterministically.
function renderHls(chapter = baseChapter) {
  const utils = render(
    <ChapterMediaPlayer chapter={chapter} updateProgress={() => {}} lastPosition={0} />,
  );
  const video = utils.container.querySelector("video") as HTMLVideoElement;
  if (video) {
    vi.spyOn(video, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 225,
      left: 0,
      top: 0,
      right: 400,
      bottom: 225,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(video, "currentTime", { writable: true, configurable: true, value: 0 });
    Object.defineProperty(video, "duration", { writable: true, configurable: true, value: 600 });
  }
  return { ...utils, video };
}

describe("ChapterMediaPlayer — app-owned HLS <video>", () => {
  it("renders a first-party <video> for HLS, not a cross-origin iframe", () => {
    const { container, video } = renderHls();
    expect(video).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("double-taps the right zone to seek +10s", () => {
    const { video } = renderHls();
    video.currentTime = 20;
    fireEvent.click(video, { clientX: 350, clientY: 50 });
    fireEvent.click(video, { clientX: 350, clientY: 50 });
    expect(video.currentTime).toBe(30);
  });

  it("double-taps the left zone to rewind 10s (never below 0)", () => {
    const { video } = renderHls();
    video.currentTime = 40;
    fireEvent.click(video, { clientX: 30, clientY: 50 });
    fireEvent.click(video, { clientX: 30, clientY: 50 });
    expect(video.currentTime).toBe(30);

    video.currentTime = 4;
    fireEvent.click(video, { clientX: 30, clientY: 50 });
    fireEvent.click(video, { clientX: 30, clientY: 50 });
    expect(video.currentTime).toBe(0);
  });

  it("does not seek on a single tap", () => {
    const { video } = renderHls();
    video.currentTime = 15;
    fireEvent.click(video, { clientX: 350, clientY: 50 });
    expect(video.currentTime).toBe(15);
  });

  it("leaves the centre column to the native controls (no seek)", () => {
    const { video } = renderHls();
    video.currentTime = 15;
    fireEvent.click(video, { clientX: 200, clientY: 50 });
    fireEvent.click(video, { clientX: 200, clientY: 50 });
    expect(video.currentTime).toBe(15);
  });

  it("ignores the bottom control strip so it never fights the scrubber", () => {
    const { video } = renderHls();
    video.currentTime = 15;
    fireEvent.click(video, { clientX: 350, clientY: 210 });
    fireEvent.click(video, { clientX: 350, clientY: 210 });
    expect(video.currentTime).toBe(15);
  });

  it("suppresses native dblclick→fullscreen inside a seek zone", () => {
    const { video } = renderHls();
    // fireEvent returns false when the (cancelable) event had preventDefault
    // called — i.e. the browser's native double-click-to-fullscreen is blocked.
    const notPrevented = fireEvent.dblClick(video, { clientX: 350, clientY: 50 });
    expect(notPrevented).toBe(false);
  });

  it("leaves native dblclick behaviour intact in the centre column", () => {
    const { video } = renderHls();
    // Centre column keeps the browser's native fullscreen toggle — no
    // preventDefault, so the event is not cancelled.
    const notPrevented = fireEvent.dblClick(video, { clientX: 200, clientY: 50 });
    expect(notPrevented).toBe(true);
  });

  it("shows a seek ripple only after a committed double-tap", () => {
    const { container, video } = renderHls();
    // A lone tap arms but doesn't fire — no ripple yet.
    fireEvent.click(video, { clientX: 350, clientY: 50 });
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    // The second tap commits: the ±10s ripple appears.
    fireEvent.click(video, { clientX: 350, clientY: 50 });
    expect(container.textContent).toContain("10s");
  });
});

describe("ChapterMediaPlayer — cross-origin surfaces get NO app-owned <video>", () => {
  it("renders Vimeo as an iframe (never a first-party video)", () => {
    const { container } = render(
      <ChapterMediaPlayer
        chapter={{ ...baseChapter, media_url: "https://vimeo.com/12345" }}
        updateProgress={() => {}}
        lastPosition={0}
      />,
    );
    expect(container.querySelector("iframe")).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
  });

  it("renders a PDF as an iframe (no gesture surface)", () => {
    const { container } = render(
      <ChapterMediaPlayer
        chapter={{ ...baseChapter, content_type: "pdf", media_url: "https://x/y.pdf" }}
        updateProgress={() => {}}
        lastPosition={0}
      />,
    );
    expect(container.querySelector("iframe")).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
  });
});

describe("ChapterMediaPlayer — STEAL-4 scrub caption (app-owned <video> only)", () => {
  it("stays hidden until the user scrubs", () => {
    momentsRows = [];
    const { container } = renderHls();
    // Nothing is scrubbing yet, so the caption pill is absent.
    expect(container.textContent).not.toContain("0:12");
  });

  it("shows the live timestamp while scrubbing", () => {
    momentsRows = [];
    const { container, video } = renderHls();
    video.currentTime = 12;
    fireEvent.seeking(video);
    expect(container.textContent).toContain("0:12");
  });

  it("surfaces the current moment title alongside the timestamp", () => {
    momentsRows = [
      { id: "m1", label: "Framing the shot", seconds: 0 },
      { id: "m2", label: "Blocking the scene", seconds: 10 },
    ];
    const { container, video } = renderHls();
    video.currentTime = 12;
    fireEvent.seeking(video);
    // Past the 10s marker → the second moment's title rides the caption.
    expect(container.textContent).toContain("0:12");
    expect(container.textContent).toContain("Blocking the scene");
  });

  it("falls back to a timestamp-only caption when the chapter has no moments", () => {
    momentsRows = [];
    const { container, video } = renderHls();
    video.currentTime = 30;
    fireEvent.seeking(video);
    expect(container.textContent).toContain("0:30");
    // No marker rows → the moment title / separator never renders.
    expect(container.textContent).not.toContain("·");
  });
});
