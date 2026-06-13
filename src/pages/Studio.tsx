import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Clipboard, Lock, Search, Brain } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useStudioEnabled, useReels, useFolders, useCaptureReel, useCreateFolder,
} from "@/hooks/useStudio";
import { BUCKETS, looksCapturable } from "@/lib/studio";
import type { Bucket } from "@/lib/studio";
import ReelCard from "@/components/studio/ReelCard";
import ConnectAI from "@/components/studio/ConnectAI";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Filter = { kind: "bucket"; value: Bucket | "all" } | { kind: "folder"; value: string };

function StudioLocked() {
  return (
    <div className="max-w-xl mx-auto text-center py-16">
      <div className="h-14 w-14 rounded-2xl grid place-items-center mx-auto bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]">
        <Lock className="h-7 w-7" />
      </div>
      <h1 className="heading-1 mt-5">Studio is for cohort members</h1>
      <p className="text-[hsl(var(--muted-foreground))] mt-2">
        Studio is your private swipe file — save reels you admire, get instant transcripts, and connect
        your own AI to your saved ideas and your cohort's learnings. It unlocks when you join a live cohort.
      </p>
      <Link to="/home"><Button className="mt-6">Browse live cohorts</Button></Link>
    </div>
  );
}

export default function Studio() {
  const enabled = useStudioEnabled();
  const [filter, setFilter] = useState<Filter>({ kind: "bucket", value: "all" });
  const [q, setQ] = useState("");
  const [url, setUrl] = useState("");
  const folders = useFolders();
  const capture = useCaptureReel();
  const createFolder = useCreateFolder();

  const reels = useReels(filter.kind === "folder" ? { folderId: filter.value, q } : { bucket: filter.value, q });

  const onCapture = () => {
    const v = url.trim();
    if (!looksCapturable(v)) { toast.error("Paste an Instagram reel or YouTube link."); return; }
    capture.mutate({ url: v, bucket: "saved" }, {
      onSuccess: (r) => { setUrl(""); toast.success(r.dedup ? "Already in your Studio" : "Saved — transcribing now"); },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (looksCapturable(text)) { setUrl(text.trim()); }
      else toast.error("No reel link on your clipboard.");
    } catch { toast.error("Clipboard access is blocked here — paste manually."); }
  };

  const onNewFolder = () => {
    const name = window.prompt("New folder name");
    if (name?.trim()) createFolder.mutate(name.trim(), { onError: (e: Error) => toast.error(e.message) });
  };

  if (enabled.isLoading) return <Skeleton className="h-48 w-full rounded-2xl max-w-5xl mx-auto" />;
  if (!enabled.data) return <StudioLocked />;

  const isFolder = (id: string) => filter.kind === "folder" && filter.value === id;
  const isBucket = (b: Bucket | "all") => filter.kind === "bucket" && filter.value === b;

  return (
    <div className="max-w-5xl mx-auto">
      <header className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-xl grid place-items-center bg-[hsl(var(--accent-amber)/0.12)] text-[hsl(var(--accent-amber))]">
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <h1 className="heading-1">Studio</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] -mt-0.5">Your private swipe file</p>
        </div>
      </header>

      {/* capture */}
      <div className="mt-5 flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCapture()}
          placeholder="Paste an Instagram reel or YouTube link…"
          className="flex-1"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <Button variant="outline" size="icon" onClick={pasteFromClipboard} aria-label="Paste from clipboard">
          <Clipboard className="h-4 w-4" />
        </Button>
        <Button onClick={onCapture} disabled={capture.isPending}>
          {capture.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* filters */}
      <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <Chip active={isBucket("all")} onClick={() => setFilter({ kind: "bucket", value: "all" })}>All</Chip>
        {BUCKETS.map((b) => (
          <Chip key={b.key} active={isBucket(b.key)} onClick={() => setFilter({ kind: "bucket", value: b.key })}>{b.label}</Chip>
        ))}
        {(folders.data ?? []).map((f) => (
          <Chip key={f.id} active={isFolder(f.id)} onClick={() => setFilter({ kind: "folder", value: f.id })}>{f.name}</Chip>
        ))}
        <button onClick={onNewFolder} className="shrink-0 inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] px-2 py-1">
          <Plus className="h-3.5 w-3.5" /> Folder
        </button>
      </div>

      {/* search */}
      <div className="mt-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transcripts…" className="pl-9" />
      </div>

      {/* library */}
      <div className="mt-5">
        {reels.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
          </div>
        ) : (reels.data?.length ?? 0) === 0 ? (
          <div className="text-center py-14 text-[hsl(var(--muted-foreground))]">
            <p className="font-medium text-[hsl(var(--foreground))]">{q ? "No matches" : "Your brain is empty"}</p>
            <p className="text-sm mt-1">{q ? "Try a different search." : "Paste a reel above and it'll transcribe itself in seconds."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {reels.data!.map((r) => <ReelCard key={r.id} reel={r} />)}
          </div>
        )}
      </div>

      {/* connect AI */}
      <div className="mt-8">
        <ConnectAI />
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3 py-1.5 text-sm border transition-colors",
        active
          ? "bg-[hsl(var(--accent-amber)/0.14)] border-[hsl(var(--accent-amber)/0.5)] text-[hsl(var(--accent-amber))]"
          : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
      )}
    >
      {children}
    </button>
  );
}
