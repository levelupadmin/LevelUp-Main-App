import { useState } from "react";
import { ExternalLink, Loader2, Trash2, AlertCircle, StickyNote, ChevronDown } from "lucide-react";
import type { Reel, Bucket } from "@/lib/studio";
import { BUCKETS } from "@/lib/studio";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useUpdateReel, useDeleteReel } from "@/hooks/useStudio";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const bucketLabel = (b: string) => BUCKETS.find((x) => x.key === b)?.label ?? b;

export default function ReelCard({ reel }: { reel: Reel }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(reel.note ?? "");
  const update = useUpdateReel();
  const del = useDeleteReel();
  const transcribing = reel.status === "pending" || reel.status === "processing";
  const failed = reel.status === "failed";

  const setBucket = (bucket: Bucket) => update.mutate({ id: reel.id, patch: { bucket } });
  const saveNote = () =>
    update.mutate({ id: reel.id, patch: { note } }, { onSuccess: () => toast.success("Note saved") });

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] overflow-hidden flex flex-col">
      <div className="flex gap-3 p-3">
        <div className="h-20 w-14 shrink-0 rounded-lg bg-[hsl(var(--surface-2))] overflow-hidden grid place-items-center">
          {reel.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={reel.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{reel.platform}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[hsl(var(--muted-foreground))] truncate">
              {reel.creator_username ? `@${reel.creator_username}` : reel.platform}
            </span>
            {transcribing && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[hsl(var(--accent-amber))]">
                <Loader2 className="h-3 w-3 animate-spin" /> transcribing…
              </span>
            )}
            {failed && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[hsl(var(--destructive))]">
                <AlertCircle className="h-3 w-3" /> failed
              </span>
            )}
          </div>
          <p className="text-sm font-medium leading-snug mt-0.5 line-clamp-2">
            {reel.title || (transcribing ? "Saving…" : "Untitled reel")}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 line-clamp-2">
            {reel.transcript ? reel.transcript : failed ? (reel.error ?? "Could not transcribe") : ""}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-1 px-3 py-2 border-t border-[hsl(var(--border))]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
              {bucketLabel(reel.bucket)} <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {BUCKETS.map((b) => (
              <DropdownMenuItem key={b.key} onClick={() => setBucket(b.key)}>
                {b.label} <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">{b.blurb}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" className={cn("h-7 px-2 text-xs gap-1", reel.note && "text-[hsl(var(--accent-amber))]")} onClick={() => setOpen((v) => !v)}>
          <StickyNote className="h-3.5 w-3.5" /> Note
        </Button>

        <a href={reel.url} target="_blank" rel="noopener noreferrer" className="ml-auto">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </Button>
        </a>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
          onClick={() => del.mutate(reel.id)} aria-label="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {reel.transcript && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] whitespace-pre-wrap max-h-40 overflow-y-auto rounded-lg bg-[hsl(var(--surface-2))] p-2">
              {reel.transcript}
            </p>
          )}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why did you save this? Hook, edit, idea to steal…"
            className="text-xs min-h-[60px]" />
          <div className="flex justify-end">
            <Button size="sm" className="h-7 text-xs" onClick={saveNote} disabled={update.isPending}>Save note</Button>
          </div>
        </div>
      )}
    </div>
  );
}
