import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import { Bell, BookOpen, Users, ShieldCheck, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notificationTypes";

interface PrefRow {
  id: string;
  notification_type: string;
  enabled: boolean;
}

const GROUPS = [
  {
    id: "learning",
    title: "Learning Updates",
    description: "Course changes, session reminders, feedback, and certificates",
    icon: BookOpen,
    keys: [
      "course_update",
      "session_reminder",
      "assignment_feedback",
      "certificate_ready",
      "course_completed",
    ] as NotificationType[],
    alwaysOnNote: null,
  },
  {
    id: "community",
    title: "Community & Social",
    description: "Replies, discussions, and new course announcements",
    icon: Users,
    keys: [
      "community_reply",
      "review_reply",
      "new_course_available",
    ] as NotificationType[],
    alwaysOnNote: null,
  },
  {
    id: "account",
    title: "Account & Admin",
    description: "Enrollment confirmations, refunds, and announcements",
    icon: ShieldCheck,
    keys: [
      "admin_announcement",
      "enrollment_confirmed",
      "refund_processed",
    ] as NotificationType[],
    alwaysOnNote:
      "Announcements and essential account notifications are always delivered.",
  },
] as const;

const NotificationPreferences = () => {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("notification_preferences")
      .select("id, notification_type, enabled")
      .eq("user_id", user.id);
    const map: Record<string, boolean> = {};
    (data || []).forEach((r: PrefRow) => {
      map[r.notification_type] = r.enabled;
    });
    setPrefs(map);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Opt-out model: no row means enabled
  const isEnabled = (key: string) => prefs[key] ?? true;

  const isGroupEnabled = (keys: readonly NotificationType[]) => {
    // A group is "on" if every non-alwaysOn key in it is enabled
    const toggleable = keys.filter((k) => {
      const nt = NOTIFICATION_TYPES.find((t) => t.key === k);
      return nt && !nt.alwaysOn;
    });
    if (toggleable.length === 0) return true; // all always-on
    return toggleable.every((k) => isEnabled(k));
  };

  const toggleGroup = async (
    groupId: string,
    keys: readonly NotificationType[],
    enabled: boolean
  ) => {
    if (!user) return;

    // Only toggle keys that are not alwaysOn
    const toggleable = keys.filter((k) => {
      const nt = NOTIFICATION_TYPES.find((t) => t.key === k);
      return nt && !nt.alwaysOn;
    });
    if (toggleable.length === 0) return;

    setSavingGroup(groupId);

    const rows = toggleable.map((key) => ({
      user_id: user.id,
      notification_type: key,
      enabled,
    }));

    const { error } = await (supabase as any)
      .from("notification_preferences")
      .upsert(rows, { onConflict: "user_id,notification_type" });

    if (error) {
      toast.error("Failed to save preferences");
      if (import.meta.env.DEV) console.error(error);
    } else {
      setPrefs((prev) => {
        const next = { ...prev };
        toggleable.forEach((k) => {
          next[k] = enabled;
        });
        return next;
      });
    }
    setSavingGroup(null);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-[16px] p-6 flex items-center justify-center min-h-[120px]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-[16px] p-6">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">Notification Preferences</h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
        {GROUPS.map((group) => {
          const Icon = group.icon;
          const groupOn = isGroupEnabled(group.keys);
          const isSaving = savingGroup === group.id;

          // Check if the entire group is alwaysOn (all keys are alwaysOn)
          const allAlwaysOn = group.keys.every((k) => {
            const nt = NOTIFICATION_TYPES.find((t) => t.key === k);
            return nt?.alwaysOn;
          });

          return (
            <div
              key={group.id}
              className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-colors ${
                groupOn
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-surface"
              }`}
            >
              {/* Header */}
              <div className="mb-4">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      groupOn
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-foreground">
                    {group.title}
                  </h4>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground pl-[42px]">
                  {group.description}
                </p>
              </div>

              {/* Toggle row */}
              <div className="flex items-center justify-between pt-3 border-t border-border/60">
                <span className="text-xs font-medium text-muted-foreground">
                  {allAlwaysOn
                    ? "Always on"
                    : groupOn
                    ? "Enabled"
                    : "Disabled"}
                </span>
                <Switch
                  checked={allAlwaysOn ? true : groupOn}
                  disabled={allAlwaysOn || isSaving}
                  onCheckedChange={(val) =>
                    toggleGroup(group.id, group.keys, val)
                  }
                />
              </div>

              {/* Always-on note */}
              {group.alwaysOnNote && (
                <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-muted/50 px-3 py-2">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {group.alwaysOnNote}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationPreferences;
