import type { CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useReveal } from "@/hooks/useReveal";

interface RevealProps {
  children?: ReactNode;
  className?: string;
  /** Extra delay before the reveal transition starts, for manual stagger. */
  delayMs?: number;
  /** Rendered element, defaults to a div. */
  as?: ElementType;
}

/**
 * Scroll-reveal wrapper: applies `.reveal` and lets useReveal flip it to
 * `.reveal-in` on first intersection. Under reduced motion the content is
 * visible immediately.
 */
export const Reveal = ({ children, className, delayMs, as: Tag = "div" }: RevealProps) => {
  const ref = useReveal<HTMLElement>();
  const style: CSSProperties | undefined =
    delayMs && delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined;

  return (
    <Tag ref={ref} className={cn("reveal", className)} style={style}>
      {children}
    </Tag>
  );
};

export default Reveal;
