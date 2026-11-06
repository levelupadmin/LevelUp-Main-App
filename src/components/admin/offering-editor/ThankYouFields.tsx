import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Props {
  form: Record<string, any>;
  f: (key: any, value: any) => void;
}

/** "Thank You Page" field group for the offering editor. Verbatim extraction;
 *  the parent owns the form state + the f() updater. */
export default function ThankYouFields({ form, f }: Props) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <div>
        <Label>Picture (optional)</Label>
        <Input
          value={form.thankyou_thumbnail_url}
          onChange={(e) => f("thankyou_thumbnail_url", e.target.value)}
          placeholder="https://… (else the offering's picture)"
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
          placeholder="You're in."
        />
      </div>
      <div>
        <Label>Message</Label>
        <Textarea
          value={form.thankyou_body}
          onChange={(e) => f("thankyou_body", e.target.value)}
          placeholder="Custom message shown below the headline (e.g., instructions, welcome note, WhatsApp group link info)"
          rows={4}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Button text</Label>
          <Input
            value={form.thankyou_cta_label}
            onChange={(e) => f("thankyou_cta_label", e.target.value)}
            placeholder="Start lesson 1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            e.g. "Join the WhatsApp group". Empty = "Start lesson 1".
          </p>
        </div>
        <div>
          <Label>Button link (optional)</Label>
          <Input
            value={form.thankyou_cta_url}
            onChange={(e) => f("thankyou_cta_url", e.target.value)}
            placeholder="Empty = opens the first lesson"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Empty = the first lesson. Can be any link, e.g. a WhatsApp group.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <Switch
            checked={form.thankyou_auto_redirect}
            onCheckedChange={(checked) => f("thankyou_auto_redirect", checked)}
          />
          <div>
            <Label>Open the button link by itself after a countdown</Label>
            <p className="text-xs text-muted-foreground">Automatically redirect logged-in users after the timer</p>
          </div>
        </div>
        <div>
          <Label>Seconds</Label>
          <Input
            type="number"
            min={0}
            max={120}
            value={form.thankyou_redirect_seconds}
            onChange={(e) => f("thankyou_redirect_seconds", Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground mt-1">
            How many seconds before auto-redirect (0–120). Set to 0 to disable.
          </p>
        </div>
      </div>
    </div>
  );
}
