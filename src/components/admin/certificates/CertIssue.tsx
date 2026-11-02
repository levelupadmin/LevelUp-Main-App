import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { callCertificates, formatDay } from "@/lib/certificates";
import { EMAIL_STATUS_LABEL, fetchOverview, fetchPeople, type PersonRow } from "./api";

type Filter = "all" | "eligible" | "not_issued" | "issued";
const CHUNK = 5;

const looksOff = (name: string | null) => !name || name.trim().length < 4 || !/\s/.test(name.trim());

export default function CertIssue({ courseId, onCourse, onStudent }: { courseId: string | null; onCourse: (id: string) => void; onStudent: (userId: string) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const overview = useQuery({ queryKey: ["admin-cert-overview"], queryFn: fetchOverview });
  const people = useQuery({ queryKey: ["admin-cert-people", courseId], queryFn: () => fetchPeople(courseId!), enabled: !!courseId });
  const [filter, setFilter] = useState<Filter>("not_issued");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const course = overview.data?.find((r) => r.course_id === courseId) ?? null;
  const options = (overview.data ?? [])
    .filter((r) => r.design_id)
    .map((r) => ({ value: r.course_id, label: `${r.course_title}${r.product_tier === "live_cohort" ? " (cohort)" : ""}` }));

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

  const selectable = (p: PersonRow) => !p.certificate_id;
  const chosen = (people.data ?? []).filter((p) => picked.has(p.user_id));
  const below = chosen.filter((p) => !(p.total > 0 && p.done >= p.needed));
  const needsReason = course?.issue_mode === "auto" && below.length > 0;
  const noEmail = chosen.filter((p) => !p.email);
  const oddNames = chosen.filter((p) => looksOff(p.full_name));

  const toggleAll = (on: boolean) => setPicked(on ? new Set(rows.filter(selectable).map((p) => p.user_id)) : new Set());

  const run = async () => {
    if (!courseId) return;
    const ids = chosen.map((p) => p.user_id);
    setProgress({ done: 0, total: ids.length });
    const tally: Record<string, number> = {};
    for (let i = 0; i < ids.length; i += CHUNK) {
      try {
        const r = await callCertificates<{ results: { result: string; email?: string }[] }>({
          action: "admin_issue",
          course_id: courseId,
          user_ids: ids.slice(i, i + CHUNK),
          reason: reason.trim() || undefined,
        });
        for (const res of r.results) {
          const key = res.result === "issued" ? (res.email === "sent" ? "issued and emailed" : "issued, email not sent") : res.result.replace(/_/g, " ");
          tally[key] = (tally[key] ?? 0) + 1;
        }
      } catch (e) {
        tally[`error: ${(e as Error).message}`] = (tally[`error: ${(e as Error).message}`] ?? 0) + Math.min(CHUNK, ids.length - i);
      }
      setProgress({ done: Math.min(ids.length, i + CHUNK), total: ids.length });
    }
    const text = Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(", ");
    setSummary(text);
    toast({ title: "Done", description: text });
    setPicked(new Set());
    setConfirm(false);
    setProgress(null);
    setReason("");
    void qc.invalidateQueries({ queryKey: ["admin-cert-people", courseId] });
    void qc.invalidateQueries({ queryKey: ["admin-cert-overview"] });
    void qc.invalidateQueries({ queryKey: ["admin-cert-totals"] });
  };

  return (
    <div className="space-y-5">
      <div className="max-w-md">
        <label className="block text-sm font-medium mb-1">Course or batch</label>
        <SearchableSelect
          options={options}
          value={courseId ?? ""}
          onValueChange={(v) => { setPicked(new Set()); setSummary(null); onCourse(v); }}
          placeholder="Pick a course with a design"
          searchPlaceholder="Search courses…"
        />
        {options.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No course has a certificate design yet. Set one up in Designs.</p>}
      </div>

      {course && (
        <p className="text-sm text-muted-foreground">
          {course.issue_mode === "auto" ? `Auto at ${course.threshold}%: students get it themselves. Use this for people who need it sent by hand.` : "Team issues: tick the students who finished, then issue."}
          {course.line_text ? ` Batch line: "${course.line_text.replace(/\n/g, " ")}"` : ""}
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
            <Button disabled={chosen.length === 0} onClick={() => setConfirm(true)}>Issue certificates ({chosen.length})</Button>
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
                  <th className="text-left font-medium px-3 py-2">Name as it will print</th>
                  <th className="text-left font-medium px-3 py-2">Progress</th>
                  <th className="text-left font-medium px-3 py-2">Email</th>
                  <th className="text-left font-medium px-3 py-2">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {people.isLoading && <tr><td colSpan={5} className="px-3 py-4 text-muted-foreground">Loading…</td></tr>}
                {!people.isLoading && rows.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-muted-foreground">Nobody here.</td></tr>}
                {rows.map((p) => (
                  <tr key={p.user_id} className="border-t border-border">
                    <td className="px-3 py-2">
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
                      <button type="button" className="font-medium hover:underline text-left" onClick={() => onStudent(p.user_id)}>
                        {p.name_on_certificate ?? p.full_name ?? "No name"}
                      </button>
                      {!p.certificate_id && looksOff(p.full_name) && <Badge variant="outline" className="ml-2 border-warning/40 text-warning">Check name</Badge>}
                      <div className="text-xs text-muted-foreground">{p.phone}</div>
                    </td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{p.done} of {p.total}</td>
                    <td className="px-3 py-2 text-xs">{p.email ?? <span className="text-warning">Missing</span>}</td>
                    <td className="px-3 py-2 text-xs">
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
            {noEmail.length > 0 && <li className="text-warning">{noEmail.length} have no email. They'll see it in the app and can add an email there.</li>}
            {oddNames.length > 0 && (
              <li className="text-warning">
                Check {oddNames.length === 1 ? "this name" : "these names"}: {oddNames.map((p) => p.full_name || "No name").join(", ")}. Names with no surname print as they are; accounts with no name are skipped.
              </li>
            )}
            {below.length > 0 && <li>{below.length} {below.length === 1 ? "hasn't" : "haven't"} reached the pass mark.</li>}
          </ul>
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
