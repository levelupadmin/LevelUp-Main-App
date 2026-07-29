import { useCallback, useEffect, useRef, useState } from "react";

/**
 * RecordingPlayer — the ONLY place in the room where a position is honest.
 *
 * 🔴 WHY THIS FILE EXISTS AT ALL. The shipped behaviour for `recording_url` is a
 * plain external link (`MySessionsPage.tsx:375-377`), and a link-out cannot
 * report where you stopped. R2-T3 asks for recordings that RESUME, so either
 * playback happens inside the app for the URLs where that is possible, or the
 * resume rail is fed by guesses. This file is the first option: an in-app embed
 * for the two providers whose players volunteer a play position over
 * `postMessage`, and nothing else. Every other URL stays a link-out and records
 * `completed` on open (see `RoomScreenings.tsx`). A resume bar that lies about
 * where you were is worse than no resume bar.
 *
 * ── No SDK, no new dependency ─────────────────────────────────────────────
 * Both providers expose their player API over raw `postMessage` on the iframe
 * itself, so neither `iframe_api.js` nor `player.js` is loaded. That matters
 * more here than usual: this app ships inside an Android WebView and a
 * WKWebView, and a third-party script tag is a network dependency and a CSP
 * surface for a feature whose whole job is to be quiet.
 *
 * ── Where the position comes from ─────────────────────────────────────────
 * · YouTube — `enablejsapi=1`, then a `{"event":"listening"}` handshake. The
 *   player answers with `infoDelivery` frames carrying `currentTime`/`duration`.
 * · Vimeo   — `{"method":"addEventListener","value":"timeupdate"}` after the
 *   player's own `ready`, which answers with `{seconds, duration}`.
 * If neither answers (an origin the provider will not run the JS API for — a
 * Capacitor `capacitor://` origin is the real case), `onProgress` simply never
 * fires. The row then shows no position, which is the truth, rather than a
 * fabricated one.
 *
 * ── Trust ─────────────────────────────────────────────────────────────────
 * Every inbound message is gated on `event.source === iframe.contentWindow`.
 * That is a reference to a browsing context no other window can obtain or
 * forge, so it binds the message to THIS frame — a strictly stronger check than
 * matching an origin string, which is why it is the only one made. The frame's
 * URL is built here from a whitelisted provider host, so "this frame" already
 * means "that provider".
 */

/** The two providers whose embed reports a play position without an SDK. */
export type RecordingProvider = "youtube" | "vimeo";

export interface EmbeddableRecording {
  provider: RecordingProvider;
  /** The provider's own video id — `[A-Za-z0-9_-]{11}` / digits. */
  id: string;
  /** Vimeo unlisted-link hash (`vimeo.com/123456789/abc123`), else null. */
  hash: string | null;
}

/** The origin each provider's player posts from, and the one we post back to. */
const PROVIDER_ORIGIN: Record<RecordingProvider, string> = {
  youtube: "https://www.youtube-nocookie.com",
  vimeo: "https://player.vimeo.com",
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;
const VIMEO_HASH = /^[A-Za-z0-9]{6,}$/;

/** YouTube paths whose NEXT segment is the video id. */
const YOUTUBE_PATH_PREFIXES = new Set(["embed", "live", "v", "shorts"]);

function youtube(id: string): EmbeddableRecording {
  return { provider: "youtube", id, hash: null };
}

/**
 * Recognise a URL we can genuinely play (and therefore genuinely resume).
 *
 * PURE, and deliberately narrow: `recording_url` is a free-text admin field, so
 * anything that is not an http(s) URL on a whitelisted host — including a
 * `javascript:` one — comes back null and is handled as a link-out by the
 * caller, which applies its own http(s) check before it renders an `href`.
 */
export function parseEmbeddableRecording(
  url: string | null | undefined,
): EmbeddableRecording | null {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const host = parsed.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = segments[0] ?? "";
    return YOUTUBE_ID.test(id) ? youtube(id) : null;
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = parsed.searchParams.get("v") ?? "";
    if (YOUTUBE_ID.test(v)) return youtube(v);
    const [head, next] = segments;
    if (head && next && YOUTUBE_PATH_PREFIXES.has(head) && YOUTUBE_ID.test(next)) {
      return youtube(next);
    }
    return null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const idIndex = segments.findIndex((segment) => VIMEO_ID.test(segment));
    if (idIndex === -1) return null;
    // `vimeo.com/123456789/abc123` and `?h=abc123` are the same unlisted hash;
    // without it the embed 403s, so it has to survive into the src.
    const trailing = segments[idIndex + 1] ?? "";
    const queryHash = parsed.searchParams.get("h") ?? "";
    const hash = VIMEO_HASH.test(trailing)
      ? trailing
      : VIMEO_HASH.test(queryHash)
        ? queryHash
        : null;
    return { provider: "vimeo", id: segments[idIndex], hash };
  }

  return null;
}

/** Whole seconds, floored and non-negative — what both providers accept. */
function startParam(startSeconds: number | null | undefined): number {
  return typeof startSeconds === "number" && Number.isFinite(startSeconds) && startSeconds > 0
    ? Math.floor(startSeconds)
    : 0;
}

/**
 * The embed URL, with the resume offset baked in. PURE.
 *
 * The offset is a URL parameter rather than a seek command because it has to
 * apply BEFORE the first frame: seeking after `ready` shows the student the
 * opening seconds again and then jumps, which reads as a bug.
 */
export function embedSrc(
  recording: EmbeddableRecording,
  startSeconds?: number | null,
  pageOrigin?: string | null,
): string {
  const start = startParam(startSeconds);

  if (recording.provider === "youtube") {
    const params = new URLSearchParams({
      enablejsapi: "1",
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
    });
    if (start > 0) params.set("start", String(start));
    // YouTube runs the JS API only for an http(s) origin it can echo back. A
    // Capacitor origin (`capacitor://…`) is not one, so it is omitted rather
    // than sent and rejected — the embed still plays, it just stays silent.
    if (pageOrigin && /^https?:\/\//i.test(pageOrigin)) params.set("origin", pageOrigin);
    return `${PROVIDER_ORIGIN.youtube}/embed/${recording.id}?${params.toString()}`;
  }

  const params = new URLSearchParams({ dnt: "1", playsinline: "1" });
  if (recording.hash) params.set("h", recording.hash);
  const fragment = start > 0 ? `#t=${start}s` : "";
  return `${PROVIDER_ORIGIN.vimeo}/video/${recording.id}?${params.toString()}${fragment}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Inbound frames
 * ──────────────────────────────────────────────────────────────────────────── */

/** What a provider frame tells us, once decoded. Null = not a progress frame. */
interface PlaybackTick {
  position: number;
  /** The recording's REAL length, when the player volunteers it. */
  duration: number | null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Provider payloads arrive as JSON strings from YouTube, objects from Vimeo. */
function decodeFrame(data: unknown): Record<string, unknown> | null {
  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
}

/** Decode one message into a tick, or null if it carries no position. PURE. */
export function readPlaybackTick(provider: RecordingProvider, data: unknown): PlaybackTick | null {
  const frame = decodeFrame(data);
  if (!frame) return null;

  if (provider === "youtube") {
    // `onReady` carries no time; `infoDelivery` is the frame that does, and the
    // player emits it on a timer of its own while playing.
    const info = frame.info;
    if (typeof info !== "object" || info === null) return null;
    const position = asFiniteNumber((info as Record<string, unknown>).currentTime);
    if (position === null) return null;
    return { position, duration: asFiniteNumber((info as Record<string, unknown>).duration) };
  }

  if (frame.event !== "timeupdate") return null;
  const payload = frame.data;
  if (typeof payload !== "object" || payload === null) return null;
  const position = asFiniteNumber((payload as Record<string, unknown>).seconds);
  if (position === null) return null;
  return { position, duration: asFiniteNumber((payload as Record<string, unknown>).duration) };
}

/** How often the handshake is re-sent before we accept the player is silent. */
const HANDSHAKE_TRIES = 8;
const HANDSHAKE_INTERVAL_MS = 500;

export interface RecordingPlayerProps {
  recording: EmbeddableRecording;
  /** Accessible name for the frame — the session title. */
  title: string;
  /** Where to resume from, in seconds. Baked into the src at FIRST render only. */
  startSeconds?: number | null;
  /** Fired on every tick the player volunteers. Throttling belongs to the caller. */
  onProgress: (position: number, duration: number | null) => void;
  className?: string;
}

export function RecordingPlayer({
  recording,
  title,
  startSeconds,
  onProgress,
  className,
}: RecordingPlayerProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // The src is captured ONCE. Re-deriving it as positions arrive would rewrite
  // the iframe's URL mid-playback and restart the video from the new offset —
  // the exact opposite of resuming. Remounting to a different recording is the
  // caller's job, via `key`.
  const [src] = useState(() =>
    embedSrc(
      recording,
      startSeconds,
      typeof window === "undefined" ? null : window.location.origin,
    ),
  );

  // Held in a ref so a caller passing an inline handler cannot re-arm the
  // listener (which would drop frames on every parent render).
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const post = useCallback(
    (message: unknown) => {
      frameRef.current?.contentWindow?.postMessage(
        JSON.stringify(message),
        PROVIDER_ORIGIN[recording.provider],
      );
    },
    [recording.provider],
  );

  const subscribe = useCallback(() => {
    if (recording.provider === "youtube") {
      post({ event: "listening", id: 1, channel: "widget" });
    } else {
      post({ method: "addEventListener", value: "timeupdate" });
    }
  }, [post, recording.provider]);

  useEffect(() => {
    const provider = recording.provider;
    let heard = false;

    const onMessage = (event: MessageEvent) => {
      // The whole trust check — see the file header.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;

      // Vimeo announces itself before it will accept a subscription.
      const frame = decodeFrame(event.data);
      if (provider === "vimeo" && frame?.event === "ready") subscribe();

      const tick = readPlaybackTick(provider, event.data);
      if (!tick) return;
      heard = true;
      onProgressRef.current(tick.position, tick.duration);
    };

    window.addEventListener("message", onMessage);

    // The handshake races the frame's own load, so it is re-sent until the
    // player answers. Both providers ignore a duplicate subscription.
    let tries = 0;
    subscribe();
    const timer = window.setInterval(() => {
      tries += 1;
      if (heard || tries >= HANDSHAKE_TRIES) {
        window.clearInterval(timer);
        return;
      }
      subscribe();
    }, HANDSHAKE_INTERVAL_MS);

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(timer);
    };
  }, [recording.provider, subscribe]);

  return (
    <div
      className={
        "relative w-full overflow-hidden rounded-lg border border-border bg-black " +
        (className ?? "")
      }
      // 16:9 without an aspect-ratio utility, so the box is reserved before the
      // frame loads and the shelf below it never shifts.
      style={{ paddingTop: "56.25%" }}
    >
      <iframe
        ref={frameRef}
        src={src}
        title={title}
        onLoad={subscribe}
        className="absolute inset-0 h-full w-full border-0"
        allow="accelerometer; autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

export default RecordingPlayer;
