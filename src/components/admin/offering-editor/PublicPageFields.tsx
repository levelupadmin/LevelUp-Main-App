import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  form: Record<string, any>;
  f: (key: any, value: any) => void;
}

/** "Public Page" field group for the offering editor. Verbatim extraction;
 *  the parent owns the form state + the f() updater. */
export default function PublicPageFields({ form, f }: Props) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <p className="text-sm text-muted-foreground">
        These fields control the public offering page at{" "}
        <span className="text-[hsl(var(--cream))] font-medium">/p/{form.slug || "slug"}</span>
      </p>
      <div>
        <Label>Subtitle</Label>
        <Input
          value={form.subtitle}
          onChange={(e) => f("subtitle", e.target.value)}
          placeholder="e.g., 12-week intensive filmmaking program"
        />
      </div>
      <div>
        <Label>Banner Image URL</Label>
        <Input
          value={form.banner_url}
          onChange={(e) => f("banner_url", e.target.value)}
          placeholder="Hero image for the public page"
        />
        {form.banner_url && (
          <img
            src={form.banner_url}
            alt="Banner preview"
            className="mt-2 h-32 w-full rounded-lg object-cover border border-border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Instructor Name</Label>
          <Input value={form.instructor_name} onChange={(e) => f("instructor_name", e.target.value)} />
        </div>
        <div>
          <Label>Instructor Title</Label>
          <Input
            value={form.instructor_title}
            onChange={(e) => f("instructor_title", e.target.value)}
            placeholder="e.g., Filmmaker"
          />
        </div>
        <div>
          <Label>Avatar URL</Label>
          <Input value={form.instructor_avatar_url} onChange={(e) => f("instructor_avatar_url", e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Highlights (JSON array)</Label>
        <Textarea
          value={form.highlights}
          onChange={(e) => f("highlights", e.target.value)}
          placeholder='["12 live sessions", "Certificate of completion", "Lifetime access"]'
          rows={4}
        />
        <p className="text-xs text-muted-foreground mt-1">
          JSON array of feature bullet points shown on the public page
        </p>
      </div>
    </div>
  );
}
