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
      className="fixed left-1/2 z-[9999] -translate-x-1/2 pointer-events-none select-none rounded-b-md bg-amber-400 px-2 py-[2px] text-[9.5px] font-semibold uppercase leading-[12px] tracking-wider text-black"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      Staging · test data
    </div>
  );
};

export default StagingBadge;
