import { useState } from "react";
import { useUploads } from "@/contexts/UploadContext";
import { ShieldCheck, UploadCloud } from "lucide-react";

interface Props {
  /** Called immediately with the storage key. The caller sets the chapter's
   *  media_url = key and media_provider = 'supabase-signed', persists the row,
   *  and may return the real chapter id (used for the completion patch). */
  onUploaded: (key: string) => void | string | Promise<string | void>;
  courseId?: string;
  /** The chapter's id. If it's a saved id (not "new-…"), the background upload
   *  also patches the row on completion, so the file attaches even if the admin
   *  navigated away without saving. */
  chapterId?: string;
  /** Shown in the upload dock so parallel uploads are tellable-apart. */
  label?: string;
  /** true once this chapter already holds a protected upload */
  alreadyProtected?: boolean;
}

// Formats we let admins upload as protected resources. PDFs get an in-app
// protected viewer; the office/text formats can only be opened by download,
// so they're useful mainly when "Allow download" is turned on.
const ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.rtf,.odt,.ods,.odp," +
  "application/pdf,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.ms-powerpoint," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "application/vnd.ms-excel," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain";

/**
 * Starts a BACKGROUND upload of a document/resource into the private
 * protected-video bucket and returns immediately — progress shows in the
 * floating UploadDock and keeps running as the admin moves around. The file
 * never gets a public URL; students reach it through a short-lived signed URL.
 */
export default function ProtectedDocumentUploader({ onUploaded, courseId, chapterId, label, alreadyProtected }: Props) {
  const { startDocumentUpload } = useUploads();
  const [file, setFile] = useState<File | null>(null);
  const [started, setStarted] = useState(false);

  const upload = () => {
    if (!file) return;
    startDocumentUpload({ file, chapterId, courseId, label, onKey: onUploaded });
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
            : "Protected file attached (no public link)"}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept={ACCEPT}
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
        Goes to a private bucket — no public link. Runs in the background and saves automatically (keep the tab open).
      </p>
    </div>
  );
}
