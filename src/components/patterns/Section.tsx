import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Section — a labeled block of content with consistent spacing and header.
 *
 * Pages are built out of a vertical stack of Sections. A Section has an
 * optional title + description + action, and children rendered in the body.
 * Use inside a `<div className="section-stack">` parent (or space-y-*) so
 * sections inherit the app's rhythm.
 *
 * ```tsx
 * <Section
 *   title="Continue learning"
 *   description="Jump back into your in-progress courses"
 *   action={{ to: "/my-courses", label: "View all" }}
 * >
 *   <CourseGrid />
 * </Section>
 * ```
 */
export interface SectionProps {
  /** Section heading. When omitted the section has no header row. */
  title?: ReactNode;
  /** One-line description under the title. */
  description?: ReactNode;
  /** Right-aligned action — a "View all" link, button, or custom node. */
  action?:
    | { to: string; label: string }
    | { onClick: () => void; label: string }
    | ReactNode;
  /** Extra className on the wrapper. */
  className?: string;
  /** Extra className on the body (below the title row). */
  bodyClassName?: string;
  /** Visual density — "relaxed" (default) or "compact". */
  density?: "relaxed" | "compact";
  children: ReactNode;
}

function isLinkAction(a: unknown): a is { to: string; label: string } {
  return !!a && typeof a === "object" && "to" in (a as any) && "label" in (a as any);
}
function isButtonAction(a: unknown): a is { onClick: () => void; label: string } {
  return !!a && typeof a === "object" && "onClick" in (a as any) && "label" in (a as any);
}

export function Section({
  title,
  description,
  action,
  className,
  bodyClassName,
  density = "relaxed",
  children,
}: SectionProps) {
  const showHeader = title || description || action;

  let actionNode: ReactNode = null;
  if (isLinkAction(action)) {
    actionNode = (
      <Link
        to={action.to}
        className="focus-ring press-scale inline-flex items-center gap-1 text-[13px] font-medium text-cream hover:text-cream/80 transition-colors rounded-md min-h-[36px] px-1"
      >
        {action.label}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    );
  } else if (isButtonAction(action)) {
    actionNode = (
      <button
        onClick={action.onClick}
        className="focus-ring press-scale inline-flex items-center gap-1 text-[13px] font-medium text-cream hover:text-cream/80 transition-colors rounded-md min-h-[36px] px-1"
      >
        {action.label}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    );
  } else if (action) {
    actionNode = action;
  }

  return (
    <section className={cn("w-full", className)}>
      {showHeader && (
        <div
          className={cn(
            "flex items-end justify-between gap-4",
            density === "compact" ? "mb-3" : "mb-4 md:mb-5",
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className={cn(density === "compact" ? "heading-3" : "heading-2", "text-foreground")}>
                {title}
              </h2>
            )}
            {description && (
              <p className="body-muted mt-1">{description}</p>
            )}
          </div>
          {actionNode && <div className="shrink-0">{actionNode}</div>}
        </div>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}

export default Section;
