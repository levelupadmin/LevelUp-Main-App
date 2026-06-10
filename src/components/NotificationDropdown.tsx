import { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/haptics";
import type { Notification } from "@/hooks/useNotifications";

/**
 * Per-type thumbnail treatment. The notifications table carries no image, so
 * instead of a tiny gray glyph we render a 36px rounded tile in a tuned tint
 * with the type's icon, it reads as "course art" at a glance and keeps the
 * list scannable.
 */
const TYPE_META: Record<
  string,
  { icon: typeof Bell; tint: string }
> = {
  community_reply: { icon: MessageSquare, tint: "bg-sky-500/15 text-sky-300" },
  review_reply: { icon: Star, tint: "bg-amber-500/15 text-amber-300" },
  session_reminder: { icon: Calendar, tint: "bg-violet-500/15 text-violet-300" },
  course_update: { icon: BookOpen, tint: "bg-cream/15 text-cream" },
  new_course_available: { icon: BookOpen, tint: "bg-cream/15 text-cream" },
  assignment_feedback: { icon: BookOpen, tint: "bg-cream/15 text-cream" },
  admin_announcement: { icon: Megaphone, tint: "bg-rose-500/15 text-rose-300" },
  refund_processed: { icon: RotateCcw, tint: "bg-emerald-500/15 text-emerald-300" },
  enrollment_confirmed: { icon: CheckCircle, tint: "bg-emerald-500/15 text-emerald-300" },
  course_completed: { icon: Award, tint: "bg-cream/15 text-cream" },
  certificate_ready: { icon: Award, tint: "bg-cream/15 text-cream" },
};

const FALLBACK_META = { icon: Bell, tint: "bg-surface-2 text-muted-foreground" } as const;

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
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleClick = (notif: Notification) => {
    hapticSelection();
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

  return (
    <div
      ref={ref}
      className="fixed top-16 left-4 right-4 sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:left-auto sm:w-[360px] bg-surface border border-border rounded-xl shadow-lg z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Notifications</h3>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
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
              <p className="sticky top-0 z-[1] bg-surface/95 backdrop-blur-sm px-4 pt-3 pb-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                {group.key}
              </p>
              {group.items.map((notif) => {
                const meta = TYPE_META[notif.type] ?? FALLBACK_META;
                const Icon = meta.icon;
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2",
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
                            !notif.is_read
                              ? "font-semibold text-foreground"
                              : "text-foreground"
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
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
