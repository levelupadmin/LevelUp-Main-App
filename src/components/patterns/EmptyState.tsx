import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * EmptyState — shown when a list/page has no data to display.
 *
 * Replaces the ad-hoc "No courses yet" / "No events found" patterns each
 * page was rendering differently.
 *
 * ```tsx
 * <EmptyState
 *   icon={<BookOpen className="h-5 w-5" />}
 *   title="No courses yet"
 *   description="Start by enrolling in your first program"
 *   action={{ to: "/browse", label: "Browse courses" }}
 * />
 * ```
 */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?:
    | { to: string; label: string }
    | { onClick: () => void; label: string };
  className?: string;
  /** Visual density — "default" centers in a surface card, "inline" uses inline spacing only. */
  variant?: "default" | "inline";
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = "default",
}: EmptyStateProps) {
  const content = (
    <div className="flex flex-col items-center text-center py-8 md:py-12 px-4">
      {icon && (
        <span className="flex items-center justify-center h-12 w-12 rounded-full bg-surface-2 text-muted-foreground mb-4">
          {icon}
        </span>
      )}
      <h3 className="heading-3 text-foreground">{title}</h3>
      {description && (
        <p className="body-muted mt-1.5 max-w-sm">{description}</p>
      )}
      {action && (
        <div className="mt-5">
          {"to" in action ? (
            <Link
              to={action.to}
              className="focus-ring press-scale inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-cream text-cream-text font-medium text-sm hover:bg-cream/90 transition-colors"
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="focus-ring press-scale inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-cream text-cream-text font-medium text-sm hover:bg-cream/90 transition-colors"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (variant === "inline") {
    return <div className={cn(className)}>{content}</div>;
  }

  return (
    <div className={cn("surface-card", className)}>
      {content}
    </div>
  );
}

export default EmptyState;
