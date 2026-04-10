import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Lock, Clock } from "lucide-react";

interface Props {
  chapterId: string;
  height?: number;
  onProgress?: (currentSeconds: number, totalSeconds: number) => void;
  startPosition?: number;
}

const VdoCipherPlayer = ({ chapterId, onProgress, startPosition }: Props) => {
  const [otp, setOtp] = useState<string | null>(null);
  const [playbackInfo, setPlaybackInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<"access" | "rate" | "network">("network");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchOtp = async () => {
      setLoading(true);
      setError(null);
      setOtp(null);
      setPlaybackInfo(null);

      try {
        const { data, error: fnErr } = await supabase.functions.invoke("get-vdocipher-otp", {
          body: { chapter_id: chapterId },
        });

        if (cancelled) return;

        if (fnErr) {
          // Parse error from edge function
          const msg = (data as any)?.error || fnErr.message || "Unable to load video";
          if (msg.includes("enrol") || msg.includes("access")) {
            setErrorType("access");
          } else if (msg.includes("Too many")) {
            setErrorType("rate");
          } else {
            setErrorType("network");
          }
          setError(msg);
        } else if (data?.otp && data?.playbackInfo) {
          setOtp(data.otp);
          setPlaybackInfo(data.playbackInfo);
        } else {
          setErrorType("network");
          setError("Unable to load video. Please try again.");
        }
      } catch {
        if (!cancelled) {
          setErrorType("network");
          setError("Unable to load video. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchOtp();
    return () => { cancelled = true; };
  }, [chapterId]);

  // Listen for VdoCipher postMessage progress events
  useEffect(() => {
    if (!onProgress) return;
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
  }, [onProgress]);

  if (loading) {
    return (
      <div className="aspect-video bg-card rounded-[16px] border border-border overflow-hidden">
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  if (error) {
    const Icon = errorType === "access" ? Lock : errorType === "rate" ? Clock : AlertCircle;
    return (
      <div className="aspect-video bg-card rounded-[16px] border border-border flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <Icon className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-video bg-card rounded-[16px] border border-border overflow-hidden">
      <iframe
        src={`https://player.vdocipher.com/v2/?otp=${otp}&playbackInfo=${playbackInfo}${startPosition ? `&t=${startPosition}` : ""}`}
        style={{ border: 0, width: "100%", height: "100%" }}
        allow="encrypted-media"
        allowFullScreen
        title="DRM Video Player"
      />
    </div>
  );
};

export default VdoCipherPlayer;
