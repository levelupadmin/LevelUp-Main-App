import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * What get-video-src said about a protected chapter's file (video or document
 * in the private `protected-video` bucket).
 *
 *  • ok      — a short-lived signed URL to play / open.
 *  • missing — the chapter points at a file that is not in storage: an upload
 *              that never finished. Not the student's fault, so it must never
 *              read as an enrolment problem.
 *  • denied  — 401/403: not signed in, or not enrolled.
 *  • error   — network failure or server fault; worth a retry.
 */
export type SignedMediaResult =
  | { kind: "ok"; url: string }
  | { kind: "missing" }
  | { kind: "denied" }
  | { kind: "error" };

export async function fetchSignedMediaUrl(chapterId: string): Promise<SignedMediaResult> {
  try {
    const { data, error } = await supabase.functions.invoke("get-video-src", {
      body: { chapter_id: chapterId },
    });
    const url = (data as { url?: string } | null)?.url;
    if (!error && url) return { kind: "ok", url };

    // functions-js discards the body of any non-2xx; FunctionsHttpError keeps
    // the raw Response on `.context`, the only place the status and the
    // `{ error: … }` code survive.
    if (error instanceof FunctionsHttpError) {
      const resp = error.context as Response | undefined;
      const status = resp?.status;
      if (status === 401 || status === 403) return { kind: "denied" };
      if (status === 404 && resp) {
        try {
          const body = (await resp.json()) as { error?: unknown } | null;
          if (body?.error === "file_missing") return { kind: "missing" };
        } catch {
          // A non-JSON or already-drained body: fall through to "error".
        }
      }
    }
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
