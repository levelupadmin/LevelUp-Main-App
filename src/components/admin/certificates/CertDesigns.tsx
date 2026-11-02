import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import CertificatePreview from "@/components/certificates/CertificatePreview";
import "@/components/certificates/certificate.css";
import {
  DEFAULT_FIELD,
  DEFAULT_FIELDS,
  designPublicUrl,
  DESIGN_BUCKET,
  FIELD_LABELS,
  fillLine,
  FONT_LABELS,
  previewDesignPdf,
  SAMPLE_VALUES,
  type DesignField,
  type FieldKey,
  type FontKey,
} from "@/lib/certificates";
import { db, fetchDesigns, fetchOverview, type DesignRow, type OverviewRow } from "./api";

const FIELD_ORDER: FieldKey[] = ["name", "date", "number", "line", "verify", "qr"];
const MAX_SIDE = 3508;

interface Draft {
  id: string | null;
  name: string;
  kind: DesignRow["kind"];
  image_path: string;
  image_width: number;
  image_height: number;
  fields: DesignField[];
  line_template: string;
}

/** Turn any uploaded image into a JPEG (the PDF engine embeds JPEGs cheaply). */
async function toJpeg(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image we can read. Use PNG or JPG."));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    if (Math.max(width, height) < 1600) throw new Error("This image is small and will print blurry. Export it at least 2480 pixels on the long side.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser couldn't process the image.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't convert the image."))), "image/jpeg", 0.92),
    );
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function CertDesigns({ assignFor, onAssigned }: { assignFor: OverviewRow | null; onAssigned: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const designs = useQuery({ queryKey: ["admin-cert-designs"], queryFn: fetchDesigns });
  const overview = useQuery({ queryKey: ["admin-cert-overview"], queryFn: fetchOverview });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<FieldKey>("name");
  const [sampleName, setSampleName] = useState(SAMPLE_VALUES.name);
  const sampleStart = "2026-02-01";
  const sampleEnd = "2026-05-01";
  const [busy, setBusy] = useState<string | null>(null);
  const [assign, setAssign] = useState<{ design: DesignRow | null; courseId: string; mode: "auto" | "manual"; threshold: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Opened from the Overview's "Set up" button: start the assign step for that course.
  useEffect(() => {
    if (!assignFor) return;
    setAssign({
      design: null,
      courseId: assignFor.course_id,
      mode: assignFor.product_tier === "masterclass" ? "auto" : "manual",
      threshold: assignFor.threshold ?? 85,
    });
  }, [assignFor]);

  const usedBy = useMemo(() => {
    const map = new Map<string, OverviewRow[]>();
    for (const r of overview.data ?? []) {
      if (!r.design_id) continue;
      map.set(r.design_id, [...(map.get(r.design_id) ?? []), r]);
    }
    return map;
  }, [overview.data]);

  const field = draft?.fields.find((f) => f.key === selected) ?? null;
  const setField = (patch: Partial<DesignField>) =>
    setDraft((d) => (d ? { ...d, fields: d.fields.map((f) => (f.key === selected ? { ...f, ...patch } : f)) } : d));
  const toggleField = (key: FieldKey, on: boolean) =>
    setDraft((d) => {
      if (!d) return d;
      if (key === "name" && !on) return d;
      const has = d.fields.some((f) => f.key === key);
      if (on && !has) return { ...d, fields: [...d.fields, { ...DEFAULT_FIELD[key] }] };
      if (!on && has) return { ...d, fields: d.fields.filter((f) => f.key !== key) };
      return d;
    });

  const upload = async (file: File) => {
    setBusy("upload");
    try {
      const { blob, width, height } = await toJpeg(file);
      const path = `designs/${crypto.randomUUID()}.jpg`;
      const { error } = await db.storage.from(DESIGN_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw new Error(error.message);
      setDraft({
        id: null,
        name: file.name.replace(/\.[a-z0-9]+$/i, ""),
        kind: "masterclass",
        image_path: path,
        image_width: width,
        image_height: height,
        fields: DEFAULT_FIELDS.map((f) => ({ ...f })),
        line_template: "",
      });
      setSelected("name");
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast({ title: "Give the design a name.", variant: "destructive" });
      return;
    }
    setBusy("save");
    const row = {
      name: draft.name.trim(),
      kind: draft.kind,
      image_path: draft.image_path,
      image_width: draft.image_width,
      image_height: draft.image_height,
      fields: draft.fields,
      line_template: draft.line_template.trim() || null,
    };
    const { error } = draft.id
      ? await db.from("certificate_designs").update(row).eq("id", draft.id)
      : await db.from("certificate_designs").insert(row);
    setBusy(null);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Design saved", description: draft.id ? "New certificates use it from now on. Ones already issued keep their PDF." : undefined });
    setDraft(null);
    void qc.invalidateQueries({ queryKey: ["admin-cert-designs"] });
    void qc.invalidateQueries({ queryKey: ["admin-cert-overview"] });
  };

  const saveAssign = async () => {
    if (!assign?.design || !assign.courseId) return;
    setBusy("assign");
    const { error } = await db.from("certificate_templates").upsert(
      {
        course_id: assign.courseId,
        design_id: assign.design.id,
        issue_mode: assign.mode,
        completion_threshold: Math.min(100, Math.max(1, Math.round(assign.threshold || 85))),
        is_active: true,
        background_image_url: designPublicUrl(assign.design.image_path),
        variable_positions: [],
      },
      { onConflict: "course_id" },
    );
    setBusy(null);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Certificate set up",
      description: assign.mode === "auto" ? "From now on, anyone who reaches the pass mark gets it by email." : "Issue it from the Issue tab when the batch finishes.",
    });
    setAssign(null);
    onAssigned();
    void qc.invalidateQueries({ queryKey: ["admin-cert-overview"] });
  };

  const courseOptions = (overview.data ?? []).map((r) => ({
    value: r.course_id,
    label: `${r.course_title}${r.design_name ? ` · now: ${r.design_name}` : ""}`,
  }));

  // ── Editor ────────────────────────────────────────────────────────
  if (draft) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-xs bg-surface" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Design name" />
          <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as DesignRow["kind"] })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="masterclass">Masterclass</SelectItem>
              <SelectItem value="cohort">Live cohort</SelectItem>
              <SelectItem value="workshop">Workshop</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button variant="outline" disabled={busy === "pdf"} onClick={async () => {
            setBusy("pdf");
            try { await previewDesignPdf(draft, { sample_name: sampleName, line_text: draft.line_template, start: sampleStart, end: sampleEnd, style: "month" }); }
            catch (e) { toast({ title: (e as Error).message, variant: "destructive" }); }
            finally { setBusy(null); }
          }}>{busy === "pdf" ? "Making PDF…" : "Preview the real PDF"}</Button>
          <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          <Button disabled={busy === "save"} onClick={save}>{busy === "save" ? "Saving…" : "Save design"}</Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-2">
            <CertificatePreview
              imageUrl={designPublicUrl(draft.image_path)}
              width={draft.image_width}
              height={draft.image_height}
              fields={draft.fields}
              values={{ ...SAMPLE_VALUES, name: sampleName, line: fillLine(draft.line_template, { start: sampleStart, end: sampleEnd, style: "month" }) }}
              selected={selected}
              onPick={(p) => setField({ x: Number(p.x.toFixed(4)), y: Number(p.y.toFixed(4)) })}
            />
            <p className="text-xs text-muted-foreground">Pick a field on the right, then click on the certificate where its centre should sit. The QR is a stand-in here; the PDF has the real code.</p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">What gets printed</p>
              {FIELD_ORDER.map((key) => {
                const on = draft.fields.some((f) => f.key === key);
                return (
                  <div key={key} className={`flex items-center justify-between rounded-md border px-3 py-2 ${selected === key ? "border-primary" : "border-border"}`}>
                    <button type="button" className="text-sm text-left flex-1" disabled={!on} onClick={() => setSelected(key)}>
                      {FIELD_LABELS[key]}
                    </button>
                    <Switch checked={on} disabled={key === "name"} onCheckedChange={(v) => { toggleField(key, v); if (v) setSelected(key); }} aria-label={`Print ${FIELD_LABELS[key]}`} />
                  </div>
                );
              })}
            </div>

            {field && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="text-sm font-medium">{FIELD_LABELS[field.key]}</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-muted-foreground">Across %
                    <Input type="number" step="0.1" value={(field.x * 100).toFixed(1)} onChange={(e) => setField({ x: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })} />
                  </label>
                  <label className="text-xs text-muted-foreground">Down %
                    <Input type="number" step="0.1" value={(field.y * 100).toFixed(1)} onChange={(e) => setField({ y: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })} />
                  </label>
                </div>
                <label className="block text-xs text-muted-foreground">Size
                  <Slider className="mt-2" min={field.key === "qr" ? 30 : 5} max={field.key === "qr" ? 200 : 80} step={1}
                    value={[Math.round(field.size * 1000)]} onValueChange={([v]) => setField({ size: v / 1000 })} />
                </label>
                {field.key !== "qr" && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-muted-foreground">Font
                        <Select value={field.font ?? "sans"} onValueChange={(v) => setField({ font: v as FontKey })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(FONT_LABELS) as FontKey[]).map((k) => <SelectItem key={k} value={k}>{FONT_LABELS[k]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="text-xs text-muted-foreground">Line up
                        <Select value={field.align ?? "center"} onValueChange={(v) => setField({ align: v as DesignField["align"] })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="left">From the left</SelectItem>
                            <SelectItem value="center">Centred</SelectItem>
                            <SelectItem value="right">From the right</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 items-end">
                      <label className="text-xs text-muted-foreground">Colour
                        <Input type="color" className="h-9 p-1" value={field.color ?? "#111111"} onChange={(e) => setField({ color: e.target.value })} />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
                        <Switch checked={!!field.upper} onCheckedChange={(v) => setField({ upper: v })} /> Capitals
                      </label>
                    </div>
                    <label className="block text-xs text-muted-foreground">Text before it
                      <Input value={field.prefix ?? ""} placeholder="Certificate No. " onChange={(e) => setField({ prefix: e.target.value || undefined })} />
                    </label>
                    <label className="block text-xs text-muted-foreground">Widest it can get ({Math.round((field.maxWidth ?? 1) * 100)}% of the page)
                      <Slider className="mt-2" min={10} max={100} step={1} value={[Math.round((field.maxWidth ?? 1) * 100)]} onValueChange={([v]) => setField({ maxWidth: v / 100 })} />
                    </label>
                  </>
                )}
                {field.key === "qr" && (
                  <label className="block text-xs text-muted-foreground">Colour
                    <Input type="color" className="h-9 p-1" value={field.color ?? "#111111"} onChange={(e) => setField({ color: e.target.value })} />
                  </label>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs text-muted-foreground">Try a name
                <Input value={sampleName} onChange={(e) => setSampleName(e.target.value)} />
              </label>
              {draft.fields.some((f) => f.key === "line") && (
                <div className="space-y-2">
                  <label className="block text-xs text-muted-foreground">The sentence printed on it (same for every batch)
                    <Textarea rows={4} value={draft.line_template} onChange={(e) => setDraft({ ...draft, line_template: e.target.value })}
                      placeholder={"In recognition of the successful completion of LevelUp Learning's\n**12-week intensive Video Editing Cohort,** conducted from\n{start} to {end}."} />
                  </label>
                  <p className="text-xs text-muted-foreground">{"{start}"} and {"{end}"} become each batch's start and end month, picked on the Issue screen (the preview uses February 2026 to May 2026). Put ** around words to make them bold. A new line starts a new printed line.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Library ───────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button disabled={busy === "upload"} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4 mr-2" /> {busy === "upload" ? "Uploading…" : "Upload a new design"}
        </Button>
        <p className="text-xs text-muted-foreground">PNG or JPG with the name area left empty, at least 2480 pixels on the long side.</p>
      </div>

      {designs.data?.length === 0 && <p className="text-sm text-muted-foreground">No designs yet. Upload the first one.</p>}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {(designs.data ?? []).map((d) => {
          const used = usedBy.get(d.id) ?? [];
          return (
            <div key={d.id} className="rounded-lg border border-border bg-surface p-3 space-y-3">
              <CertificatePreview imageUrl={designPublicUrl(d.image_path)} width={d.image_width} height={d.image_height} fields={d.fields}
                values={{ ...SAMPLE_VALUES, line: fillLine(d.line_template ?? "", { start: "2026-02-02", end: "2026-05-16", style: "month" }) }} alt={d.name} />
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {used.length === 0 ? "Not used by any course yet" : `Used by ${used.map((u) => u.course_title).join(", ")}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setDraft({ id: d.id, name: d.name, kind: d.kind, image_path: d.image_path, image_width: d.image_width, image_height: d.image_height, fields: d.fields, line_template: d.line_template ?? "" }); setSelected("name"); }}>Edit</Button>
                <Button size="sm" onClick={() => setAssign({ design: d, courseId: "", mode: d.kind === "masterclass" ? "auto" : "manual", threshold: 85 })}>Use for a course</Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!assign} onOpenChange={(o) => !o && setAssign(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Use a design for a course</DialogTitle>
            <DialogDescription>One design can serve many batches. Each course picks its own rule and batch line.</DialogDescription>
          </DialogHeader>
          {assign && (
            <div className="space-y-3">
              <label className="block text-xs text-muted-foreground">Design
                <Select value={assign.design?.id ?? ""} onValueChange={(v) => setAssign({ ...assign, design: designs.data?.find((d) => d.id === v) ?? null })}>
                  <SelectTrigger><SelectValue placeholder="Pick a design" /></SelectTrigger>
                  <SelectContent>{(designs.data ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <div className="text-xs text-muted-foreground">Course or batch
                <SearchableSelect options={courseOptions} value={assign.courseId} onValueChange={(v) => setAssign({ ...assign, courseId: v })} placeholder="Pick a course" searchPlaceholder="Search courses…" />
              </div>
              <label className="block text-xs text-muted-foreground">How it's issued
                <Select value={assign.mode} onValueChange={(v) => setAssign({ ...assign, mode: v as "auto" | "manual" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatically at the pass mark (masterclasses)</SelectItem>
                    <SelectItem value="manual">The team issues it (live cohorts)</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {assign.mode === "auto" && (
                <label className="block text-xs text-muted-foreground">Pass mark (% of lessons marked done)
                  <Input type="number" min={1} max={100} value={assign.threshold} onChange={(e) => setAssign({ ...assign, threshold: Number(e.target.value) })} />
                </label>
              )}
              {assign.mode === "manual" && (
                <p className="text-xs text-muted-foreground">Batch dates are set on the Issue screen when you issue.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button disabled={!assign?.design || !assign?.courseId || busy === "assign"} onClick={saveAssign}>{busy === "assign" ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
