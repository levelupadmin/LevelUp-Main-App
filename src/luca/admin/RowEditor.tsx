import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db, fromForm, toForm, userIdByEmail, type Field, type Row } from "./db";

export const inputCls = "w-full h-9 px-3 rounded-md bg-background border border-border text-sm focus:outline-none focus:border-foreground/40";
export const areaCls = "w-full min-h-[84px] px-3 py-2 rounded-md bg-background border border-border text-sm font-mono focus:outline-none focus:border-foreground/40";
export const btnCls = "inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium disabled:opacity-50";
export const primaryCls = `${btnCls} bg-cream text-cream-text`;
export const ghostCls = `${btnCls} border border-border text-muted-foreground hover:text-foreground`;

export interface Ctx {
  tz: string;
  mentors: { id: string; name: string }[];
  sessions: { id: string; title: string; starts_at: string }[];
}

/** One field, by type. */
export function FieldInput({ f, value, onChange, ctx }: { f: Field; value: string | boolean; onChange: (v: string | boolean) => void; ctx: Ctx }) {
  const [email, setEmail] = useState("");
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<string | null>(null);
  const v = value as string;
  switch (f.type) {
    case "bool":
      return <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />{f.label}</label>;
    case "textarea": case "json": case "lines":
      return <textarea className={areaCls} rows={f.type === "json" ? 8 : 3} value={v} onChange={(e) => onChange(e.target.value)} spellCheck={f.type !== "json"} />;
    case "select":
      return <select className={inputCls} value={v} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{(f.options ?? []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
    case "session":
      return (
        <select className={inputCls} value={v} onChange={(e) => onChange(e.target.value)}>
          <option value="">Next review after the deadline (automatic)</option>
          {ctx.sessions.map((s) => <option key={s.id} value={s.id}>{new Date(s.starts_at).toLocaleDateString("en-IN", { timeZone: ctx.tz, day: "numeric", month: "short" })} · {s.title}</option>)}
        </select>
      );
    case "mentors": {
      const on = new Set(v ? v.split(",") : []);
      return (
        <div className="flex flex-wrap gap-2">
          {ctx.mentors.map((m) => (
            <label key={m.id} className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs cursor-pointer ${on.has(m.id) ? "border-foreground/60 text-foreground" : "border-border text-muted-foreground"}`}>
              <input type="checkbox" className="hidden" checked={on.has(m.id)} onChange={() => { const n = new Set(on); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); onChange([...n].join(",")); }} />{m.name}
            </label>
          ))}
          {!ctx.mentors.length ? <span className="text-xs text-muted-foreground">Add mentors first.</span> : null}
        </div>
      );
    }
    case "user":
      return (
        <div className="flex gap-2 items-center flex-wrap">
          <input className={inputCls} style={{ maxWidth: 320 }} placeholder="Their LevelUp account email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="button" className={ghostCls} disabled={!email.trim() || looking} onClick={async () => {
            setLooking(true);
            try {
              const u = await userIdByEmail(email);
              if (u) { onChange(u.id); setFound(u.name); } else setFound("No account with that email");
            } catch (e) { setFound(`Couldn't look that up: ${(e as Error).message}`); }
            finally { setLooking(false); }
          }}>{looking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Link"}</button>
          {v ? <span className="text-xs text-muted-foreground">Linked{found ? `: ${found}` : ""} · <button type="button" className="underline" onClick={() => { onChange(""); setFound(null); }}>unlink</button></span> : found ? <span className="text-xs text-muted-foreground">{found}</span> : null}
        </div>
      );
    default:
      return <input className={inputCls} type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : "text"} value={v} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Fields laid out two-up, with labels and hints. */
export function FieldGrid({ fields, form, set, ctx }: { fields: Field[]; form: Record<string, string | boolean>; set: (k: string, v: string | boolean) => void; ctx: Ctx }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key} className={f.wide || ["textarea", "json", "lines", "mentors", "user"].includes(f.type) ? "sm:col-span-2" : ""}>
          {f.type !== "bool" ? <div className="text-xs font-medium text-muted-foreground mb-1">{f.label}{f.required ? " *" : ""}</div> : null}
          <FieldInput f={f} value={form[f.key] ?? ""} onChange={(v) => set(f.key, v)} ctx={ctx} />
          {f.hint ? <div className="text-[11px] text-muted-foreground mt-1">{f.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

function RowItem({ table, row, fields, title, sub, ctx, onChange }: {
  table: string; row: Row; fields: Field[]; title: (r: Row) => string; sub?: (r: Row) => string; ctx: Ctx; onChange: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const initial = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, toForm(f, row[f.key], ctx.tz)])), [row, fields, ctx.tz]);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const save = async () => {
    let patch: Record<string, unknown>;
    try { patch = Object.fromEntries(fields.map((f) => [f.key, fromForm(f, form[f.key], ctx.tz)])); }
    catch (e) { toast({ title: (e as Error).message, variant: "destructive" }); return; }
    setBusy(true);
    const { error } = await db.from(table).update(patch).eq("id", row.id);
    setBusy(false);
    if (error) toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    else { toast({ title: "Saved" }); onChange(); }
  };
  const del = async () => {
    if (!window.confirm(`Delete "${title(row)}"? This can't be undone.`)) return;
    const { error } = await db.from(table).delete().eq("id", row.id);
    if (error) toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
    else onChange();
  };

  return (
    <div className="border border-border rounded-lg bg-surface">
      <button type="button" className="w-full flex items-center gap-2 px-4 py-3 text-left" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{title(row)}</span>{sub ? <span className="block text-xs text-muted-foreground truncate">{sub(row)}</span> : null}</span>
        {dirty ? <span className="text-[10px] uppercase tracking-wider text-amber-400">unsaved</span> : null}
      </button>
      {open ? (
        <div className="px-4 pb-4 space-y-3">
          <FieldGrid fields={fields} form={form} set={(k, v) => setForm((x) => ({ ...x, [k]: v }))} ctx={ctx} />
          <div className="flex gap-2 justify-end">
            <button type="button" className={ghostCls} onClick={del}><Trash2 className="h-3.5 w-3.5" />Delete</button>
            <button type="button" className={primaryCls} disabled={!dirty || busy} onClick={save}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A list of rows of one table for one program: expand to edit, add new. */
export function RowList({ table, programId, fields, order, title, sub, ctx, blank, onChange, note }: {
  table: string; programId: string; fields: Field[]; order: [string, boolean][];
  title: (r: Row) => string; sub?: (r: Row) => string; ctx: Ctx;
  blank: () => Record<string, unknown> | Promise<Record<string, unknown>>; onChange?: () => void; note?: string;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = async () => {
    let q = db.from(table).select("*").eq("program_id", programId);
    for (const [k, asc] of order) q = q.order(k, { ascending: asc });
    const { data, error } = await q;
    if (error) toast({ title: `Couldn't load ${table}`, description: error.message, variant: "destructive" });
    setRows((data as Row[]) ?? []);
  };
  useEffect(() => { void load(); }, [table, programId]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = () => { void load(); onChange?.(); };
  const add = async () => {
    const { error } = await db.from(table).insert({ program_id: programId, ...(await blank()) });
    if (error) toast({ title: "Couldn't add", description: error.message, variant: "destructive" });
    else changed();
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {note ? <p className="text-xs text-muted-foreground flex-1">{note}</p> : <span className="flex-1" />}
        <button type="button" className={primaryCls} onClick={add}><Plus className="h-3.5 w-3.5" />Add</button>
      </div>
      {rows === null ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        : rows.length ? rows.map((r) => <RowItem key={r.id} table={table} row={r} fields={fields} title={title} sub={sub} ctx={ctx} onChange={changed} />)
        : <div className="border border-border rounded-lg p-8 text-center text-sm text-muted-foreground bg-surface">Nothing here yet.</div>}
    </div>
  );
}
