import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  form: Record<string, any>;
  f: (key: any, value: any) => void;
}

/** "Thank You Page" field group for the offering editor. Verbatim extraction;
 *  the parent owns the form state + the f() updater. */
export default function ThankYouFields({ form, f }: Props) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <p className="text-sm text-muted-foreground">
        Customize what buyers see after a successful payment. Leave fields empty to use defaults.
      </p>
      <div>
        <Label>Thank You Banner / Thumbnail URL</Label>
        <Input
          value={form.thankyou_thumbnail_url}
          onChange={(e) => f("thankyou_thumbnail_url", e.target.value)}
          placeholder="Hero image shown on the thank you page"
        />
        {form.thankyou_thumbnail_url && (
          <img
            src={form.thankyou_thumbnail_url}
            alt="Thank you banner preview"
            className="mt-2 h-32 w-full rounded-lg object-cover border border-border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
      </div>
      <div>
        <Label>Headline</Label>
        <Input
          value={form.thankyou_headline}
          onChange={(e) => f("thankyou_headline", e.target.value)}
          placeholder="Payment Successful!"
        />
      </div>
      <div>
        <Label>Body Text</Label>
        <Textarea
          value={form.thankyou_body}
          onChange={(e) => f("thankyou_body", e.target.value)}
          placeholder="Custom message shown below the headline (e.g., instructions, welcome note, WhatsApp group link info)"
          rows={4}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>CTA Button Label</Label>
          <Input
            value={form.thankyou_cta_label}
            onChange={(e) => f("thankyou_cta_label", e.target.value)}
            placeholder="Go to Dashboard"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Text shown on the main button (e.g., "Join WhatsApp Group", "Go to Dashboard")
          </p>
        </div>
        <div>
          <Label>CTA Button URL</Label>
          <Input
            value={form.thankyou_cta_url}
            onChange={(e) => f("thankyou_cta_url", e.target.value)}
            placeholder="Leave empty for dashboard"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Where the button goes. Leave empty to go to the student dashboard. Can be a full URL (e.g., WhatsApp group link).
          </p>
        </div>
      </div>
      {/* No auto-redirect controls: the thank-you page no longer leaves on its
          own (it raced buyers reading their receipt). The buyer taps the
          button above when ready. */}
    </div>
  );
}
