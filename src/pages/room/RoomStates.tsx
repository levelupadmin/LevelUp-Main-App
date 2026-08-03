import { Lock, RotateCcw } from "lucide-react";
import { EmptyState, SkeletonBlock, SkeletonLine } from "@/components/patterns";

/**
 * RoomStates — the three non-content states a room route can land in, in ONE
 * place so they cannot drift into three improvisations.
 *
 * The voice matches `patterns/EmptyState` (cream-ringed icon, serif-italic
 * headline, muted sub line), so a locked room reads like every other dead end
 * in the app rather than like a bug.
 *
 * The rule these encode (brief rule 6): a visitor who cannot enter a room sees
 * a branded state — NEVER a spinner that never resolves, and never a tease of
 * content they cannot have.
 */

/**
 * `/room/:slug` for a slug we cannot resolve.
 *
 * "Private" and "does not exist" are ONE state on purpose. A client can only
 * map a slug to an offering through its own memberships, so the two are
 * genuinely indistinguishable here — and splitting them would turn the route
 * into a slug oracle that confirms which cohorts exist.
 */
export const RoomUnavailableState = () => (
  <EmptyState
    icon={<Lock size={22} strokeWidth={1.5} />}
    title="This room is private"
    description="It's private, or it doesn't exist. If you're enrolled, open it from My Cohorts."
    action={{ to: "/rooms", label: "My Cohorts" }}
  />
);

/**
 * A room we DID resolve, where the server answered `42501`.
 *
 * Reachable from the UUID route, where the split is real: `get_cohort_room`
 * either returns a payload or raises. Kept separate from the slug route's
 * combined state because "empty" and "denied" are different answers, and the UI
 * must not conflate them.
 */
export const RoomPrivateState = () => (
  <EmptyState
    icon={<Lock size={22} strokeWidth={1.5} />}
    title="This room is private"
    description="You're not on the roster for this cohort. If that looks wrong, talk to your program team."
    action={{ to: "/rooms", label: "My Cohorts" }}
  />
);

/** The room could not be loaded — a network flake, not a permission answer. */
export const RoomErrorState = ({ onRetry }: { onRetry?: () => void }) => (
  <EmptyState
    icon={<RotateCcw size={22} strokeWidth={1.5} />}
    title="We couldn't open the room"
    description="Something went wrong on the way in. Give it another go."
    action={onRetry ? { onClick: onRetry, label: "Try again" } : { to: "/rooms", label: "My Cohorts" }}
  />
);

/**
 * The room shell, loading.
 *
 * A skeleton in the SHAPE of a room (masthead block, nameplate lines, a tab
 * rail, a module stack) so the wait reads as "this exact layout is arriving",
 * matching `RouteFallback`'s reasoning. Never shown to someone who will end up
 * on a private state — the states above resolve first.
 */
export const RoomLoadingState = () => (
  <div
    className="mx-auto w-full min-w-0 max-w-5xl space-y-6"
    role="status"
    aria-busy="true"
    aria-live="polite"
  >
    <span className="sr-only">Loading room…</span>
    <SkeletonBlock height={200} className="rounded-2xl" />
    <div className="space-y-3">
      <SkeletonLine width="40%" height="18px" />
      <SkeletonLine width="70%" height="12px" />
    </div>
    <div className="flex gap-3 overflow-hidden">
      {[0, 1, 2, 3].map((i) => (
        <SkeletonLine key={i} width={88} height="32px" className="rounded-full" />
      ))}
    </div>
    <div className="space-y-4">
      {[0, 1].map((i) => (
        <SkeletonBlock key={i} height={120} className="rounded-2xl" />
      ))}
    </div>
  </div>
);
