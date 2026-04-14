import { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  MessageSquare,
  Calendar,
  BookOpen,
  CheckCheck,
  Inbox,
  Award,
  RotateCcw,
  CheckCircle,
  Star,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Notification } from "@/hooks/useNotifications";

const TYPE_ICONS: Record<string, typeof Bell> = {
  community_reply: MessageSquare,
  session_reminder: Calendar,
  course_update: BookOpen,
  admin_announcement: Megaphone,
  assignment_feedback: BookOpen,
  review_reply: Star,
  refund_processed: RotateCcw,
  enrollment_confirmed: CheckCircle,
  course_completed: Award,
  certificate_ready: Award,
  new_course_available: BookOpen,
};

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

interface Props {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
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
    if (!notif.is_read) onMarkRead(notif.id);
    if (notif.link) {
      navigate(notif.link);
      onClose();
    }
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-[360px] bg-surface border border-border rounded-xl shadow-lg z-50 overflow-hidden"
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
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">You're all caught up</p>
          </div>
        ) : (
          notifications.map((notif) => {
            const Icon = TYPE_ICONS[notif.type] || Bell;
            return (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2",
                  !notif.is_read && "bg-surface-2/50"
                )}
              >
                {/* Unread dot */}
                <div className="pt-1.5 w-2 flex-shrink-0">
                  {!notif.is_read && (
                    <span className="block h-2 w-2 rounded-full bg-blue-500" />
                  )}
                </div>

                {/* Type icon */}
                <div className="pt-0.5 flex-shrink-0">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm leading-snug",
                      !notif.is_read ? "font-semibold text-foreground" : "text-foreground"
                    )}
                  >
                    {notif.title}
                  </p>
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
          })
        )}
      </div>
    </div>
  );
}
