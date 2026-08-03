import { ExternalLink, FileText } from "lucide-react";

import type { RoomDemoEntry } from "@/hooks/useRoomDemoDay";

export interface DemoEntryCardProps {
  entry: RoomDemoEntry;
  memberName: string;
  city?: string | null;
  isOwn?: boolean;
  onEdit?: () => void;
}

function safeExternalUrl(value: string | null): string | null {
  const url = value?.trim() ?? "";
  return /^https?:\/\//i.test(url) ? url : null;
}

const DemoEntryCard = ({ entry, memberName, city, isOwn, onEdit }: DemoEntryCardProps) => {
  const workUrl = safeExternalUrl(entry.work_url);

  return (
    <article className="group flex min-w-0 h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="relative isolate min-h-36 min-w-0 overflow-hidden border-b border-border bg-canvas px-5 py-6">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,hsl(var(--room-accent)/0.18),transparent_58%)]"
        />
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-room-accent-text">
          Demo Day
        </p>
        <h2 className="mt-4 line-clamp-3 break-words font-serif text-2xl leading-tight text-foreground">
          {entry.title}
        </h2>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-5">
        <p className="break-words font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {memberName}{city ? ` · ${city}` : ""}
        </p>
        {entry.description && (
          <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-foreground/85">
            {entry.description}
          </p>
        )}

        <div className="mt-auto flex min-w-0 flex-wrap gap-2 pt-5">
          {workUrl && (
            <a
              href={workUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring pressable inline-flex min-h-11 items-center gap-2 rounded-full border border-room-accent/35 px-4 text-sm text-room-accent-text"
            >
              View work <ExternalLink size={15} strokeWidth={1.5} aria-hidden />
            </a>
          )}
          {entry.files.map((file) =>
            file.signedUrl ? (
              <a
                key={file.path}
                href={file.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring pressable inline-flex min-h-11 max-w-full min-w-0 items-center gap-2 rounded-full border border-border px-4 text-sm text-foreground"
              >
                <FileText size={15} strokeWidth={1.5} className="shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{file.name}</span>
              </a>
            ) : null,
          )}
          {isOwn && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="focus-ring min-h-11 rounded-full px-4 text-sm text-muted-foreground hover:text-foreground"
            >
              Edit entry
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

export default DemoEntryCard;
