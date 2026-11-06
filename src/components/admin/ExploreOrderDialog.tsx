import { refreshStorefront } from "@/lib/storefrontCache";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROW_FORMATS, ROW_TITLE, renumber } from "@/lib/catalogue";

/*
 * Offerings → "Explore order": the Home carousel and the three rows exactly as
 * students see them, with arrows to reorder. Switching something on or off is
 * done in the offering itself ("Show on Explore").
 */

interface Row { pageId: string; offeringId: string; title: string; price: number; access: string; tier: string; listing: string; position: number; carousel: number | null }

async function load(): Promise<Row[]> {
  const { data: pages, error } = await supabase
    .from("pages")
    .select("id, listing, position, carousel_position, button_offering_id")
    .in("listing", ["listed", "featured"]);
  if (error) throw error;
  const ids = (pages ?? []).map((p) => p.button_offering_id).filter((x): x is string => !!x);
  const { data: offs } = ids.length
    ? await supabase.from("offerings").select("id, title, price_inr, access, product_tier, status").in("id", ids)
    : { data: [] as { id: string; title: string; price_inr: number; access: string; product_tier: string; status: string }[] };
  const byId = new Map((offs ?? []).map((o) => [o.id, o]));
  return (pages ?? []).flatMap((p) => {
    const o = p.button_offering_id ? byId.get(p.button_offering_id) : undefined;
    if (!o || o.status !== "active") return [];
    return [{ pageId: p.id, offeringId: o.id, title: o.title.trim(), price: Number(o.price_inr), access: o.access, tier: o.product_tier, listing: p.listing, position: p.position, carousel: p.carousel_position }];
  });
}

export function ExploreOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    try { setRows(await load()); } catch (e) { toast.error((e as Error).message); }
  }, []);
  useEffect(() => { if (open) void reload(); }, [open, reload]);

  const move = async (list: Row[], i: number, dir: -1 | 1, carousel: boolean) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setBusy(true);
    const results = await Promise.all(renumber(next.map((r) => ({ id: r.pageId }))).map((r) =>
      supabase.from("pages").update(carousel ? { carousel_position: r.position / 10 } : { position: r.position }).eq("id", r.id)));
    setBusy(false);
    const bad = results.find((r) => r.error);
    if (bad?.error) toast.error(`Order not saved: ${bad.error.message}`);
    refreshStorefront();
    await reload();
  };

  const groups = rows ? [
    { key: "carousel", title: "Home carousel", carousel: true, list: rows.filter((r) => r.listing === "featured").sort((a, b) => (a.carousel ?? 99) - (b.carousel ?? 99)) },
    ...ROW_FORMATS.map((t) => ({ key: t, title: ROW_TITLE[t], carousel: false, list: rows.filter((r) => r.tier === t).sort((a, b) => a.position - b.position) })),
  ] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Explore order {busy && <Loader2 className="inline h-4 w-4 ml-2 animate-spin" />}</DialogTitle>
          <DialogDescription>What students see on Home and Explore, in this order. To add or remove something, open the offering and change "Show on Explore".</DialogDescription>
        </DialogHeader>
        {!rows ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.key}>
                <p className="text-sm font-medium mb-2">{g.title} <span className="text-muted-foreground font-normal">· {g.list.length}</span></p>
                {!g.list.length && <p className="text-sm text-muted-foreground">Nothing here yet.</p>}
                <ol className="space-y-1">
                  {g.list.map((r, i) => (
                    <li key={r.pageId} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm">
                      <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="flex-1 min-w-0 truncate">{r.title}
                        <span className="text-muted-foreground"> · {r.access === "apply" ? "Apply" : r.price > 0 ? `₹${r.price.toLocaleString("en-IN")}` : "Free"}</span>
                      </span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move ${r.title} up`} disabled={i === 0 || busy} onClick={() => void move(g.list, i, -1, g.carousel)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move ${r.title} down`} disabled={i === g.list.length - 1 || busy} onClick={() => void move(g.list, i, 1, g.carousel)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
