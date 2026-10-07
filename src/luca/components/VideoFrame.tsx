import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { embedSrc, parseEmbeddableRecording } from "@/components/room/RecordingPlayer";

/**
 * An unlisted YouTube (or Vimeo) recording, driven over postMessage with no
 * SDK, the same way the room's RecordingPlayer does it. On top of position
 * ticks this one takes commands (seek, play, pause, speed) so chapters,
 * notes and the hot-seat jump can move the video.
 *
 * Trust: inbound frames are accepted only from this iframe's own window.
 */
export interface VideoHandle {
  seek: (sec: number) => void;
  play: () => void;
  pause: () => void;
  rate: (r: number) => void;
}

interface Props {
  url: string;
  title: string;
  start?: number;
  onTick?: (pos: number, dur: number | null, playing: boolean) => void;
  onEnded?: () => void;
}

const ORIGIN = { youtube: "https://www.youtube-nocookie.com", vimeo: "https://player.vimeo.com" } as const;

export function canEmbed(url: string | null | undefined): boolean {
  return !!parseEmbeddableRecording(url);
}

export const VideoFrame = forwardRef<VideoHandle, Props>(function VideoFrame({ url, title, start, onTick, onEnded }, ref) {
  const rec = parseEmbeddableRecording(url);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [src] = useState(() => (rec ? embedSrc(rec, start, window.location.origin) : ""));
  const cb = useRef({ onTick, onEnded });
  cb.current = { onTick, onEnded };
  const state = useRef({ pos: start ?? 0, dur: null as number | null, playing: false });

  const post = useCallback((msg: unknown) => {
    if (!rec) return;
    frame.current?.contentWindow?.postMessage(rec.provider === "youtube" ? JSON.stringify(msg) : msg, ORIGIN[rec.provider]);
  }, [rec?.provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const yt = useCallback((func: string, args: unknown[] = []) => post({ event: "command", func, args, id: 1, channel: "widget" }), [post]);
  const subscribe = useCallback(() => {
    if (!rec) return;
    if (rec.provider === "youtube") post({ event: "listening", id: 1, channel: "widget" });
    else ["timeupdate", "play", "pause", "ended"].forEach((v) => post({ method: "addEventListener", value: v }));
  }, [post, rec?.provider]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    seek: (sec) => {
      if (!rec) return;
      if (rec.provider === "youtube") { yt("seekTo", [sec, true]); yt("playVideo"); }
      else { post({ method: "setCurrentTime", value: sec }); post({ method: "play" }); }
      state.current.pos = sec;
      cb.current.onTick?.(sec, state.current.dur, true);
    },
    play: () => (rec?.provider === "youtube" ? yt("playVideo") : post({ method: "play" })),
    pause: () => (rec?.provider === "youtube" ? yt("pauseVideo") : post({ method: "pause" })),
    rate: (r) => (rec?.provider === "youtube" ? yt("setPlaybackRate", [r]) : post({ method: "setPlaybackRate", value: r })),
  }), [rec?.provider, yt, post]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rec) return;
    let heard = false;
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      let data: Record<string, unknown> | null = null;
      if (typeof e.data === "string") { try { data = JSON.parse(e.data); } catch { return; } }
      else if (e.data && typeof e.data === "object") data = e.data as Record<string, unknown>;
      if (!data) return;
      const s = state.current;
      if (rec.provider === "youtube") {
        const info = data.info as Record<string, unknown> | undefined;
        if (!info || typeof info !== "object") return;
        heard = true;
        if (typeof info.currentTime === "number") s.pos = info.currentTime;
        if (typeof info.duration === "number" && info.duration > 0) s.dur = info.duration;
        if (typeof info.playerState === "number") {
          s.playing = info.playerState === 1;
          if (info.playerState === 0) cb.current.onEnded?.();
        }
        cb.current.onTick?.(s.pos, s.dur, s.playing);
      } else {
        if (data.event === "ready") { subscribe(); return; }
        heard = true;
        const p = data.data as Record<string, unknown> | undefined;
        if (data.event === "timeupdate" && p) {
          if (typeof p.seconds === "number") s.pos = p.seconds;
          if (typeof p.duration === "number") s.dur = p.duration;
          s.playing = true;
        } else if (data.event === "pause") s.playing = false;
        else if (data.event === "play") s.playing = true;
        else if (data.event === "ended") { s.playing = false; cb.current.onEnded?.(); }
        cb.current.onTick?.(s.pos, s.dur, s.playing);
      }
    };
    window.addEventListener("message", onMessage);
    let tries = 0;
    subscribe();
    const t = window.setInterval(() => {
      tries += 1;
      if (heard || tries >= 10) { window.clearInterval(t); return; }
      subscribe();
    }, 500);
    return () => { window.removeEventListener("message", onMessage); window.clearInterval(t); };
  }, [rec?.provider, subscribe]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rec) return null;
  return (
    <iframe
      ref={frame}
      className="lu-yt"
      src={src}
      title={title}
      onLoad={subscribe}
      allow="accelerometer; autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
});
