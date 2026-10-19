import { useState } from "react";
import { useUploads } from "@/contexts/UploadContext";
import { UploadCloud } from "lucide-react";
import ProtectedUploadStatus from "@/components/admin/ProtectedUploadStatus";

interface Props {
  /** Called before the upload starts: make sure the chapter row exists
   *  (inserting a brand-new one) WITHOUT changing its media, and return its
   *  real id. The file is attached only after it has fully uploaded. */
  ensureChapter: () => void | string | Promise<string | void>;
  /** Called once the file is stored; reflect it in the editor's local state. */
  onAttached: (key: string, chapterId: string, attached: boolean) => void;
  courseId?: string;
  /** The chapter's id. If it's a saved id (not "new-…"), the finished upload
   *  is attached to that row even if the admin navigated away without saving. */
  chapterId?: string;
  /** The chapter's current media_url — re-checks the file is really in storage. */
  mediaKey?: string;
  /** Shown in the upload dock so parallel uploads are tellable-apart. */
  label?: string;
  /** true once this chapter already holds a protected upload */
  alreadyProtected?: boolean;
}

/**
 * Starts a BACKGROUND upload into the private protected-video bucket and returns
 * immediately — progress shows in the floating UploadDock and keeps running as
 * the admin moves around the app. The file never gets a public URL.
 */
export default function ProtectedVideoUploader({
  ensureChapter,
  onAttached,
  courseId,
  chapterId,
  mediaKey,
  label,
  alreadyProtected,
}: Props) {
  const { uploads, startVideoUpload } = useUploads();
  const [file, setFile] = useState<File | null>(null);
  // Found by chapter id, not held in state: saving a new chapter swaps its
  // "new-…" id for the real one, which remounts this component.
  const latest = chapterId ? uploads.filter((u) => u.chapterIds.includes(chapterId)).at(-1) : undefined;

  const upload = () => {
    if (!file) return;
    startVideoUpload({ file, chapterId, courseId, label, ensureChapter, onAttached });
    setFile(null);
  };

  return (
    <div className="space-y-2">
      <ProtectedUploadStatus
        upload={latest}
        chapterId={chapterId}
        mediaKey={mediaKey}
        alreadyProtected={alreadyProtected}
        noun="video"
      />
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-xs"
        />
        <button
          type="button"
          onClick={upload}
          disabled={!file}
          className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
        >
          <UploadCloud className="h-3.5 w-3.5" />
          Upload protected
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Runs in the background, up to 10 GB, and attaches itself when it finishes. You can leave this page, but keep the
        tab open.
      </p>
    </div>
  );
}
