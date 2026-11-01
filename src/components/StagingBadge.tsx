import { supabaseUrl } from "@/integrations/supabase/client";

const PRODUCTION_REF = "ivkvluezuiojovpotlyb";

/**
 * Small corner tag shown whenever the app is NOT talking to the production
 * database (the staging project, or a local Supabase). It exists so nobody
 * testing a preview mistakes fake data for live students. Renders nothing on
 * production, and never takes clicks.
 */
const StagingBadge = () => {
  if (supabaseUrl.includes(PRODUCTION_REF)) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed left-2 z-[9999] pointer-events-none select-none rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-black shadow"
      style={{ bottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
    >
      Staging · test data
    </div>
  );
};

export default StagingBadge;
