import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  MessageSquare,
  Calendar,
  BookOpen,
  CheckCheck,
  Award,
  RotateCcw,
  CheckCircle,
  Star,
  Megaphone,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { tapTick } from "@/lib/haptics";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useMotionSafe } from "@/lib/motion";
import type { Notification } from "@/hooks/useNotifications";

/**
 * Per-type thumbnail treatment. The notifications table carries no image, so
 * instead of a tiny gray glyph we render a 36px rounded tile with the type's
 * icon. The tile tint collapses the raw event zoo into FOUR semantic families
 * drawn from the token system so the list reads as one coherent surface:
 *   success events → --success · payments/invoices → --gold ·
 *   sessions/live → --accent-crimson · everything else → --cream.
 * Icon stays per-type for scannability; only the colour is semantic.
 */
// Alpha modifiers use arbitrary-value form (bg-[hsl(var(--x)/0.12)]) because
// these tokens are declared in tailwind.config as hsl(var(--x)) WITHOUT the
// <alpha-value> placeholder, so the shorthand `/12` modifier compiles to
// nothing and the tile renders transparent. Arbitrary values sidestep that.
const TINT = {
  success: "bg-[hsl(var(--success)/0.12)] text-success",
  gold: "bg-[hsl(var(--gold)/0.12)] text-gold",
  crimson: "bg-[hsl(var(--accent-crimson)/0.12)] text-accent-crimson",
  cream: "bg-[hsl(var(--cream)/0.12)] text-cream",
} as const;

const TYPE_META: Record<string, { icon: typeof Bell; tint: string }> = {
  community_reply: { icon: MessageSquare, tint: TINT.cream },
  review_reply: { icon: Star, tint: TINT.cream },
  session_reminder: { icon: Calendar, tint: TINT.crimson },
  course_update: { icon: BookOpen, tint: TINT.cream },
  new_course_available: { icon: BookOpen, tint: TINT.cream },
  assignment_feedback: { icon: BookOpen, tint: TINT.cream },
  admin_announcement: { icon: Megaphone, tint: TINT.cream },
  refund_processed: { icon: RotateCcw, tint: TINT.gold },
  enrollment_confirmed: { icon: CheckCircle, tint: TINT.success },
  course_completed: { icon: Award, tint: TINT.success },
  certificate_ready: { icon: Award, tint: TINT.success },
};

const FALLBACK_META = { icon: Bell, tint: TINT.cream } as const;

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

type GroupKey = "Today" | "Yesterday" | "This week" | "Earlier";

/** Bucket a timestamp into a human date group, calendar-day aware. */
function groupFor(dateStr: string): GroupKey {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d = new Date(dateStr).getTime();
  const dayMs = 86_400_000;
  if (d >= startOfToday) return "Today";
  if (d >= startOfToday - dayMs) return "Yesterday";
  if (d >= startOfToday - 7 * dayMs) return "This week";
  return "Earlier";
}

const GROUP_ORDER: GroupKey[] = ["Today", "Yesterday", "This week", "Earlier"];

interface Props {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

/** Soft clapperboard line-art for the "all caught up" rest state. */
const ClapperboardArt = () => (
  <svg
    width="56"
    height="56"
    viewBox="0 0 56 56"
    fill="none"
    aria-hidden
    className="text-cream"
  >
    <g stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <rect x="8" y="22" width="40" height="26" rx="3" opacity="0.85" />
      <path d="M8 26.5 L48 26.5" opacity="0.55" />
      <path d="M9 22 L17 13 M19 22 L27 13 M29 22 L37 13 M39 22 L47 13" opacity="0.85" />
      <path d="M8 22 L48 13" opacity="0.5" />
    </g>
  </svg>
);

/**
 * A single notification row. Wrapped in a `motion.div` so a realtime insert
 * while the surface is open fades + slides in (opacity/transform only — no
 * layout-triggering height animation, per the phase-4 motion budget) and
 * re-flows its neighbours with a `layout` spring, which FLIPs via transforms.
 * First mount is silent (AnimatePresence `initial={false}`); only genuinely
 * new rows choreograph.
 */
function NotificationRow({
  notif,
  transition,
  onSelect,
}: {
  notif: Notification;
  transition: ReturnType<typeof useMotionSafe>["springs"]["glide"];
  onSelect: (notif: Notification) => void;
}) {
  const meta = TYPE_META[notif.type] ?? FALLBACK_META;
  const Icon = meta.icon;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={transition}
    >
      <button
        onClick={() => onSelect(notif)}
        className={cn(
          "w-full flex items-start gap-3 px-4 py-3 text-left min-h-[56px] transition-colors [@media(hover:hover)]:hover:bg-surface-2",
          !notif.is_read && "bg-surface-2/50"
        )}
      >
        {/* 36px rounded thumbnail tile */}
        <div
          className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
            meta.tint
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p
              className={cn(
                "text-sm leading-snug flex-1 min-w-0",
                !notif.is_read ? "font-semibold text-foreground" : "text-foreground"
              )}
            >
              {notif.title}
            </p>
            {!notif.is_read && (
              <span
                aria-label="Unread"
                className="mt-1.5 h-2 w-2 rounded-full bg-cream flex-shrink-0"
              />
            )}
          </div>
          {notif.body && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {notif.body}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">
            {timeAgo(notif.created_at)}
          </p>
        </div>
      </button>
    </motion.div>
  );
}

export default function NotificationDropdown({
  open,
  onClose,
  notifications,
  unreadCount,
  loading,
  onMarkRead,
  onMarkAllRead,
}: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { springs } = useMotionSafe();
  // Focus is trapped only on the desktop (anchored) surface — the mobile vaul
  // Drawer owns its own focus management.
  const dialogRef = useFocusTrap<HTMLDivElement>(!isMobile && open);

  // Desktop-only dismissal: Esc + outside click. On mobile the Drawer overlay
  // and vaul's own Escape handling cover this.
  useEffect(() => {
    if (isMobile || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [isMobile, open, onClose, dialogRef]);

  const handleClick = (notif: Notification) => {
    void tapTick();
    if (!notif.is_read) onMarkRead(notif.id);
    if (notif.link) {
      navigate(notif.link);
      onClose();
    }
  };

  // Group notifications by date bucket, preserving the incoming (newest-first)
  // order within each bucket.
  const grouped = GROUP_ORDER.map((key) => ({
    key,
    items: notifications.filter((n) => groupFor(n.created_at) === key),
  })).filter((g) => g.items.length > 0);

  const markAllButton = unreadCount > 0 && (
    <button
      onClick={onMarkAllRead}
      className="inline-flex items-center gap-1 min-h-[44px] px-2 -mr-2 text-xs text-muted-foreground [@media(hover:hover)]:hover:text-foreground transition-colors"
    >
      <CheckCheck className="h-3.5 w-3.5" />
      Mark all read
    </button>
  );

  const listBody = loading ? (
    <div className="px-4 py-3 space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg skeleton-shimmer flex-shrink-0" />
          <div className="flex-1 space-y-2 py-0.5">
            <div className="h-3 w-3/4 rounded skeleton-shimmer" />
            <div className="h-2.5 w-1/2 rounded skeleton-shimmer" />
          </div>
        </div>
      ))}
    </div>
  ) : notifications.length === 0 ? (
    <div className="px-6 py-12 text-center flex flex-col items-center">
      <ClapperboardArt />
      <p className="mt-4 font-serif-italic text-lg text-cream">All caught up</p>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-[240px]">
        No new notifications. We'll let you know the moment something happens.
      </p>
    </div>
  ) : (
    grouped.map((group) => (
      <div key={group.key}>
        <p className="sticky top-0 z-[1] bg-surface px-4 pt-3 pb-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          {group.key}
        </p>
        <AnimatePresence initial={false}>
          {group.items.map((notif) => (
            <NotificationRow
              key={notif.id}
              notif={notif}
              transition={springs.glide}
              onSelect={handleClick}
            />
          ))}
        </AnimatePresence>
      </div>
    ))
  );

  // ── Mobile: vaul bottom sheet (drag-to-dismiss, spring settle). ──
  // shouldScaleBackground OFF — background scale needs a [vaul-drawer-wrapper]
  // on the app root that this task must not add (see P4-T1 note / P4-T4 owner).
  if (isMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        shouldScaleBackground={false}
      >
        <DrawerContent className="max-h-[85dvh] bg-surface">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <DrawerTitle className="text-sm font-semibold">Notifications</DrawerTitle>
            {markAllButton}
          </div>
          <DrawerDescription className="sr-only">
            Your recent notifications
          </DrawerDescription>
          <div className="overflow-y-auto overscroll-contain pb-safe">{listBody}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  // ── Desktop: anchored dropdown with focus trap + AnimatePresence exit. ──
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-label="Notifications"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={springs.snap}
          className="absolute right-0 top-full mt-2 w-[360px] max-w-[92vw] bg-surface border border-border rounded-xl shadow-lg z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {markAllButton}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">{listBody}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
