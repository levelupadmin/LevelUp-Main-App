import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseVideoProgressReturn {
  currentSeconds: number;
  totalSeconds: number;
  progressPct: number;
  updateProgress: (currentSeconds: number, totalSeconds: number) => void;
  lastPosition: number;
}

export function useVideoProgress(
  chapterId: string | undefined,
  courseId: string | null,
  userId: string | undefined,
  totalDurationSeconds?: number
): UseVideoProgressReturn {
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(totalDurationSeconds || 0);
  const [lastPosition, setLastPosition] = useState(0);

  // Track the latest seconds for the debounced save without triggering re-renders
  const latestSecondsRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(0);

  // Load existing progress on mount
  useEffect(() => {
    if (!chapterId || !userId) return;

    const load = async () => {
      const { data } = await supabase
        .from("chapter_progress")
        .select("last_position_seconds")
        .eq("chapter_id", chapterId)
        .eq("user_id", userId)
        .maybeSingle();

      const pos = data?.last_position_seconds || 0;
      setLastPosition(pos);
      setCurrentSeconds(pos);
      latestSecondsRef.current = pos;
      lastSavedRef.current = pos;
    };

    load();
  }, [chapterId, userId]);

  // Debounced save: persists at most every 15 seconds
  const flushSave = useCallback(async () => {
    if (!chapterId || !courseId || !userId) return;
    const seconds = latestSecondsRef.current;
    // Skip if value hasn't changed since last save
    if (seconds === lastSavedRef.current) return;
    lastSavedRef.current = seconds;

    await supabase
      .from("chapter_progress")
      .upsert(
        {
          user_id: userId,
          chapter_id: chapterId,
          course_id: courseId,
          last_position_seconds: seconds,
          started_at: new Date().toISOString(),
        },
        { onConflict: "user_id,chapter_id" }
      );
  }, [userId, chapterId, courseId]);

  // Flush progress when tab is hidden or page is closing
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushSave();
      }
    };
    const handleBeforeUnload = () => {
      flushSave();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flushSave]);

  // Clean up timer and flush on unmount or chapter change
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // Fire one last save on unmount / chapter change
      flushSave();
    };
  }, [flushSave, chapterId]);

  const updateProgress = useCallback(
    (current: number, total: number) => {
      setCurrentSeconds(current);
      latestSecondsRef.current = current;
      if (total > 0) setTotalSeconds(total);

      // Schedule a debounced save if one isn't already pending
      if (!saveTimerRef.current) {
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null;
          flushSave();
        }, 15000);
      }
    },
    [flushSave]
  );

  const progressPct = useMemo(() => {
    const dur = totalSeconds || totalDurationSeconds || 0;
    if (dur <= 0) return 0;
    return Math.min(Math.round((currentSeconds / dur) * 100), 100);
  }, [currentSeconds, totalSeconds, totalDurationSeconds]);

  return { currentSeconds, totalSeconds, progressPct, updateProgress, lastPosition };
}
