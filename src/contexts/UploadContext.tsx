import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import type { DetailedError } from "tus-js-client";
import { supabase, supabaseUrl } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";

// Background upload manager. Lives ABOVE the router so an upload keeps
// running while the admin navigates to other pages (the component that started
// it can unmount freely). Progress surfaces in the floating <UploadDock/>.
//
// Three rules, each learned from lost class recordings:
//
//  1. The chapter is attached to the file only AFTER every byte is stored.
//     Until 2026-10 the key was written onto the chapter before the upload
//     began, so any upload that failed (a 502, a closed tab, the 50 MB cap
//     the Oct-2026 billing pause left on the project) left students a dead
//     player, and a failed RE-upload replaced a working video with a dead one.
//
//  2. The chapter ROW exists before any bytes move (ensureChapter), so a
//     finished upload always has somewhere to land — the 2026-08-03 lesson.
//     No saved row, no upload.
//
//  3. Bytes go up through Supabase's resumable (TUS) endpoint in 6 MB chunks,
//     not one multi-GB PUT. A dropped connection retries the chunk it was on,
//     and an upload that still gives up can be resumed from the dock.

export interface UploadItem {
  id: string;
  filename: string;
  /** Where this upload is going, e.g. the chapter title — so eight parallel
   *  uploads across different courses stay tellable-apart in the dock. */
  label?: string;
  /** Every id the target chapter has had: its local "new-…" id and its real
   *  one. The uploader finds its upload by these, so the status survives the
   *  id swap (which remounts the editor). */
  chapterIds: string[];
  progress: number; // 0–100
  status: "preparing" | "uploading" | "done" | "error";
  error?: string;
  /** Set on a finished upload that still needs the admin to act. */
  warning?: string;
  /** A transfer that gave up part-way; resume() continues from the last stored chunk. */
  canResume?: boolean;
  /** Stored fine, but attaching it to the chapter failed; retryAttach() tries again. */
  canRetryAttach?: boolean;
}

interface StartOpts {
  file: File;
  /** The chapter's current id: real, or local "new-…" for an unsaved one. */
  chapterId?: string;
  courseId?: string;
  /** Shown under the filename in the dock ("→ Chapter 3 · VEA-06"). */
  label?: string;
  /** Called synchronously when the upload is started, BEFORE any bytes move.
   *  Make sure the chapter row exists (insert a brand-new one) WITHOUT
   *  touching its media, and resolve to its real id (undefined on failure,
   *  which cancels the upload). */
  ensureChapter?: () => void | string | Promise<string | void>;
  /** Called only once the file is fully stored. `attached` says whether the
   *  chapter row was patched; when false the caller's local state must carry
   *  the key so the manual Save attaches it. */
  onAttached?: (key: string, chapterId: string, attached: boolean) => void;
}

// What kind of media is being uploaded — drives the fallback content-type and
// which chapter columns the completion patch touches. Both kinds go to the same
// private `protected-video` bucket via the same get-video-upload-url edge fn.
type UploadKind = "video" | "document";

interface UploadCtx {
  uploads: UploadItem[];
  /** Starts a background upload and returns its id. */
  startVideoUpload: (opts: StartOpts) => string;
  /** Same background pipeline as video, for PDFs / Word / any resource file. */
  startDocumentUpload: (opts: StartOpts) => string;
  resume: (id: string) => void;
  retryAttach: (id: string) => void;
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

const BUCKET = "protected-video";
// Supabase's resumable endpoint accepts exactly 6 MB chunks.
const CHUNK_SIZE = 6 * 1024 * 1024;
// The protected-video bucket's file_size_limit. The project-wide cap
// (Storage settings) must be at least this, or every larger upload fails
// with "Payload too large" — see ops/storage-health.sh.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;
// Signed upload tokens live 2 hours; re-mint one for the same key well before.
const TOKEN_REFRESH_MS = 90 * 60 * 1000;
// ~5 minutes of patience per chunk before the upload pauses for a Resume.
const RETRY_DELAYS = [0, 1000, 3000, 5000, 10000, 20000, 30000, 60000, 60000, 60000];

let seq = 0;

/** Thrown into a paused upload's promise when the admin dismisses it. */
class Abandoned extends Error {}

function formatSize(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

async function mintUploadToken(body: { filename?: string; course_id?: string; path?: string }) {
  const { data, error } = await supabase.functions.invoke("get-video-upload-url", { body });
  const signed = data as { token?: string; path?: string } | null;
  if (error || !signed?.token || !signed?.path) {
    throw new Error("Couldn't start the upload. Are you signed in as an admin?");
  }
  return { token: signed.token, path: signed.path };
}

/** A tus error → one line an admin can act on. */
function describeUploadError(err: unknown): string {
  const res = (err as DetailedError | null)?.originalResponse;
  if (res) {
    let message = "";
    try {
      message = (JSON.parse(res.getBody()) as { message?: string })?.message ?? "";
    } catch {
      // Not JSON: the status alone still goes into the line.
    }
    return `Upload failed (${res.getStatus()})${message ? `: ${message}` : ""}`;
  }
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? "Upload paused: you're offline"
    : "Upload paused: the connection kept failing";
}

/**
 * Retry a network drop (no status), a server fault, a conflict, or a rate
 * limit. tus-js-client's default also gives up the instant the browser says
 * it is offline, which turned a 2-second Wi-Fi blip into a dead upload.
 */
function shouldRetry(err: DetailedError): boolean {
  const status = err.originalResponse?.getStatus() ?? 0;
  return status === 0 || status >= 500 || status === 409 || status === 423 || status === 429;
}

type AttachResult = "attached" | "no-row" | "failed";

/** Point the chapter at its stored file, retrying a flaky network. */
async function attachToChapter(chapterId: string, key: string, kind: UploadKind): Promise<AttachResult> {
  // Video also normalises video_type; a document has no video_type to set.
  const media: { media_url: string; media_provider: string; video_type?: string } = {
    media_url: key,
    media_provider: "supabase-signed",
  };
  if (kind === "video") media.video_type = "standard";
  for (const delay of [0, 1000, 3000, 8000]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    // `.select` makes a patch that matched no row count as one.
    const { data, error } = await supabase.from("chapters").update(media).eq("id", chapterId).select("id");
    if (!error) return data?.length ? "attached" : "no-row";
  }
  return "failed";
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  // What the dock's buttons do for each upload, plus how to release a paused one.
  const actionsRef = useRef(
    new Map<string, { resume?: () => void; retryAttach?: () => void; abandon?: () => void }>()
  );

  const patch = useCallback(
    (id: string, u: Partial<UploadItem>) =>
      setUploads((list) => list.map((it) => (it.id === id ? { ...it, ...u } : it))),
    []
  );
  // Drop an upload's dock actions; a paused transfer's promise is rejected so
  // its closure (and the File it holds) can be collected.
  const release = useCallback((id: string) => {
    actionsRef.current.get(id)?.abandon?.();
    actionsRef.current.delete(id);
  }, []);
  const dismiss = useCallback(
    (id: string) => {
      release(id);
      setUploads((list) => list.filter((it) => it.id !== id));
    },
    [release]
  );
  const clearFinished = useCallback(() => {
    // Only finished items ever hold actions (a resume removes them before the
    // transfer restarts), so every entry belongs to an item being cleared.
    for (const id of [...actionsRef.current.keys()]) release(id);
    setUploads((list) => list.filter((it) => it.status === "preparing" || it.status === "uploading"));
  }, [release]);
  const resume = useCallback((id: string) => actionsRef.current.get(id)?.resume?.(), []);
  const retryAttach = useCallback((id: string) => actionsRef.current.get(id)?.retryAttach?.(), []);

  // Closing or reloading the tab kills every in-flight upload, so ask first.
  const inFlight = uploads.some((u) => u.status === "preparing" || u.status === "uploading");
  useEffect(() => {
    if (!inFlight) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inFlight]);

  const run = useCallback(
    async (id: string, kind: UploadKind, { file, chapterId, courseId, label, ensureChapter, onAttached }: StartOpts) => {
      setUploads((list) => [
        ...list,
        { id, filename: file.name, label, chapterIds: chapterId ? [chapterId] : [], progress: 0, status: "preparing" },
      ]);
      try {
        if (file.size === 0) throw new Error("That file is empty. Pick the file again.");
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new Error(
            `This file is ${formatSize(file.size)}; the limit is ${formatSize(MAX_UPLOAD_BYTES)}. Export a smaller file and upload that.`
          );
        }

        // Rule 2. ensureChapter() is CALLED synchronously here, at click time,
        // so its insert is registered before a Save Curriculum clicked right
        // after can race it into a duplicate row.
        let realId = chapterId && !chapterId.startsWith("new-") ? chapterId : undefined;
        try {
          const returned = await ensureChapter?.();
          if (typeof returned === "string" && returned) realId = returned;
        } catch {
          /* the caller surfaces its own error toast */
        }
        if (!realId) {
          throw new Error("This lesson isn't saved yet. Click Save Curriculum, then upload again.");
        }
        const chapterIds = [...new Set([chapterId, realId].filter((v): v is string => !!v))];
        patch(id, { chapterIds });

        const first = await mintUploadToken({ filename: file.name, course_id: courseId });
        const key = first.path;
        let token = first.token;
        let mintedAt = Date.now();
        patch(id, { status: "uploading" });

        // Loaded on first use so the student bundle never carries it.
        const { Upload } = await import("tus-js-client");
        await new Promise<void>((resolve, reject) => {
          const upload = new Upload(file, {
            endpoint: `${supabaseUrl}/storage/v1/upload/resumable/sign`,
            chunkSize: CHUNK_SIZE,
            retryDelays: RETRY_DELAYS,
            onShouldRetry: shouldRetry,
            uploadDataDuringCreation: true,
            // Each upload gets a fresh key, so there is no earlier upload to resume.
            storeFingerprintForResuming: false,
            metadata: {
              bucketName: BUCKET,
              objectName: key,
              contentType: file.type || (kind === "video" ? "video/mp4" : "application/octet-stream"),
              cacheControl: "3600",
            },
            // The signed token is the upload's only credential. Swap in a fresh
            // one for the same key before the 2-hour expiry; storage accepts a
            // re-minted token mid-upload.
            onBeforeRequest: async (req) => {
              if (Date.now() - mintedAt > TOKEN_REFRESH_MS) {
                token = (await mintUploadToken({ path: key })).token;
                mintedAt = Date.now();
              }
              req.setHeader("x-signature", token);
            },
            onProgress: (sent, total) => {
              // Hold at 99 until the server confirms the last chunk.
              if (total > 0) patch(id, { progress: Math.min(99, Math.floor((sent / total) * 100)) });
            },
            // Out of retries: pause rather than fail. The Upload object keeps
            // its tus URL, so start() asks the server how far it got and
            // carries on from there. Nothing is attached meanwhile.
            onError: (err) => {
              const message = describeUploadError(err);
              actionsRef.current.set(id, {
                resume: () => {
                  actionsRef.current.delete(id);
                  patch(id, { status: "uploading", error: undefined, canResume: false });
                  upload.start();
                },
                abandon: () => reject(new Abandoned()),
              });
              patch(id, { status: "error", error: message, canResume: true });
              toast.error(`"${file.name}": ${message}`);
            },
            onSuccess: () => {
              actionsRef.current.delete(id);
              resolve();
            },
          });
          upload.start();
        });

        // Rule 1: every byte is stored, so NOW attach it to the chapter —
        // server-side, so it survives navigation without a save.
        const settle = async (result: AttachResult) => {
          try {
            onAttached?.(key, realId!, result === "attached");
          } catch {
            /* a dead page's callback must not mark a stored upload as failed */
          }
          // No auto-dismiss: the green tick stays in the dock (Drive-style)
          // until the admin closes it, so a batch of 8 reads as a checklist.
          if (result === "attached") {
            actionsRef.current.delete(id);
            patch(id, { status: "done", progress: 100, warning: undefined, canRetryAttach: false });
            toast.success(`"${file.name}" uploaded and attached (protected)`);
            return;
          }
          const warning =
            result === "no-row"
              ? "Uploaded, but its lesson was deleted meanwhile. Upload it again on the right lesson."
              : "Uploaded, but attaching it to the lesson failed. Retry the attach.";
          if (result === "failed") {
            actionsRef.current.set(id, {
              retryAttach: () => {
                patch(id, { canRetryAttach: false, warning: "Attaching…" });
                void attachToChapter(realId!, key, kind).then(settle);
              },
            });
          }
          patch(id, { status: "done", progress: 100, warning, canRetryAttach: result === "failed" });
          toast.error(`"${file.name}": ${warning}`);
        };
        await settle(await attachToChapter(realId, key, kind));
      } catch (e) {
        if (e instanceof Abandoned) return;
        const message = e instanceof Error ? e.message : "Upload failed";
        patch(id, { status: "error", error: message, canResume: false });
        toast.error(message);
      }
    },
    [patch]
  );

  const start = useCallback(
    (kind: UploadKind, opts: StartOpts) => {
      const id = `up-${seq++}`;
      void run(id, kind, opts);
      return id;
    },
    [run]
  );
  const startVideoUpload = useCallback((opts: StartOpts) => start("video", opts), [start]);
  const startDocumentUpload = useCallback((opts: StartOpts) => start("document", opts), [start]);

  return (
    <Ctx.Provider
      value={{ uploads, startVideoUpload, startDocumentUpload, resume, retryAttach, dismiss, clearFinished }}
    >
      {children}
    </Ctx.Provider>
  );
}
