import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ACCESS, FORMAT, LISTING, LISTING_ORDER, OFFERING_STATUS, isReady, pageReadiness, slugify } from "@/lib/catalogue";
import type { CatOffering, CatPage } from "./types";

/**
 * Create or edit a PAGE: what people see. It says where it shows, which
 * offering its button sells, and which offerings sit under it (batches).
 * "Listed" and "Featured" need every Ready check green.
 */
export function PageDialog({
  open, onOpenChange, page, offerings, lessonsByOffering, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = a new page */
  page: CatPage | null;
  offerings: CatOffering[];
  lessonsByOffering: Map<string, number>;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [listing, setListing] = useState("link");
  const [opens, setOpens] = useState("page");
  const [button, setButton] = useState<string>("");
  const [under, setUnder] = useState<Set<string>>(new Set());
  const [position, setPosition] = useState("100");
  const [carouselPosition, setCarouselPosition] = useState("");
  const [carouselTitle, setCarouselTitle] = useState("");
  const [cardImage, setCardImage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(page?.title ?? "");
    setSlug(page?.slug ?? "");
    setSlugTouched(!!page);
    setListing(page?.listing ?? "link");
    setOpens(page?.opens ?? "page");
    setButton(page?.button_offering_id ?? "");
    setUnder(new Set(offerings.filter((o) => page && o.page_id === page.id).map((o) => o.id)));
    setPosition(String(page?.position ?? 100));
    setCarouselPosition(page?.carousel_position != null ? String(page.carousel_position) : "");
    setCarouselTitle(page?.carousel_title ?? "");
    setCardImage(page?.card_image_url ?? "");
  }, [open, page, offerings]);

  const buttonOffering = offerings.find((o) => o.id === button) ?? null;
  const checks = useMemo(
    () => pageReadiness({ button_offering_id: button || null, card_image_url: cardImage || null }, buttonOffering, button ? lessonsByOffering.get(button) ?? 0 : 0),
    [button, cardImage, buttonOffering, lessonsByOffering],
  );
  const ready = isReady(checks);
  const wantsListed = listing === "listed" || listing === "featured";
  const sellable = offerings
    .filter((o) => o.status !== "draft" || o.id === button)
    .sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || a.title.localeCompare(b.title));

  const save = async () => {
    const cleanSlug = slugify(slug || title);
    if (!title.trim() || !cleanSlug) { toast.error("Give the page a title"); return; }
    if (wantsListed && !ready) { toast.error("Finish the Ready checks before listing it, or choose Link only"); return; }
    setSaving(true);
    const row = {
      title: title.trim(),
      slug: cleanSlug,
      listing,
      opens,
      button_offering_id: button || null,
      position: Number(position) || 100,
      carousel_position: listing === "featured" ? Number(carouselPosition) || 9 : null,
      carousel_title: carouselTitle.trim() || null,
      card_image_url: cardImage.trim() || null,
    };
    const res = page
      ? await supabase.from("pages").update(row).eq("id", page.id).select("id").single()
      : await supabase.from("pages").insert(row).select("id").single();
    if (res.error || !res.data) {
      setSaving(false);
      toast.error(res.error?.message.includes("pages_slug_key") ? "Another page already uses that address" : `Not saved: ${res.error?.message}`);
      return;
    }
    const pageId = res.data.id;
    // Which offerings sit under this page: the button's offering always does.
    const want = new Set(under);
    if (button) want.add(button);
    const was = new Set(offerings.filter((o) => o.page_id === pageId).map((o) => o.id));
    const add = [...want].filter((id) => !was.has(id));
    const drop = [...was].filter((id) => !want.has(id));
    const errs: string[] = [];
    if (add.length) {
      const { error } = await supabase.from("offerings").update({ page_id: pageId }).in("id", add);
      if (error) errs.push(error.message);
    }
    if (drop.length) {
      const { error } = await supabase.from("offerings").update({ page_id: null }).in("id", drop);
      if (error) errs.push(error.message);
    }
    setSaving(false);
    if (errs.length) toast.error(`Page saved, but the offerings under it weren't: ${errs[0]}`);
    else toast.success(page ? "Page saved" : "Page created");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{page ? "Edit page" : "New page"}</DialogTitle>
          <DialogDescription>
            A page is what people see: its card on Explore and Home, and its address. Its button sells one offering.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
            </div>
            <div>
              <Label>Address</Label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground shrink-0">/p/</span>
                <Input value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} />
              </div>
            </div>
          </div>

          <div>
            <Label>Its button sells</Label>
            <Select value={button || "none"} onValueChange={(v) => setButton(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Choose an offering" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">Nothing yet</SelectItem>
                {sellable.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.title} · {OFFERING_STATUS[o.status]?.label ?? o.status} · {ACCESS[o.access]?.label ?? o.access}
                    {Number(o.price_inr) > 0 ? ` · ₹${Number(o.price_inr).toLocaleString("en-IN")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {buttonOffering && (
              <p className="text-xs text-muted-foreground mt-1">
                {FORMAT[buttonOffering.product_tier ?? ""] ?? buttonOffering.product_tier} · {ACCESS[buttonOffering.access]?.hint}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Where it shows</Label>
              <Select value={listing} onValueChange={setListing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LISTING_ORDER.map((k) => (
                    <SelectItem key={k} value={k}>{LISTING[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{LISTING[listing]?.hint}</p>
            </div>
            <div>
              <Label>When someone taps its card</Label>
              <Select value={opens} onValueChange={setOpens}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="page">Show the page</SelectItem>
                  <SelectItem value="checkout">Go straight to the checkout</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Place in its row</Label>
              <Input type="number" value={position} onChange={(e) => setPosition(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Smaller comes first</p>
            </div>
            {listing === "featured" && (
              <>
                <div>
                  <Label>Carousel slot</Label>
                  <Input type="number" value={carouselPosition} onChange={(e) => setCarouselPosition(e.target.value)} placeholder="1–5" />
                </div>
                <div>
                  <Label>Carousel line (optional)</Label>
                  <Input value={carouselTitle} onChange={(e) => setCarouselTitle(e.target.value)} placeholder="Uses the page's headline" />
                </div>
              </>
            )}
          </div>

          <div>
            <Label>Card picture (optional)</Label>
            <Input value={cardImage} onChange={(e) => setCardImage(e.target.value)} placeholder="https://… (otherwise the offering's thumbnail or page design)" />
          </div>

          <div>
            <Label className="mb-1 block">Offerings under this page</Label>
            <p className="text-xs text-muted-foreground mb-2">
              For example every batch of a programme. People see only the one its button sells; the rest are grouped here so you can find them.
            </p>
            <div className="max-h-44 overflow-y-auto border border-border rounded-lg p-3 space-y-1.5">
              {offerings
                .filter((o) => o.status !== "draft" || under.has(o.id))
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={under.has(o.id) || o.id === button}
                      disabled={o.id === button}
                      onCheckedChange={(v) => setUnder((prev) => { const n = new Set(prev); if (v) n.add(o.id); else n.delete(o.id); return n; })}
                    />
                    <span className="flex-1 truncate">{o.title}</span>
                    <span className="text-xs text-muted-foreground">{OFFERING_STATUS[o.status]?.label}</span>
                  </label>
                ))}
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium mb-2">Ready to list {ready ? "✓" : ""}</p>
            <ul className="space-y-1">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-sm">
                  {c.ok
                    ? <CheckCircle2 className="h-4 w-4 text-[hsl(var(--accent-emerald))]" aria-label="done" />
                    : <Circle className="h-4 w-4 text-muted-foreground" aria-label="not yet" />}
                  <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
                </li>
              ))}
            </ul>
            {wantsListed && !ready && (
              <p className="text-xs text-[hsl(var(--destructive-text))] mt-2">It can't be Listed or Featured until every check is done. Choose Link only to save it now.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || (wantsListed && !ready)}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
