import type { LucideIcon } from "lucide-react";
import { EmptyState as CanonicalEmptyState } from "@/components/patterns/EmptyState";

/**
 * @deprecated Import the canonical EmptyState from `@/components/patterns/EmptyState`.
 *
 * This module is a backward-compatible shim kept only so existing call sites keep
 * compiling. It maps the old serif API (`icon` as a lucide component, `sub`, `cta`)
 * onto the single canonical `patterns/EmptyState` (`icon` as a ReactNode,
 * `description`, `action`). New code should use the canonical component directly and
 * pass the icon as an element, e.g. `icon={<BookOpen size={22} strokeWidth={1.5} />}`.
 */
type EmptyStateCta =
  | { label: string; to: string }
  | { label: string; onClick: () => void };

interface LegacyEmptyStateProps {
  icon: LucideIcon;
  title: string;
  sub?: string;
  cta?: EmptyStateCta;
  className?: string;
}

export const EmptyState = ({ icon: Icon, title, sub, cta, className }: LegacyEmptyStateProps) => (
  <CanonicalEmptyState
    icon={<Icon size={22} strokeWidth={1.5} />}
    title={title}
    description={sub}
    action={cta}
    className={className}
  />
);

export default EmptyState;
