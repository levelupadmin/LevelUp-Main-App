// The rising line as a loader: draws in, holds, draws out, repeats.
// Target path: src/components/brand/LevelUpLoader.tsx
//
// Use for waits longer than ~400ms that are not a list or a page (those get
// skeletons): paying, verifying, joining a class, generating a certificate.
// Inside a button, set size to 30 and let it inherit the button's text colour.

import { motion } from "framer-motion";
import { useMotionSafe } from "@/lib/motion";
import { loaderLoop } from "@/lib/brand-moments";
import { LINK_STROKE, MARK_LINKS as LINKS, MARK_NODES, NODE_R, NODE_STROKE, VIEWBOX_LINE } from "@/components/brand/mark-geometry";
import { cn } from "@/lib/utils";

export function LevelUpLoader({ size = 40, className, label = "Loading" }: { size?: number; className?: string; label?: string }) {
  const { reduced } = useMotionSafe();
  const loop = (i: number, offset = 0) =>
    reduced
      ? undefined
      : {
          duration: loaderLoop.period,
          delay: i * loaderLoop.stagger + offset,
          times: [0, 0.4, 0.62, 1],
          repeat: Infinity,
          ease: [0.65, 0, 0.35, 1] as [number, number, number, number],
        };
  const draw = reduced ? { pathLength: 1 } : { pathLength: [0, 1, 1, 1], pathOffset: [0, 0, 0, 1] };

  return (
    <svg
      viewBox={VIEWBOX_LINE}
      width={size}
      className={cn("inline-block overflow-visible", className)}
      role="progressbar"
      aria-label={label}
      fill="none"
      stroke="currentColor"
    >
      {LINKS.map(([x1, y1, x2, y2], i) => (
        <motion.line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={LINK_STROKE} initial={false} animate={draw} transition={loop(i, 0.08)} />
      ))}
      {MARK_NODES.map(([cx, cy], i) => (
        <motion.circle key={i} cx={cx} cy={cy} r={NODE_R} strokeWidth={NODE_STROKE} initial={false} animate={draw} transition={loop(i)} />
      ))}
    </svg>
  );
}

export default LevelUpLoader;
