import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Reveal from "@/components/motion/Reveal";

// ── Editorial breaker ──
// A single full-bleed typographic band that breaks the vertical rhythm of the
// feed between the resume rail and the catalogue. Oversized "NEW THIS WEEK"
// wordmark over the canvas, with a live count of how many courses landed in
// the last seven days as the supporting line. Renders even with zero new
// arrivals, the band is an editorial divider first, a stat second.
//
// Full-bleed: the Home content sits inside a padded, max-width container
// (px-4 → md:px-8 → lg:px-10 → xl:px-12 in StudentLayout). Negative margins
// of the same scale pull this band edge-to-edge; inner padding re-insets the
// text so it never kisses the viewport edge.

const FULL_BLEED =
  "-mx-4 md:-mx-8 lg:-mx-10 xl:-mx-12 px-4 md:px-8 lg:px-10 xl:px-12";

const EditorialBreaker = () => {
  const [newCount, setNewCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .in("status", ["published", "upcoming"])
      .eq("show_on_browse", true)
      .gte("created_at", sevenDaysAgo)
      .then(({ count, error }) => {
        if (cancelled) return;
        if (error) {
          if (import.meta.env.DEV) console.error("EditorialBreaker count failed:", error);
          setNewCount(0);
          return;
        }
        setNewCount(count ?? 0);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const supporting =
    newCount === null
      ? "Fresh drops, hand-picked for makers."
      : newCount > 0
        ? `${newCount} new ${newCount === 1 ? "release" : "releases"} just landed in the catalogue.`
        : "The catalogue refreshes every week. Something new is always coming.";

  return (
    <Reveal>
      <div
        className={`relative overflow-hidden ${FULL_BLEED} py-12 md:py-16 bg-[hsl(var(--surface))]`}
      >
        {/* Hairline rules top + bottom to read as a deliberate band. */}
        <div className="absolute inset-x-0 top-0 h-px bg-[hsl(var(--cream))]/10" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-[hsl(var(--cream))]/10" />

        {/* Soft champagne wash bleeding from the right edge. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            background:
              "radial-gradient(120% 140% at 92% 50%, hsl(var(--cream)) 0%, transparent 55%)",
          }}
          aria-hidden="true"
        />

        <div className="relative">
          <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-[hsl(var(--cream))]/70 mb-3">
            Editor&rsquo;s pick
          </p>
          <h2 className="font-bold leading-[0.92] tracking-[-0.03em] text-[clamp(2.75rem,12vw,7rem)]">
            NEW
            <br className="sm:hidden" />
            <span className="sm:ml-4">THIS</span>{" "}
            <span className="font-serif-italic text-cream">week</span>
          </h2>
          <p className="mt-5 max-w-xl text-sm md:text-base text-muted-foreground">
            {supporting}
          </p>
        </div>
      </div>
    </Reveal>
  );
};

export default EditorialBreaker;
