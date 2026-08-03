import { useState } from "react";
import { useUploads } from "@/contexts/UploadContext";
import { Loader2, CheckCircle2, AlertCircle, X, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Google-Drive-style upload tray. Mounted once, above the router, so it stays
 * put while the admin moves around the app. Shows every in-flight and finished
 * upload as a checklist: a spinner + % while uploading, a green tick when done.
 * Finished items persist (no auto-dismiss) until the admin clears them.
 */
export default function UploadDock() {
  const { uploads, dismiss, clearFinished } = useUploads();
  const [collapsed, setCollapsed] = useState(false);
  if (!uploads.length) return null;

  const active = uploads.filter((u) => u.status === "uploading" || u.status === "preparing").length;
  const done = uploads.filter((u) => u.status === "done").length;
  const failed = uploads.filter((u) => u.status === "error").length;

  const heading =
    active > 0
      ? `Uploading ${active} item${active === 1 ? "" : "s"}…`
      : failed > 0
      ? `${done} done · ${failed} failed`
      : `${done} upload${done === 1 ? "" : "s"} complete`;

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[21rem] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-xl shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-secondary/40 border-b border-border">
        {active > 0 ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
        ) : failed > 0 ? (
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        )}
        <span className="text-sm font-medium flex-1 truncate">{heading}</span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {active === 0 && (
          <button
            type="button"
            onClick={clearFinished}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* List */}
      {!collapsed && (
        <div className="max-h-[15rem] overflow-y-auto divide-y divide-border/60">
          {uploads.map((u) => (
            <div key={u.id} className="px-3 py-2.5 flex items-center gap-2.5">
              <div className="shrink-0">
                {u.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : u.status === "error" ? (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                ) : u.status === "uploading" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground opacity-60" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{u.filename}</div>
                {u.label && <div className="text-[11px] text-muted-foreground truncate">→ {u.label}</div>}
                {u.status === "uploading" && (
                  <div className="mt-1 h-1 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-200" style={{ width: `${u.progress}%` }} />
                  </div>
                )}
                {u.status === "error" && (
                  <div className="text-[11px] text-red-500 truncate">{u.error || "Upload failed"}</div>
                )}
              </div>
              <div className="shrink-0 text-[11px] text-muted-foreground w-10 text-right">
                {u.status === "uploading" ? `${u.progress}%` : u.status === "done" ? "Done" : u.status === "error" ? "" : "…"}
              </div>
              {(u.status === "done" || u.status === "error") && (
                <button
                  type="button"
                  onClick={() => dismiss(u.id)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
