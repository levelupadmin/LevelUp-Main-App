import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notificationTypes";

interface PrefRow {
  id: string;
  notification_type: string;
  enabled: boolean;
}

const NotificationPreferences = () => {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

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

  const toggle = async (key: NotificationType, enabled: boolean) => {
    if (!user) return;
    setSaving(key);
    const { error } = await (supabase as any)
      .from("notification_preferences")
      .upsert(
        { user_id: user.id, notification_type: key, enabled },
        { onConflict: "user_id,notification_type" }
      );
    if (error) {
      toast.error("Failed to save preference");
      console.error(error);
    } else {
      setPrefs((prev) => ({ ...prev, [key]: enabled }));
    }
    setSaving(null);
  };

  // Opt-out model: no row means enabled
  const isEnabled = (key: string) => prefs[key] ?? true;

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

      <div className="space-y-1">
        {NOTIFICATION_TYPES.map((nt) => {
          const Icon = nt.icon;
          const alwaysOn = nt.alwaysOn;
          const checked = alwaysOn ? true : isEnabled(nt.key);

          return (
            <div
              key={nt.key}
              className="flex items-center justify-between py-3 px-2 rounded-lg hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">{nt.label}</p>
                  {alwaysOn && (
                    <p className="text-xs text-muted-foreground">(Required)</p>
                  )}
                </div>
              </div>
              <Switch
                checked={checked}
                disabled={alwaysOn || saving === nt.key}
                onCheckedChange={(val) => toggle(nt.key as NotificationType, val)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationPreferences;
