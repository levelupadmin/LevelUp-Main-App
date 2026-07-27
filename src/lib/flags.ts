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
 * The decision-experience flag (Phase DC). Default off — the sealed reveal, the
 * acceptance card, the claim flow and the public admission page are all inert,
 * and an `accepted` application falls back to today's TeleCRM-managed admin +
 * email path with no in-app reveal.
 *
 * It gates a READ path only: the app never writes a funnel status (SOR-1), and
 * there is no in-app admin decision RPC. Because the `accepted` signal is
 * sourced from `useFunnelStage`, which is itself gated on `FUNNEL_RECON`, the
 * reveal needs BOTH flags on to fire.
 */
export const DECISION_FLOW = "VITE_DECISION_FLOW";

/** Known flags and their default when neither localStorage nor env speaks. */
const REGISTRY: Record<string, boolean> = {
  [FUNNEL_RECON]: false,
  [DECISION_FLOW]: false,
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
