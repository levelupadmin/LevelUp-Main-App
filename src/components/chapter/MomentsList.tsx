import { useEffect, useState } from "react";
import { ListVideo } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { hapticSelection } from "@/lib/haptics";

interface Props {
  chapterId: string;
  /** Seek the player to a moment; ChapterViewer owns player control. */
  onSeek: (seconds: number) => void;
}

interface Moment {
  id: string;
  label: string;
  seconds: number;
}

/** Format whole seconds as an M:SS / H:MM:SS clock. */
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

/**
 * "Moments" / chapter-marker list: instructor-authored jump points read from
 * the chapter_moments table (label + seconds), ordered by sort_order then
 * timestamp. Each row is a tap target that seeks the player via onSeek.
 * Renders nothing when a chapter has no moments, so it can be dropped into the
 * sidebar/tab unconditionally.
 */
export default function MomentsList({ chapterId, onSeek }: Props) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void supabase
      .from("chapter_moments")
      .select("id, label, seconds")
      .eq("chapter_id", chapterId)
      .order("sort_order", { ascending: true })
      .order("seconds", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        setMoments(error || !data ? [] : data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  if (loading || moments.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ListVideo className="h-3.5 w-3.5 text-[hsl(var(--cream))]/70" />
        <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
          Moments
        </p>
      </div>
      <ul className="space-y-1">
        {moments.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => {
                void hapticSelection();
                onSeek(m.seconds);
              }}
              className="pressable w-full flex items-center gap-3 rounded-lg p-2 text-left hover:bg-surface/60 active:bg-surface transition-colors min-h-[44px]"
            >
              <span className="shrink-0 rounded bg-[hsl(var(--cream))]/15 px-2 py-1 font-mono text-[11px] font-semibold text-[hsl(var(--cream))] tabular-nums">
                {clock(m.seconds)}
              </span>
              <span className="flex-1 min-w-0 text-sm leading-snug text-foreground line-clamp-2">
                {m.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
