import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckoutPreviewFromForm, type BumpChoice, type BumpRow, type Question } from "./CheckoutPageTab";
import type { ExploreState } from "./ExploreFields";

/*
 * The always-on visualiser beside the offering editor (founder, 6 Nov 2026):
 * the checkout, the thank-you page and the Explore card, drawn from the
 * unsaved form so every keystroke shows. It follows the section being edited;
 * the switch at the top shows any of the three.
 */

export type PreviewKind = "checkout" | "thankyou" | "card";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Form = Record<string, any>;

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function OfferingPreview({ follow, form, explore, courseTitles, bumps, bumpChoices, questions }: {
  /** which preview the current editor section wants */
  follow: PreviewKind;
  form: Form;
  explore: ExploreState;
  courseTitles: string[];
  bumps: BumpRow[];
  bumpChoices: BumpChoice[];
  questions: Question[];
}) {
  const [kind, setKind] = useState<PreviewKind>(follow);
  useEffect(() => setKind(follow), [follow]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Live preview</p>
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs" role="tablist" aria-label="Preview">
          {([["checkout", "Checkout"], ["thankyou", "Thank-you"], ["card", "Explore card"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
              className={cn("rounded-md px-2.5 py-1", kind === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {kind === "checkout" && <CheckoutPreviewFromForm form={form} courseTitles={courseTitles} bumps={bumps} bumpChoices={bumpChoices} questions={questions} />}
      {kind === "thankyou" && <ThankYouPreview form={form} />}
      {kind === "card" && <CardPreview form={form} explore={explore} />}
    </div>
  );
}

/** Mirrors ThankYou.tsx: its own headline/message/button, else the page's defaults. */
function ThankYouPreview({ form }: { form: Form }) {
  const thumb: string = form.thankyou_thumbnail_url || form.thumbnail_url || "";
  return (
    <div className="rounded-2xl border border-border bg-background p-5 space-y-4 text-center">
      {thumb
        ? <img src={thumb} alt="" className="mx-auto aspect-video w-full rounded-xl object-cover" />
        : <div className="mx-auto flex aspect-video w-full items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground"><ImageIcon className="h-5 w-5 mr-1" />Picture</div>}
      <p className="text-xl font-semibold">{form.thankyou_headline || "You're in."}</p>
      <p className="text-sm text-muted-foreground whitespace-pre-line">{form.thankyou_body || `${form.title || "Your purchase"} is now in My learning.`}</p>
      <div className="rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground">{form.thankyou_cta_label || "Start lesson 1"}</div>
      {form.thankyou_auto_redirect && (form.thankyou_cta_url || "").trim() && (
        <p className="text-xs text-muted-foreground">Opens {form.thankyou_cta_url} in {form.thankyou_redirect_seconds || 10} s</p>
      )}
    </div>
  );
}

/** The card students tap on Explore and in Home's rows. */
function CardPreview({ form, explore }: { form: Form; explore: ExploreState }) {
  const art: string = explore.cardImage || form.thumbnail_url || form.checkout_cover_url || "";
  const price = Number(form.price_inr) || 0;
  return (
    <div className="space-y-3">
      <div className="max-w-[300px] overflow-hidden rounded-2xl border border-border bg-background">
        <div className="aspect-video bg-muted flex items-center justify-center">
          {art ? <img src={art} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-muted-foreground">Card picture</span>}
        </div>
        <div className="p-3">
          <p className="text-sm font-semibold leading-snug">{form.title || "Title"}</p>
          {form.subtitle && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{form.subtitle}</p>}
          <p className="text-xs mt-2">{form.access === "apply" ? "Apply" : price > 0 ? inr(price) : form.access === "free" ? "Free" : ""}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {explore.show === "off" ? "Not on Explore: only people with its link see it." : `On Explore${explore.show === "carousel" ? " and the Home carousel" : ""}. A tap opens ${explore.opens === "checkout" ? "the checkout" : "the sales page"}.`}
      </p>
    </div>
  );
}
