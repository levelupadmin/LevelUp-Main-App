import { forwardRef, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * SurfaceCard — the canonical card surface.
 *
 * Replaces the pattern `bg-surface border border-border rounded-xl ...`
 * that was re-inlined across 8+ pages. Three variants:
 *
 *   interactive (default) — hover lift + press scale, renders as a button/Link
 *                           when `as` or `to`/`onClick` is provided.
 *   static               — no interactivity, just the surface.
 *   muted                — bg-surface-2 variant for nested cards.
 *
 * ```tsx
 * <SurfaceCard to={`/courses/${id}`} padding="md">
 *   ...card content...
 * </SurfaceCard>
 * ```
 */
export type SurfaceCardPadding = "none" | "sm" | "md" | "lg";

export interface SurfaceCardBaseProps {
  variant?: "interactive" | "static" | "muted";
  padding?: SurfaceCardPadding;
  children: ReactNode;
  className?: string;
  /** Completely remove rounded corners (used for image-topped cards). */
  flush?: boolean;
}

export type SurfaceCardLinkProps = SurfaceCardBaseProps & {
  to: string;
  onClick?: never;
};
export type SurfaceCardButtonProps = SurfaceCardBaseProps & {
  onClick: () => void;
  to?: never;
};
export type SurfaceCardDivProps = SurfaceCardBaseProps & {
  to?: never;
  onClick?: never;
};

export type SurfaceCardProps =
  | SurfaceCardLinkProps
  | SurfaceCardButtonProps
  | SurfaceCardDivProps;

const paddingClass: Record<SurfaceCardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5 md:p-6",
};

const baseClasses = (variant: SurfaceCardBaseProps["variant"]) =>
  cn(
    variant === "muted"
      ? "bg-surface-2 border border-border"
      : "bg-surface border border-border",
    "rounded-xl overflow-hidden",
  );

export const SurfaceCard = forwardRef<HTMLElement, SurfaceCardProps>(
  function SurfaceCard(
    { variant = "interactive", padding = "md", children, className, flush, ...rest },
    ref,
  ) {
    const interactive = variant === "interactive";
    const classes = cn(
      baseClasses(variant),
      interactive && "card-hover press-scale focus-ring cursor-pointer",
      flush && "rounded-none",
      paddingClass[padding],
      className,
    );

    if ("to" in rest && rest.to) {
      return (
        <Link ref={ref as any} to={rest.to} className={classes}>
          {children}
        </Link>
      );
    }
    if ("onClick" in rest && rest.onClick) {
      return (
        <button
          ref={ref as any}
          type="button"
          onClick={rest.onClick}
          className={cn(classes, "text-left w-full")}
        >
          {children}
        </button>
      );
    }
    return (
      <div ref={ref as any} className={classes}>
        {children}
      </div>
    );
  },
);

export default SurfaceCard;
