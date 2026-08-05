/**
 * The Creator OS design language, translated into LevelUp's palette.
 *
 * The original Creator OS (creator-os/frontend) earns its feel from four moves
 * this prototype now copies deliberately:
 *
 *  1. **Nodes have a lip.** `box-shadow: 0 5px 0 <darker>` plus a 3px press on
 *     :active. That single detail is why the path feels like a physical board
 *     and not a list of circles.
 *  2. **Each phase owns a colour.** Walking from phase 1 to phase 4 should look
 *     like moving through a book, not scrolling one page.
 *  3. **The trail winds.** Fixed horizontal offsets per day index — a straight
 *     column reads as a checklist, a winding one reads as a journey.
 *  4. **Weeks are announced, phases are rewarded.** A tinted unit banner opens
 *     each week; a chest closes each phase with its payoff line.
 *
 * What changes vs the original: the palette. Creator OS runs teal/amber/pink on
 * warm dark; this app is champagne and cream on pure black. Phase identity now
 * comes from the app's OWN accent tokens, so the board is unmistakably Creator
 * OS in structure and unmistakably LevelUp in colour.
 */

export interface PhaseTone {
  /** Main accent — CSS colour string, resolved from the app's tokens. */
  c: string;
  /** The darker "lip" under a node. */
  d: string;
  name: string;
}

export const PHASE_TONES: PhaseTone[] = [
  { name: "Position", c: "hsl(var(--gold))", d: "hsl(40 61% 32%)" },
  { name: "Produce", c: "hsl(var(--accent-amber))", d: "hsl(38 92% 26%)" },
  { name: "Multiply", c: "hsl(var(--accent-violet))", d: "hsl(258 90% 34%)" },
  { name: "Convert & Systemize", c: "hsl(var(--accent-emerald))", d: "hsl(160 84% 20%)" },
];

export function toneForPhase(phase: string): PhaseTone {
  return PHASE_TONES.find((t) => t.name === phase) ?? PHASE_TONES[0];
}

/**
 * Horizontal offsets that make the trail wind. Lifted from Creator OS's
 * `SNAKE`, then damped on small screens by the caller — the original amplitude
 * (82px) pushes a node off a 360px viewport.
 */
export const SNAKE = [0, 54, 82, 54, 0, -54, -82];

export function snakeOffset(i: number, compact: boolean): number {
  const raw = SNAKE[i % SNAKE.length];
  return compact ? Math.round(raw * 0.62) : raw;
}
