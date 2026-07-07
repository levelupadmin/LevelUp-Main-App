import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Lock, Clock, Loader2, Play, RotateCcw } from "lucide-react";
import { VdoPlayerNative, isNativeDrmAvailable } from "@/lib/vdoNative";
import { toast } from "@/lib/toast";
import { hapticImpact } from "@/lib/haptics";
import { captureException } from "@/lib/sentry";

interface Props {
  chapterId: string;
  height?: number;
  onProgress?: (currentSeconds: number, totalSeconds: number) => void;
  startPosition?: number;
  /** Shown in the native fullscreen player chrome (iOS only). */
  title?: string;
  /** iOS native poster image behind the tap-to-play affordance. */
  posterUrl?: string | null;
  /** Duration badge on the iOS native poster (seconds). */
  durationSeconds?: number | null;
}

/** Compact h:mm:ss / m:ss for the poster duration badge. */
function formatDuration(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

type OtpErrorType = "access" | "rate" | "network";

type VdoOtpResult =
  | { ok: true; otp: string; playbackInfo: string; videoId?: string }
  | { ok: false; errorType: OtpErrorType; message: string };

/**
 * Shared OTP mint used by BOTH playback paths: the web/Android iframe embed
 * (fetched on mount) and the iOS native FairPlay handoff (fetched at tap
 * time, OTP ttl is 300s, so native must mint as late as possible).
 * Error classification mirrors the original inline logic exactly.
 */
async function fetchVdoOtp(chapterId: string): Promise<VdoOtpResult> {
  try {
    const { data, error: fnErr } = await supabase.functions.invoke("get-vdocipher-otp", {
      body: { chapter_id: chapterId },
    });

    if (fnErr) {
      // On a non-2xx, supabase-js puts the function's JSON body on
      // fnErr.context (a Response), NOT on `data`, so reading data?.error
      // always missed and we defaulted to "network", masking the real reason
      // (sign-in required / no access / rate limited). Read the body.
      let msg = (data as any)?.error || fnErr.message || "Unable to load video";
      try {
        const ctx = (fnErr as { context?: Response })?.context;
        if (ctx && typeof ctx.clone === "function") {
          const body = await ctx.clone().json().catch(() => null);
          if (body?.error) msg = body.error;
        }
      } catch {
        // keep the fallback msg
      }
      let errorType: OtpErrorType = "network";
      if (msg.includes("enrol") || msg.includes("access") || msg.includes("Sign in")) {
        errorType = "access";
      } else if (msg.includes("Too many") || msg.includes("wait")) {
        errorType = "rate";
      }
      return { ok: false, errorType, message: msg };
    }

    if (data?.otp && data?.playbackInfo) {
      return {
        ok: true,
        otp: data.otp,
        playbackInfo: data.playbackInfo,
        // Edge fn may also return the raw videoId (needed by the native
        // SDK's VdoAsset.createAsset); forward it when present.
        videoId: typeof data.videoId === "string" ? data.videoId : undefined,
      };
    }

    return { ok: false, errorType: "network", message: "Unable to load video. Please try again." };
  } catch {
    return { ok: false, errorType: "network", message: "Unable to load video. Please try again." };
  }
}

const VdoCipherPlayer = ({ chapterId, onProgress, startPosition, title, posterUrl, durationSeconds }: Props) => {
  // iOS Capacitor shell: WKWebView cannot play FairPlay, so the iframe is
  // never mounted there; playback hands off to the native plugin instead.
  // Web + Android keep the iframe path untouched (Widevine works in the
  // Android WebView).
  const nativeDrm = isNativeDrmAvailable();

  // Session only steers the error-state CTA (anon → Sign in, signed-in →
  // enrol guidance); the OTP mint itself stays server-authorised.
  const { session } = useAuth();

  const [otp, setOtp] = useState<string | null>(null);
  const [playbackInfo, setPlaybackInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<OtpErrorType>("network");
  const [loading, setLoading] = useState(!nativeDrm);
  const [nativeLaunching, setNativeLaunching] = useState(false);
  // Bumped by the Retry button on network errors; re-runs the OTP mint.
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    // Native path mints its OTP at tap time (ttl 300s), not page load.
    if (nativeDrm) return;

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      setOtp(null);
      setPlaybackInfo(null);

      const result = await fetchVdoOtp(chapterId);
      if (cancelled) return;

      if (result.ok) {
        setOtp(result.otp);
        setPlaybackInfo(result.playbackInfo);
      } else {
        setErrorType(result.errorType);
        setError(result.message);
        // The raw failure reason is for us, not the student. A network fail
        // carries a technical string (e.g. supabase-js's "Failed to send a
        // request to the Edge Function") that must never reach the screening
        // room — the UI shows warm microcopy instead, so route the real reason
        // to Sentry + console for diagnosis. Access/rate messages are human,
        // actionable copy and stay on screen.
        if (result.errorType === "network") {
          console.error("[VdoCipherPlayer] OTP mint failed (network):", result.message);
          captureException(new Error(`VdoCipher OTP mint failed: ${result.message}`), {
            chapterId,
            errorType: result.errorType,
          });
        }
      }
      setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [chapterId, nativeDrm, retryKey]);

  // Listen for VdoCipher postMessage progress events. These come from the
  // iframe embed only; on iOS native there is no iframe, so don't attach
  // the listener at all. (Progress/completion tracking from the native
  // player is out of scope for now; when added it will flow through plugin
  // events (VdoPlayerNative.addListener), not window postMessage.)
  useEffect(() => {
    if (!onProgress || nativeDrm) return;
    const handler = (event: MessageEvent) => {
      if (event.origin !== "https://player.vdocipher.com") return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data.currentTime !== undefined) {
          onProgress(Math.floor(data.currentTime), Math.floor(data.duration || 0));
        }
      } catch {
        // ignore non-JSON messages
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onProgress, nativeDrm]);

  // iOS native progress: the fullscreen FairPlay player has no iframe/postMessage,
  // so the Swift plugin emits "playerTimeUpdate" (every ~5s) and a final
  // "playerClosed" carrying the last position. Feed both into onProgress so
  // resume/completion track on iOS exactly like the web iframe. We subscribe once
  // (deps: [nativeDrm]) and read onProgress through a ref to avoid re-subscribing
  // when the parent passes a fresh callback each render.
  const onProgressRef = useRef(onProgress);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => {
    if (!nativeDrm) return;
    let active = true;
    const handles: Array<{ remove: () => void }> = [];
    const report = (cur?: number, total?: number) => {
      if (cur != null && total && total > 0) {
        onProgressRef.current?.(Math.floor(cur), Math.floor(total));
      }
    };
    (async () => {
      const h1 = await VdoPlayerNative.addListener("playerTimeUpdate", (d) =>
        report(d?.currentSeconds, d?.totalSeconds),
      );
      const h2 = await VdoPlayerNative.addListener("playerClosed", (d) => {
        report(d?.currentSeconds, d?.totalSeconds);
        setNativeLaunching(false);
      });
      if (!active) { h1.remove(); h2.remove(); return; }
      handles.push(h1, h2);
    })();
    return () => { active = false; handles.forEach((h) => h.remove()); };
  }, [nativeDrm]);

  const handleNativePlay = async () => {
    if (nativeLaunching) return;
    setNativeLaunching(true);
    hapticImpact("light");
    try {
      const result = await fetchVdoOtp(chapterId);
      if (!result.ok) {
        // errorType is now accurate (see fetchVdoOtp). Show the real reason for
        // access/rate; keep a clean, actionable line for genuine network fails.
        toast.error(
          result.errorType === "network"
            ? "Couldn't start playback. Check your connection and try again."
            : result.message,
        );
        return;
      }
      await VdoPlayerNative.play({
        otp: result.otp,
        playbackInfo: result.playbackInfo,
        videoId: result.videoId,
        title,
        startPosition,
      });
    } catch (e) {
      // Surface the native plugin's reject reason so a failing device reports
      // the actual cause (SDK error / "not implemented") instead of a generic
      // message, the iOS FairPlay path can't be debugged any other way.
      const msg = (e as { message?: string })?.message;
      toast.error(msg ? `Playback error: ${msg}`.slice(0, 140) : "Couldn't start playback. Try again.");
    } finally {
      setNativeLaunching(false);
    }
  };

  if (nativeDrm) {
    // FairPlay can't play in WKWebView, so iOS hands off to the native
    // fullscreen player. In place of the iframe we render a REAL video poster
    // (chapter thumbnail + scrim + play affordance + duration), framed like the
    // embed, so tapping it reads as one intentional gesture into fullscreen,
    // not a jarring jump out of a blank box. The whole poster is the tap target.
    return (
      <div className="relative aspect-video w-full max-w-full bg-card rounded-[16px] border border-border overflow-hidden">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title ? `${title} thumbnail` : "Lesson thumbnail"}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : null}
        {/* Scrim: depth + keeps the play glyph legible over any thumbnail. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/35" />
        <button
          type="button"
          onClick={handleNativePlay}
          disabled={nativeLaunching}
          aria-label={nativeLaunching ? "Starting playback" : "Play video"}
          className="group absolute inset-0 flex items-center justify-center"
        >
          <span className="pressable inline-flex h-16 w-16 items-center justify-center rounded-full bg-cream text-cream-text shadow-[0_8px_28px_-6px_rgba(243,229,200,0.55)] transition-transform group-active:scale-95 disabled:opacity-60">
            {nativeLaunching
              ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
              : <Play className="h-7 w-7 ml-0.5 fill-current" aria-hidden="true" />}
          </span>
        </button>
        <span className="pointer-events-none absolute bottom-2.5 left-3 text-[11px] font-medium text-white/80 drop-shadow">
          Plays fullscreen
        </span>
        {durationSeconds ? (
          <span className="pointer-events-none absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white">
            <Clock className="h-3 w-3" aria-hidden="true" /> {formatDuration(durationSeconds)}
          </span>
        ) : null}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="aspect-video w-full max-w-full bg-card rounded-[16px] border border-border overflow-hidden">
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  if (error) {
    const Icon = errorType === "access" ? Lock : errorType === "rate" ? Clock : AlertCircle;
    // Craft-register copy (Pillar 5): a serif-italic headline + one calm
    // sentence, one voice with EmptyState / SystemState. On the network path we
    // never echo the raw `error` — it's a technical string ("Failed to send a
    // request to the Edge Function") already routed to Sentry above; the
    // student sees warm microcopy. Access/rate errors carry human, actionable
    // server copy, so their sentence stays the real message.
    const isNetwork = errorType === "network";
    const heading =
      errorType === "access" ? "Locked for now" : errorType === "rate" ? "One moment" : "Lost the signal";
    const body = isNetwork
      ? "We couldn't load this lesson just now. Check your connection and try again."
      : error;
    return (
      <div className="aspect-video w-full max-w-full bg-card rounded-[16px] border border-border flex items-center justify-center">
        <div className="text-center max-w-md px-6 space-y-3">
          <Icon className="h-10 w-10 mx-auto text-muted-foreground" />
          <h3 className="font-serif-italic text-xl text-cream">{heading}</h3>
          <p className="text-sm text-muted-foreground">{body}</p>
          {/* Dead-end recovery: each error class gets a next step instead
              of a bare message. Anon access errors route to sign-in (and
              back here via Login's location.state.from); signed-in access
              errors point at enrolment; network errors re-mint the OTP. */}
          {errorType === "access" &&
            (!session ? (
              <Link
                to={`/login?next=${encodeURIComponent(window.location.pathname)}`}
                state={{ from: { pathname: window.location.pathname } }}
                className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-cream text-cream-text text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Sign in
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">
                View the program page to enrol and unlock this lesson.
              </p>
            ))}
          {errorType === "network" && (
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    // Fixed aspect-ratio box with max-w-full + overflow-hidden so the player
    // can never exceed the viewport width (no sideways pan) and the iframe is
    // clipped to the box. The iframe is absolutely positioned inside, so when
    // the notes/Q&A keyboard opens and the page reflows, the player keeps its
    // own fixed-size box instead of becoming a scroll/pan target. We do NOT
    // set touch-action here, VdoCipher needs touch events for its own
    // play/pause + scrub controls.
    <div className="relative aspect-video w-full max-w-full bg-card rounded-[16px] border border-border overflow-hidden">
      <iframe
        src={`https://player.vdocipher.com/v2/?otp=${otp}&playbackInfo=${playbackInfo}${startPosition ? `&t=${startPosition}` : ""}`}
        style={{ border: 0, position: "absolute", inset: 0, width: "100%", height: "100%", maxWidth: "100%" }}
        allow="encrypted-media"
        allowFullScreen
        title="DRM Video Player"
      />
    </div>
  );
};

export default VdoCipherPlayer;
