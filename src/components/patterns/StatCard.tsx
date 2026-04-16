import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import SurfaceCard from "./SurfaceCard";

/**
 * StatCard — a dashboard tile for a single metric.
 *
 * Used across AdminDashboard, AdminRevenue, InstructorDashboard. Replaces
 * the hand-rolled `<div className="bg-surface p-4 ..."><Icon /><h3 /></div>`
 * variants with a single component.
 *
 * ```tsx
 * <StatCard
 *   label="Active students"
 *   value="3,412"
 *   delta={{ value: "+12.4%", direction: "up" }}
 *   icon={<Users className="h-4 w-4" />}
 *   accent="indigo"
 * />
 * ```
 */
export type StatAccent = "cream" | "amber" | "indigo" | "emerald" | "violet" | "crimson";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  icon?: ReactNode;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  accent?: StatAccent;
  className?: string;
  /** Render as a clickable tile. */
  to?: string;
  onClick?: () => void;
}

const accentMap: Record<StatAccent, string> = {
  cream: "text-cream",
  amber: "text-[hsl(var(--accent-amber))]",
  indigo: "text-[hsl(var(--accent-indigo))]",
  emerald: "text-[hsl(var(--accent-emerald))]",
  violet: "text-[hsl(var(--accent-violet))]",
  crimson: "text-[hsl(var(--accent-crimson))]",
};

const accentBgMap: Record<StatAccent, string> = {
  cream: "bg-cream/10",
  amber: "bg-[hsl(var(--accent-amber)/0.12)]",
  indigo: "bg-[hsl(var(--accent-indigo)/0.12)]",
  emerald: "bg-[hsl(var(--accent-emerald)/0.12)]",
  violet: "bg-[hsl(var(--accent-violet)/0.12)]",
  crimson: "bg-[hsl(var(--accent-crimson)/0.12)]",
};

export function StatCard({
  label,
  value,
  sublabel,
  icon,
  delta,
  accent = "cream",
  className,
  to,
  onClick,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="heading-eyebrow">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex items-center justify-center h-8 w-8 rounded-lg",
              accentBgMap[accent],
              accentMap[accent],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="font-display text-[26px] md:text-[28px] font-semibold leading-tight mt-2 tabular-nums">
        {value}
      </p>
      <div className="flex items-center gap-2 mt-1">
        {delta && (
          <span
            className={cn(
              "caption font-medium",
              delta.direction === "up" && "text-[hsl(var(--accent-emerald))]",
              delta.direction === "down" && "text-[hsl(var(--accent-crimson))]",
              delta.direction === "flat" && "text-muted-foreground",
            )}
          >
            {delta.value}
          </span>
        )}
        {sublabel && <span className="caption">{sublabel}</span>}
      </div>
    </>
  );

  if (to || onClick) {
    return (
      <SurfaceCard
        {...(to ? { to } : { onClick: onClick! })}
        padding="md"
        className={className}
      >
        {body}
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard variant="static" padding="md" className={className}>
      {body}
    </SurfaceCard>
  );
}

export default StatCard;
