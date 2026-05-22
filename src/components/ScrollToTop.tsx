import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls the window to the top whenever the route changes. React Router v6
 * does NOT do this by default — without this, navigating from a long
 * masterclass page to e.g. /privacy lands you partway down /privacy at
 * the same Y position you left, which feels broken on mobile.
 *
 * Skips full-bleed routes where the user is actively positioned (chapter
 * viewer continues from where they paused, etc).
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Chapter viewer manages its own position
    if (pathname.startsWith("/chapters/")) return;

    // Use instant rather than smooth so the new page doesn't show a
    // jarring auto-scroll animation during route transitions.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return null;
};

export default ScrollToTop;
