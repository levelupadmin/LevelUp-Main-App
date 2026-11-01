// The LevelUp wordmark, rebuilt so it can animate.
// Target path: src/components/brand/LevelUpMark.tsx
//
// Letter paths are the official wordmark (same paths as LevelUpWordmark.tsx).
// The rising line above "Up" is redrawn as real strokes (4 rings + 3 lines,
// on the midlines of the original filled shapes) so it can DRAW itself.
// Static, it looks the same as LevelUpWordmark at every size we use, so it can
// replace it everywhere once Stage is the default (keep LevelUpWordmark and the
// boot splash in lockstep until then: CLAUDE.md Tier 1).
//
// Colour: letters use currentColor; the line uses `lineClassName` (e.g.
// "text-brand-text") so the line can carry the accent while the name stays neutral.

import * as React from "react";
import { motion } from "framer-motion";
import { useMotionSafe } from "@/lib/motion";
import { brandEase, brandIntro, emptyDraw, signInMoment } from "@/lib/brand-moments";
import { cn } from "@/lib/utils";
import {
  LETTERS,
  LINK_STROKE,
  MARK_LINKS as LINKS,
  MARK_NODES,
  NODE_R,
  NODE_STROKE,
  SUB,
  VIEWBOX_LINE,
  VIEWBOX_MARK,
} from "@/components/brand/mark-geometry";


export type MarkPlay = "none" | "intro" | "draw" | "signin";
export type NodeIndex = 0 | 1 | 2 | 3;

export interface LevelUpMarkProps {
  /** Which timeline to play. "none" renders the finished mark. */
  play?: MarkPlay;
  /** false = only the rising line (used by the sign-in moment, loaders, empty states). */
  showWord?: boolean;
  /** The small "learning" line under the name. */
  showSub?: boolean;
  className?: string;
  /** Classes for the rising line, usually a text colour: "text-brand-text". */
  lineClassName?: string;
  /** Fires as node i starts drawing. Hook sound + haptics here. */
  onNode?: (i: NodeIndex) => void;
  /** Fires once the last node has finished drawing. */
  onDrawn?: () => void;
  /** Accessible name. Pass "" to mark it decorative. */
  title?: string;
}

type Beat = { start: number; stagger: number; draw: number };
const TIMELINES: Record<Exclude<MarkPlay, "none">, { nodes: Beat; links: Beat }> = {
  intro: { nodes: brandIntro.nodes, links: brandIntro.links },
  draw: { nodes: emptyDraw.nodes, links: emptyDraw.links },
  signin: { nodes: signInMoment.nodes, links: signInMoment.links },
};

const box: React.CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };

export function LevelUpMark({
  play = "none",
  showWord = true,
  showSub = true,
  className,
  lineClassName,
  onNode,
  onDrawn,
  title = "LevelUp Learning",
}: LevelUpMarkProps) {
  const { reduced } = useMotionSafe();
  const animate = play !== "none" && !reduced;
  const tl = play === "none" ? null : TIMELINES[play];

  // Cue sound/haptics per node, and report when the line is drawn. Timers,
  // not animation callbacks, so the cues fire on time even if a frame drops.
  const onNodeRef = React.useRef(onNode);
  const onDrawnRef = React.useRef(onDrawn);
  onNodeRef.current = onNode;
  onDrawnRef.current = onDrawn;
  React.useEffect(() => {
    if (!tl) return;
    if (!animate) {
      onDrawnRef.current?.();
      return;
    }
    const timers = [0, 1, 2, 3].map((i) =>
      window.setTimeout(() => onNodeRef.current?.(i as NodeIndex), (tl.nodes.start + i * tl.nodes.stagger) * 1000),
    );
    const doneAt = (tl.nodes.start + 3 * tl.nodes.stagger + tl.nodes.draw) * 1000;
    timers.push(window.setTimeout(() => onDrawnRef.current?.(), doneAt));
    return () => timers.forEach(window.clearTimeout);
  }, [tl, animate]);

  const viewBox = showWord ? VIEWBOX_MARK : VIEWBOX_LINE;
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };

  return (
    <svg viewBox={viewBox} className={cn("block h-auto overflow-visible", className)} {...a11y}>
      {showWord && (
        <g fill="currentColor">
          {LETTERS.map((d, i) => (
            <motion.path
              key={i}
              d={d}
              style={box}
              initial={animate && play === "intro" ? { opacity: 0, y: "6%", scale: 1.04 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                duration: brandIntro.letters.duration,
                delay: brandIntro.letters.start + i * brandIntro.letters.stagger,
                ease: brandEase,
              }}
            />
          ))}
          {showSub && (
            <motion.g
              initial={animate && play === "intro" ? { opacity: 0, y: 1 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: brandIntro.sub.duration, delay: brandIntro.sub.delay, ease: brandEase }}
            >
              {SUB.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </motion.g>
          )}
        </g>
      )}

      <g className={lineClassName} fill="none" stroke="currentColor">
        {LINKS.map(([x1, y1, x2, y2], i) => (
          <motion.line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeWidth={LINK_STROKE}
            initial={animate ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={tl ? { duration: tl.links.draw, delay: tl.links.start + i * tl.links.stagger, ease: brandEase } : undefined}
          />
        ))}
        {MARK_NODES.map(([cx, cy], i) => (
          <React.Fragment key={i}>
            {play === "signin" && animate && (
              <motion.circle
                cx={cx}
                cy={cy}
                r={NODE_R}
                strokeWidth={0.5}
                style={box}
                initial={{ opacity: 0.7, scale: 1 }}
                animate={{ opacity: 0, scale: signInMoment.ripple.scaleTo }}
                transition={{
                  duration: signInMoment.ripple.duration,
                  delay: signInMoment.nodes.start + i * signInMoment.nodes.stagger,
                  ease: brandEase,
                }}
              />
            )}
            <motion.circle
              cx={cx}
              cy={cy}
              r={NODE_R}
              strokeWidth={NODE_STROKE}
              style={box}
              initial={animate ? { pathLength: 0, scale: 0.2 } : false}
              animate={{ pathLength: 1, scale: 1 }}
              transition={
                tl
                  ? {
                      pathLength: { duration: tl.nodes.draw, delay: tl.nodes.start + i * tl.nodes.stagger, ease: brandEase },
                      scale: { type: "spring", stiffness: 320, damping: 16, delay: tl.nodes.start + i * tl.nodes.stagger },
                    }
                  : undefined
              }
            />
          </React.Fragment>
        ))}
      </g>
    </svg>
  );
}

export default LevelUpMark;
