import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";

// Background video-upload manager. Lives ABOVE the router so an upload keeps
// running while the admin navigates to other pages (the component that started
// it can unmount freely). Progress surfaces in the floating <UploadDock/>.
//
// It also patches the target chapter's row on completion (when the chapter is
// already saved), so the video attaches itself even if the admin walked away
// without hitting Save.

export interface UploadItem {
  id: string;
  filename: string;
  /** Where this upload is going, e.g. the chapter title — so eight parallel
   *  uploads across different courses stay tellable-apart in the dock. */
  label?: string;
  progress: number; // 0–100
  status: "preparing" | "uploading" | "done" | "error";
  error?: string;
}

interface StartOpts {
  file: File;
  /** Real (saved) chapter id → the row is patched on completion. Omit / "new-…" to skip the patch. */
  chapterId?: string;
  courseId?: string;
  /** Shown under the filename in the dock ("→ Chapter 3 · VEA-06"). */
  label?: string;
  /** Called immediately with the storage key, before the bytes finish, so the
   *  caller can wire the chapter to it right away. If it returns a chapter id
   *  (e.g. the caller just INSERTED the chapter row to persist the key), that
   *  id replaces `chapterId` for the completion patch — this is how a chapter
   *  that was brand-new ("new-…") at upload start still gets patched. */
  onKey?: (key: string) => void | string | Promise<string | void>;
}

interface UploadCtx {
  uploads: UploadItem[];
  startVideoUpload: (opts: StartOpts) => void;
  dismiss: (id: string) => void;
  /** Clear every finished (done/error) item — the dock's "Close" once idle. */
  clearFinished: () => void;
}

const Ctx = createContext<UploadCtx | null>(null);

export function useUploads(): UploadCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUploads must be used within <UploadProvider>");
  return c;
}

let seq = 0;

export function UploadProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  const patch = useCallback(
    (id: string, u: Partial<UploadItem>) =>
      setUploads((list) => list.map((it) => (it.id === id ? { ...it, ...u } : it))),
    []
  );
  const dismiss = useCallback(
    (id: string) => setUploads((list) => list.filter((it) => it.id !== id)),
    []
  );
  const clearFinished = useCallback(
    () => setUploads((list) => list.filter((it) => it.status === "preparing" || it.status === "uploading")),
    []
  );

  const startVideoUpload = useCallback(
    async ({ file, chapterId, courseId, label, onKey }: StartOpts) => {
      const id = `up-${seq++}`;
      setUploads((list) => [...list, { id, filename: file.name, label, progress: 0, status: "preparing" }]);
      try {
        const { data, error } = await supabase.functions.invoke("get-video-upload-url", {
          body: { filename: file.name, course_id: courseId },
        });
        const signed = data as { signedUrl?: string; token?: string; path?: string } | null;
        if (error || !signed?.signedUrl || !signed?.path) {
          throw new Error("Couldn't start the upload. Are you signed in as an admin?");
        }
        // Wire the chapter to the key immediately (before the bytes land).
        // The caller persists the chapter row here and hands back its real id;
        // a failure there must NOT abort the byte transfer (the file is still
        // recoverable from storage), so it's contained.
        let effectiveChapterId = chapterId;
        try {
          const returned = await onKey?.(signed.path);
          if (typeof returned === "string" && returned) effectiveChapterId = returned;
        } catch {
          /* caller surfaces its own error toast */
        }
        patch(id, { status: "uploading" });

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", signed.signedUrl!);
          xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) patch(id, { progress: Math.round((e.loaded / e.total) * 100) });
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(`Upload failed (${xhr.status})`));
          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.send(file);
        });

        // Attach to the chapter server-side so it survives navigation without a save.
        if (effectiveChapterId && !effectiveChapterId.startsWith("new-")) {
          await supabase
            .from("chapters")
            .update({ media_url: signed.path, media_provider: "supabase-signed", video_type: "standard" })
            .eq("id", effectiveChapterId);
        }

        // No auto-dismiss: the green tick stays in the dock (Drive-style) until
        // the admin closes it, so a batch of 8 uploads reads as a checklist.
        patch(id, { status: "done", progress: 100 });
        toast.success(`"${file.name}" uploaded — protected`);
      } catch (e) {
        patch(id, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    },
    [patch]
  );

  return <Ctx.Provider value={{ uploads, startVideoUpload, dismiss, clearFinished }}>{children}</Ctx.Provider>;
}
