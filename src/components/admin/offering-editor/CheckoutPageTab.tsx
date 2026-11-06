import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ImageIcon, Lock, Plus, X } from "lucide-react";

/*
 * Offering editor → "Checkout page" (founder, 6 Nov 2026). An offering IS its
 * checkout page (TagMango's "service"). Every checkout has the same blocks in
 * the same order; you fill them on the left and see the page on the right as
 * you type. Saving happens with the editor's own Save button.
 */

export interface BumpRow { id: string; bump_offering_id: string; headline: string; bump_price_override_inr: string; bump_title?: string }
export interface BumpChoice { id: string; title: string; price_inr: number | string | null; status: string; access: string }
export interface Question { id?: string; label: string; is_required: boolean }
interface Testimonial { name?: string; quote?: string; role?: string }

// The editor's form keeps these JSON columns as strings; parse once here.
const parseList = <T,>(json: string): T[] => { try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; } };
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const isVideoUrl = (u: string) => /\.(mp4|webm|mov)(\?|#|$)/i.test(u);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Form = Record<string, any>;

function Block({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{n}</span>
        <div>
          <p className="text-sm font-medium">{title}</p>
          {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        </div>
      </div>
      <div className="space-y-3 pl-9">{children}</div>
    </section>
  );
}

export function CheckoutPageTab({
  form, f, offeringId, bumps, setBumps, bumpChoices, questions, setQuestions, courseTitles,
}: {
  form: Form;
  f: (key: string, value: unknown) => void;
  offeringId: string | undefined;
  bumps: BumpRow[];
  setBumps: React.Dispatch<React.SetStateAction<BumpRow[]>>;
  bumpChoices: BumpChoice[];
  questions: Question[];
  setQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  /** titles of the courses this offering unlocks (the fallback "What you get") */
  courseTitles: string[];
}) {
  const bullets = parseList<string>(form.checkout_bullets).filter((b) => typeof b === "string");
  const testimonials = parseList<Testimonial>(form.checkout_testimonials);
  const setBullets = (next: string[]) => f("checkout_bullets", JSON.stringify(next));
  const setTestimonials = (next: Testimonial[]) => f("checkout_testimonials", JSON.stringify(next));
  const addonChoices = bumpChoices.filter((o) => o.id !== offeringId && o.status === "active" && o.access === "buy" && Number(o.price_inr) > 0);

  return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The blocks of this offering's checkout page, in the order buyers see them. The preview beside this updates as you type.
          Address: <span className="font-mono">/checkout/{form.slug || "…"}</span>
        </p>

        <Block n={1} title="Cover" hint="An image, or a video (a link ending in .mp4). Shown at the top, 16:9.">
          <Input value={form.checkout_cover_url ?? ""} onChange={(e) => f("checkout_cover_url", e.target.value)} placeholder="https://…/cover.jpg" />
        </Block>

        <Block n={2} title="One line under the title" hint="The title itself is set in Basics.">
          <Textarea rows={2} value={form.description} onChange={(e) => f("description", e.target.value)} placeholder="A 2-hour live workshop on directing your first film." />
        </Block>

        <Block n={3} title="What you get" hint={`Your own list. Empty = the courses inside (${courseTitles.length ? courseTitles.join(", ") : "none linked yet"}).`}>
          {bullets.map((b, i) => (
            <div key={i} className="flex gap-2">
              <Input value={b} onChange={(e) => setBullets(bullets.map((x, j) => (j === i ? e.target.value : x)))} />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => setBullets(bullets.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setBullets([...bullets, ""])}><Plus className="h-4 w-4 mr-1" />Add a line</Button>
        </Block>

        <Block n={4} title="When (optional)" hint="For live sessions. Leave empty for recorded courses.">
          <Input value={form.checkout_when ?? ""} maxLength={200} onChange={(e) => f("checkout_when", e.target.value)} placeholder="Wed 8 PM · 2 hours · on Zoom" />
        </Block>

        <Block n={5} title="Add-ons" hint="Other offerings the buyer can tick. Only Selling, Buy offerings priced above ₹0.">
          {bumps.map((b, i) => (
            <div key={b.id || i} className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_1fr_auto] gap-2 items-end">
              <div>
                <Label className="text-xs">Offering</Label>
                <Select value={b.bump_offering_id || "none"} onValueChange={(v) => setBumps((prev) => prev.map((x, j) => (j === i ? { ...x, bump_offering_id: v === "none" ? "" : v } : x)))}>
                  <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="none">Choose an offering</SelectItem>
                    {bumpChoices.filter((o) => addonChoices.includes(o) || o.id === b.bump_offering_id).map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.title} · {inr(Number(o.price_inr))}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Line on the checkout</Label>
                <Input value={b.headline} placeholder="Add the recording + deck" onChange={(e) => setBumps((prev) => prev.map((x, j) => (j === i ? { ...x, headline: e.target.value } : x)))} />
              </div>
              <div>
                <Label className="text-xs">Price (₹)</Label>
                <Input type="number" value={b.bump_price_override_inr} placeholder="its own" onChange={(e) => setBumps((prev) => prev.map((x, j) => (j === i ? { ...x, bump_price_override_inr: e.target.value } : x)))} />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove add-on" onClick={() => setBumps((prev) => prev.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setBumps((prev) => [...prev, { id: "", bump_offering_id: "", headline: "", bump_price_override_inr: "" }])}><Plus className="h-4 w-4 mr-1" />Add an add-on</Button>
        </Block>

        <Block n={6} title="Questions to ask the buyer (optional)" hint="Name, email and phone are always asked. Add only what you truly need: every extra question costs sales.">
          {questions.map((q, i) => (
            <div key={q.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2">
              <Input className="flex-1 min-w-[200px]" value={q.label} placeholder="Which city are you in?" onChange={(e) => setQuestions((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox checked={q.is_required} onCheckedChange={(v) => setQuestions((prev) => prev.map((x, j) => (j === i ? { ...x, is_required: !!v } : x)))} />
                Required
              </label>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove question" onClick={() => setQuestions((prev) => prev.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setQuestions((prev) => [...prev, { label: "", is_required: false }])}><Plus className="h-4 w-4 mr-1" />Add a question</Button>
        </Block>

        <Block n={7} title="Price" hint="Set in Basics. The coupon box shows by itself only when a coupon can apply.">
          <p className="text-sm">
            ₹{Number(form.price_inr || 0).toLocaleString("en-IN")}
            {Number(form.mrp_inr) > Number(form.price_inr) && <span className="text-muted-foreground line-through ml-2">₹{Number(form.mrp_inr).toLocaleString("en-IN")}</span>}
            <span className="text-muted-foreground"> · GST {form.gst_mode === "none" ? "none" : `${form.gst_rate || 18}% ${form.gst_mode === "inclusive" ? "included" : "added on top"}`}</span>
          </p>
        </Block>

        <Block n={8} title="Trust" hint="Refund window and up to two short testimonials.">
          <div className="max-w-[220px]">
            <Label className="text-xs">Refund window (days)</Label>
            <Input type="number" value={form.refund_policy_days ?? ""} placeholder="7" onChange={(e) => f("refund_policy_days", e.target.value)} />
          </div>
          {testimonials.map((t, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
              <Input value={t.name ?? ""} placeholder="Name" onChange={(e) => setTestimonials(testimonials.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input value={t.quote ?? ""} placeholder="What they said" onChange={(e) => setTestimonials(testimonials.map((x, j) => (j === i ? { ...x, quote: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove testimonial" onClick={() => setTestimonials(testimonials.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          {testimonials.length < 2 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setTestimonials([...testimonials, { name: "", quote: "" }])}><Plus className="h-4 w-4 mr-1" />Add a testimonial</Button>
          )}
        </Block>

      </div>
  );
}

/** The checkout preview straight from the editor's (unsaved) form. */
export function CheckoutPreviewFromForm(props: {
  form: Form; courseTitles: string[]; bumps: BumpRow[]; bumpChoices: BumpChoice[]; questions: Question[];
}) {
  const bullets = parseList<string>(props.form.checkout_bullets).filter((b) => typeof b === "string");
  const testimonials = parseList<Testimonial>(props.form.checkout_testimonials);
  return <CheckoutPreview {...props} bullets={bullets} testimonials={testimonials} />;
}

/** A faithful sketch of the buyer's checkout, from the unsaved form. */
export function CheckoutPreview({ form, bullets, courseTitles, testimonials, bumps, bumpChoices, questions }: {
  form: Form; bullets: string[]; courseTitles: string[]; testimonials: Testimonial[];
  bumps: BumpRow[]; bumpChoices: BumpChoice[]; questions: Question[];
}) {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const addOns = bumps
    .map((b, i) => {
      const o = bumpChoices.find((x) => x.id === b.bump_offering_id);
      if (!o) return null;
      const price = b.bump_price_override_inr !== "" && b.bump_price_override_inr != null ? Number(b.bump_price_override_inr) : Number(o.price_inr);
      return { i, label: b.headline || o.title, price };
    })
    .filter((x): x is { i: number; label: string; price: number } => !!x && x.price > 0);
  const base = Number(form.price_inr) || 0;
  const total = useMemo(() => {
    const sub = base + addOns.filter((a) => ticked.has(a.i)).reduce((n, a) => n + a.price, 0);
    return form.gst_mode === "exclusive" ? sub + Math.round(sub * ((Number(form.gst_rate) || 18) / 100)) : sub;
  }, [base, addOns, ticked, form.gst_mode, form.gst_rate]);
  const mrp = Number(form.mrp_inr) || 0;
  const list = bullets.filter((b) => b.trim()).length ? bullets.filter((b) => b.trim()) : courseTitles;
  const cover: string = form.checkout_cover_url ?? "";
  const days = Number(form.refund_policy_days) || 7;

  return (
    <div className="rounded-2xl border border-border bg-background p-4 space-y-4 text-foreground">
      <div className="overflow-hidden rounded-xl bg-muted aspect-video flex items-center justify-center">
        {cover ? (isVideoUrl(cover)
          ? <video src={cover} className="h-full w-full object-cover" autoPlay muted loop playsInline aria-hidden />
          : <img src={cover} alt="" className="h-full w-full object-cover" />)
          : <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground"><ImageIcon className="h-5 w-5" />Cover (block 1)</span>}
      </div>
      <div>
        <p className="text-lg font-semibold leading-snug">{form.title || "Title (block 2)"}</p>
        {form.checkout_when && <p className="text-sm mt-1">{form.checkout_when}</p>}
        {form.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{form.description}</p>}
      </div>

      {addOns.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Add to your order</p>
          {addOns.map((a) => (
            <label key={a.i} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm cursor-pointer">
              <Checkbox checked={ticked.has(a.i)} onCheckedChange={(v) => setTicked((prev) => { const n = new Set(prev); if (v) n.add(a.i); else n.delete(a.i); return n; })} />
              <span className="flex-1">{a.label}</span>
              <span>+{inr(a.price)}</span>
            </label>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Your details</p>
        {["Full name", "Email address", "Phone number", ...questions.filter((q) => q.label.trim()).map((q) => q.label + (q.is_required ? " *" : ""))].map((l) => (
          <div key={l} className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{l}</div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Total</span>
          <span className="text-right">
            {mrp > base && <span className="text-xs text-muted-foreground line-through mr-2">{inr(mrp)}</span>}
            <span className="text-lg font-semibold">{inr(total)}</span>
          </span>
        </div>
        <div className="rounded-lg bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground">Pay {inr(total)}</div>
        <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" />Secured by Razorpay · {days}-day refund</p>
      </div>

      {list.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">What you get</p>
          {list.map((b, i) => (
            <p key={i} className="flex items-start gap-2 text-sm"><CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[hsl(var(--accent-emerald))]" />{b}</p>
          ))}
        </div>
      )}

      {testimonials.filter((t) => t.quote?.trim()).slice(0, 2).map((t, i) => (
        <figure key={i} className="rounded-lg border border-border p-3 text-sm">
          <blockquote>"{t.quote}"</blockquote>
          {t.name && <figcaption className="text-xs text-muted-foreground mt-1">{t.name}</figcaption>}
        </figure>
      ))}
    </div>
  );
}
