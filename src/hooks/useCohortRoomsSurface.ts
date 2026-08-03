import { useCallback, useEffect, useRef, useState } from "react";
import { COHORT_ROOMS, flag } from "@/lib/flags";
import { queryClient } from "@/lib/queryClient";
import {
  fetchCohortRoomsSurfaceEnabled,
  resolveCohortRoomsSurface,
} from "@/lib/runtimeFlags";

export const COHORT_ROOMS_SURFACE_REFRESH_MS = 60_000;

export type CohortRoomsSurfaceState = {
  /** Local rollout intent AND the latest successful server answer. */
  enabled: boolean;
  /** True only while an opted-in client is waiting for its first answer. */
  pending: boolean;
};

const DISABLED: CohortRoomsSurfaceState = { enabled: false, pending: false };
const INITIAL_PENDING: CohortRoomsSurfaceState = { enabled: false, pending: true };

const clearRoomQueries = (): void => {
  queryClient.removeQueries({ queryKey: ["cohort-rooms"] });
};

/**
 * Resolve the room surface from two independent switches:
 *
 *   local rollout intent (`VITE_COHORT_ROOMS`) AND a fresh server RPC answer.
 *
 * The remote answer intentionally lives only in component state. It is never a
 * persisted/query cache entry, so a server-side kill takes effect on the next
 * foreground or 60-second refresh even in an already-shipped native bundle.
 */
export function useCohortRoomsSurface(): CohortRoomsSurfaceState {
  const initialIntent = flag(COHORT_ROOMS);
  const [state, setState] = useState<CohortRoomsSurfaceState>(
    initialIntent ? INITIAL_PENDING : DISABLED,
  );
  const hasResolvedRef = useRef(!initialIntent);
  const requestGenerationRef = useRef(0);

  const disable = useCallback(() => {
    clearRoomQueries();
    hasResolvedRef.current = true;
    setState(DISABLED);
  }, []);

  const refresh = useCallback(async () => {
    // Re-read on every trigger so a localStorage rollout override can be
    // withdrawn at runtime. Crucially, false returns before any network call.
    if (!flag(COHORT_ROOMS)) {
      requestGenerationRef.current += 1;
      disable();
      return;
    }

    const generation = ++requestGenerationRef.current;
    if (!hasResolvedRef.current) setState(INITIAL_PENDING);

    let remotelyEnabled = false;
    try {
      remotelyEnabled = await fetchCohortRoomsSurfaceEnabled();
    } catch {
      // The reader itself is fail-closed; this guards against an unexpected
      // client/mock regression so an opted-in app can never stay pending/live.
      remotelyEnabled = false;
    }
    if (generation !== requestGenerationRef.current) return;

    hasResolvedRef.current = true;
    // Re-read local intent after the async boundary as well. A same-window
    // localStorage change does not emit `storage` back to its source window,
    // so the remote true must not revive an opt-in withdrawn mid-request.
    if (!resolveCohortRoomsSurface(flag(COHORT_ROOMS), remotelyEnabled)) {
      disable();
      return;
    }

    setState({ enabled: true, pending: false });
  }, [disable]);

  useEffect(() => {
    let mounted = true;

    const guardedRefresh = () => {
      if (mounted) void refresh();
    };

    guardedRefresh();

    const intervalId = window.setInterval(guardedRefresh, COHORT_ROOMS_SURFACE_REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") guardedRefresh();
    };
    const onFocus = () => guardedRefresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === COHORT_ROOMS) guardedRefresh();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);

    return () => {
      mounted = false;
      requestGenerationRef.current += 1;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  return state;
}
