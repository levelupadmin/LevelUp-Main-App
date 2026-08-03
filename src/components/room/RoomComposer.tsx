import { useEffect, useState, type FormEvent } from "react";
import { CircleHelp, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { RoomPostDraft, RoomPostKind } from "@/hooks/useCohortRooms";

const POST_KINDS: ReadonlyArray<{
  value: RoomPostKind;
  label: string;
  icon: typeof CircleHelp;
}> = [
  { value: "post", label: "Post", icon: Send },
  { value: "question", label: "Question", icon: CircleHelp },
  { value: "win", label: "Win", icon: Sparkles },
];

interface RoomComposerProps {
  channelKey: string;
  batchId: string | null;
  cohortWeekId: string | null;
  forcedKind?: RoomPostKind | null;
  disabledReason?: string | null;
  onSubmit: (draft: RoomPostDraft) => Promise<void>;
}

/**
 * The feed's compact writing desk. The database remains the write gate; this
 * component only keeps obviously incomplete drafts from making a round trip.
 */
const RoomComposer = ({
  channelKey,
  batchId,
  cohortWeekId,
  forcedKind = null,
  disabledReason = null,
  onSubmit,
}: RoomComposerProps) => {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<RoomPostKind>(forcedKind ?? "post");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (forcedKind) setKind(forcedKind);
  }, [forcedKind]);

  const unavailable = !!disabledReason || !batchId;
  const canSubmit = !unavailable && !submitting && body.trim().length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!canSubmit || !trimmed) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        body: trimmed,
        kind: forcedKind ?? kind,
        channelKey,
        batchId,
        cohortWeekId,
      });
      setBody("");
      if (!forcedKind) setKind("post");
    } catch {
      setError("That post did not send. Your draft is still here.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border bg-surface p-4 focus-within:border-room-accent/50"
      aria-label="Write to the room"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-room-accent">
          Add to the room
        </p>
        {!forcedKind && (
          <div className="flex flex-wrap gap-1" aria-label="Post type">
            {POST_KINDS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                disabled={unavailable || submitting}
                onClick={() => setKind(value)}
                className={cn(
                  "focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors disabled:opacity-50",
                  kind === value
                    ? "border-room-accent/40 bg-room-accent/10 text-room-accent"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon size={13} strokeWidth={1.5} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={20_000}
        rows={4}
        disabled={unavailable || submitting}
        placeholder={
          disabledReason ??
          (forcedKind === "win"
            ? "What moved forward?"
            : kind === "question"
              ? "What would you like the room to help with?"
              : "Share an update, an idea, or something useful.")
        }
        className="resize-y border-border bg-canvas/40"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="body-muted mr-auto text-xs">
          {disabledReason ?? "Async by design. Come back when it suits you."}
        </p>
        <Button
          type="submit"
          disabled={!canSubmit}
          className="min-h-11 bg-cream text-cream-text hover:bg-cream/90"
        >
          <Send size={14} strokeWidth={1.5} className="mr-2" aria-hidden />
          {submitting ? "Posting..." : "Post"}
        </Button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
};

export default RoomComposer;
