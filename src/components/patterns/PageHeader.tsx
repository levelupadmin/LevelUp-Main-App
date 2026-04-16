import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PageHeader — unified page title block.
 *
 * Replaces the bespoke "h1 + description + actions" cluster that every
 * screen was hand-rolling. Gives LevelUp a single visual rhythm for every
 * landing view: eyebrow → title → subtitle → actions, with optional
 * back-link, icon, and meta.
 *
 * Use at the top of every page/section directly below StudentLayout/
 * AdminLayout content wrapper.
 *
 * ```tsx
 * <PageHeader
 *   eyebrow="Courses"
 *   title="My Courses"
 *   subtitle="Everything you're enrolled in, ready to go."
 *   actions={<Button>New course</Button>}
 * />
 * ```
 */
export interface PageHeaderProps {
  /** Short uppercase label above the title (e.g. "Courses", "Admin"). */
  eyebrow?: string;
  /** Main page title. Required. */
  title: ReactNode;
  /** One-line description under the title. */
  subtitle?: ReactNode;
  /** Inline icon rendered to the left of the title. */
  icon?: ReactNode;
  /** Right-aligned action cluster (buttons, dropdowns, etc.). */
  actions?: ReactNode;
  /** Meta info rendered as a row below the title (stats, dates, counts). */
  meta?: ReactNode;
  /** Back link — when provided, renders a chevron+label tappable target. */
  back?: { to: string; label?: string };
  /** Extra class names applied to the wrapper. */
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  actions,
  meta,
  back,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 md:gap-4", className)}>
      {back && (
        <Link
          to={back.to}
          className="focus-ring press-scale inline-flex items-center gap-1 self-start -ml-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors rounded-md min-h-[36px] px-1"
        >
          <ChevronLeft className="h-4 w-4" />
          {back.label ?? "Back"}
        </Link>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="heading-eyebrow mb-1.5">{eyebrow}</p>}
          <div className="flex items-center gap-3">
            {icon && (
              <span className="flex items-center justify-center h-10 w-10 rounded-lg surface-card-muted text-cream shrink-0">
                {icon}
              </span>
            )}
            <h1 className="heading-1 text-foreground truncate">{title}</h1>
          </div>
          {subtitle && (
            <p className="body-muted mt-1.5 max-w-2xl">{subtitle}</p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>

      {meta && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 caption">
          {meta}
        </div>
      )}
    </header>
  );
}

export default PageHeader;
