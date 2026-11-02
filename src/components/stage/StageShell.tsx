import { Suspense, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Bell, Brain, Compass, Home, Library, Search, Shield, BarChart3, Users } from "lucide-react";
import PageMotion from "@/components/motion/PageMotion";
import NotificationDropdown from "@/components/NotificationDropdown";
import RoomNavSlot from "@/components/layout/RoomNavSlot";
import { LevelUpMark } from "@/components/brand/LevelUpMark";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { useStudioEnabled } from "@/hooks/useStudio";
import { useCohortRoomsSurfaceValue } from "@/contexts/CohortRoomsSurfaceContext";
import { hapticSelection, tapTick } from "@/lib/haptics";
import { useBuyerHome } from "@/components/stage/home/buyer";
import { cardView } from "@/components/stage/home/BuyerHome";
import "@/components/stage/home/home.css";
import "@/styles/stage-ui.css";
import "./shell.css";

/*
 * The Stage frame for signed-in student pages (VITE_BRAND_STAGE), replacing
 * StudentLayout's chrome with the round-4 mockup's: on a phone a top bar
 * (logo, search, notifications, you) and four tabs (Home, My learning,
 * Explore, Community); from 900px a sidebar that always lists what you own,
 * with search in the top bar. Studio still appears for cohort members, the
 * cohort-room entry still comes from RoomNavSlot, and staff keep their
 * dashboard link.
 */

const NAV = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "My learning", icon: Library, path: "/learn" },
  { label: "Explore", icon: Compass, path: "/explore" },
  { label: "Community", icon: Users, path: "/community" },
];
const STUDIO = { label: "Studio", icon: Brain, path: "/studio" };

const initials = (name?: string | null) =>
  (name ?? "").trim().split(/\s+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "?";

const ContentFallback = () => (
  <div className="hm-skel" role="status" aria-busy="true" style={{ paddingTop: 8 }}>
    <span className="sr">Loading</span>
    <div className="skeleton-shimmer" style={{ height: 30, width: "50%", borderRadius: 10 }} />
    <div className="skeleton-shimmer" style={{ height: 200, borderRadius: 22 }} />
  </div>
);

export default function StageShell() {
  const { profile } = useAuth();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const { notifications, unreadCount, loading: notifLoading, markRead, markAllRead } = useNotifications();
  const { data: studioEnabled } = useStudioEnabled();
  const { enabled: roomsEnabled } = useCohortRoomsSurfaceValue();
  const { data: buyer } = useBuyerHome();
  const owned = useMemo(() => (buyer?.items ?? []).map((i) => cardView(i, Date.now())), [buyer]);

  useEffect(() => {
    if (!notifOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNotifOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [notifOpen]);

  const nav = useMemo(() => {
    if (!studioEnabled) return NAV;
    const arr = [...NAV];
    arr.splice(2, 0, STUDIO);
    return arr;
  }, [studioEnabled]);

  const isOn = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);
  const first = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "You";
  const staff = profile?.role === "admin" || profile?.role === "owner";
  const me = (
    <span className="av av--me" aria-hidden="true">
      {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile?.full_name)}
    </span>
  );

  return (
    <div className="stage-ui sh">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:bg-surface focus:text-foreground focus:px-4 focus:py-2 focus:rounded-lg">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="hm-side" aria-label="Main navigation">
        <Link to="/home" className="side-logo" aria-label="LevelUp home"><LevelUpMark /></Link>
        {nav.map((item) => (
          <Link key={item.path} to={item.path} className={`nav${isOn(item.path) ? " is-on" : ""}`} aria-current={isOn(item.path) ? "page" : undefined}>
            <item.icon className="ic" />{item.label}
          </Link>
        ))}
        {roomsEnabled && <RoomNavSlot variant="desktop" />}
        <div className="side-k">My learning</div>
        {owned.length ? owned.map((o) => (
          <Link key={o.key} to={o.path} className="yi">
            <span className="yi-art">{o.img && <img src={o.img} alt="" />}</span>
            <span><span className="yi-t">{o.title}</span><span className="yi-m">{o.side}</span></span>
          </Link>
        )) : (
          <div className="side-empty">Nothing here yet. What you buy shows up here, one click from every page.</div>
        )}
        {(staff || profile?.role === "instructor") && (
          <div className="side-staff">
            {staff && <Link to="/admin" className="nav"><Shield className="ic" />Admin dashboard</Link>}
            {profile?.role === "instructor" && <Link to="/instructor" className="nav"><BarChart3 className="ic" />Instructor dashboard</Link>}
          </div>
        )}
        <Link to="/profile" className="side-me">
          {me}
          <span><b>{first}</b><span className="sm">Profile and settings</span></span>
        </Link>
      </aside>

      <div className="sh-main">
        {/* Top bar */}
        <header className="sh-top">
          <Link to="/home" className="sh-logo" aria-label="LevelUp home"><LevelUpMark /></Link>
          <Link to="/explore" className="sh-search"><Search className="ic" />Search masterclasses, cohorts and workshops</Link>
          <Link to="/explore" className="ibtn ibtn--search" aria-label="Search"><Search className="ic" /></Link>
          <div className="sh-notif">
            <button
              type="button"
              className="ibtn"
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
              onClick={() => { void tapTick(); setNotifOpen((v) => !v); }}
            >
              <Bell className="ic" />{!notifLoading && unreadCount > 0 && <i className="dot" />}
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
          {staff && <Link to="/admin" className="ibtn ibtn--staff" aria-label="Admin dashboard"><Shield className="ic" /></Link>}
          <Link to="/profile" className="av-btn" aria-label="Profile">{me}</Link>
        </header>

        <main id="main-content" className="sh-content">
          <Suspense fallback={<ContentFallback />}>
            <PageMotion><Outlet /></PageMotion>
          </Suspense>
        </main>
      </div>

      {/* Phone tab bar */}
      <nav className="sh-tabbar" aria-label="Main navigation">
        {nav.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`sh-tab${isOn(item.path) ? " is-on" : ""}`}
            aria-current={isOn(item.path) ? "page" : undefined}
            onClick={() => { void hapticSelection(); }}
          >
            <item.icon className="ic" />{item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
