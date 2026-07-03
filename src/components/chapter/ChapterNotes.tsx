import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { hapticImpact, hapticSelection } from "@/lib/haptics";

interface Props {
  chapterId: string;
  /** Returns the player's current playback position in seconds. */
  getCurrentTime: () => number;
  /** Seek the player to a timestamped note. */
  onSeek: (seconds: number) => void;
}

/** One parsed timestamped note. */
interface ParsedNote {
  /** Stable key: the source line index. */
  index: number;
  /** Offset in seconds, or null for an untimestamped line. */
  seconds: number | null;
  /** The note text after the [MM:SS] prefix (or the whole line). */
  text: string;
}

const TS_RE = /^\s*\[(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\]\s?(.*)$/;

/** Parse "[MM:SS] text" / "[H:MM:SS] text" lines into structured notes. */
function parseNotes(body: string): ParsedNote[] {
  if (!body) return [];
  return body.split("\n").map((line, index) => {
    const m = TS_RE.exec(line);
    if (!m) return { index, seconds: null, text: line };
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const c = m[3] != null ? parseInt(m[3], 10) : null;
    // Two groups → MM:SS; three groups → H:MM:SS.
    const seconds = c != null ? a * 3600 + b * 60 + c : a * 60 + b;
    return { index, seconds, text: m[4] ?? "" };
  });
}

/** Format whole seconds as the [MM:SS] / [H:MM:SS] prefix label. */
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
 * Timestamped notes for a lesson. Persists to the existing per-user/chapter
 * `chapter_notes.body` text column (same store ChapterViewer's scratchpad
 * uses). There is no per-note table or seconds column, so each note lives as
 * a `[MM:SS] …` line inside `body`. That keeps notes interoperable with the
 * plain scratchpad and synced across devices.
 *
 *   - "Add note at MM:SS" captures getCurrentTime() and inserts a timestamped
 *     line, focusing it for immediate typing.
 *   - Tapping a note's timestamp chip calls onSeek(seconds) so ChapterViewer
 *     can scrub the player.
 *   - A free-form textarea remains available for untimed thoughts; edits
 *     debounce-save and a final flush runs on unmount/chapter switch.
 */
export default function ChapterNotes({ chapterId, getCurrentTime, onSeek }: Props) {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const hydratedRef = useRef(false);
  const bodyRef = useRef("");
  bodyRef.current = body;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // When set, focus the textarea after the next render (post add-note).
  const focusOnNextRender = useRef(false);

  // Load existing notes for this chapter.
  useEffect(() => {
    if (!user) {
      setBody("");
      setSavedAt(null);
      hydratedRef.current = false;
      return;
    }
    let cancelled = false;
    hydratedRef.current = false;
    void supabase
      .from("chapter_notes")
      .select("body")
      .eq("user_id", user.id)
      .eq("chapter_id", chapterId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setBody(data?.body ?? "");
        setSavedAt(null);
        hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [user, chapterId]);

  // Debounced autosave once hydrated.
  useEffect(() => {
    if (!user || !hydratedRef.current) return;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          if (body) {
            const { error } = await supabase
              .from("chapter_notes")
              .upsert(
                { user_id: user.id, chapter_id: chapterId, body },
                { onConflict: "user_id,chapter_id" }
              );
            if (!error) setSavedAt(Date.now());
          } else {
            const { error, count } = await supabase
              .from("chapter_notes")
              .delete({ count: "exact" })
              .eq("user_id", user.id)
              .eq("chapter_id", chapterId);
            if (!error && (count ?? 0) > 0) setSavedAt(Date.now());
          }
        } catch {
          // Offline / network blip, notes stay in component state and the
          // next edit (or the unmount flush) retries.
        }
      })();
    }, 800);
    return () => window.clearTimeout(handle);
  }, [body, chapterId, user]);

  // Final flush on unmount / chapter switch, can't rely on setState here.
  useEffect(() => {
    return () => {
      if (!user || !hydratedRef.current) return;
      const finalBody = bodyRef.current;
      if (finalBody) {
        void supabase
          .from("chapter_notes")
          .upsert(
            { user_id: user.id, chapter_id: chapterId, body: finalBody },
            { onConflict: "user_id,chapter_id" }
          );
      } else {
        void supabase
          .from("chapter_notes")
          .delete()
          .eq("user_id", user.id)
          .eq("chapter_id", chapterId);
      }
    };
  }, [chapterId, user]);

  // Focus the textarea after an add-note insertion.
  useEffect(() => {
    if (focusOnNextRender.current) {
      focusOnNextRender.current = false;
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  }, [body]);

  const notes = useMemo(() => parseNotes(body), [body]);
  const timestamped = useMemo(() => notes.filter((n) => n.seconds != null), [notes]);

  const handleAddNote = () => {
    void hapticImpact("light");
    const t = Math.max(0, Math.floor(getCurrentTime() || 0));
    const prefix = `[${clock(t)}] `;
    setBody((prev) => {
      const trimmed = prev.replace(/\s+$/, "");
      return trimmed ? `${trimmed}\n${prefix}` : prefix;
    });
    focusOnNextRender.current = true;
  };

  const handleSeek = (seconds: number) => {
    void hapticSelection();
    onSeek(seconds);
  };

  const handleDelete = (index: number) => {
    void hapticSelection();
    setBody((prev) => {
      const lines = prev.split("\n");
      lines.splice(index, 1);
      return lines.join("\n");
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          onClick={handleAddNote}
          // handleAddNote fires a deliberate hapticImpact("light"); suppress the
          // Button's default tapTick so the tap doesn't double-buzz.
          haptic={false}
          className="btn-champagne px-3 text-[hsl(var(--cream-text))] gap-1.5"
        >
          <Clock className="h-4 w-4" />
          Add note at {clock(Math.max(0, Math.floor(getCurrentTime() || 0)))}
        </Button>
        {savedAt && (
          <span className="text-[10px] font-mono text-[hsl(var(--accent-emerald))]/80 uppercase tracking-wider">
            Saved
          </span>
        )}
      </div>

      {timestamped.length > 0 && (
        <ul className="space-y-1.5">
          {timestamped.map((n) => (
            <li
              key={n.index}
              className="group flex items-start gap-2 rounded-lg border border-border bg-[hsl(var(--surface))] p-2.5"
            >
              <button
                type="button"
                onClick={() => n.seconds != null && handleSeek(n.seconds)}
                className="pressable shrink-0 rounded bg-[hsl(var(--cream))]/15 px-2 py-1 font-mono text-[11px] font-semibold text-[hsl(var(--cream))] hover:bg-[hsl(var(--cream))]/25 min-h-[28px]"
              >
                {n.seconds != null ? clock(n.seconds) : ""}
              </button>
              <p className="flex-1 min-w-0 text-sm leading-snug text-foreground whitespace-pre-wrap break-words pt-0.5">
                {n.text || <span className="text-muted-foreground/50">Empty note</span>}
              </p>
              <button
                type="button"
                onClick={() => handleDelete(n.index)}
                aria-label="Delete note"
                className="shrink-0 rounded p-1 text-muted-foreground/50 hover:text-foreground hover:bg-surface-2 min-h-[28px] min-w-[28px] flex items-center justify-center"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Free-form editor, also the raw store for the timestamped lines.
          font-size stays >=16px on mobile (text-base) so iOS WKWebView
          doesn't fire focus auto-zoom; drop to text-sm from sm: up. */}
      <Textarea
        ref={textareaRef}
        placeholder="Jot down what stood out, or tap “Add note” to timestamp it…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        className="text-base sm:text-sm resize-none bg-[hsl(var(--surface))]"
      />
      <p className="text-[10px] text-muted-foreground/60">
        Lines starting with [MM:SS] become tappable timestamps. Notes sync to your
        account across every device you sign in on.
      </p>
    </div>
  );
}
