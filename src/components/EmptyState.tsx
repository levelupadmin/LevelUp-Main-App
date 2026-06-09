import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateCta =
  | { label: string; to: string }
  | { label: string; onClick: () => void };

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  sub?: string;
  cta?: EmptyStateCta;
  className?: string;
}

const ctaClasses =
  "focus-ring pressable mt-6 inline-flex items-center justify-center h-10 px-5 rounded-full bg-cream text-cream-text font-medium text-sm hover:bg-cream/90 transition-colors";

/**
 * The standardized empty state: centered icon in a soft circle, sentence-case
 * title, muted sub line, optional cream pill CTA (Link or button).
 */
export const EmptyState = ({ icon: Icon, title, sub, cta, className }: EmptyStateProps) => (
  <div
    className={cn(
      "anim-rise flex flex-col items-center justify-center text-center px-6 py-12",
      className
    )}
  >
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-muted-foreground mb-4">
      <Icon size={22} strokeWidth={1.5} />
    </div>
    <h3 className="font-semibold text-foreground">{title}</h3>
    {sub && <p className="text-muted-foreground text-sm mt-1.5 max-w-[300px]">{sub}</p>}
    {cta &&
      ("to" in cta ? (
        <Link to={cta.to} className={ctaClasses}>
          {cta.label}
        </Link>
      ) : (
        <button type="button" onClick={cta.onClick} className={ctaClasses}>
          {cta.label}
        </button>
      ))}
  </div>
);

export default EmptyState;
