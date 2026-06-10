import Reveal from "@/components/motion/Reveal";

const STEPS = [
  "Request an invite via the application form",
  "Pay a refundable application fee",
  "Sit for an interview with our admissions team",
  "Get a decision within 12–48 hours",
  "Confirm your seat if selected",
];

/**
 * Vertical 5-step admission timeline for application-only (live cohort)
 * offerings, rendered after the description when tally_form_url is set.
 */
export default function ApplicationTimeline() {
  return (
    <Reveal className="space-y-4">
      <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
        How admission works
      </p>
      <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
        From application to your seat
      </h2>
      <ol className="pt-2">
        {STEPS.map((step, i) => (
          <li key={i} className="relative flex gap-4 pb-8 last:pb-0">
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-4 top-9 bottom-1 w-px bg-border"
              />
            )}
            <span className="h-8 w-8 rounded-full border border-border bg-[hsl(var(--surface))] flex items-center justify-center font-mono text-xs text-[hsl(var(--cream))] flex-shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="text-sm sm:text-base text-foreground leading-relaxed pt-1.5">{step}</p>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}
