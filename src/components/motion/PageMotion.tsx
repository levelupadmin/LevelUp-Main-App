import { ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Native-feel route transition wrapper.
 *
 * Wraps the routed content so each navigation gets an app-like motion:
 *   - PUSH (forward navigation): the new screen slides in from the right,
 *     like pushing onto an iOS navigation stack.
 *   - POP (back) / REPLACE: no JS animation. On iOS the system interactive
 *     edge-swipe-back peel (enabled via allowsBackForwardNavigationGestures)
 *     owns the back motion; animating here as well would visibly fight it.
 *
 * Keyed on pathname so the animation re-triggers on every navigation. The
 * shell (sidebar / top bar / tab bar) lives OUTSIDE this wrapper and stays
 * mounted, so only the content area animates — no "full reload" flash.
 *
 * Reduced motion: index.css's global `prefers-reduced-motion: reduce` block
 * flattens the keyframes to ~0ms, so no extra guard is needed here.
 */
export default function PageMotion({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navType = useNavigationType(); // 'PUSH' | 'POP' | 'REPLACE'

  const cls = navType === "PUSH" ? "page-motion-push" : "page-motion-none";

  return (
    <div key={location.pathname} className={cls}>
      {children}
    </div>
  );
}
