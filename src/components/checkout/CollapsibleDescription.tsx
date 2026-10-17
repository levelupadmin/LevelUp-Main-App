import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The offering description on checkout, clamped to two lines behind
 * "Read more". The full paragraph (1,400+ characters on the masterclasses)
 * used to push the form and the Pay button two to three screens down on a
 * phone; the buyer arrives from a sales page that already said all of it.
 */
export default function CollapsibleDescription({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  // Short descriptions fit in two lines; no toggle for them.
  const long = text.trim().length > 120;
  return (
    <div className={cn("mt-2", className)}>
      <p
        id={id}
        className={cn(
          "text-sm text-muted-foreground leading-relaxed whitespace-pre-line",
          long && !open && "line-clamp-2",
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center min-h-[44px] -my-1.5 text-xs font-medium text-[hsl(var(--cream))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] rounded-sm"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
