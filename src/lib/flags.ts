/**
 * flags.ts — the single, honest feature-flag registry.
 *
 * A flag's default comes from a compiled Vite env var (`import.meta.env[name]`);
 * a per-device `localStorage` entry of the same name overrides it, so internal
 * testers can preview a dark feature without shipping it to users. This mirrors
 * the `VITE_COHORT_ROOMS` env + localStorage pattern from the cohort rollout doc
 * (`design/cohorts/docs/08-ROLLOUT-MIGRATION.md` — "Flags are env +
 * localStorage-overridable").
 *
 * Resolution order: localStorage override → compiled env default → registry
 * default. Registered flags default OFF (dark); unknown names also read false.
 */

/** The reconciler flag. Default off — the whole reconciler path is inert. */
export const FUNNEL_RECON = "VITE_FUNNEL_RECON";

/**
 * The cohort-rooms SURFACE flag. Default off — `/rooms` and `/room/*` do not
 * exist as routes, and `/cohort/:offeringId` behaves exactly as it did before
 * R1 (no slug resolution, no redirect).
 *
 * ⚠️ SURFACE ONLY, NEVER AUTHORISATION (NFR-CONFIG-2). Because `flag()` reads
 * localStorage BEFORE the compiled env (see the resolution order above), any
 * visitor can turn this on for their own device. That is fine and intended: R0's
 * RLS and the three room RPCs gate the DATA regardless, and each RPC asserts
 * access first and RAISEs `42501` for a caller who does not hold it. Nothing in
 * the room stack may read this flag to decide what a user is allowed to see.
 */
export const COHORT_ROOMS = "VITE_COHORT_ROOMS";

/** Known flags and their default when neither localStorage nor env speaks. */
const REGISTRY: Record<string, boolean> = {
  [FUNNEL_RECON]: false,
  [COHORT_ROOMS]: false,
};

function truthy(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "on";
}

/**
 * Resolve a flag. Pure and safe to call anywhere — a private-mode / non-browser
 * `localStorage` throw is caught and falls through to the env default.
 */
export function flag(name: string): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      const override = localStorage.getItem(name);
      if (override !== null) return truthy(override);
    }
  } catch {
    // localStorage unavailable (private mode / SSR) — fall through to env.
  }

  const env = (import.meta.env as Record<string, unknown>)[name];
  if (env !== undefined) return truthy(env);

  return REGISTRY[name] ?? false;
}
