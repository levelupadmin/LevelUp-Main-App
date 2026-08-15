/**
 * THE ENTRANCE — full bleed, and it finishes.
 *
 * Founder, 2026-08-15: "I wanted the video to be on the screen, not one small
 * patch. It has to go full size, end to end, and the animation has to
 * completely get over, then we load the page. I know this might not be
 * scalable, I just want to see how nice it looks."
 *
 * So this deliberately trades the polite thing for the good-looking thing:
 * the animation owns the whole viewport and the room waits for it to END,
 * rather than being cut off by a timer.
 *
 * 🔴 AND IT STARTS NEAR THE END, ON PURPOSE (founder, second pass): "the full
 * animation takes too much time — keep the last three seconds where there is
 * the flip from light to black, with all the stickers." So playback seeks to
 * `duration - TAIL` the moment metadata lands. That is a genuinely better
 * trade than trimming the file: the room waits about three seconds instead of
 * the full run, the payoff frame is still the one people remember, and if the
 * animation is ever recut we inherit the new ending automatically with no
 * asset to re-export or re-host.
 *
 * 🔴 WHAT THAT COSTS, WRITTEN DOWN SO THE TRADE IS A CHOICE AND NOT A DRIFT.
 * The room is gated on a video download. Once a session softens it, but a
 * student on a bad train connection waits on a CDN before they can submit
 * anything. Two guards keep that from becoming a wall rather than a wait:
 * `onError` bails instantly, and a long stall timeout gives up if the file
 * never arrives. Neither ever cuts a playing animation short — they only
 * rescue the case where it is not playing at all.
 *
 * If this stays past the prototype, the honest version is: keep full bleed,
 * keep once-a-session, but preload the file and skip the splash entirely when
 * it is not already cached. That way it is a gift on a good connection and
 * invisible on a bad one.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const SRC =
  "https://cdn.leveluplearning.in/creator-academy-local/assets/pub-3be000680ad849f1b16efc848a240a04.r2.dev/creator/Creators%20Logo%20Animation.mp4";

const KEY = "cs-boot-seen";
/** Seconds of the animation to keep — the flip to dark and the stickers. */
const TAIL_S = 3.2;
/** Only fires if the video never starts. A playing animation is never cut. */
const STALL_MS = 12000;

export function LevelUpMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 22" fill="none" className={className} aria-label="LevelUp Learning">
      <path d="M2 18 L11 9 L18 14 L27 4 L36 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="11" cy="9" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="27" cy="4" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export default function StudioBoot() {
  const reduced = useReducedMotion();
  const [show, setShow] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) !== "1";
    } catch {
      return false; // storage blocked — never trap someone behind a splash
    }
  });
  const [playing, setPlaying] = useState(false);
  const [hint, setHint] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem(KEY, "1"); } catch { /* fine */ }

    // Reduced motion gets the mark and a beat, never a video.
    if (reduced) {
      const t = window.setTimeout(() => setShow(false), 900);
      return () => window.clearTimeout(t);
    }

    // The only timer here. It checks whether playback ever BEGAN — if it did,
    // the animation is left alone to finish on its own terms.
    const stall = window.setTimeout(() => {
      if (!startedRef.current) setShow(false);
    }, STALL_MS);
    const hintTimer = window.setTimeout(() => setHint(true), 3500);
    const skip = () => setShow(false);
    window.addEventListener("keydown", skip);
    return () => {
      window.clearTimeout(stall);
      window.clearTimeout(hintTimer);
      window.removeEventListener("keydown", skip);
    };
  }, [show, reduced]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[60] bg-[hsl(var(--background))]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          onClick={() => setShow(false)}
          role="status"
          aria-label="Creator Studio"
        >
          {reduced ? (
            <div className="grid h-full w-full place-items-center">
              <LevelUpMark className="h-9 w-16 text-[hsl(var(--foreground))]" />
            </div>
          ) : (
            <>
              {/* The mark holds the frame while the file arrives, so the first
                  thing on screen is never an empty black rectangle. */}
              <motion.div
                className="absolute inset-0 grid place-items-center"
                animate={{ opacity: playing ? 0 : 1 }}
                transition={{ duration: 0.3 }}
              >
                <LevelUpMark className="h-9 w-16 text-[hsl(var(--muted-foreground))]" />
              </motion.div>

              <motion.video
                src={SRC}
                autoPlay
                muted
                playsInline
                loop={false}
                onLoadedMetadata={(e) => {
                  // Jump to the payoff. Guarded because a stream with no known
                  // duration reports Infinity or NaN, and seeking to that
                  // leaves a black frame that never plays.
                  const v = e.currentTarget;
                  if (Number.isFinite(v.duration) && v.duration > TAIL_S) v.currentTime = v.duration - TAIL_S;
                }}
                onPlaying={() => { startedRef.current = true; setPlaying(true); }}
                onEnded={() => setShow(false)}
                onError={() => setShow(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: playing ? 1 : 0 }}
                transition={{ duration: 0.35 }}
                className="cs-boot-video absolute inset-0 h-full w-full"
              />

              <AnimatePresence>
                {hint && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-[10px] tracking-[0.24em] text-[hsl(var(--muted-foreground))]"
                  >
                    TAP TO SKIP
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
