import { useEffect, useState } from "react";

/**
 * Champagne dust — the calm-luxury celebration particle.
 *
 * The brand's answer to confetti (see design/vision/60FPS-IDEAS.md Idea #1 and
 * INTERACTION-STEALS.md): celebration as *light*, not litter. Rising golden
 * bokeh on black — soft gold/cream discs born just below the fold, drifting up,
 * scaling 0.6→1 and fading 0→0.85→0 as they cross the top third, then stillness.
 *
 * Design constraints honoured:
 *  - Transform/opacity only. No `filter` at runtime — the soft "bokeh" of the
 *    large discs is baked into a radial-gradient background (pre-blurred art),
 *    so there is zero per-frame paint/blur cost.
 *  - No layout work per frame: absolutely-positioned divs animating a CSS
 *    keyframe; the field is generated once when `active` flips true.
 *  - One-shot: particles mount on activation and unmount after `duration`.
 *  - ~22 particles (spec 16–24), 3 size classes (4/8/16px).
 *  - prefers-reduced-motion: renders nothing (the caller keeps its static glow).
 *
 * API mirrors <Confetti> so it can drop into the same call sites.
 */

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Champagne palette (index.css tokens). Low opacity over pure black.
const TOKENS = ["--champagne-from", "--champagne-to", "--cream"] as const;

/** Soft radial disc. Larger classes fall off sooner → read as out-of-focus
 *  bokeh without a runtime `filter: blur`. */
function discBackground(token: string, sizeClass: 0 | 1 | 2): string {
  // [core alpha, mid alpha, mid stop %, transparent stop %]
  const [core, mid, midStop, edge] =
    sizeClass === 2
      ? [0.5, 0.28, 34, 62] // 16px — softest, dimmest bokeh
      : sizeClass === 1
        ? [0.78, 0.46, 40, 68] // 8px — medium
        : [0.95, 0.6, 42, 72]; // 4px — crispest, brightest
  return (
    `radial-gradient(circle at center, ` +
    `hsl(var(${token}) / ${core}) 0%, ` +
    `hsl(var(${token}) / ${mid}) ${midStop}%, ` +
    `transparent ${edge}%)`
  );
}

const SIZE_PX = [4, 8, 16] as const;

interface Particle {
  id: number;
  x: number; // left, %
  size: number; // px
  background: string;
  sway: number; // px, signed (±12 sine swing)
  delay: number; // s
  duration: number; // s
}

interface ChampagneDustProps {
  active: boolean;
  /** How long particles stay mounted before the one-shot unmounts them. */
  duration?: number;
}

export default function ChampagneDust({
  active,
  duration = 3200,
}: ChampagneDustProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      setParticles([]);
      return;
    }

    const COUNT = 22;
    // Depth-field emission stagger. The reference's exact stagger is ~90ms;
    // with 22 discs a strict 90ms ramp would push the last one past the
    // one-shot window, so we move toward it (55ms, up from the old flat 35ms)
    // — enough to read as arriving from varied depths, not a single flat puff.
    const STAGGER = 0.055;
    const next: Particle[] = Array.from({ length: COUNT }, (_, i) => {
      // Weighted size classes: mostly small, a few soft large bokeh.
      const r = Math.random();
      const sizeClass: 0 | 1 | 2 = r < 0.55 ? 0 : r < 0.85 ? 1 : 2;
      const token = TOKENS[Math.floor(Math.random() * TOKENS.length)];
      return {
        id: i,
        x: 6 + Math.random() * 88,
        size: SIZE_PX[sizeClass],
        background: discBackground(token, sizeClass),
        sway: (10 + Math.random() * 4) * (Math.random() < 0.5 ? -1 : 1),
        // Last disc is born ~1.2s in; the trimmed calm rise (2.0–2.3s, ease-out)
        // means even the latest starter finishes its 0→0.85→0 fade to stillness
        // before the field unmounts — no disc is ever cut mid-rise.
        delay: i * STAGGER + Math.random() * 0.03,
        duration: 2.0 + Math.random() * 0.3,
      };
    });
    setParticles(next);

    // Unmount only AFTER the slowest disc has fully faded. The old fixed cut at
    // `duration` (3200ms) guillotined the late/large discs while they were still
    // at ~0.2–0.3 opacity, leaving a visible hard flicker. Derive the timeout
    // from the actual last-particle end instead, floored at the caller's
    // nominal window so the felt one-shot never shortens below spec.
    const lastEndMs = Math.max(...next.map((p) => p.delay + p.duration)) * 1000;
    const unmountAt = Math.max(duration, Math.ceil(lastEndMs) + 120);
    const timer = window.setTimeout(() => setParticles([]), unmountAt);
    return () => window.clearTimeout(timer);
  }, [active, duration]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9998] overflow-hidden">
      <style>{`
        @keyframes champagne-rise {
          0%   { transform: translate3d(0, 0, 0) scale(0.6); opacity: 0; }
          14%  { opacity: 0.85; }
          55%  { transform: translate3d(var(--sway), -60vh, 0) scale(1); opacity: 0.6; }
          100% { transform: translate3d(0, -110vh, 0) scale(1); opacity: 0; }
        }
      `}</style>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            bottom: "-24px",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: p.background,
            // Consumed by the keyframe's mid-rise waypoint for the x-sway.
            ["--sway" as string]: `${p.sway}px`,
            // No explicit `will-change`: an immediately-running transform/opacity
            // animation is already auto-composited by the browser for its
            // duration, so the hint bought nothing but pinned 22 permanent
            // layers for the whole mount. Let the animation own promotion.
            animation: `champagne-rise ${p.duration}s ease-out ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
