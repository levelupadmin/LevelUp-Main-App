/**
 * THE PAYOFF MOMENT.
 *
 * 🔴 WHY THIS EXISTS. The founder's note, 2026-08-15: "eventually when I come
 * out, your confetti comes — okay, you have unlocked this. That looks so nice
 * to go through." A gate that only ever says no is a chore. The same gate that
 * pays out when it opens is a game. This is the payout.
 *
 * Deliberately dependency-free: a burst of absolutely-positioned pieces driven
 * by framer springs. Adding a confetti package for twenty divs would be a new
 * bundle on the critical path of a room students open every day.
 *
 * Respects `prefers-reduced-motion`: the card still appears and still says what
 * was unlocked, it just does not throw anything.
 */
import { useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";

const PIECES = 26;
const COLORS = [
  "hsl(var(--gold))",
  "hsl(var(--cream))",
  "hsl(var(--accent-amber))",
  "hsl(var(--success))",
  "hsl(var(--accent-violet))",
];

function Burst() {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: PIECES }).map((_, i) => {
        // Fixed pseudo-random spread — deterministic so it renders identically
        // in a screenshot review and in a test.
        const angle = (i / PIECES) * Math.PI * 2;
        const dist = 90 + ((i * 37) % 110);
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist - 40;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 block h-2 w-1.5 rounded-[1px]"
            style={{ background: COLORS[i % COLORS.length] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{ x, y, opacity: 0, rotate: (i % 2 ? 1 : -1) * 320, scale: 0.6 }}
            transition={{ duration: 1.1 + (i % 5) * 0.08, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

export interface Celebration {
  title: string;
  sub?: string;
}

export function CelebrationOverlay({ show, onDone }: { show: Celebration | null; onDone: () => void }) {
  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(onDone, 2100);
    return () => window.clearTimeout(t);
  }, [show, onDone]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDone}
          role="status"
          aria-live="polite"
        >
          <div className="relative">
            <Burst />
            <motion.div
              className="relative rounded-2xl border border-[hsl(var(--gold)/0.45)] bg-[hsl(var(--card))] px-8 py-6 text-center"
              initial={{ scale: 0.8, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 18 }}
            >
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-[hsl(var(--champagne-from))] to-[hsl(var(--champagne-to))]">
                <Check className="h-5 w-5 text-[hsl(var(--cream-text))]" strokeWidth={3} />
              </div>
              <div className="mt-3 text-[17px] font-extrabold tracking-[-0.01em]">{show.title}</div>
              {show.sub && <p className="mt-1 text-[12.5px] text-[hsl(var(--muted-foreground))]">{show.sub}</p>}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
