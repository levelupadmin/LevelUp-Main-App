import { AlertCircle, RefreshCw } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * ErrorState — shown when a data fetch fails or a screen can't render.
 *
 * Pairs with EmptyState / LoadingState so every data-dependent view has
 * the same set of affordances.
 *
 * ```tsx
 * {error ? (
 *   <ErrorState onRetry={refetch} />
 * ) : loading ? (
 *   <SkeletonGrid />
 * ) : items.length === 0 ? (
 *   <EmptyState ... />
 * ) : (
 *   ...items
 * )}
 * ```
 */
export interface ErrorStateProps {
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  variant?: "default" | "inline";
}

export function ErrorState({
  title = "Something went wrong",
  description = "Check your connection and try again.",
  onRetry,
  retryLabel = "Try again",
  className,
  variant = "default",
}: ErrorStateProps) {
  const inner = (
    <div className="flex flex-col items-center text-center py-8 md:py-12 px-4">
      <span className="flex items-center justify-center h-12 w-12 rounded-full bg-[hsl(var(--accent-crimson)/0.12)] text-[hsl(var(--accent-crimson))] mb-4">
        <AlertCircle className="h-5 w-5" />
      </span>
      <h3 className="heading-3 text-foreground">{title}</h3>
      <p className="body-muted mt-1.5 max-w-sm">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="focus-ring press-scale inline-flex items-center justify-center gap-2 mt-5 h-10 px-4 rounded-lg bg-surface-2 border border-border text-foreground font-medium text-sm hover:bg-surface transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          {retryLabel}
        </button>
      )}
    </div>
  );

  if (variant === "inline") {
    return <div className={cn(className)} role="alert">{inner}</div>;
  }

  return (
    <div className={cn("surface-card", className)} role="alert">
      {inner}
    </div>
  );
}

export default ErrorState;
