import { CheckCircle2, Circle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { isReady, pageReadiness, type ReadinessOffering } from "@/lib/catalogue";

/*
 * "Show on Explore", inside the offering (founder, 6 Nov 2026: no separate
 * Pages screen). Stored as this offering's row in `pages` (one per offering:
 * its listing, place in the row, card picture and what a tap opens), so Home,
 * Explore and /p/<slug> keep reading the same table.
 */

export interface ExploreState {
  pageId: string | null;
  /** off = not listed (its addresses still work) · on = Explore + its Home row · carousel = also the Home carousel */
  show: "off" | "on" | "carousel";
  position: string;
  carouselSlot: string;
  cardImage: string;
  opens: "page" | "checkout";
}
export const EMPTY_EXPLORE: ExploreState = { pageId: null, show: "off", position: "100", carouselSlot: "", cardImage: "", opens: "page" };

const toShow = (listing: string): ExploreState["show"] => (listing === "featured" ? "carousel" : listing === "listed" ? "on" : "off");
const toListing = (show: ExploreState["show"]) => (show === "carousel" ? "featured" : show === "on" ? "listed" : "link");

export async function loadExplore(offeringId: string): Promise<ExploreState> {
  const { data } = await supabase
    .from("pages")
    .select("id, listing, position, carousel_position, card_image_url, opens")
    .eq("button_offering_id", offeringId)
    .order("listing", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return EMPTY_EXPLORE;
  return {
    pageId: data.id,
    show: toShow(data.listing),
    position: String(data.position ?? 100),
    carouselSlot: data.carousel_position != null ? String(data.carousel_position) : "",
    cardImage: data.card_image_url ?? "",
    opens: data.opens === "checkout" ? "checkout" : "page",
  };
}

/** Save after the offering itself is saved. Returns an error message or null. */
export async function saveExplore(offeringId: string, slug: string, title: string, e: ExploreState): Promise<string | null> {
  const row = {
    listing: toListing(e.show),
    position: Number(e.position) || 100,
    carousel_position: e.show === "carousel" ? Number(e.carouselSlot) || 9 : null,
    card_image_url: e.cardImage.trim() || null,
    opens: e.opens,
  };
  if (e.pageId) {
    const { error } = await supabase.from("pages").update(row).eq("id", e.pageId);
    return error?.message ?? null;
  }
  if (e.show === "off") return null; // nothing to store yet
  const { data, error } = await supabase
    .from("pages")
    .insert({ ...row, slug, title, button_offering_id: offeringId })
    .select("id")
    .single();
  if (error) return error.message.includes("pages_slug_key") ? "Another product already uses this address" : error.message;
  await supabase.from("offerings").update({ page_id: data.id }).eq("id", offeringId);
  return null;
}

export function ExploreFields({ value, onChange, offering, courseCount }: {
  value: ExploreState;
  onChange: (next: ExploreState) => void;
  offering: ReadinessOffering;
  courseCount: number;
}) {
  // The first check ("its button sells an offering") is always true here.
  const checks = pageReadiness({ button_offering_id: "this", card_image_url: value.cardImage || null }, offering, courseCount).slice(1);
  const ready = isReady(checks);
  const set = (patch: Partial<ExploreState>) => onChange({ ...value, ...patch });

  return (
    <div className="rounded-xl border border-border p-4 space-y-4">
      <div>
        <p className="text-sm font-medium">Show on Explore</p>
        <p className="text-xs text-muted-foreground mt-0.5">Whether students see this in the app's Explore page and Home rows. Its checkout link works either way.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label className="text-xs">Show it</Label>
          <Select value={value.show} onValueChange={(v) => set({ show: v as ExploreState["show"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="off">No</SelectItem>
              <SelectItem value="on">Yes, in its row</SelectItem>
              <SelectItem value="carousel">Yes, and in the Home carousel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Place in its row</Label>
          <Input type="number" value={value.position} onChange={(e) => set({ position: e.target.value })} />
          <p className="text-[11px] text-muted-foreground mt-1">Smaller comes first</p>
        </div>
        <div>
          <Label className="text-xs">A tap on its card opens</Label>
          <Select value={value.opens} onValueChange={(v) => set({ opens: v as ExploreState["opens"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="page">The sales page (/p/…)</SelectItem>
              <SelectItem value="checkout">The checkout</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <Label className="text-xs">Card picture (optional)</Label>
          <Input value={value.cardImage} onChange={(e) => set({ cardImage: e.target.value })} placeholder="https://… (else the thumbnail)" />
        </div>
        {value.show === "carousel" && (
          <div>
            <Label className="text-xs">Carousel slot</Label>
            <Input type="number" value={value.carouselSlot} placeholder="1–5" onChange={(e) => set({ carouselSlot: e.target.value })} />
          </div>
        )}
      </div>
      {value.show !== "off" && (
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-medium mb-1.5">{ready ? "Ready to show" : "Before it can show:"}</p>
          <ul className="space-y-1">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-xs">
                {c.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--accent-emerald))]" aria-label="done" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" aria-label="not yet" />}
                <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
