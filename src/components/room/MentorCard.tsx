import InitialsAvatar from "@/components/InitialsAvatar";
import { cn } from "@/lib/utils";

/**
 * MentorCard.tsx — the people who run the room (R3-T2).
 *
 * The top of `/room/:slug/people`: avatar, wordmark, name, and one serif line.
 * Mentors and hosts are offering-wide (`cohort_room_roster_ids` always admits
 * `role IN ('mentor','host')`, whatever batch the caller is in), so this card is
 * the one part of the roster every member of an offering sees identically.
 *
 * ── What it may render, and nothing else ──────────────────────────────────
 * Every value here traces to a column of `get_room_roster`: `full_name`,
 * `avatar_url`, `occupation`, `city`, `role`. That RPC returns SIX columns and
 * deliberately carries no phone and no email (the projection is pinned in the
 * migration's `RETURNS TABLE` and asserted over the wire by the adversarial
 * suite's C1). This component therefore takes composed STRINGS rather than a
 * roster row: it cannot reach for a field the roster does not return, because it
 * is never handed the row.
 *
 * ── ROSTER-SCOPE-1 ────────────────────────────────────────────────────────
 * No DM, no follow, no profile drilldown in v1. The card is deliberately not a
 * link and not a button: there is nowhere to go, so there is no affordance
 * suggesting there is. That is a product ruling, not a styling accident — do not
 * add an `onClick` here without the ruling being revisited.
 *
 * ── Absence is silence ────────────────────────────────────────────────────
 * `line` omitted (or null) renders NO element at all rather than an empty one:
 * `occupation` and `city` are both nullable on `public.users`, and a blank line
 * under a name reads as a broken card, not as a person who did not fill a field.
 */

export interface MentorCardProps {
  /** Display name, already resolved (see `rosterDisplayName` in RosterGrid). */
  name: string;
  /** `users.avatar_url`. Null falls through to the initials disc. */
  avatarUrl?: string | null;
  /** The wordmark, already resolved: `MENTOR` or `HOST`. Rendered verbatim. */
  wordmark: string;
  /** The serif one-liner (occupation, else city). Omitted when there is none. */
  line?: string | null;
  className?: string;
}

const MentorCard = ({ name, avatarUrl, wordmark, line, className }: MentorCardProps) => (
  <div
    data-testid="mentor-card"
    className={cn(
      "flex items-start gap-3 rounded-xl border border-border bg-surface p-4",
      className,
    )}
  >
    <InitialsAvatar name={name} photoUrl={avatarUrl} size={48} className="shrink-0" />
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-room-accent">
        {wordmark}
      </p>
      <p className="mt-1 break-words font-serif text-[19px] leading-tight text-foreground">
        {name}
      </p>
      {line && (
        <p className="mt-1 break-words font-serif-italic text-sm leading-snug text-muted-foreground">
          {line}
        </p>
      )}
    </div>
  </div>
);

export default MentorCard;
