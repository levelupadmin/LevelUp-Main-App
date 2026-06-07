import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  form: Record<string, any>;
  f: (key: any, value: any) => void;
}

/** "Tracking & Pixels" field group for the offering editor. Verbatim
 *  extraction; the parent owns the form state + the f() updater. */
export default function TrackingFields({ form, f }: Props) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <p className="text-sm text-muted-foreground">
        Conversion tracking pixels that fire on the Thank You page after purchase.
      </p>
      <div>
        <Label>Meta Pixel ID</Label>
        <Input
          value={form.meta_pixel_id}
          onChange={(e) => f("meta_pixel_id", e.target.value)}
          placeholder="e.g., 1234567890"
        />
        <p className="text-xs text-muted-foreground mt-1">Facebook/Meta Pixel ID for tracking conversions</p>
      </div>
      <div>
        <Label>Google Ads Conversion</Label>
        <Input
          value={form.google_ads_conversion}
          onChange={(e) => f("google_ads_conversion", e.target.value)}
          placeholder="e.g., AW-123456789/AbCdEfGhIjKl"
        />
        <p className="text-xs text-muted-foreground mt-1">Format: AW-ID/LABEL</p>
      </div>
      <div>
        <Label>Custom Tracking Script</Label>
        <Textarea
          value={form.custom_tracking_script}
          onChange={(e) => f("custom_tracking_script", e.target.value)}
          placeholder="GTM or custom pixel code. Use {{value}}, {{currency}}, {{transaction_id}} as placeholders."
          rows={5}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Runs on Thank You page. Placeholders: {"{{value}}"}, {"{{currency}}"}, {"{{transaction_id}}"}, {"{{order_id}}"}
        </p>
      </div>
    </div>
  );
}
