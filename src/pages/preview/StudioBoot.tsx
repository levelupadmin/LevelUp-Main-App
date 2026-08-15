/**
 * THE ENTRANCE.
 *
 * 🔴 WHY ONCE A SESSION, NOT EVERY LOAD. This is a room students open daily,
 * often twice. What feels premium on day one is an obstacle by day four, and by
 * week three it is the thing standing between someone and their deadline. So it
 * plays on first entry per session, it is skippable on any key or tap, and
 * anyone with reduced-motion set gets the static mark and nothing else.
 *
 * The asset is the academy's own logo animation, the one under "What is the
 * LevelUp Creator Academy" on the marketing site. It is currently served from
 * a Cloudflare `pub-….r2.dev` bucket proxied through the CDN — those dev URLs
 * are rate-limited and not intended for production traffic, so before merge it
 * moves into the app's own bucket. Prototype only, and deliberate.
 *
 * It is also `loop={false}` on purpose: a splash has to end. If the source
 * turns out to loop seamlessly rather than landing on the lockup, the timeout
 * below ends it anyway — the animation never gets to hold the room hostage.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const SRC =
  "https://cdn.leveluplearning.in/creator-academy-local/assets/pub-3be000680ad849f1b16efc848a240a04.r2.dev/creator/Creators%20Logo%20Animation.mp4";

const KEY = "cs-boot-seen";
/** Hard ceiling. Nothing about a logo justifies more than this. */
const MAX_MS = 2600;

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
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem(KEY, "1"); } catch { /* fine */ }
    const t = window.setTimeout(() => setShow(false), reduced ? 900 : MAX_MS);
    const skip = () => setShow(false);
    window.addEventListener("keydown", skip);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", skip);
    };
  }, [show, reduced]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center bg-[hsl(var(--background))]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          onClick={() => setShow(false)}
          role="status"
          aria-label="Creator Studio"
        >
          <div className="flex flex-col items-center gap-5">
            {reduced ? (
              <LevelUpMark className="h-8 w-14 text-[hsl(var(--foreground))]" />
            ) : (
              <video
                ref={videoRef}
                src={SRC}
                autoPlay
                muted
                playsInline
                loop={false}
                onEnded={() => setShow(false)}
                // If the CDN is throttling or offline the splash must not become
                // a blank wall — the timeout still fires, and the mark below is
                // already on screen underneath.
                onError={() => setShow(false)}
                className="max-h-[38vh] max-w-[76vw] object-contain"
              />
            )}
            <motion.div
              className="text-[10px] tracking-[0.24em] text-[hsl(var(--muted-foreground))]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              CREATOR STUDIO
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
