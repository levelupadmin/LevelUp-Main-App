import { forwardRef, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { MotionCard } from "@/components/motion/MotionCard";
import { tapTick } from "@/lib/haptics";

/**
 * SurfaceCard: the canonical card surface.
 *
 * Replaces the pattern `bg-surface border border-border rounded-xl ...`
 * that was re-inlined across 8+ pages. Three variants:
 *
 *   interactive (default): press scale + hover lift (via MotionCard's snap/glide
 *                           springs), fires a tapTick() haptic on activation, and
 *                           is keyboard-operable. Renders as a Link (client-side
 *                           routing) when `to` is set, a button when `onClick` is
 *                           set, or a self-pressable div otherwise.
 *   static               : no interactivity, just the surface.
 *   muted                : bg-surface-2 variant for nested cards.
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
    // The spring path (MotionCard) replaces the old .card-hover/.press-scale
    // behaviour for interactive cards; keep .focus-ring + cursor for affordance.
    const classes = cn(
      baseClasses(variant),
      interactive && "focus-ring cursor-pointer",
      flush && "rounded-none",
      paddingClass[padding],
      className,
    );

    // ── Interactive Link ── keep client-side routing AND native link semantics.
    // MotionCard's Slot layers ONLY the press/hover springs onto the native <a>: we
    // deliberately do NOT hand MotionCard an onClick, so it stays non-interactive
    // (no role="button", no Enter-preventDefault keydown bridge). The anchor keeps
    // its real link role and is already keyboard-operable — Enter synthesizes a
    // click. tapTick() rides on the <Link>'s own onClick (fires on mouse click and
    // on the Enter-synthesized click) without cancelling navigation. tabIndex={0}
    // preserves the anchor's native tab stop (MotionCard would otherwise force -1
    // on a non-interactive card).
    if ("to" in rest && rest.to) {
      return (
        <MotionCard asChild tabIndex={0}>
          <Link
            ref={ref as React.Ref<HTMLAnchorElement>}
            to={rest.to}
            className={classes}
            onClick={tapTick}
          >
            {children}
          </Link>
        </MotionCard>
      );
    }

    // ── Interactive button ── MotionCard supplies button semantics + Enter/Space
    // keyboard activation for the onClick; wrap it to also fire the haptic tick.
    if ("onClick" in rest && rest.onClick) {
      const onClick = rest.onClick;
      const handleActivate = () => {
        tapTick();
        onClick();
      };
      return (
        <MotionCard
          ref={ref as React.Ref<HTMLDivElement>}
          onClick={handleActivate}
          className={cn(classes, "text-left w-full")}
        >
          {children}
        </MotionCard>
      );
    }

    // ── Interactive div (no handler) ── still a pressable surface: MotionCard adds
    // the press/hover springs but stays a non-focusable, semantics-free <div>.
    if (interactive) {
      return (
        <MotionCard ref={ref as React.Ref<HTMLDivElement>} className={classes}>
          {children}
        </MotionCard>
      );
    }

    // ── Static / muted ── motion-free plain surface.
    return (
      <div ref={ref as React.Ref<HTMLDivElement>} className={classes}>
        {children}
      </div>
    );
  },
);

export default SurfaceCard;
