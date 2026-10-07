import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { ExternalLink, Loader2, Plus, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import usePageTitle from "@/hooks/usePageTitle";
import { db, type ProgramRow } from "./db";
import { ghostCls, inputCls, primaryCls } from "./RowEditor";
import ProgramEditor from "./ProgramEditor";

interface Offering { id: string; title: string; status: string; payment_mode: string | null; price_inr: number | null; confirmation_amount_inr: number | null; app_fee_inr: number | null }

/** /admin/luca — every LUCA cohort, and a way to start a new one. */
function ProgramList() {
  usePageTitle("LUCA cohorts");
  const { toast } = useToast();
  const nav = useNavigate();
  const [rows, setRows] = useState<ProgramRow[] | null>(null);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ offering_id: "", slug: "", name: "", short_name: "", cohort_label: "", template: true });

  useEffect(() => {
    void (async () => {
      const [p, o] = await Promise.all([
        db.from("luca_programs").select("*").order("is_demo").order("created_at", { ascending: false }),
        db.from("offerings").select("id, title, status, payment_mode, price_inr, confirmation_amount_inr, app_fee_inr").order("created_at", { ascending: false }),
      ]);
      if (p.error) toast({ title: "Couldn't load cohorts", description: p.error.message, variant: "destructive" });
      setRows((p.data as ProgramRow[]) ?? []);
      setOfferings((o.data as Offering[]) ?? []);
    })();
  }, [toast]);

  const create = async () => {
    if (!form.offering_id || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(form.slug) || !form.name.trim()) {
      toast({ title: "Pick an offering, and give it a name and a slug (lowercase, numbers, dashes)", variant: "destructive" });
      return;
    }
    setBusy(true);
    let template: Partial<ProgramRow> = {};
    if (form.template) {
      const { data } = await db.from("luca_programs").select("content, coin_rules, features, sprint, clan_config").eq("is_demo", true).limit(1).maybeSingle();
      if (data) {
        const content = { ...(data.content as Record<string, unknown>) };
        delete content.demo;
        template = { content, coin_rules: data.coin_rules, features: data.features, sprint: { ...(data.sprint as ProgramRow["sprint"]), starts_on: null }, clan_config: { ...(data.clan_config as ProgramRow["clan_config"]), reveal_at: null } };
      }
    }
    const { data, error } = await db.from("luca_programs").insert({
      offering_id: form.offering_id, slug: form.slug, name: form.name.trim(), short_name: form.short_name.trim(),
      cohort_label: form.cohort_label.trim(), is_demo: false, enabled: false, ...template,
    }).select("id").single();
    setBusy(false);
    if (error) {
      const msg = /offering_uniq/.test(error.message) ? "That offering already has a LUCA cohort. Each cohort run needs its own offering."
        : /slug/.test(error.message) ? "That slug is taken. Pick another." : error.message;
      toast({ title: "Couldn't create", description: msg, variant: "destructive" });
      return;
    }
    toast({ title: "Cohort created", description: "It's off until you enable it, and staff-only until the LUCA switch is on." });
    nav(`/admin/luca/${data.id}`);
  };

  const offeringOf = (id: string | null) => offerings.find((o) => o.id === id);
  // One LUCA cohort per offering (luca_programs_offering_uniq): each run of a cohort is its own offering.
  const taken = new Set((rows ?? []).map((r) => r.offering_id).filter(Boolean) as string[]);
  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5" />LUCA cohorts</h1>
          <p className="text-sm text-muted-foreground mt-1">Live cohorts in the LUCA app. Each one sits on an offering, which sets the price. Nothing here is visible to learners until the cohort is enabled and the LUCA switch is on (see LUCA-LAUNCH.md).</p>
        </div>
        <button type="button" className={primaryCls} onClick={() => setCreating(!creating)}><Plus className="h-4 w-4" />New cohort</button>
      </div>

      {creating ? (
        <div className="border border-border rounded-lg bg-surface p-4 mb-6 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="block text-xs text-muted-foreground mb-1">Offering (sets the price, deposit and application fee) *</span>
              <select className={inputCls} value={form.offering_id} onChange={(e) => setForm({ ...form, offering_id: e.target.value })}>
                <option value="">Pick an offering</option>
                {offerings.map((o) => <option key={o.id} value={o.id} disabled={taken.has(o.id)}>{o.title} · {o.status}{o.payment_mode === "staged" ? " · staged" : " · NOT staged"}{o.price_inr ? ` · ₹${Number(o.price_inr).toLocaleString("en-IN")}` : ""}{o.confirmation_amount_inr ? ` · deposit ₹${Number(o.confirmation_amount_inr).toLocaleString("en-IN")}` : ""}{taken.has(o.id) ? " · already has a LUCA cohort" : ""}</option>)}
              </select>
            </label>
            <label><span className="block text-xs text-muted-foreground mb-1">Name *</span><input className={inputCls} value={form.name} placeholder="The LevelUp Creator Academy" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label><span className="block text-xs text-muted-foreground mb-1">Slug (the link: /luca/slug) *</span><input className={inputCls} value={form.slug} placeholder="luca-c03" onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} /></label>
            <label><span className="block text-xs text-muted-foreground mb-1">Short name</span><input className={inputCls} value={form.short_name} placeholder="LUCA" onChange={(e) => setForm({ ...form, short_name: e.target.value })} /></label>
            <label><span className="block text-xs text-muted-foreground mb-1">Cohort label</span><input className={inputCls} value={form.cohort_label} placeholder="Cohort 03" onChange={(e) => setForm({ ...form, cohort_label: e.target.value })} /></label>
          </div>
          {form.offering_id && offerings.find((o) => o.id === form.offering_id)?.payment_mode !== "staged" ? (
            <p className="text-xs text-amber-400">This offering isn&apos;t set to staged payments (fee, deposit, balance). LUCA won&apos;t take any payment on it until it is; change it in the offering.</p>
          ) : null}
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.template} onChange={(e) => setForm({ ...form, template: e.target.checked })} />Start from the demo cohort&apos;s copy, coin values and features (then edit them)</label>
          <div className="flex gap-2 justify-end">
            <button type="button" className={ghostCls} onClick={() => setCreating(false)}>Cancel</button>
            <button type="button" className={primaryCls} disabled={busy} onClick={create}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Create</button>
          </div>
        </div>
      ) : null}

      {rows === null ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="border border-border rounded-lg divide-y divide-border bg-surface">
          {rows.map((p) => {
            const o = offeringOf(p.offering_id);
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Link to={`/admin/luca/${p.id}`} className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{p.name} {p.cohort_label ? <span className="text-muted-foreground">· {p.cohort_label}</span> : null}</span>
                  <span className="block text-xs text-muted-foreground truncate">/luca/{p.slug}{o ? ` · ${o.title}` : p.is_demo ? " · demo (staff only, sample data)" : ""}</span>
                </Link>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${p.is_demo ? "bg-purple-500/20 text-purple-300" : p.enabled ? "bg-green-500/20 text-green-300" : "bg-zinc-500/20 text-zinc-400"}`}>{p.is_demo ? "demo" : p.enabled ? "enabled" : "off"}</span>
                <a className={ghostCls} href={`/luca/${p.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />Open</a>
              </div>
            );
          })}
          {!rows.length ? <div className="p-8 text-center text-sm text-muted-foreground">No LUCA cohorts yet.</div> : null}
        </div>
      )}
    </div>
  );
}

export default function AdminLuca() {
  return (
    <Routes>
      <Route index element={<ProgramList />} />
      <Route path=":id/*" element={<ProgramEditor />} />
    </Routes>
  );
}
