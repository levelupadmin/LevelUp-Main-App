interface TestimonialCardProps {
  quote: string;
  name?: string | null;
  role?: string | null;
}

/**
 * Single pull-quote testimonial, used right after the free-preview /
 * trailer section on the offering page, where one strong voice lands
 * harder than a grid. The full Testimonials grid still renders further
 * down the page.
 */
export default function TestimonialCard({ quote, name, role }: TestimonialCardProps) {
  return (
    <figure className="rounded-2xl border border-border bg-[hsl(var(--surface))] p-6 sm:p-8 space-y-4">
      <blockquote className="text-lg sm:text-2xl text-foreground leading-relaxed font-['Instrument_Serif'] italic">
        &ldquo;{quote}&rdquo;
      </blockquote>
      {(name || role) && (
        <figcaption className="text-sm text-muted-foreground">
          {name && <span className="font-medium text-foreground">{name}</span>}
          {role && <span> · {role}</span>}
        </figcaption>
      )}
    </figure>
  );
}
