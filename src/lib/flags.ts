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
 * The re-entry reminder ladder. Default off (PHASE RE, Δ3 — enabling it is
 * Rahul's switch, not ours).
 *
 * ⚠️ THIS FLAG GATES THE CLIENT ONLY, AND THE CLIENT IS NOT WHERE THE MESSAGES
 * COME FROM. The ladder runs as a Deno edge function on pg_cron
 * (`supabase/functions/cohort-reentry-cron`), and `import.meta.env` — which
 * every value below is resolved through — does not exist in Deno. So this flag
 * cannot and does not gate a single outbound message. The switch that does is
 * the server-side env var `REMINDER_LADDER_ENABLED` on that function, which is
 * fail-closed and unset. Turning this one on lights up any future client
 * surface for the ladder; it does not start the sending.
 *
 * SCOPE: the ladder, and only the ladder. The install nudge built in the same
 * phase is NOT under this flag — it has its own switch, `INSTALL_NUDGE` below,
 * for the reasons stated there.
 */
export const REMINDER_LADDER = "VITE_REMINDER_LADDER";

/**
 * The install nudge at the two application value moments (PHASE RE, E-3 —
 * REQ-INSTALL-1/2). Default off, and OFF MEANS INERT: with this flag down the
 * `beforeinstallprompt` listener is never attached, the browser's own
 * mini-infobar is never `preventDefault()`ed, and neither <InstallNudge> mount
 * renders anything. Flag-off is byte-identical to the app before E-3 existed.
 *
 * It is deliberately a SECOND flag rather than a reuse of REMINDER_LADDER. That
 * one is Rahul's switch for "start messaging applicants"; this one decides
 * whether we take over install promotion in the browser, which lands on every
 * web visitor including people who never applied. Different blast radius,
 * different decision, different day — so they turn on independently, and the
 * ladder docblock above stays true.
 */
export const INSTALL_NUDGE = "VITE_INSTALL_NUDGE";

/** Known flags and their default when neither localStorage nor env speaks. */
const REGISTRY: Record<string, boolean> = {
  [FUNNEL_RECON]: false,
  [REMINDER_LADDER]: false,
  [INSTALL_NUDGE]: false,
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
