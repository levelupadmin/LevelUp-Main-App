import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, RotateCw, FileText, BookOpen } from "lucide-react";
import VdoCipherPlayer from "@/components/VdoCipherPlayer";
import { supabase } from "@/integrations/supabase/client";
import { useMotionSafe, durations, easings, instant } from "@/lib/motion";
import { tapTick, hapticSelection } from "@/lib/haptics";
import type { Chapter } from "@/components/chapter/types";

interface Props {
  chapter: Chapter;
  updateProgress: (currentSeconds: number, durationSeconds: number) => void;
  lastPosition: number;
}

type SeekSide = "back" | "forward";

// Double-tap seek tuning.
const SEEK_STEP = 10; // ±10s per double-tap, the platform-standard jump.
const DOUBLE_TAP_MS = 300; // two taps inside this window = a double-tap.
// Bottom strip (px) left untouched so a double-tap never lands on the native
// scrubber / play button; the side zones exclude the outer control chrome too.
const CONTROLS_STRIP = 56;
// How long the scrub caption lingers after the seek settles before it fades —
// long enough to read the landing moment, short enough to get out of the way.
const CAPTION_LINGER_MS = 900;

/** A chapter marker: an instructor-authored jump point (label + timestamp). */
interface Moment {
  id: string;
  label: string;
  seconds: number;
}

/** Format whole seconds as an M:SS / H:MM:SS clock for the scrub caption. */
function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
  }
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** The moment the playhead sits in: the last marker at or before `seconds`. */
function momentAt(moments: Moment[], seconds: number): Moment | null {
  let active: Moment | null = null;
  for (const m of moments) {
    if (m.seconds <= seconds) active = m;
    else break;
  }
  return active;
}

/**
 * The ONE app-owned video surface: an HLS (`.m3u8` / WebinarKit) stream played
 * through a first-party <video> tag (Chrome/Firefox get the hls.js fallback).
 * Because we own this element — unlike the VdoCipher DRM iframe or the
 * Vimeo/YouTube embeds, which are cross-origin and cannot receive our handlers —
 * it's the only place we layer double-tap ±10s seek with a ripple.
 *
 * The gesture listens on the <video> itself (never an overlay), so it never
 * intercepts the native controls: a tap on the scrubber/play button hits the
 * browser's own UI, and the ripple layer is `pointer-events-none`. Left 40% =
 * rewind, right 40% = forward; the centre column and the bottom control strip
 * stay pass-through so single taps still toggle the native controls. Reduced
 * motion drops the ripple's scale theatrics to a plain fade — the seek itself
 * always fires.
 *
 * STEAL-4 (Quartr) scrub caption: because we own the timeline, scrubbing the
 * native scrubber surfaces a live "M:SS · Moment title" pill above the control
 * strip. The timestamp updates continuously (tabular-nums, no reflow); the
 * moment title crossfades (opacity + ±8px slide) only as the playhead crosses a
 * marker boundary, so fast scrubbing stays readable. A `hapticSelection()` ticks
 * on each boundary crossing (native only). Chapters without markers fall back to
 * a timestamp-only pill. Reduced motion swaps the title instantly.
 */
function AppOwnedVideo({ url, title, chapterId }: { url: string; title: string; chapterId: string }) {
  const motionSafe = useMotionSafe();
  const videoRef = useRef<HTMLVideoElement>(null);
  // Last tap's timestamp + side, for double-tap detection. A second tap on the
  // same side within DOUBLE_TAP_MS commits the seek; anything else re-arms.
  const lastTapRef = useRef<{ t: number; side: SeekSide } | null>(null);
  const [ripple, setRipple] = useState<{ side: SeekSide; id: number } | null>(null);

  // ── Scrub caption state ──
  const [moments, setMoments] = useState<Moment[]>([]);
  // The live playhead time shown in the caption while scrubbing.
  const [scrubTime, setScrubTime] = useState(0);
  // Caption visibility: true through the drag and its short linger afterwards.
  const [captionShown, setCaptionShown] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Last moment id the caption showed, so the boundary haptic fires exactly once
  // per crossing rather than on every seeking event inside the same segment.
  const lastMomentIdRef = useRef<string | null>(null);

  // Auto-clear the ripple so AnimatePresence can play its exit; keyed on the
  // ripple id so a rapid second seek restarts the timer cleanly.
  useEffect(() => {
    if (!ripple) return;
    const t = setTimeout(() => setRipple(null), 500);
    return () => clearTimeout(t);
  }, [ripple]);

  // Chapter markers for the scrub caption — same source as MomentsList, read
  // independently here so the app-owned <video> is self-contained. Failures
  // degrade silently to a timestamp-only caption.
  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("chapter_moments")
      .select("id, label, seconds")
      .eq("chapter_id", chapterId)
      .order("sort_order", { ascending: true })
      .order("seconds", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        setMoments(error || !data ? [] : (data as Moment[]));
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  // Tidy the linger timer on unmount.
  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const activeMoment = captionShown ? momentAt(moments, scrubTime) : null;
  const activeMomentId = activeMoment?.id ?? null;

  // Boundary tick: one selection haptic each time the caption enters a new
  // moment during a scrub (the wrapper already no-ops off-device).
  useEffect(() => {
    if (!captionShown) {
      lastMomentIdRef.current = activeMomentId;
      return;
    }
    if (activeMomentId && activeMomentId !== lastMomentIdRef.current) {
      void hapticSelection();
    }
    lastMomentIdRef.current = activeMomentId;
  }, [activeMomentId, captionShown]);

  // Show the caption for the duration of a scrub. `seeking` fires repeatedly as
  // the user drags; `seeked` schedules the fade-out after a readable linger.
  const onSeeking = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setScrubTime(e.currentTarget.currentTime);
    setCaptionShown(true);
  };

  const onSeeked = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setScrubTime(e.currentTarget.currentTime);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setCaptionShown(false), CAPTION_LINGER_MS);
  };

  const seek = (v: HTMLVideoElement, side: SeekSide) => {
    if (side === "back") {
      v.currentTime = Math.max(0, v.currentTime - SEEK_STEP);
    } else {
      // duration is NaN until metadata loads; fall back to Infinity so the min
      // never clamps to NaN before we know the length.
      v.currentTime = Math.min(v.duration || Infinity, v.currentTime + SEEK_STEP);
    }
    void tapTick();
    setRipple({ side, id: Date.now() });
  };

  // Which seek zone a point falls in, or null for the centre column / bottom
  // control strip / an unlaid-out element. Pure geometry so both the tap
  // counter and the native-dblclick suppressor read the zones identically.
  const sideFromPoint = (clientX: number, clientY: number): SeekSide | null => {
    const v = videoRef.current;
    if (!v) return null;
    const rect = v.getBoundingClientRect();
    if (rect.width === 0) return null; // not laid out (e.g. jsdom without a mocked rect)
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    // Leave the bottom control strip alone — that's the scrubber's territory.
    if (y > rect.height - CONTROLS_STRIP) return null;
    if (x < rect.width * 0.4) return "back";
    if (x > rect.width * 0.6) return "forward";
    // Centre column: leave the native show/hide-controls toggle untouched.
    return null;
  };

  const handleTap = (clientX: number, clientY: number) => {
    const v = videoRef.current;
    if (!v) return;
    const side = sideFromPoint(clientX, clientY);
    if (!side) {
      lastTapRef.current = null;
      return;
    }
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.side === side && now - last.t < DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      seek(v, side);
    } else {
      lastTapRef.current = { t: now, side };
    }
  };

  // hls.js fallback: Safari / iOS play m3u8 natively; Chrome/Firefox dynamically
  // load hls.js and attach. Unchanged from the original inline dispatcher.
  const onLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.canPlayType("application/vnd.apple.mpegurl")) return;
    if (v.src === url) return; // already attached
    import("hls.js")
      .then(({ default: Hls }) => {
        if (!Hls.isSupported()) {
          v.src = url;
          return;
        }
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(v);
      })
      .catch(() => {
        v.src = url;
      });
  };

  const rippleIcon =
    ripple?.side === "back" ? (
      <RotateCcw className="h-6 w-6" strokeWidth={2.25} />
    ) : (
      <RotateCw className="h-6 w-6" strokeWidth={2.25} />
    );

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        key={url}
        controls
        playsInline
        preload="metadata"
        className="h-full w-full bg-black"
        // `manipulation` kills the double-tap-zoom + 300ms click delay ON THE
        // VIDEO ONLY, so our double-tap fires promptly; page scroll is untouched.
        // (This addresses touch only; desktop-mouse dblclick→fullscreen is
        // suppressed separately in onDoubleClick below.)
        style={{ touchAction: "manipulation" }}
        title={title}
        onLoadedMetadata={onLoadedMetadata}
        onSeeking={onSeeking}
        onSeeked={onSeeked}
        onClick={(e) => handleTap(e.clientX, e.clientY)}
        // Desktop Chrome toggles native fullscreen on a <video> double-click.
        // Since we've repurposed the double-tap for ±10s seek, suppress that
        // default — but ONLY inside our seek zones, so a double-click in the
        // centre column keeps the browser's native fullscreen behaviour.
        onDoubleClick={(e) => {
          if (sideFromPoint(e.clientX, e.clientY)) e.preventDefault();
        }}
        src={url}
      />
      {/* Seek ripple — decorative, never intercepts the controls. */}
      <AnimatePresence>
        {ripple && (
          <motion.div
            key={ripple.id}
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 flex w-2/5 items-center justify-center ${
              ripple.side === "back" ? "left-0" : "right-0"
            }`}
            initial={motionSafe.reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={motionSafe.reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={motionSafe.reduced ? { opacity: 0 } : { opacity: 0, scale: 1.1 }}
            transition={motionSafe.springs.snap}
          >
            <span className="flex flex-col items-center gap-1 rounded-full bg-black/55 px-4 py-3 text-[hsl(var(--cream))]">
              {rippleIcon}
              <span className="font-mono text-xs font-semibold tabular-nums">
                {SEEK_STEP}s
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* STEAL-4 scrub caption — decorative, sits ABOVE the control strip so it
          never covers the native scrubber, and is pointer-events-none so it
          never intercepts a drag. */}
      <AnimatePresence>
        {captionShown && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 flex justify-center px-4"
            style={{ bottom: CONTROLS_STRIP }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionSafe.reduced ? instant : { duration: durations.fast, ease: easings.out }}
          >
            <span className="flex max-w-full items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[hsl(var(--cream))]">
              <span className="font-mono text-xs font-semibold tabular-nums">{clock(scrubTime)}</span>
              {activeMoment && (
                <>
                  <span className="text-[hsl(var(--cream))]/40">·</span>
                  {/* Single-cell grid so the incoming and outgoing titles
                      overlap (no vertical stack) while the box keeps its
                      intrinsic width — the crossfade never shifts layout. */}
                  <span className="grid h-4 max-w-[46vw] items-center overflow-hidden text-xs">
                    <AnimatePresence initial={false}>
                      <motion.span
                        key={activeMomentId}
                        className="col-start-1 row-start-1 truncate"
                        initial={motionSafe.reduced ? { opacity: 0 } : { opacity: 0, x: 8 }}
                        animate={motionSafe.reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
                        exit={motionSafe.reduced ? { opacity: 0 } : { opacity: 0, x: -8 }}
                        transition={motionSafe.reduced ? instant : { duration: durations.fast, ease: easings.out }}
                      >
                        {activeMoment.label}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Renders a chapter's primary media based on content_type: VdoCipher DRM, HLS
 * (.m3u8 / WebinarKit), Vimeo / YouTube / generic iframe, PDF, image, embedded,
 * article placeholder, or a "not available" fallback.
 *
 * Player-surface ownership (drives where gestures can attach — see T3 findings):
 *  • VdoCipher DRM → cross-origin <iframe> (VdoCipherPlayer). Off-limits.
 *  • HLS video → first-party <video> (AppOwnedVideo). App-owned → double-tap seek.
 *  • Vimeo / YouTube / generic / embedded / pdf → cross-origin <iframe>. Off-limits.
 *  • image / article → static, no playback surface.
 */
export default function ChapterMediaPlayer({ chapter, updateProgress, lastPosition }: Props) {
  return chapter.content_type === "video" && (chapter as any).video_type === "vdocipher" && (chapter as any).vdocipher_video_id ? (
    <div className="w-full max-w-full rounded-2xl overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] ring-1 ring-white/5">
      <VdoCipherPlayer
        chapterId={chapter.id}
        onProgress={updateProgress}
        startPosition={lastPosition}
        title={chapter.title}
        posterUrl={chapter.thumbnail_url || chapter.vdocipher_thumbnail_url}
        durationSeconds={chapter.duration_seconds}
      />
    </div>
  ) : chapter.content_type === "video" && (chapter.media_url || chapter.embed_url) ? (
    <div className="aspect-video w-full max-w-full bg-card rounded-2xl overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] ring-1 ring-white/5">
      {(() => {
        // Multi-source dispatcher. Respects `media_provider` if set
        // (post-TagMango-migration chapters explicitly tag their
        // provider). Falls back to URL-pattern detection for older
        // rows where media_provider defaulted to vdocipher.
        const url = chapter.embed_url || chapter.media_url || "";
        const provider = (chapter as any).media_provider || "";

        // HLS playlists (Bunny CDN from WebinarKit, or any .m3u8)
        // render in a <video> tag, iframe wouldn't be able to play
        // m3u8 natively. Safari + iOS handle this directly; Chrome
        // gets dynamic hls.js fallback. This is the only app-owned
        // playback surface, so it's the only one that gets gestures.
        const isHls = /\.m3u8(\?|$)/i.test(url) || provider === "webinarkit";
        if (isHls) {
          return <AppOwnedVideo url={url} title={chapter.title} chapterId={chapter.id} />;
        }

        // Vimeo / YouTube / generic iframe.
        let src = url;
        const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
        if (vimeoMatch) src = `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=0&title=0&byline=0&portrait=0`;
        else if (provider === "vimeo" && /^\d+$/.test(url)) {
          // media_provider='vimeo' with raw numeric ID (no full URL)
          src = `https://player.vimeo.com/video/${url}?autoplay=0&title=0&byline=0&portrait=0`;
        } else {
          const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
          if (ytMatch) src = `https://www.youtube.com/embed/${ytMatch[1]}`;
          else if (provider === "youtube" && /^[a-zA-Z0-9_-]{6,15}$/.test(url)) {
            src = `https://www.youtube.com/embed/${url}`;
          }
        }

        return (
          <iframe
            src={src}
            className="w-full max-w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            frameBorder="0"
            title={chapter.title}
          />
        );
      })()}
    </div>
  ) : chapter.content_type === "pdf" && chapter.media_url ? (
    <div className="w-full rounded-2xl border border-border overflow-hidden bg-card h-[55vh] sm:h-[80vh]">
      <iframe src={chapter.media_url} className="w-full h-full" title={`${chapter.title} - PDF`} />
    </div>
  ) : chapter.content_type === "image" && chapter.media_url ? (
    <div className="w-full rounded-2xl border border-border overflow-hidden bg-card flex items-center justify-center p-4">
      <img src={chapter.media_url} alt={chapter.title} className="max-w-full max-h-[80vh] object-contain rounded-lg" />
    </div>
  ) : chapter.content_type === "embedded" && chapter.embed_url ? (
    <div className="aspect-video bg-card rounded-2xl border border-border overflow-hidden">
      <iframe src={chapter.embed_url} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen frameBorder="0" title={chapter.title} />
    </div>
  ) : chapter.content_type === "article" || chapter.content_type === "text" ? (
    <div className="bg-card rounded-2xl border border-border p-8 flex items-center gap-4">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-2 text-cream">
        <FileText className="h-8 w-8" aria-hidden="true" />
      </span>
      <div>
        <p className="font-medium">{chapter.title}</p>
        <p className="text-muted-foreground text-sm mt-1">Scroll down to read the article content</p>
      </div>
    </div>
  ) : (
    <div className="aspect-video bg-card rounded-2xl border border-border flex items-center justify-center">
      <div className="text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-cream">
          <BookOpen className="h-8 w-8" aria-hidden="true" />
        </span>
        <p className="text-muted-foreground text-sm">{chapter.title}</p>
        <p className="text-muted-foreground/60 text-xs mt-1">Content not available</p>
      </div>
    </div>
  );
}
