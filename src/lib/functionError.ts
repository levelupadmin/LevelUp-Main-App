import { FunctionsHttpError } from "@supabase/supabase-js";

export type FunctionErrorInfo = {
  /** HTTP status when the function answered; null when it never did. */
  status: number | null;
  /** The function's `error` string, when it sent one. */
  message: string | null;
  /** The function's machine-readable `code` (e.g. "already_enrolled"). */
  code: string | null;
};

/**
 * `supabase.functions.invoke` returns `data: null` for every non-2xx answer and
 * puts the raw Response on `error.context`. That is the only place the
 * function's `{ error, code }` body survives, so read it from there. Network
 * failures (no Response) come back with status null.
 */
export async function readFunctionError(error: unknown, data?: unknown): Promise<FunctionErrorInfo> {
  const fromBody = (body: unknown): Pick<FunctionErrorInfo, "message" | "code"> => {
    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      message: typeof b.error === "string" ? b.error : null,
      code: typeof b.code === "string" ? b.code : null,
    };
  };
  if (!error) return { status: 200, ...fromBody(data) };
  if (error instanceof FunctionsHttpError) {
    const resp = error.context as Response | undefined;
    const status = resp && typeof resp.status === "number" ? resp.status : null;
    try {
      const body = resp ? await resp.clone().json() : null;
      return { status, ...fromBody(body) };
    } catch {
      return { status, message: null, code: null };
    }
  }
  return { status: null, message: null, code: null };
}
