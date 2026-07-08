import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * EmptyState: the single, canonical dead-end surface — shown when a list or
 * page has no data to display.
 *
 * The one true empty state for the app. Its voice matches <SystemState> so
 * every dead-end (an empty list, a lost page) feels like the same room: calm,
 * warm, plain-spoken — a cream-ringed icon, a serif-italic headline, a muted
 * sub line, and a single cream-pill action (Link or button).
 *
 * `icon` is a ReactNode (render the lucide element yourself so you control its
 * size/stroke), e.g. `<BookOpen size={22} strokeWidth={1.5} />`.
 *
 * ```tsx
 * <EmptyState
 *   icon={<BookOpen size={22} strokeWidth={1.5} />}
 *   title="No courses yet"
 *   description="Start by enrolling in your first program."
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
}

const actionClasses =
  "focus-ring pressable mt-6 inline-flex items-center justify-center h-11 px-5 rounded-full bg-cream text-cream-text font-medium text-sm hover:bg-cream/90 transition-colors";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "anim-rise flex flex-col items-center justify-center text-center px-6 py-12",
        className
      )}
    >
      {icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-cream/20 bg-surface/60 text-cream mb-5">
          {icon}
        </span>
      )}
      <h3 className="font-serif-italic text-[24px] leading-tight text-cream">{title}</h3>
      {description && (
        <p className="body-muted mt-2 max-w-[300px]">{description}</p>
      )}
      {action &&
        ("to" in action ? (
          <Link to={action.to} className={actionClasses}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={actionClasses}>
            {action.label}
          </button>
        ))}
    </div>
  );
}

export default EmptyState;
