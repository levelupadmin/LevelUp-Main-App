import { useUploads } from "@/contexts/UploadContext";
import { Loader2, CheckCircle2, AlertCircle, X, UploadCloud } from "lucide-react";

/**
 * Floating progress widget for background video uploads. Mounted once, above the
 * router, so it stays put while the admin moves around the app. Renders nothing
 * when there are no active uploads.
 */
export default function UploadDock() {
  const { uploads, dismiss } = useUploads();
  if (!uploads.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[19rem] max-w-[calc(100vw-2rem)] space-y-2">
      {uploads.map((u) => (
        <div
          key={u.id}
          className="bg-card border border-border rounded-xl shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)] p-3"
        >
          <div className="flex items-center gap-2">
            {u.status === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : u.status === "error" ? (
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            ) : u.status === "uploading" ? (
              <UploadCloud className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
            )}
            <span className="truncate flex-1 text-sm">{u.filename}</span>
            {(u.status === "done" || u.status === "error") && (
              <button
                type="button"
                onClick={() => dismiss(u.id)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {u.status === "uploading" && (
            <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${u.progress}%` }}
              />
            </div>
          )}

          <div className="mt-1.5 text-xs text-muted-foreground">
            {u.status === "preparing" && "Preparing…"}
            {u.status === "uploading" && `${u.progress}% · uploading — you can keep working`}
            {u.status === "done" && "Uploaded & protected"}
            {u.status === "error" && (u.error || "Upload failed")}
          </div>
        </div>
      ))}
    </div>
  );
}
