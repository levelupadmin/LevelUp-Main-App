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
 * The additive Email sign-in tab (PHASE SP). Default off, so the MSG91 phone
 * form is the only login surface until this is switched on: the tab dark-ships
 * and inviolable rule 2 ("phone-OTP stays byte-identical to production") holds
 * by construction while it is unset. Lives here rather than next to the claim
 * hook so the Tier-1 login page depends on the registry, not on a Phase-SP
 * feature module, to learn the flag's name.
 */
export const EMAIL_OTP_TAB = "VITE_EMAIL_OTP_TAB";

/**
 * The interview-cluster flag (PHASE IV). Default off — the slot buttons,
 * interviewer card and reschedule control stay dark. (The batch ledger this
 * docblock used to list was deleted in c656232: it could only ever hide.)
 *
 * TWO SURFACES ARE BEHIND IT, NOT ONE. `ApplicationStatus` renders for real
 * applicants today, and `ThankYou` is the ₹400 post-payment screen — so the
 * whole cluster ships behind this before any of it is switched on. `ThankYou`
 * additionally keeps main's Calendly iframe as its flag-off branch, so turning
 * this off restores the surface that shipped rather than falling through to the
 * new component's own fallback ladder.
 */
export const COHORT_INTERVIEW = "VITE_COHORT_INTERVIEW";

/** Known flags and their default when neither localStorage nor env speaks. */
const REGISTRY: Record<string, boolean> = {
  [FUNNEL_RECON]: false,
  [EMAIL_OTP_TAB]: false,
  [COHORT_INTERVIEW]: false,
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
