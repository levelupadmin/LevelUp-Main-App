import { useCallback, useEffect, useMemo, useState } from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

import { MorphSheet } from "@/components/motion/MorphSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { tapTick } from "@/lib/haptics";
import { track } from "@/lib/analytics";
import { useMotionSafe } from "@/lib/motion";
import { resolveTheme } from "@/lib/room";
import { cn } from "@/lib/utils";

/**
 * RoomSwitcher — the room nameplate, and (only when it has somewhere to go) the
 * control that moves a multi-cohort member between their rooms (R1-T5).
 *
 * ── The contract with the shell ──
 * This component NEVER fetches. It renders the membership list `RoomShell`
 * already holds from `useCohortRooms()` (R1-T1) — one RPC round-trip
 * (`get_my_cohort_rooms()`), one consumer of it. A second read here would be a
 * duplicate membership query on every room paint, and `05-ACCESS-SECURITY.md`
 * is explicit that room membership is a live server read, never something a
 * component re-derives for itself. Hence `rooms` + `currentOfferingId` as
 * PROPS: the switcher is pure presentation over data the shell owns.
 *
 * ── Dead controls ──
 * A dropdown that opens onto a single row is a dead control, so the menu only
 * exists when there is genuinely another addressable room to reach. One
 * membership (or one addressable membership) renders the nameplate as static
 * text: no button, no chevron, no `aria-haspopup`, nothing to tap. A room whose
 * config row has no `slug` is not reachable at `/room/:slug` at all, so it is
 * not offered as a destination — see `addressable` below.
 *
 * ── Two surfaces, one grammar ──
 * Desktop (≥768px, the same breakpoint `StudentLayout` splits its chrome on) is
 * a Radix dropdown; below it is a `vaul` sheet via `MorphSheet`, the app's
 * sheet grammar since P4-T1.
 *
 * ⚠️ vaul background-scale stays OFF (`MorphSheet` hard-codes
 * `shouldScaleBackground={false}`) and this component adds NO
 * `[vaul-drawer-wrapper]`. That is the P4-T4 GO/NO-GO recorded in
 * `StudentLayout.tsx` (~line 116): vaul scales the wrapper with `transform:
 * scale(...)`, and a transform establishes a containing block for every
 * `position: fixed`/`sticky` descendant — which would re-anchor the fixed
 * mobile tab bar and the sticky header to the scaled wrapper for as long as any
 * sheet is open. Identical on Blink and WebKit, so it reproduces on the Android
 * WebView we ship. Do not reintroduce it here.
 *
 * ── Android back ──
 * Neither surface needs its own back handling. `App.tsx`'s hardware-back
 * listener already looks for `[data-vaul-drawer][data-state="open"]` and
 * `[data-radix-popper-content-wrapper]` and dispatches Escape at them, which
 * both Radix (DismissableLayer) and vaul (Radix Dialog) honour. A back press
 * with the menu open therefore CLOSES the menu instead of navigating out of the
 * room and stranding an open overlay. The dropdown runs `modal={false}` so it
 * never engages a body scroll lock at all.
 *
 * ── Motion ──
 * `springs.snap` (the button/toggle preset) drives the dropdown's entrance and
 * the chevron; `AnimatePresence` + `forceMount` keeps the Radix content mounted
 * for its exit. Transform and opacity only — no width/height/filter, no one-off
 * easings. Every spring comes from `useMotionSafe()`, which maps `snap` to an
 * instant cut under `prefers-reduced-motion`. The SHEET's entrance and exit are
 * vaul's own spring + keyframes (already flattened by the global reduced-motion
 * block in `index.css`); layering a second entrance on its rows would animate
 * content upward inside a surface that is itself sliding upward.
 *
 * ── Colour ──
 * Every accent is run through `resolveTheme()` (R0) rather than read off the
 * `theme` jsonb, so the WCAG AA contrast floor applies to a row's chip exactly
 * as it applies to the room itself — an admin cannot type an unreadable colour
 * into this menu. Rows use INLINE accents on purpose: the menu is portalled to
 * `document.body`, outside `RoomThemeProvider`'s wrapper, so `--room-accent`
 * there would resolve to the `:root` cream default for every row. The trigger
 * sits inside the provider and uses the `text-room-accent-text` alias.
 */

/**
 * `localStorage` key holding the slug of the room the member last switched to
 * (`ROOMS-ARCHITECTURE.md` §6.2). Exported so the sign-out purge
 * (`clearPerUserLocalState()` in `AuthContext`) and any "resume last room"
 * caller name the same string — a per-user watermark that outlives sign-out is
 * exactly the class of bug `lu_weeks_seen` taught.
 */
export const LAST_ROOM_STORAGE_KEY = "lu_last_room";

/**
 * Key under which a departing room's scroll offset is parked in its own history
 * entry's `state`. Namespaced so it cannot collide with route state a caller
 * passes for its own reasons.
 */
const SCROLL_STATE_KEY = "luRoomScrollY";

/**
 * How many frames the restore may keep retrying. A room popped back to re-fetches
 * its content, so for the first frames after the POP the document can be shorter
 * than the offset we are restoring and the browser clamps the scroll. ~12 frames
 * (about 200ms at 60fps) covers a warm react-query cache without ever fighting a
 * user who has started scrolling for themselves.
 */
const SCROLL_RESTORE_MAX_FRAMES = 12;

/**
 * One membership row, as `get_my_cohort_rooms()` returns it.
 *
 * Deliberately a MINIMAL structural subset — only what the switcher renders —
 * so the richer row type from `useCohortRooms()` (R1-T1) is assignable without
 * this file importing it, and so a later column added to the RPC costs nothing
 * here. `theme` is `unknown` for the same reason it is `unknown` in
 * `RoomConfigInput`: it is admin-entered jsonb, and the only thing allowed to
 * make claims about its shape is `resolveTheme()`.
 */
export interface RoomSwitcherRoom {
  offering_id: string;
  offering_title: string;
  /** `cohort_room_configs.slug`. NULL when the room has no config row. */
  room_slug: string | null;
  batch_name?: string | null;
  phase?: string | null;
  theme?: unknown;
}

export interface RoomSwitcherProps {
  /** Every room this member holds, in the RPC's order (live first, alumni last). */
  rooms: readonly RoomSwitcherRoom[];
  /** The offering whose room is on screen — the identity the RPC row is keyed on. */
  currentOfferingId: string;
  /** Classes for the trigger / static nameplate. */
  className?: string;
}

/** A room resolved down to what a row actually draws. */
interface RoomOption {
  offeringId: string;
  slug: string;
  label: string;
  secondary: string | null;
  accent: string;
  isCurrent: boolean;
}

/** Read a parked scroll offset out of a history entry's state, or null. */
function readSavedScroll(state: unknown): number | null {
  if (state === null || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[SCROLL_STATE_KEY];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** `lu_last_room`. Storage can be disabled (private mode, a locked-down WebView). */
function rememberLastRoom(slug: string): void {
  try {
    window.localStorage.setItem(LAST_ROOM_STORAGE_KEY, slug);
  } catch {
    /* storage unavailable — the pointer is a convenience, never a gate */
  }
}

const ROW_CLASSES =
  "focus-ring flex min-h-[44px] w-full cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors data-[highlighted]:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2";

/** The inner content of a room row — shared by the dropdown item and the sheet button. */
function RoomRow({ option }: { option: RoomOption }) {
  return (
    <>
      {/* The accent chip. Inline because the portal sits outside RoomThemeProvider. */}
      <span
        aria-hidden="true"
        className="h-7 w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: `hsl(${option.accent})` }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-xs uppercase tracking-[0.16em] text-foreground">
          {option.label}
        </span>
        {option.secondary ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {option.secondary}
          </span>
        ) : null}
      </span>
      {option.isCurrent ? (
        <Check
          aria-hidden="true"
          className="h-4 w-4 shrink-0"
          style={{ color: `hsl(${option.accent})` }}
        />
      ) : null}
    </>
  );
}

export function RoomSwitcher({ rooms, currentOfferingId, className }: RoomSwitcherProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const motionSafe = useMotionSafe();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();

  const current = useMemo(
    () => rooms.find((room) => room.offering_id === currentOfferingId) ?? null,
    [rooms, currentOfferingId],
  );

  /**
   * Destinations. A room with no slug has no `/room/:slug` to send anyone to, so
   * it is not a destination — listing it would render a row that cannot be
   * followed, which is the dead control this task exists to avoid.
   */
  const options = useMemo<RoomOption[]>(
    () =>
      rooms.flatMap((room) => {
        const slug = room.room_slug?.trim();
        if (!slug) return [];
        const theme = resolveTheme(room);
        const secondary = [
          room.batch_name?.trim() || null,
          room.phase === "alumni" ? "Alumni" : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return [
          {
            offeringId: room.offering_id,
            slug,
            label: theme.wordmarkText ?? room.offering_title,
            secondary: secondary || null,
            accent: theme.accentTextVar,
            isCurrent: room.offering_id === currentOfferingId,
          },
        ];
      }),
    [rooms, currentOfferingId],
  );

  const currentLabel = current
    ? (resolveTheme(current).wordmarkText ?? current.offering_title)
    : null;
  const hasSomewhereToGo = options.some((option) => !option.isCurrent);

  /**
   * Park the departing room's scroll offset in ITS OWN history entry before
   * pushing the next one, so a Back out of the destination lands the member
   * where they were rather than at the top of a room they had read halfway
   * down. React Router keeps `state` per entry, so the replace below rewrites
   * the current entry in place and the push that follows stacks on top of it.
   *
   * The switcher owns this because the switcher is what creates the round trip;
   * `ScrollToTop` (App.tsx) correctly resets every other route change.
   */
  const parkScroll = useCallback(() => {
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      {
        replace: true,
        state: {
          ...(typeof location.state === "object" && location.state !== null
            ? location.state
            : null),
          [SCROLL_STATE_KEY]: Math.round(window.scrollY),
        },
      },
    );
  }, [navigate, location.pathname, location.search, location.hash, location.state]);

  // The other half of the round trip: on a POP back into a room we parked an
  // offset for, restore it. Runs on rAF so it lands AFTER ScrollToTop's effect
  // has zeroed the window for the new route.
  useEffect(() => {
    if (navigationType !== "POP") return;
    const saved = readSavedScroll(location.state);
    if (saved === null) return;

    let frame = 0;
    let handle = 0;
    const attempt = () => {
      window.scrollTo({ top: saved, left: 0, behavior: "instant" as ScrollBehavior });
      frame += 1;
      // The room may still be painting its content; keep asking until the
      // document is tall enough to hold the offset, then stop.
      if (frame < SCROLL_RESTORE_MAX_FRAMES && Math.round(window.scrollY) < saved) {
        handle = requestAnimationFrame(attempt);
      }
    };
    handle = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(handle);
  }, [navigationType, location.key, location.state]);

  const handleSelect = useCallback(
    (option: RoomOption) => {
      setOpen(false);
      if (option.isCurrent) return;
      void tapTick();
      track({ name: "room_switched" });
      rememberLastRoom(option.slug);
      parkScroll();
      navigate(`/room/${encodeURIComponent(option.slug)}`);
    },
    [navigate, parkScroll],
  );

  // No membership row for this offering (a list still in flight, or a room the
  // caller resolved another way): the masthead carries the nameplate, so render
  // nothing rather than a placeholder that shifts layout when the data lands.
  if (!currentLabel) return null;

  const nameplate = (
    <>
      <span className="truncate font-mono text-xs uppercase tracking-[0.18em] text-room-accent-text">
        {currentLabel}
      </span>
      <motion.span
        aria-hidden="true"
        className="shrink-0 text-muted-foreground"
        animate={{ rotate: open ? 180 : 0 }}
        transition={motionSafe.springs.snap}
      >
        <ChevronDown className="h-4 w-4" />
      </motion.span>
    </>
  );

  // One membership — or one addressable one. Static text, no control.
  if (!hasSomewhereToGo) {
    return (
      <span
        className={cn(
          "inline-flex min-h-[44px] max-w-full items-center truncate font-mono text-xs uppercase tracking-[0.18em] text-room-accent-text",
          className,
        )}
      >
        {currentLabel}
      </span>
    );
  }

  const triggerClasses = cn(
    "focus-ring inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-xl px-3 py-2 transition-colors [@media(hover:hover)]:hover:bg-surface",
    className,
  );
  const triggerLabel = `Switch cohort room. Current room: ${currentLabel}`;

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={triggerLabel}
          className={triggerClasses}
        >
          {nameplate}
        </button>
        <MorphSheet
          open={open}
          onOpenChange={setOpen}
          title="Switch room"
          description="Choose which of your cohort rooms to open."
          className="pt-2"
        >
          <h2 className="px-3 pb-2 pt-1 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">
            Your rooms
          </h2>
          <div className="flex flex-col gap-1 pb-4">
            {options.map((option) => (
              <button
                key={option.offeringId}
                type="button"
                onClick={() => handleSelect(option)}
                aria-current={option.isCurrent ? "page" : undefined}
                className={ROW_CLASSES}
              >
                <RoomRow option={option} />
              </button>
            ))}
          </div>
        </MorphSheet>
      </>
    );
  }

  return (
    <DropdownMenuPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuPrimitive.Trigger aria-label={triggerLabel} className={triggerClasses}>
        {nameplate}
      </DropdownMenuPrimitive.Trigger>
      <AnimatePresence>
        {open ? (
          <DropdownMenuPrimitive.Portal forceMount>
            <DropdownMenuPrimitive.Content
              asChild
              align="start"
              sideOffset={8}
              collisionPadding={12}
            >
              <motion.div
                className="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-1.5 shadow-lg"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={motionSafe.springs.snap}
                style={{ transformOrigin: "var(--radix-dropdown-menu-content-transform-origin)" }}
              >
                {options.map((option) => (
                  <DropdownMenuPrimitive.Item
                    key={option.offeringId}
                    onSelect={() => handleSelect(option)}
                    aria-current={option.isCurrent ? "page" : undefined}
                    className={ROW_CLASSES}
                  >
                    <RoomRow option={option} />
                  </DropdownMenuPrimitive.Item>
                ))}
              </motion.div>
            </DropdownMenuPrimitive.Content>
          </DropdownMenuPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DropdownMenuPrimitive.Root>
  );
}

export default RoomSwitcher;
