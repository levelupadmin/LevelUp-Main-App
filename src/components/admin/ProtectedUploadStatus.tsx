import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import type { UploadItem } from "@/contexts/UploadContext";
import { useProtectedFileStatus } from "@/hooks/useProtectedFileStatus";

interface Props {
  /** The newest upload aimed at this chapter, if it is still in the dock. */
  upload?: UploadItem;
  chapterId?: string;
  /** The chapter's current media_url; a change re-runs the storage check. */
  mediaKey?: string;
  /** true when the chapter holds a protected upload (media_provider = 'supabase-signed'). */
  alreadyProtected?: boolean;
  noun: "video" | "file";
}

/** End a message with exactly one sentence mark. */
const sentence = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);

/**
 * The one status line above a protected uploader. The order matters: an
 * upload in flight or just failed outranks what the chapter currently holds,
 * and a chapter whose file is missing from storage is called out in red
 * rather than shown as "attached".
 */
export default function ProtectedUploadStatus({ upload, chapterId, mediaKey, alreadyProtected, noun }: Props) {
  const fileStatus = useProtectedFileStatus(chapterId, mediaKey, !!alreadyProtected);

  if (upload && (upload.status === "preparing" || upload.status === "uploading")) {
    return (
      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 mt-px animate-spin shrink-0" />
        <span>
          Uploading{upload.status === "uploading" ? ` ${upload.progress}%` : "…"}. It keeps going in the corner while you
          work. {alreadyProtected ? `The lesson keeps its current ${noun} until the new one finishes.` : `The lesson gets the ${noun} once it finishes.`}
        </span>
      </div>
    );
  }
  if (upload?.status === "done" && upload.warning) {
    return (
      <div className="flex items-start gap-1.5 text-xs text-amber-500">
        <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
        <span>{upload.warning}</span>
      </div>
    );
  }
  if (upload?.status === "error") {
    return (
      <div className="flex items-start gap-1.5 text-xs text-red-500">
        <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
        <span>
          {sentence(upload.error || "Upload failed")}{" "}
          {upload.canResume ? "Resume it from the upload panel. " : ""}
          {alreadyProtected ? `The lesson still has its previous ${noun}.` : "Nothing was attached to the lesson."}
        </span>
      </div>
    );
  }
  if (!alreadyProtected) return null;
  if (fileStatus === "missing") {
    return (
      <div className="flex items-start gap-1.5 text-xs text-red-500">
        <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
        <span>
          This lesson's {noun} is missing from storage (an earlier upload never finished), so students can't open it.
          Upload the {noun} again.
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-emerald-500">
      <ShieldCheck className="h-3.5 w-3.5" />
      {noun === "video"
        ? "Protected video attached (no public link, download blocked)"
        : "Protected file attached (no public link)"}
    </div>
  );
}
