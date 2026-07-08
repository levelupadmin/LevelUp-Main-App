import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// "Learn from" social-proof row that replaces the generic 5-star rating.
// Pulls the instructor face + name off the *active* offerings so the proof
// is real (these are the people teaching right now), not a hardcoded list
// that drifts every time the catalog changes. Falls back to an initials
// monogram when an offering has no avatar on file.

interface Instructor {
  name: string;
  avatarUrl: string | null;
}

const INSTRUCTOR_PROOF_QUERY_KEY = ["instructor-proof"] as const;

const fetchInstructors = async (): Promise<Instructor[]> => {
  const { data, error } = await supabase
    .from("offerings")
    .select("instructor_name, instructor_avatar_url")
    .eq("status", "active")
    .not("instructor_name", "is", null);
  if (error) throw error;

  // De-dupe by name (an instructor can own several active offerings);
  // prefer the first row that carries an avatar so faces win over blanks.
  const byName = new Map<string, Instructor>();
  for (const row of data ?? []) {
    const name = (row.instructor_name ?? "").trim();
    if (!name) continue;
    const existing = byName.get(name);
    if (!existing) {
      byName.set(name, { name, avatarUrl: row.instructor_avatar_url });
    } else if (!existing.avatarUrl && row.instructor_avatar_url) {
      existing.avatarUrl = row.instructor_avatar_url;
    }
  }
  return Array.from(byName.values());
};

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface Props {
  className?: string;
  /** Cap the number of avatars shown; the rest collapse into a "+N" chip. */
  max?: number;
}

export function InstructorProof({ className, max = 5 }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: INSTRUCTOR_PROOF_QUERY_KEY,
    queryFn: fetchInstructors,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    // Reserve the row height so the form doesn't jump when proof lands.
    return (
      <div className={className}>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2.5">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-8 w-8 rounded-full border-2 border-canvas skeleton-shimmer"
              />
            ))}
          </div>
          <div className="h-3 w-32 rounded-full skeleton-shimmer" />
        </div>
      </div>
    );
  }

  const instructors = data ?? [];
  if (instructors.length === 0) return null;

  const shown = instructors.slice(0, max);
  const overflow = instructors.length - shown.length;

  // Names line: list the first few, then "& N more" so it never wraps wildly.
  const namedCount = Math.min(shown.length, 3);
  const names = instructors.slice(0, namedCount).map((i) => i.name);
  const remaining = instructors.length - namedCount;
  const namesLine =
    remaining > 0 ? `${names.join(", ")} & ${remaining} more` : names.join(", ");

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        {/* Decorative: the same instructors are named in the text below, so the
            avatar stack is hidden from assistive tech to avoid announcing each
            name twice (image alt + names line). */}
        <div className="flex -space-x-2.5" aria-hidden="true">
          {shown.map((ins) => (
            <div
              key={ins.name}
              className="h-8 w-8 rounded-full border-2 border-canvas overflow-hidden bg-surface-2 flex items-center justify-center shrink-0"
              title={ins.name}
            >
              {ins.avatarUrl ? (
                <img
                  src={ins.avatarUrl}
                  alt={ins.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="text-[10px] font-semibold text-cream">
                  {initials(ins.name)}
                </span>
              )}
            </div>
          ))}
          {overflow > 0 && (
            <div className="h-8 w-8 rounded-full border-2 border-canvas bg-surface-2 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-semibold text-muted-foreground">
                +{overflow}
              </span>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Learn from
          </p>
          <p className="text-[13px] text-foreground leading-snug line-clamp-1">
            {namesLine}
          </p>
        </div>
      </div>
    </div>
  );
}

export default InstructorProof;
