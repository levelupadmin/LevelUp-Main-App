import { Suspense, useState, useEffect, useMemo } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import PageMotion from "@/components/motion/PageMotion";
import { useMotionSafe } from "@/lib/motion";
import { useAuth } from "@/contexts/AuthContext";
import InitialsAvatar from "@/components/InitialsAvatar";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import NotificationDropdown from "@/components/NotificationDropdown";
import Footer from "@/components/Footer";
import { useNotifications } from "@/hooks/useNotifications";
import {
  Home, BookOpen, MessageSquare, User,
  Menu, X, Bell, LogOut, ChevronDown, Shield, Video, Calendar, BarChart3, Loader2, Sparkles, Brain
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveCohort } from "@/hooks/useActiveCohort";
import { useStudioEnabled } from "@/hooks/useStudio";
import { hapticSelection, tapTick } from "@/lib/haptics";

// Browse merged into Home, the catalog now lives in the Home feed.
// Simplified IA: My Courses + Sessions + Events collapse into one "Learn" tab
// (segmented Courses/Live/Events). Profile moves to the header avatar menu.
const NAV_ITEMS = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "Learn", icon: BookOpen, path: "/learn" },
  { label: "Community", icon: MessageSquare, path: "/community" },
];

// Mobile bottom bar mirrors the sidebar (Studio inserts for cohort members).
const MOBILE_NAV_ITEMS = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "Learn", icon: BookOpen, path: "/learn" },
  { label: "Community", icon: MessageSquare, path: "/community" },
];

// Studio (Content Brain) — inserted into the nav only for active cohort members.
const STUDIO_NAV_ITEM = { label: "Studio", icon: Brain, path: "/studio" };

interface Props {
  /**
   * Optional. If omitted the layout will render an <Outlet/> so it can be
   * used as a React Router v6 layout route. Existing usages that pass
   * children continue to work (e.g. wrapper-style pages during migration).
   */
  children?: React.ReactNode;
}

// Calm content skeleton (no spinner) shown while a lazy page chunk loads inside
// the shell. The top bar + tab bar are already painted by the layout, so this
// only fills the content area, reads as "content arriving", not "app frozen".
const ContentSuspenseFallback = () => (
  <div className="px-4 md:px-8 py-6 space-y-6 max-w-5xl mx-auto w-full" role="status" aria-busy="true">
    <span className="sr-only">Loading…</span>
    <div className="h-44 rounded-2xl skeleton-shimmer" />
    <div className="space-y-3">
      <div className="h-4 w-2/5 rounded skeleton-shimmer" />
      <div className="h-3 w-4/5 rounded skeleton-shimmer" />
      <div className="h-3 w-3/5 rounded skeleton-shimmer" />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <div className="h-32 rounded-xl skeleton-shimmer" />
      <div className="h-32 rounded-xl skeleton-shimmer" />
      <div className="h-32 rounded-xl skeleton-shimmer" />
    </div>
  </div>
);

const StudentLayout = ({ children }: Props) => {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const motionSafe = useMotionSafe();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Hardware back / Esc closes any open hand-rolled overlay first. The native
  // back button (App.tsx) dispatches a synthetic Escape when it detects an
  // open overlay, so this keeps the mobile sidebar + dropdowns from trapping
  // the user or letting back-press exit the app while a menu is open.
  useEffect(() => {
    if (!sidebarOpen && !dropdownOpen && !notifOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSidebarOpen(false);
      setDropdownOpen(false);
      setNotifOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen, dropdownOpen, notifOpen]);
  const { notifications, unreadCount, loading: notifLoading, markRead, markAllRead } = useNotifications();
  const { offeringId: activeCohortId } = useActiveCohort();
  const { data: studioEnabled } = useStudioEnabled();

  // Studio only appears for active cohort members; everyone else sees the
  // unchanged bar (additive — never orphans a route).
  const navItems = useMemo(() => {
    if (!studioEnabled) return NAV_ITEMS;
    const arr = [...NAV_ITEMS];
    const i = arr.findIndex((x) => x.path === "/learn");
    arr.splice(i >= 0 ? i + 1 : arr.length, 0, STUDIO_NAV_ITEM);
    return arr;
  }, [studioEnabled]);
  const mobileNavItems = useMemo(() => {
    if (!studioEnabled) return MOBILE_NAV_ITEMS;
    const arr = [...MOBILE_NAV_ITEMS];
    const i = arr.findIndex((x) => x.path === "/learn");
    arr.splice(i >= 0 ? i + 1 : arr.length, 0, STUDIO_NAV_ITEM);
    return arr;
  }, [studioEnabled]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "Student";

  return (
    // vaul background-scale GO/NO-GO (P4-T4): vaul's `shouldScaleBackground`
    // needs a `[vaul-drawer-wrapper]` on the element it scales — but that element
    // is THIS layout root, which contains the fixed mobile tab bar and the sticky
    // header. vaul scales the wrapper via `transform: scale(...)`, and a transform
    // establishes a containing block for every `position: fixed`/`sticky`
    // descendant (CSS spec — identical on Blink/WebKit, so it reproduces on the
    // Android WebView we ship). The tab bar + header would re-anchor to the scaled
    // wrapper and lose viewport-fixing while any sheet is open. → NO-GO: the
    // wrapper is NOT added; sheets ship without background scale (matches P4-T1's
    // `shouldScaleBackground` OFF). Reconciles brief acceptance #2 accordingly.
    <div className="flex min-h-screen bg-canvas">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:bg-surface focus:text-foreground focus:px-4 focus:py-2 focus:rounded-lg">Skip to content</a>
      {/* Desktop sidebar - visible at md+ (768px) */}
      <aside className="hidden md:flex flex-col w-[260px] min-w-[260px] border-r border-border bg-canvas sticky top-0 h-screen">
        <div className="px-6 pt-7 pb-5">
          <LevelUpWordmark className="h-7 w-auto text-foreground" />
        </div>

        <LayoutGroup id="desktop-sidebar">
        <nav aria-label="Main navigation" className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
                  active
                    ? "text-foreground bg-cream/[0.08] font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="desktop-sidebar-active-bar"
                    // No CSS transform on the layout-projected element (framer drives
                    // `transform` during the glide) — centre with inset-y-0 + my-auto.
                    className="absolute left-0 inset-y-0 my-auto h-5 w-[3px] rounded-r-full bg-cream"
                    transition={motionSafe.springs.glide}
                  />
                )}
                <item.icon className={cn("h-[18px] w-[18px]", active && "text-cream")} />
                {item.label}
              </Link>
            );
          })}

          {activeCohortId && (
            <>
              <div className="my-3 border-t border-border" />
              <Link
                to={`/cohort/${activeCohortId}`}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
                  location.pathname.startsWith("/cohort/")
                    ? "text-foreground bg-cream/[0.08] font-medium"
                    : "text-cream hover:bg-cream/[0.06]"
                )}
              >
                {location.pathname.startsWith("/cohort/") && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-cream" />}
                <Sparkles className="h-[18px] w-[18px]" />
                My Cohort
              </Link>
            </>
          )}

          {(profile?.role === "admin" || profile?.role === "owner") && (
            <>
              <div className="my-3 border-t border-border" />
              <Link
                to="/admin"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[hsl(var(--accent-amber))] hover:bg-[hsl(var(--accent-amber)/0.1)] transition-all duration-200"
              >
                <Shield className="h-[18px] w-[18px]" />
                Admin Dashboard
              </Link>
            </>
          )}

          {profile?.role === "instructor" && (
            <>
              <div className="my-3 border-t border-border" />
              <Link to="/instructor" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[hsl(var(--accent-amber))] hover:bg-[hsl(var(--accent-amber)/0.1)] transition-all duration-200">
                <BarChart3 className="h-[18px] w-[18px]" />
                Instructor Dashboard
              </Link>
            </>
          )}
        </nav>
        </LayoutGroup>

        <div className="p-3">
          <Link to="/profile" className="flex items-center gap-3 rounded-2xl bg-surface/60 border border-border px-3 py-2.5 hover:border-cream/30 transition-colors">
            <InitialsAvatar name={profile?.full_name ?? "U"} photoUrl={profile?.avatar_url} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-foreground">{firstName}</p>
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                #{profile?.member_number ?? "-"}
              </p>
            </div>
          </Link>
        </div>
      </aside>

      {/* Mobile sidebar overlay, respects iOS safe-area. AnimatePresence gives it
          a real exit: the backdrop fades and the panel slides back to x:-100% on
          the glide spring (both transform/opacity-only). The container stays a
          plain motion element so AnimatePresence defers unmount until the panel's
          exit finishes — and keeps `data-overlay-open` mounted for App.tsx's
          hardware-back Escape dispatch throughout the close. */}
      <AnimatePresence>
        {sidebarOpen && (
          // `data-overlay-open` + hit-testing are driven off `sidebarOpen`, NOT off
          // mount: AnimatePresence keeps this subtree mounted through the exit glide,
          // so once the user closes it the backdrop/panel must go click-through (else
          // the fading backdrop swallows every tap on the freshly-navigated page) and
          // must stop advertising an open overlay (else App.tsx's hardware-back keeps
          // dispatching Escape at a listener that's already torn down). `pointerEvents`
          // is inherited, so setting it on the container makes the backdrop + aside
          // click-through during exit without gating each child.
          <motion.div
            data-overlay-open={sidebarOpen ? "true" : undefined}
            style={{ pointerEvents: sidebarOpen ? "auto" : "none" }}
            className="fixed inset-0 z-50 md:hidden"
          >
            <motion.div
              className="absolute inset-0 bg-black/60"
              onClick={() => setSidebarOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionSafe.springs.glide}
            />
            <motion.aside
              className="absolute left-0 top-0 bottom-0 w-[280px] bg-canvas border-r border-border flex flex-col safe-top safe-bottom"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={motionSafe.springs.glide}
            >
            <div className="flex items-center justify-between p-6">
              <LevelUpWordmark className="h-8 w-auto text-foreground" />
              <button aria-label="Close menu" onClick={() => { void tapTick(); setSidebarOpen(false); }} className="-mr-1.5 h-11 w-11 flex items-center justify-center focus-ring press-scale rounded-xl text-muted-foreground">
                <X className="h-6 w-6" />
              </button>
            </div>
            <LayoutGroup id="mobile-sidebar">
            <nav aria-label="Main navigation" className="flex-1 px-3 space-y-1">
              {navItems.map((item) => {
                const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2",
                      active ? "text-foreground bg-cream/[0.08] font-medium" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="mobile-sidebar-active-bar"
                        // No CSS transform on the layout-projected element (framer
                        // drives `transform` during the glide) — centre with
                        // inset-y-0 + my-auto.
                        className="absolute left-0 inset-y-0 my-auto h-5 w-[3px] rounded-r-full bg-cream"
                        transition={motionSafe.springs.glide}
                      />
                    )}
                    <item.icon className={cn("h-[18px] w-[18px]", active && "text-cream")} />
                    {item.label}
                  </Link>
                );
              })}

              {(profile?.role === "admin" || profile?.role === "owner") && (
                <>
                  <div className="my-3 border-t border-border" />
                  <Link
                    to="/admin"
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[hsl(var(--accent-amber))] hover:bg-[hsl(var(--accent-amber)/0.1)] transition-all duration-200"
                  >
                    <Shield className="h-[18px] w-[18px]" />
                    Admin Dashboard
                  </Link>
                </>
              )}

              {profile?.role === "instructor" && (
                <>
                  <div className="my-3 border-t border-border" />
                  <Link
                    to="/instructor"
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[hsl(var(--accent-amber))] hover:bg-[hsl(var(--accent-amber)/0.1)] transition-all duration-200"
                  >
                    <BarChart3 className="h-[18px] w-[18px]" />
                    Instructor Dashboard
                  </Link>
                </>
              )}
            </nav>
            </LayoutGroup>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar: `safe-top` pushes the row below the Dynamic Island; the
            16-unit row sits *under* that inset (min-height, not fixed height,
            so the inset is added rather than eating into the row and clipping
            the logo). */}
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-8 border-b border-border bg-canvas/90 backdrop-blur-md safe-top min-h-16">
          <div className="flex items-center gap-2">
            <button aria-label="Open menu" className="md:hidden -ml-1.5 text-muted-foreground h-11 w-11 flex items-center justify-center focus-ring press-scale rounded-xl" onClick={() => { void tapTick(); setSidebarOpen(true); }}>
              <Menu className="h-6 w-6" />
            </button>
            <Link to="/home" aria-label="LevelUp home" className="md:hidden flex items-center min-h-[44px] min-w-[44px]">
              <LevelUpWordmark className="h-8 w-auto text-foreground" />
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                aria-label="Notifications"
                onClick={() => { void tapTick(); setNotifOpen(!notifOpen); }}
                className="relative text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center focus-ring press-scale rounded-md"
              >
                <Bell className="h-5 w-5" />
                {notifLoading ? (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-muted-foreground/50" />
                ) : unreadCount > 0 ? (
                  <span className="absolute top-1.5 right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold leading-none text-white bg-[hsl(var(--destructive))] rounded-full">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </button>
              <NotificationDropdown
                open={notifOpen}
                onClose={() => setNotifOpen(false)}
                notifications={notifications}
                unreadCount={unreadCount}
                loading={notifLoading}
                onMarkRead={markRead}
                onMarkAllRead={markAllRead}
              />
            </div>

            <div className="relative">
              <button
                onClick={() => { void tapTick(); setDropdownOpen(!dropdownOpen); }}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
                className="flex items-center justify-center gap-2 focus-ring press-scale rounded-md px-1"
              >
                <InitialsAvatar name={profile?.full_name ?? "U"} photoUrl={profile?.avatar_url} size={32} interactive />
                <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
              </button>

              <AnimatePresence>
                {dropdownOpen && (
                  // `contents` wrapper: a motion element AnimatePresence can track
                  // for exit deferral without introducing a layout box, so the
                  // click-catcher and menu keep their original positioning context.
                  <motion.div className="contents">
                  {/* Full-screen click-catcher: gated off `dropdownOpen` so it stops
                      catching taps the instant the menu is dismissed — AnimatePresence
                      holds it mounted through the exit, and an ungated catcher would be
                      a full-screen input dead-zone over the page for the exit duration. */}
                  <div className="fixed inset-0 z-40" style={{ pointerEvents: dropdownOpen ? "auto" : "none" }} onClick={() => setDropdownOpen(false)} />
                  <motion.div
                    // Off `dropdownOpen`, not mount: cleared on close so App.tsx's
                    // hardware-back stops matching this overlay once the listener is
                    // gone, letting a second back-press walk history instead of no-op.
                    data-overlay-open={dropdownOpen ? "true" : undefined}
                    className="absolute right-0 mt-2 w-48 origin-top-right bg-surface border border-border rounded-lg shadow-lg py-1 z-50"
                    // Gated off `dropdownOpen`, not mount: opacity→0 does not disable
                    // hit-testing, so without this the fading menu stays tappable through
                    // its ~200ms snap exit and a tap fires a real navigate()/signOut().
                    // Set on the menu (not the `contents` wrapper, which generates no box
                    // and so ignores pointer-events) to clear its whole subtree of buttons.
                    style={{ pointerEvents: dropdownOpen ? "auto" : "none" }}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={motionSafe.springs.snap}
                  >
                    {(profile?.role === "admin" || profile?.role === "owner") && (
                      <button
                        onClick={() => { setDropdownOpen(false); navigate("/admin"); }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-[hsl(var(--accent-amber))] hover:bg-surface-2 transition-colors min-h-[44px]"
                      >
                        <Shield className="h-4 w-4" />
                        Admin Dashboard
                      </button>
                    )}
                    <button
                      onClick={() => { setDropdownOpen(false); navigate("/profile"); }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors min-h-[44px]"
                    >
                      <User className="h-4 w-4" />
                      Profile
                    </button>
                    <button
                      onClick={async () => { await signOut(); navigate("/login"); }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors min-h-[44px]"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Content area: Suspense is INSIDE the layout so lazy chunk loads
            don't swap out the entire shell (fixes the "page reloads on every
            navigation" feeling). The nav, sidebar, and tab bar stay mounted. */}
        <main id="main-content" className="flex-1 grain">
          <div className="max-w-[1280px] xl:max-w-[1440px] 2xl:max-w-[1680px] mx-auto px-4 md:px-8 lg:px-10 xl:px-12 py-6 md:py-10 relative z-10 page-enter">
            <Suspense fallback={<ContentSuspenseFallback />}>
              <PageMotion>{children ?? <Outlet />}</PageMotion>
            </Suspense>
          </div>
        </main>
        {/* Footer sits below scrollable content; extra bottom padding on
            mobile keeps it clear of the fixed bottom tab bar. On native the
            <Footer/> renders null, so this padding alone provides the
            tab-bar clearance (safe-area aware for the home indicator). */}
        <div className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          <Footer variant="app" />
        </div>
      </div>

      {/* Mobile bottom tab bar, respects iOS safe-area inset */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-canvas/90 backdrop-blur-md border-t border-border flex items-stretch safe-bottom"
      >
        <LayoutGroup id="mobile-tabbar">
        {mobileNavItems.map((item) => {
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => { void hapticSelection(); }}
              className={cn(
                // Tokenized colour cross-fade (duration-base ease-out) so the
                // active label/icon colour eases in step with the pill glide
                // rather than snapping mid-flight (default transition-colors is a
                // fast synchronous swap that flickers legibility as the pill moves).
                "relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[11px] font-medium transition-colors duration-base ease-out-expo focus-ring",
                active ? "text-cream" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="mobile-tabbar-active-pill"
                  // Soft cream tint behind the active icon+label — the brief's
                  // "unmistakable but subtlest accent on pure black". Low-opacity
                  // cream fill (not the solid segmented-control fill) so the cream
                  // icon+label read on top without a contrast flip. Sits behind the
                  // content (content gets relative z-10).
                  // No CSS transform on the layout-projected element: framer writes
                  // its projection delta to `transform` during the layoutId glide,
                  // which fights a Tailwind translate mid-flight (drifts on Android
                  // Blink). Centre via inset-x-0 + mx-auto instead (repo precedent:
                  // Learn.tsx learn-segment-pill).
                  className="absolute inset-x-0 inset-y-1 mx-auto w-14 rounded-2xl bg-cream/[0.08]"
                  transition={motionSafe.springs.glide}
                />
              )}
              <motion.span
                // tabIndex={-1}: framer-motion auto-injects tabIndex={0} on any
                // element with whileTap when it's left undefined, which would add a
                // redundant, inert nested tab stop inside the focusable <Link>. Pin
                // it out of the tab order (repo precedent: MotionCard.tsx).
                tabIndex={-1}
                className="relative z-10 flex flex-col items-center gap-0.5"
                whileTap={motionSafe.reduced ? undefined : motionSafe.pressTap}
              >
                <item.icon className={cn("h-5 w-5", active && "scale-110")} />
                <span>{item.label}</span>
              </motion.span>
            </Link>
          );
        })}
        </LayoutGroup>
      </nav>
    </div>
  );
};

export default StudentLayout;
