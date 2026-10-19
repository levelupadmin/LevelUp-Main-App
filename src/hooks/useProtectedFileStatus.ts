import { useEffect, useState } from "react";
import { fetchSignedMediaUrl } from "@/lib/protectedMedia";

export type ProtectedFileStatus = "unknown" | "checking" | "present" | "missing";

/**
 * Admin-side check: is the file this protected chapter points at actually in
 * storage? A chapter can carry a key whose upload never finished, and the
 * editor used to show it as "attached" while students got a dead player.
 * Asks get-video-src (admins pass its access gate), which reads the SAVED row,
 * so `mediaKey` is only a re-check trigger. Anything other than a clear
 * answer stays "unknown" rather than raising a false alarm.
 */
export function useProtectedFileStatus(
  chapterId: string | undefined,
  mediaKey: string | undefined,
  enabled: boolean
): ProtectedFileStatus {
  const [status, setStatus] = useState<ProtectedFileStatus>("unknown");

  useEffect(() => {
    if (!enabled || !chapterId || chapterId.startsWith("new-") || !mediaKey) {
      setStatus("unknown");
      return;
    }
    let cancelled = false;
    setStatus("checking");
    void fetchSignedMediaUrl(chapterId).then((res) => {
      if (cancelled) return;
      setStatus(res.kind === "ok" ? "present" : res.kind === "missing" ? "missing" : "unknown");
    });
    return () => {
      cancelled = true;
    };
  }, [chapterId, mediaKey, enabled]);

  return status;
}
