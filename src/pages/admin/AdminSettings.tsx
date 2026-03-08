import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { defaultPlatformSettings } from "@/data/adminData";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const AdminSettings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState(defaultPlatformSettings);

  const save = () => toast({ title: "Settings saved", description: "Platform settings updated successfully." });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Platform Settings</h1>
          <p className="text-sm text-muted-foreground">Configure platform behaviour and features</p>
        </div>

        {/* General */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="text-base font-semibold text-foreground">General</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Platform Name</label>
              <Input
                value={settings.general.platformName}
                onChange={(e) => setSettings((s) => ({ ...s, general: { ...s.general, platformName: e.target.value } }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Support Email</label>
              <Input
                value={settings.general.supportEmail}
                onChange={(e) => setSettings((s) => ({ ...s, general: { ...s.general, supportEmail: e.target.value } }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
              <Input
                value={settings.general.description}
                onChange={(e) => setSettings((s) => ({ ...s, general: { ...s.general, description: e.target.value } }))}
              />
            </div>
          </div>
        </section>

        {/* Gamification */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="text-base font-semibold text-foreground">Gamification</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {([
              { key: "xpPerLesson", label: "XP per Lesson" },
              { key: "xpPerQuiz", label: "XP per Quiz" },
              { key: "xpPerProject", label: "XP per Project" },
            ] as const).map((field) => (
              <div key={field.key}>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{field.label}</label>
                <Input
                  type="number"
                  value={settings.gamification[field.key]}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      gamification: { ...s.gamification, [field.key]: parseInt(e.target.value) || 0 },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </section>

        {/* Subscription */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="text-base font-semibold text-foreground">Subscription Plans</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Free Tier Name</label>
              <Input
                value={settings.subscription.freeTier}
                onChange={(e) => setSettings((s) => ({ ...s, subscription: { ...s.subscription, freeTier: e.target.value } }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Pro Plan Price (₹/mo)</label>
              <Input
                type="number"
                value={settings.subscription.proPlan.price}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    subscription: { ...s.subscription, proPlan: { ...s.subscription.proPlan, price: parseInt(e.target.value) || 0 } },
                  }))
                }
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Master Plan Price (₹/mo)</label>
              <Input
                type="number"
                value={settings.subscription.masterPlan.price}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    subscription: { ...s.subscription, masterPlan: { ...s.subscription.masterPlan, price: parseInt(e.target.value) || 0 } },
                  }))
                }
              />
            </div>
          </div>
        </section>

        {/* Feature Flags */}
        <section className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="text-base font-semibold text-foreground">Feature Flags</h2>
          <div className="space-y-3">
            {(Object.entries(settings.featureFlags) as [string, boolean][]).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-md bg-secondary px-4 py-3">
                <span className="text-sm text-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                <Switch
                  checked={value}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({
                      ...s,
                      featureFlags: { ...s.featureFlags, [key]: checked },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-end">
          <Button onClick={save} className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90">
            Save Settings
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSettings;
