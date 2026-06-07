import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import { clearSettingsCache } from "@/lib/analytics";
import usePageTitle from "@/hooks/usePageTitle";

interface Settings {
  clarity_project_id: string | null;
  meta_pixel_id: string | null;
  ga4_measurement_id: string | null;
  twitter_pixel_id: string | null;
  clarity_enabled: boolean;
  meta_pixel_enabled: boolean;
  ga4_enabled: boolean;
  twitter_pixel_enabled: boolean;
}

const PLATFORMS = [
  {
    key: "clarity",
    label: "Microsoft Clarity",
    helper:
      "Session recording + heatmaps. Find your Project ID in the Clarity dashboard URL.",
    idField: "clarity_project_id" as const,
    enabledField: "clarity_enabled" as const,
    placeholder: "e.g. abc12def34",
    docs: "https://clarity.microsoft.com/",
  },
  {
    key: "meta",
    label: "Meta Pixel",
    helper:
      "Fires ViewContent, InitiateCheckout, Purchase. Conversions API (server-side) is a separate setup; this is browser-side only.",
    idField: "meta_pixel_id" as const,
    enabledField: "meta_pixel_enabled" as const,
    placeholder: "e.g. 123456789012345",
    docs: "https://business.facebook.com/events_manager2",
  },
  {
    key: "ga4",
    label: "Google Analytics 4",
    helper: "Measurement ID, not Tracking ID. Starts with G-…",
    idField: "ga4_measurement_id" as const,
    enabledField: "ga4_enabled" as const,
    placeholder: "G-XXXXXXXXXX",
    docs: "https://analytics.google.com/",
  },
  {
    key: "twitter",
    label: "Twitter (X) Pixel",
    helper:
      "Find this under Ads Manager → Conversion Tracking → Website Tag.",
    idField: "twitter_pixel_id" as const,
    enabledField: "twitter_pixel_enabled" as const,
    placeholder: "e.g. abc12",
    docs: "https://ads.twitter.com/",
  },
];

const AdminAnalyticsSettings = () => {
  usePageTitle("Analytics & tracking");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("analytics_settings" as any)
        .select(
          "clarity_project_id, meta_pixel_id, ga4_measurement_id, twitter_pixel_id, clarity_enabled, meta_pixel_enabled, ga4_enabled, twitter_pixel_enabled",
        )
        .limit(1)
        .maybeSingle();
      if (error) toast.error("Couldn't load settings");
      setSettings((data as unknown as Settings) ?? null);
      setLoading(false);
    })();
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("analytics_settings" as any)
      .update(settings)
      .eq("singleton", true);
    setSaving(false);
    if (error) {
      toast.error("Save failed", { description: error.message });
      return;
    }
    clearSettingsCache();
    toast.success("Analytics settings saved", {
      description: "Refresh any open tabs to pick up the new scripts.",
    });
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-2">
        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
          Settings
        </p>
        <h1 className="text-3xl font-bold tracking-[-0.01em]">
          Analytics &amp; tracking
        </h1>
        <p className="text-sm text-muted-foreground max-w-[60ch]">
          Per-platform IDs for the client-side tags we inject on every page.
          Server-side Conversions APIs (Meta CAPI, Google Enhanced Conversions)
          are configured separately via edge function secrets and are not
          managed from this screen.
        </p>
      </div>

      <div className="space-y-4">
        {PLATFORMS.map((p) => (
          <Card key={p.key} className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold">{p.label}</h2>
                  <a
                    href={p.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Console <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <p className="text-xs text-muted-foreground max-w-[60ch]">
                  {p.helper}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={settings[p.enabledField]}
                  onCheckedChange={(v) =>
                    update({ [p.enabledField]: v } as any)
                  }
                  aria-label={`Enable ${p.label}`}
                />
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {settings[p.enabledField] ? "On" : "Off"}
                </span>
              </div>
            </div>
            <Input
              value={settings[p.idField] ?? ""}
              onChange={(e) =>
                update({ [p.idField]: e.target.value.trim() || null } as any)
              }
              placeholder={p.placeholder}
              className="font-mono"
              disabled={!settings[p.enabledField]}
            />
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 sticky bottom-4 z-10">
        <Button
          onClick={save}
          disabled={saving}
          size="lg"
          className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90 h-11 px-6"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save settings
        </Button>
        <p className="text-xs text-muted-foreground">
          Scripts inject on the next page load. Refresh any open tabs to
          verify.
        </p>
      </div>
    </div>
  );
};

export default AdminAnalyticsSettings;
