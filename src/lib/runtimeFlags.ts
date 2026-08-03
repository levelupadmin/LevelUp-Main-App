import { supabase } from "@/integrations/supabase/client";

/** Server-owned switch read by every shipped client before exposing rooms. */
export const COHORT_ROOMS_SURFACE_RPC = "cohort_rooms_surface_enabled" as const;

/**
 * Keep the first boot bounded. A missing/slow RPC must fail closed instead of
 * holding the whole route tree on its loading shell indefinitely.
 */
export const RUNTIME_FLAG_TIMEOUT_MS = 3_000;

type RuntimeFlagRpcResult = {
  data: unknown;
  error: unknown;
};

type RuntimeFlagClient = {
  rpc: (name: typeof COHORT_ROOMS_SURFACE_RPC) => PromiseLike<RuntimeFlagRpcResult>;
};

/** The complete surface truth table; neither input can enable rooms alone. */
export function resolveCohortRoomsSurface(
  localIntent: boolean,
  remoteAnswer: unknown,
): boolean {
  return localIntent === true && remoteAnswer === true;
}

/**
 * Read the cohort-room surface switch directly from Postgres.
 *
 * This deliberately does not use TanStack Query or local storage: a positive
 * answer is only an in-memory observation and is refreshed by the owning hook.
 * Every non-literal-true outcome (RPC error, missing value, timeout) is false.
 */
export async function fetchCohortRoomsSurfaceEnabled(
  timeoutMs = RUNTIME_FLAG_TIMEOUT_MS,
  client: RuntimeFlagClient = supabase as unknown as RuntimeFlagClient,
): Promise<boolean> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<RuntimeFlagRpcResult>((resolve) => {
    timeoutId = setTimeout(() => resolve({ data: false, error: new Error("runtime flag timeout") }), timeoutMs);
  });

  try {
    const result = await Promise.race([
      Promise.resolve(client.rpc(COHORT_ROOMS_SURFACE_RPC)).catch((error) => ({ data: false, error })),
      timeout,
    ]);

    return result.error == null && result.data === true;
  } catch {
    return false;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
