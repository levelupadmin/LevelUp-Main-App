import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import CertificatePreview from "@/components/certificates/CertificatePreview";
import "@/components/certificates/certificate.css";
import {
  callCertificates,
  designPublicUrl,
  fillLine,
  formatDay,
  needsDates,
  previewDesignPdf,
  SAMPLE_VALUES,
  type DateStyle,
} from "@/lib/certificates";
import { EMAIL_STATUS_LABEL, fetchDesigns, fetchOverview, fetchPeople, type PersonRow } from "./api";

type Filter = "all" | "eligible" | "not_issued" | "issued";
const CHUNK = 5;

const looksOff = (name: string | null) => !name || name.trim().length < 4 || !/\s/.test(name.trim());

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => String(THIS_YEAR - 4 + i));

/** "2026-09-01" → { m: "09", y: "2026" }; the day is never used. */
const splitMonth = (iso: string) => ({ m: iso ? iso.slice(5, 7) : "", y: iso ? iso.slice(0, 4) : "" });
const joinMonth = (m: string, y: string) => (m && y ? `${y}-${m}-01` : "");

function MonthPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { m, y } = splitMonth(value);
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <span>{label}</span>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <Select value={m} onValueChange={(nm) => onChange(joinMonth(nm, y || String(THIS_YEAR)))}>
          <SelectTrigger aria-label={`${label} month`}><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((name, i) => <SelectItem key={name} value={String(i + 1).padStart(2, "0")}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={y} onValueChange={(ny) => onChange(joinMonth(m || "01", ny))}>
          <SelectTrigger aria-label={`${label} year`}><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            {YEARS.map((yy) => <SelectItem key={yy} value={yy}>{yy}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default function CertIssue({ courseId, onCourse, onStudent }: { courseId: string | null; onCourse: (id: string) => void; onStudent: (userId: string) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const overview = useQuery({ queryKey: ["admin-cert-overview"], queryFn: fetchOverview });
  const designs = useQuery({ queryKey: ["admin-cert-designs"], queryFn: fetchDesigns });
  const people = useQuery({ queryKey: ["admin-cert-people", courseId], queryFn: () => fetchPeople(courseId!), enabled: !!courseId });
  const [filter, setFilter] = useState<Filter>("not_issued");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ start: string; end: string; line: string } | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  const course = overview.data?.find((r) => r.course_id === courseId) ?? null;
  const design = designs.data?.find((d) => d.id === course?.design_id) ?? null;
  const options = (overview.data ?? [])
    .filter((r) => r.design_id)
    .map((r) => ({ value: r.course_id, label: `${r.course_title}${r.product_tier === "live_cohort" ? " (cohort)" : ""}` }));

  // The batch box starts from what's saved on the course.
  useEffect(() => {
    if (!course) return;
    setBatch({
      start: course.period_start ?? "",
      end: course.period_end ?? "",
      line: course.line_text ?? "",
    });
  }, [course?.course_id, course?.period_start, course?.period_end, course?.date_style, course?.line_text]); // eslint-disable-line react-hooks/exhaustive-deps

  const designSentence = design?.line_template ?? course?.line_template ?? "";
  const hasLineField = !!design?.fields.some((f) => f.key === "line");
  const sentence = (batch?.line.trim() || designSentence).trim();
  const datesNeeded = needsDates(sentence);
  const printedLine = batch ? fillLine(sentence, { start: batch.start || null, end: batch.end || null, style: "month" as DateStyle }) : "";
  const batchDirty =
    !!course && !!batch &&
    (batch.start !== (course.period_start ?? "") ||
      batch.end !== (course.period_end ?? "") ||
      (course.date_style ?? "month") !== "month" ||
      batch.line.trim() !== (course.line_text ?? "").trim());
  const datesMissing = datesNeeded && (!batch?.start || !batch?.end);
  const datesBackwards = !!batch?.start && !!batch?.end && batch.end < batch.start;

  const rows = useMemo(() => {
    const list = people.data ?? [];
    return list.filter((p) => {
      const eligible = p.total > 0 && p.done >= p.needed;
      if (filter === "eligible") return eligible && !p.certificate_id;
      if (filter === "not_issued") return !p.certificate_id;
      if (filter === "issued") return !!p.certificate_id;
      return true;
    });
  }, [people.data, filter]);

  const nameFor = (p: PersonRow) => names[p.user_id] ?? p.full_name ?? "";
  const edited = (p: PersonRow) => names[p.user_id] != null && names[p.user_id].trim() !== (p.full_name ?? "").trim();
  const selectable = (p: PersonRow) => !p.certificate_id;
  const chosen = (people.data ?? []).filter((p) => picked.has(p.user_id));
  const below = chosen.filter((p) => !(p.total > 0 && p.done >= p.needed));
  const needsReason = course?.issue_mode === "auto" && below.length > 0;
  const noEmail = chosen.filter((p) => !p.email);
  const changedNames = chosen.filter(edited);
  const oddNames = chosen.filter((p) => looksOff(nameFor(p)));
  const emptyNames = chosen.filter((p) => nameFor(p).trim().length < 2);

  const toggleAll = (on: boolean) => setPicked(on ? new Set(rows.filter(selectable).map((p) => p.user_id)) : new Set());

  const saveBatch = async () => {
    if (!courseId || !batch) return true;
    if (!batchDirty) return true;
    setBatchBusy(true);
    try {
      await callCertificates({
        action: "admin_set_batch",
        course_id: courseId,
        start: batch.start || null,
        end: batch.end || null,
        style: "month",
        line_text: batch.line,
      });
      await qc.invalidateQueries({ queryKey: ["admin-cert-overview"] });
      return true;
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
      return false;
    } finally {
      setBatchBusy(false);
    }
  };

  const run = async () => {
    if (!courseId) return;
    if (!(await saveBatch())) return;
    const ids = chosen.map((p) => p.user_id);
    setProgress({ done: 0, total: ids.length });
    const tally: Record<string, number> = {};
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const sliceNames: Record<string, string> = {};
      for (const id of slice) {
        const p = chosen.find((c) => c.user_id === id);
        if (p && edited(p)) sliceNames[id] = nameFor(p).trim();
      }
      try {
        const r = await callCertificates<{ results: { result: string; email?: string }[] }>({
          action: "admin_issue",
          course_id: courseId,
          user_ids: slice,
          names: sliceNames,
          update_profile: saveToProfile,
          reason: reason.trim() || undefined,
        });
        for (const res of r.results) {
          const key = res.result === "issued" ? (res.email === "sent" ? "issued and emailed" : "issued, email not sent") : res.result.replace(/_/g, " ");
          tally[key] = (tally[key] ?? 0) + 1;
        }
      } catch (e) {
        const key = `error: ${(e as Error).message}`;
        tally[key] = (tally[key] ?? 0) + slice.length;
      }
      setProgress({ done: Math.min(ids.length, i + CHUNK), total: ids.length });
    }
    const text = Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(", ");
    setSummary(text);
    toast({ title: "Done", description: text });
    setPicked(new Set());
    setNames({});
    setConfirm(false);
    setProgress(null);
    setReason("");
    void qc.invalidateQueries({ queryKey: ["admin-cert-people", courseId] });
    void qc.invalidateQueries({ queryKey: ["admin-cert-overview"] });
    void qc.invalidateQueries({ queryKey: ["admin-cert-totals"] });
  };

  const previewName = chosen[0] ? nameFor(chosen[0]) : SAMPLE_VALUES.name;

  return (
    <div className="space-y-5">
      <div className="max-w-md">
        <label className="block text-sm font-medium mb-1">Course or batch</label>
        <SearchableSelect
          options={options}
          value={courseId ?? ""}
          onValueChange={(v) => { setPicked(new Set()); setNames({}); setSummary(null); onCourse(v); }}
          placeholder="Pick a course with a design"
          searchPlaceholder="Search courses…"
        />
        {options.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No course has a certificate design yet. Set one up in Designs.</p>}
      </div>

      {course && batch && (hasLineField || course.product_tier === "live_cohort") && (
        <div className="grid gap-5 rounded-lg border border-border bg-surface p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold">This batch</p>
              <p className="text-xs text-muted-foreground">Saved on the course and printed on every certificate you issue for it.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MonthPicker label="Start month" value={batch.start} onChange={(v) => setBatch({ ...batch, start: v })} />
              <MonthPicker label="End month" value={batch.end} onChange={(v) => setBatch({ ...batch, end: v })} />
            </div>
            {hasLineField ? (
              <>
                <label className="block text-xs text-muted-foreground">Wording for this batch (leave empty to use the design's)
                  <Textarea rows={3} value={batch.line} placeholder={designSentence || "conducted from {start} to {end}"} onChange={(e) => setBatch({ ...batch, line: e.target.value })} />
                </label>
                <p className="text-xs text-muted-foreground">{"{start}"} and {"{end}"} become the months above; wrap words in ** to make them bold.</p>
                <div className="rounded-md bg-background p-3 text-sm whitespace-pre-line">
                  <span className="text-xs text-muted-foreground block mb-1">Prints as</span>
                  {printedLine ? printedLine.replace(/\*\*/g, "") : <span className="text-muted-foreground">Nothing (no sentence on this design)</span>}
                </div>
              </>
            ) : (
              <p className="text-xs text-warning">This design has no place for the batch sentence yet, so the dates aren't printed. In Designs, open it, switch on Batch line and place it.</p>
            )}
            {datesMissing && <p className="text-xs text-warning">Pick the start and end month before issuing.</p>}
            {datesBackwards && <p className="text-xs text-destructive">The end month is before the start month.</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={!batchDirty || batchBusy || datesBackwards} onClick={async () => { if (await saveBatch()) toast({ title: "Batch saved" }); }}>
                {batchBusy ? "Saving…" : "Save batch"}
              </Button>
              {design && (
                <Button size="sm" variant="ghost" onClick={() => previewDesignPdf(design, { sample_name: previewName, line_text: sentence, start: batch.start, end: batch.end, style: "month" }).catch((e: Error) => toast({ title: e.message, variant: "destructive" }))}>
                  Preview the real PDF
                </Button>
              )}
            </div>
          </div>
          {design && (
            <CertificatePreview
              imageUrl={designPublicUrl(design.image_path)}
              width={design.image_width}
              height={design.image_height}
              fields={design.fields}
              values={{ ...SAMPLE_VALUES, name: previewName, line: printedLine }}
              alt="Preview"
            />
          )}
        </div>
      )}

      {course && !(hasLineField || course.product_tier === "live_cohort") && (
        <p className="text-sm text-muted-foreground">
          {course.issue_mode === "auto" ? `Auto at ${course.threshold}%: students get it themselves. Use this for people who need it sent by hand.` : "Team issues: tick the students who finished, then issue."}
        </p>
      )}

      {courseId && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(["not_issued", "eligible", "issued", "all"] as Filter[]).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                {f === "not_issued" ? "Not issued" : f === "eligible" ? "Past the pass mark" : f === "issued" ? "Issued" : "Everyone"}
              </Button>
            ))}
            <div className="flex-1" />
            <Button disabled={chosen.length === 0 || datesMissing || datesBackwards} onClick={() => setConfirm(true)}>Issue certificates ({chosen.length})</Button>
          </div>
          {summary && <p className="text-sm">Last run: {summary}</p>}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <Checkbox
                      checked={rows.some(selectable) && rows.filter(selectable).every((p) => picked.has(p.user_id))}
                      onCheckedChange={(v) => toggleAll(!!v)}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="text-left font-medium px-3 py-2 min-w-[220px]">Name as it will print</th>
                  <th className="text-left font-medium px-3 py-2">Progress</th>
                  <th className="text-left font-medium px-3 py-2">Email</th>
                  <th className="text-left font-medium px-3 py-2">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {people.isLoading && <tr><td colSpan={5} className="px-3 py-4 text-muted-foreground">Loading…</td></tr>}
                {!people.isLoading && rows.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-muted-foreground">Nobody here.</td></tr>}
                {rows.map((p) => (
                  <tr key={p.user_id} className="border-t border-border align-top">
                    <td className="px-3 py-2 pt-3">
                      <Checkbox
                        disabled={!selectable(p)}
                        checked={picked.has(p.user_id)}
                        onCheckedChange={(v) => {
                          const next = new Set(picked);
                          if (v) next.add(p.user_id); else next.delete(p.user_id);
                          setPicked(next);
                        }}
                        aria-label={`Select ${p.full_name ?? "student"}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {p.certificate_id ? (
                        <button type="button" className="font-medium hover:underline text-left" onClick={() => onStudent(p.user_id)}>
                          {p.name_on_certificate ?? p.full_name}
                        </button>
                      ) : (
                        <div className="space-y-1">
                          <Input
                            className="h-8"
                            value={nameFor(p)}
                            maxLength={60}
                            placeholder="Full name"
                            onChange={(e) => setNames({ ...names, [p.user_id]: e.target.value })}
                            aria-label={`Name for ${p.phone ?? "student"}`}
                          />
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {edited(p) && <Badge variant="outline" className="border-primary/40 text-primary">Changed</Badge>}
                            {!edited(p) && looksOff(nameFor(p)) && <Badge variant="outline" className="border-warning/40 text-warning">Check name</Badge>}
                            <button type="button" className="hover:underline" onClick={() => onStudent(p.user_id)}>{p.phone}</button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 pt-3 tabular-nums whitespace-nowrap">{p.done} of {p.total}</td>
                    <td className="px-3 py-2 pt-3 text-xs">{p.email ?? <span className="text-warning">Missing</span>}</td>
                    <td className="px-3 py-2 pt-3 text-xs">
                      {p.certificate_id ? (
                        <span>{p.certificate_number} · {EMAIL_STATUS_LABEL[p.email_status ?? "none"]}{p.last_emailed_at ? ` ${formatDay(p.last_emailed_at)}` : ""}</span>
                      ) : (
                        <span className="text-muted-foreground">Not issued</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={confirm} onOpenChange={(o) => !o && !progress && setConfirm(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue {chosen.length} certificate{chosen.length === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>{course?.course_title}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 text-sm">
            <li>{chosen.length - noEmail.length} will get the PDF by email now.</li>
            {printedLine && <li className="text-muted-foreground">Printed: "{printedLine.replace(/\*\*/g, "").replace(/\n/g, " ")}"</li>}
            {noEmail.length > 0 && <li className="text-warning">{noEmail.length} have no email. They'll see it in the app and can add an email there.</li>}
            {changedNames.length > 0 && (
              <li>
                {changedNames.length} name{changedNames.length === 1 ? "" : "s"} changed: {changedNames.map((p) => `${p.full_name ?? "No name"} → ${nameFor(p).trim()}`).join(", ")}.
              </li>
            )}
            {oddNames.length > 0 && (
              <li className="text-warning">
                Check {oddNames.length === 1 ? "this name" : "these names"}: {oddNames.map((p) => nameFor(p) || "No name").join(", ")}.
              </li>
            )}
            {emptyNames.length > 0 && <li className="text-destructive">{emptyNames.length} have no name and will be skipped.</li>}
            {below.length > 0 && <li>{below.length} {below.length === 1 ? "hasn't" : "haven't"} reached the pass mark.</li>}
          </ul>
          {changedNames.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={saveToProfile} onCheckedChange={(v) => setSaveToProfile(!!v)} />
              Also save the changed names to their profiles
            </label>
          )}
          {needsReason && <Textarea placeholder="Why issue below the pass mark? (kept on record)" value={reason} onChange={(e) => setReason(e.target.value)} />}
          {progress && <p className="text-sm">Working… {progress.done} of {progress.total}</p>}
          <DialogFooter>
            <Button disabled={!!progress || (needsReason && reason.trim().length < 3)} onClick={run}>
              {progress ? "Issuing…" : "Issue and email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
