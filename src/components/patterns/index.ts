// Barrel export for design-system primitives.
// Always import patterns from "@/components/patterns" — keeps page imports tidy
// and lets us reorganize the underlying modules without touching consumers.
export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";

export { Section } from "./Section";
export type { SectionProps } from "./Section";

export { SurfaceCard } from "./SurfaceCard";
export type { SurfaceCardProps, SurfaceCardPadding } from "./SurfaceCard";

export { StatCard } from "./StatCard";
export type { StatCardProps, StatAccent } from "./StatCard";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { ErrorState } from "./ErrorState";
export type { ErrorStateProps } from "./ErrorState";

export {
  SkeletonLine,
  SkeletonBlock,
  SkeletonCard,
  SkeletonGrid,
  PageSpinner,
} from "./LoadingState";
