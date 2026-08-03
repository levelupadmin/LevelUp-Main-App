import { CSSProperties, ReactNode, useMemo } from "react";
import { resolveTheme, type RoomConfigInput } from "@/lib/room";

/**
 * RoomThemeProvider — the ONE place a cohort room's accent enters the DOM.
 *
 * It renders a single wrapper div carrying `--room-accent` / `--room-accent-text`
 * as inline custom properties, so everything in the room subtree can say
 * `text-room-accent` / `bg-room-accent` / `text-room-accent-text` (aliases in
 * `tailwind.config.ts`) and get this room's identity colour.
 *
 * ```tsx
 * <RoomThemeProvider config={room?.config} className="min-h-dvh">
 *   <RoomMasthead … />   // reads text-room-accent
 * </RoomThemeProvider>
 * ```
 *
 * Three things it deliberately does NOT do:
 *
 * 1. **It adds no layout.** No overflow, no transform, no backdrop-filter, no
 *    positioning — CSS VARIABLES ONLY. Two rooms with different accents must
 *    lay out identically, and `src/index.css`'s 2026-06-14 scroll outage is the
 *    standing reminder that a "harmless" style on a wrapper this high in the
 *    tree is not harmless. Any layout the wrapper needs comes in via
 *    `className` from the route that mounts it, and is that route's business.
 * 2. **It does not trust the config row.** `theme` is admin-entered jsonb, so
 *    the accent goes through `resolveTheme()` (R0, unit-tested in
 *    `src/lib/__tests__/room.test.ts`), which applies the WCAG AA contrast floor
 *    against `--surface-2` and hands back `accentVar` / `accentTextVar` already
 *    formatted as bare HSL triples (`"258 90% 66%"`) for the variables. The
 *    `hsl()` wrapper lives in the Tailwind alias, not here.
 * 3. **It does not remount on a theme change.** The wrapper is one stable
 *    element with no `key`; a new theme swaps the style object in place, so
 *    scroll position, focus and child state all survive an accent change
 *    mid-session.
 *
 * Outside a provider (i.e. everywhere that is not `/room/*`) the two variables
 * still resolve — `:root` defaults them to cream — so a room component dropped
 * on another surface renders in the system's own voice rather than unstyled.
 *
 * Exactly one of these per room shell. Nesting a second would work (custom
 * properties inherit) but there is no reason to, and two accents in one subtree
 * is the thing the "one accent per room" rule exists to prevent.
 */
export interface RoomThemeProviderProps {
  /**
   * The RAW `cohort_room_configs` row — NOT an already-resolved `RoomTheme`.
   * Resolution, and with it the contrast floor, happens here so a config row
   * can never reach a style attribute untouched. `null` / `undefined` (no
   * config row, or a room that has not been themed) resolves to the documented
   * defaults, which is a complete, renderable theme.
   */
  config?: RoomConfigInput | null;
  /**
   * Classes for the wrapper element. The provider contributes none of its own —
   * pass the room shell's layout here instead of nesting another div, so the
   * provider costs zero boxes.
   */
  className?: string;
  children?: ReactNode;
}

export function RoomThemeProvider({ config, className, children }: RoomThemeProviderProps) {
  const theme = resolveTheme(config);

  // Keyed on the resolved strings, not on `config`: a query that hands back a
  // fresh-but-equal config object on every render must not churn the style
  // attribute, and a genuinely new accent must swap it without a remount.
  const style = useMemo(
    () =>
      ({
        "--room-accent": theme.accentVar,
        "--room-accent-text": theme.accentTextVar,
      }) as CSSProperties,
    [theme.accentVar, theme.accentTextVar],
  );

  return (
    <div data-room-theme="" className={className} style={style}>
      {children}
    </div>
  );
}

export default RoomThemeProvider;
