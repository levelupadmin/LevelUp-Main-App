import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Lock, Clock, Loader2, Play } from "lucide-react";
import { VdoPlayerNative, isNativeDrmAvailable } from "@/lib/vdoNative";
import { toast } from "@/lib/toast";
import { hapticImpact } from "@/lib/haptics";

interface Props {
  chapterId: string;
  height?: number;
  onProgress?: (currentSeconds: number, totalSeconds: number) => void;
  startPosition?: number;
  /** Shown in the native fullscreen player chrome (iOS only). */
  title?: string;
}

type OtpErrorType = "access" | "rate" | "network";

type VdoOtpResult =
  | { ok: true; otp: string; playbackInfo: string; videoId?: string }
  | { ok: false; errorType: OtpErrorType; message: string };

/**
 * Shared OTP mint used by BOTH playback paths: the web/Android iframe embed
 * (fetched on mount) and the iOS native FairPlay handoff (fetched at tap
 * time — OTP ttl is 300s, so native must mint as late as possible).
 * Error classification mirrors the original inline logic exactly.
 */
async function fetchVdoOtp(chapterId: string): Promise<VdoOtpResult> {
  try {
    const { data, error: fnErr } = await supabase.functions.invoke("get-vdocipher-otp", {
      body: { chapter_id: chapterId },
    });

    if (fnErr) {
      // On a non-2xx, supabase-js puts the function's JSON body on
      // fnErr.context (a Response), NOT on `data` — so reading data?.error
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

const VdoCipherPlayer = ({ chapterId, onProgress, startPosition, title }: Props) => {
  // iOS Capacitor shell: WKWebView cannot play FairPlay, so the iframe is
  // never mounted there — playback hands off to the native plugin instead.
  // Web + Android keep the iframe path untouched (Widevine works in the
  // Android WebView).
  const nativeDrm = isNativeDrmAvailable();

  const [otp, setOtp] = useState<string | null>(null);
  const [playbackInfo, setPlaybackInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<OtpErrorType>("network");
  const [loading, setLoading] = useState(!nativeDrm);
  const [nativeLaunching, setNativeLaunching] = useState(false);

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
      }
      setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [chapterId, nativeDrm]);

  // Listen for VdoCipher postMessage progress events. These come from the
  // iframe embed only — on iOS native there is no iframe, so don't attach
  // the listener at all. (Progress/completion tracking from the native
  // player is out of scope for now; when added it will flow through plugin
  // events — VdoPlayerNative.addListener — not window postMessage.)
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
      // message — the iOS FairPlay path can't be debugged any other way.
      const msg = (e as { message?: string })?.message;
      toast.error(msg ? `Playback error: ${msg}`.slice(0, 140) : "Couldn't start playback. Try again.");
    } finally {
      setNativeLaunching(false);
    }
  };

  if (nativeDrm) {
    // Poster/handoff card in place of the iframe: same dark aspect-video
    // shell as the embed, with a cream play affordance that launches the
    // native fullscreen FairPlay player.
    return (
      <div className="relative aspect-video w-full max-w-full bg-card rounded-[16px] border border-border overflow-hidden flex flex-col items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleNativePlay}
          disabled={nativeLaunching}
          aria-label={nativeLaunching ? "Starting playback" : "Play video"}
          className="pressable inline-flex h-16 w-16 items-center justify-center rounded-full bg-cream text-cream-text shadow-[0_8px_24px_-8px_rgba(243,229,200,0.45)] disabled:opacity-60"
        >
          {nativeLaunching
            ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
            : <Play className="h-7 w-7 ml-0.5 fill-current" aria-hidden="true" />}
        </button>
        <p className="text-xs text-muted-foreground">Plays in fullscreen player</p>
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
    return (
      <div className="aspect-video w-full max-w-full bg-card rounded-[16px] border border-border flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <Icon className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{error}</p>
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
    // set touch-action here — VdoCipher needs touch events for its own
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
