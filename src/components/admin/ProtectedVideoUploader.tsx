import { useState } from "react";
import { useUploads } from "@/contexts/UploadContext";
import { ShieldCheck, UploadCloud } from "lucide-react";

interface Props {
  /** Called immediately with the storage key. The caller sets the chapter's
   *  media_url = key and media_provider = 'supabase-signed'. */
  onUploaded: (key: string) => void;
  courseId?: string;
  /** The chapter's id. If it's a saved id (not "new-…"), the background upload
   *  also patches the row on completion, so the video attaches even if the admin
   *  navigated away without saving. */
  chapterId?: string;
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
export default function ProtectedVideoUploader({ onUploaded, courseId, chapterId, label, alreadyProtected }: Props) {
  const { startVideoUpload } = useUploads();
  const [file, setFile] = useState<File | null>(null);
  const [started, setStarted] = useState(false);

  const upload = () => {
    if (!file) return;
    startVideoUpload({ file, chapterId, courseId, label, onKey: onUploaded });
    setStarted(true);
    setFile(null);
  };

  return (
    <div className="space-y-2">
      {(alreadyProtected || started) && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          {started && !alreadyProtected
            ? "Upload started — it continues in the corner while you work"
            : "Protected video attached (no public link, download blocked)"}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="video/*"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setStarted(false);
          }}
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
        Runs in the background and saves automatically — you can leave this page (keep the tab open).
      </p>
    </div>
  );
}
