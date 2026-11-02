import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { callCertificates, downloadCertificate, formatDay } from "@/lib/certificates";
import { db, EMAIL_STATUS_LABEL, EVENT_LABEL, fetchEvents, fetchStudent, type StudentCourseRow } from "./api";

interface Person { id: string; full_name: string | null; email: string | null; phone: string | null }

type Dialogs =
  | { kind: "issue"; row: StudentCourseRow; below: boolean }
  | { kind: "resend"; row: StudentCourseRow }
  | { kind: "rename"; row: StudentCourseRow }
  | { kind: "revoke"; row: StudentCourseRow }
  | { kind: "history"; row: StudentCourseRow }
  | null;

export default function CertStudent({ initialUserId }: { initialUserId?: string | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Person[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!initialUserId) return;
    void db.from("users").select("id, full_name, email, phone").eq("id", initialUserId).maybeSingle()
      .then(({ data }: { data: Person | null }) => data && setPerson(data));
  }, [initialUserId]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setMatches([]);
      return;
    }
    const t = setTimeout(async () => {
      const digits = term.replace(/\D/g, "");
      const like = `%${term.replace(/[%,()]/g, "")}%`;
      const ors = [`full_name.ilike.${like}`, `email.ilike.${like}`];
      if (digits.length >= 4) ors.push(`phone.ilike.%${digits.slice(-10)}%`);
      const { data } = await db.from("users").select("id, full_name, email, phone").or(ors.join(",")).limit(8);
      setMatches((data ?? []) as Person[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const courses = useQuery({
    queryKey: ["admin-cert-student", person?.id],
    queryFn: () => fetchStudent(person!.id),
    enabled: !!person,
  });
  const history = useQuery({
    queryKey: ["admin-cert-events", dialog?.kind === "history" ? dialog.row.certificate_id : null],
    queryFn: () => fetchEvents((dialog as { row: StudentCourseRow }).row.certificate_id!),
    enabled: dialog?.kind === "history" && !!dialog.row.certificate_id,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-cert-student", person?.id] });
    void qc.invalidateQueries({ queryKey: ["admin-cert-overview"] });
    void qc.invalidateQueries({ queryKey: ["admin-cert-totals"] });
  };

  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      const msg = await fn();
      toast({ title: msg });
      setDialog(null);
      setText("");
      refresh();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const emailWord = (s?: string) =>
    s === "sent" ? "and emailed" : s === "no_email" ? "(no email on file)" : s === "skipped" ? "(email not sent on the test site)" : s === "waiting" ? "(email waiting)" : s === "failed" ? "(email failed)" : "";

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 bg-surface border-border" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        {matches.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  setPerson(m);
                  setMatches([]);
                  setQ("");
                }}
              >
                <span className="font-medium">{m.full_name || "No name"}</span>
                <span className="ml-2 text-xs text-muted-foreground">{[m.phone, m.email].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!person && <p className="text-sm text-muted-foreground">Search for a student to see their progress and certificates.</p>}

      {person && (
        <div className="space-y-3">
          <div>
            <p className="font-semibold">{person.full_name || "No name on the account"}</p>
            <p className="text-xs text-muted-foreground">{[person.phone, person.email].filter(Boolean).join(" · ") || "No contact details"}</p>
          </div>
          {courses.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {courses.data?.length === 0 && <p className="text-sm text-muted-foreground">This student has no active courses.</p>}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Course</th>
                  <th className="text-left font-medium px-3 py-2">Progress</th>
                  <th className="text-left font-medium px-3 py-2">Certificate</th>
                  <th className="text-left font-medium px-3 py-2">Email</th>
                  <th className="text-right font-medium px-3 py-2">Re-sends (48h)</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(courses.data ?? []).map((r) => {
                  const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
                  const eligible = r.total > 0 && r.done >= r.needed;
                  return (
                    <tr key={r.course_id} className="border-t border-border align-top">
                      <td className="px-3 py-2 max-w-[240px]"><div className="font-medium">{r.course_title}</div></td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.done} of {r.total} · {pct}%</td>
                      <td className="px-3 py-2">
                        {r.certificate_id ? (
                          <div className="space-y-1">
                            <Badge variant="outline" className={r.cert_status === "revoked" ? "border-destructive/40 text-destructive" : "border-success/40 text-success"}>
                              {r.certificate_number}{r.cert_status === "revoked" ? " · cancelled" : ""}
                            </Badge>
                            <div className="text-xs text-muted-foreground">{r.name_on_certificate} · {formatDay(r.issued_at)}</div>
                          </div>
                        ) : !r.template_ready ? (
                          <span className="text-xs text-muted-foreground">No design set up</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{eligible ? "Earned, not issued yet" : `Needs ${r.needed} lessons`}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.certificate_id ? (
                          <div>
                            <div>{EMAIL_STATUS_LABEL[r.email_status ?? "none"] ?? r.email_status}{r.email_to ? ` · ${r.email_to}` : ""}</div>
                            {r.last_emailed_at && <div className="text-muted-foreground">{formatDay(r.last_emailed_at)}</div>}
                            {r.email_status === "failed" && r.last_email_error && <div className="text-destructive">{r.last_email_error}</div>}
                          </div>
                        ) : "–"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.certificate_id ? `${r.resends_48h} of 2` : "–"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {!r.certificate_id && r.template_ready && (
                            <Button size="sm" onClick={() => { setText(""); setDialog({ kind: "issue", row: r, below: !eligible && r.issue_mode === "auto" }); }}>
                              {eligible || r.issue_mode === "manual" ? "Issue and email" : "Issue anyway"}
                            </Button>
                          )}
                          {r.certificate_id && r.cert_status === "valid" && (
                            <>
                              <Button size="sm" onClick={() => { setText(r.email_to ?? person.email ?? ""); setDialog({ kind: "resend", row: r }); }}>Send email again</Button>
                              <Button size="sm" variant="outline" onClick={() => act(async () => { await downloadCertificate(r.certificate_id!, { admin: true }); return "Download started"; })}>Download</Button>
                              <Button size="sm" variant="outline" onClick={() => { setText(r.name_on_certificate ?? ""); setDialog({ kind: "rename", row: r }); }}>Fix name</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setText(""); setDialog({ kind: "revoke", row: r }); }}>Cancel</Button>
                            </>
                          )}
                          {r.certificate_id && r.cert_status === "revoked" && (
                            <Button size="sm" variant="outline" onClick={() => act(async () => { await callCertificates({ action: "admin_restore", certificate_id: r.certificate_id }); return "Certificate restored"; })}>Restore</Button>
                          )}
                          {r.certificate_id && <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "history", row: r })}>History</Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg">
          {dialog?.kind === "issue" && (
            <>
              <DialogHeader>
                <DialogTitle>Issue certificate</DialogTitle>
                <DialogDescription>
                  {dialog.row.course_title}. {dialog.below
                    ? `They've done ${dialog.row.done} of ${dialog.row.needed} needed lessons, so say why you're issuing it anyway.`
                    : "It's made now and emailed if they have an email."}
                </DialogDescription>
              </DialogHeader>
              {dialog.below && <Textarea placeholder="Reason (kept on record)" value={text} onChange={(e) => setText(e.target.value)} />}
              <DialogFooter>
                <Button
                  disabled={busy || (dialog.below && text.trim().length < 3)}
                  onClick={() => act(async () => {
                    const r = await callCertificates<{ results: { result: string; number?: string; email?: string; error?: string }[] }>({
                      action: "admin_issue", course_id: dialog.row.course_id, user_ids: [person!.id], reason: text.trim() || undefined,
                    });
                    const res = r.results[0];
                    if (res?.result !== "issued") throw new Error(res?.result === "need_name" ? "This account has no usable name. Add their name in Users first." : res?.error ?? `Not issued (${res?.result})`);
                    return `Issued ${res.number} ${emailWord(res.email)}`;
                  })}
                >
                  {busy ? "Issuing…" : "Issue and email"}
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog?.kind === "resend" && (
            <>
              <DialogHeader>
                <DialogTitle>Send the certificate email again</DialogTitle>
                <DialogDescription>Change the address if they asked for a different one. Admin sends skip the student limit and are logged.</DialogDescription>
              </DialogHeader>
              <Input type="email" placeholder="name@gmail.com" value={text} onChange={(e) => setText(e.target.value)} />
              <DialogFooter>
                <Button disabled={busy} onClick={() => act(async () => {
                  const r = await callCertificates<{ email: string }>({ action: "admin_resend", certificate_id: dialog.row.certificate_id, email: text.trim() || undefined });
                  return r.email === "sent" ? "Email sent" : `Not sent: ${EMAIL_STATUS_LABEL[r.email] ?? r.email}`;
                })}>{busy ? "Sending…" : "Send"}</Button>
              </DialogFooter>
            </>
          )}
          {dialog?.kind === "rename" && (
            <>
              <DialogHeader>
                <DialogTitle>Fix the name and reissue</DialogTitle>
                <DialogDescription>Same certificate number, a new PDF with the new name, emailed again. The old name stays in the history.</DialogDescription>
              </DialogHeader>
              <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={60} />
              <DialogFooter>
                <Button disabled={busy || text.trim().length < 2} onClick={() => act(async () => {
                  const r = await callCertificates<{ email: string }>({ action: "admin_reissue", certificate_id: dialog.row.certificate_id, name: text.trim() });
                  return `Reissued ${emailWord(r.email)}`;
                })}>{busy ? "Reissuing…" : "Reissue and email"}</Button>
              </DialogFooter>
            </>
          )}
          {dialog?.kind === "revoke" && (
            <>
              <DialogHeader>
                <DialogTitle>Cancel this certificate</DialogTitle>
                <DialogDescription>The check page will say it's cancelled. You can restore it later.</DialogDescription>
              </DialogHeader>
              <Textarea placeholder="Reason (kept on record)" value={text} onChange={(e) => setText(e.target.value)} />
              <DialogFooter>
                <Button variant="destructive" disabled={busy || text.trim().length < 3} onClick={() => act(async () => {
                  await callCertificates({ action: "admin_revoke", certificate_id: dialog.row.certificate_id, reason: text.trim() });
                  return "Certificate cancelled";
                })}>Cancel certificate</Button>
              </DialogFooter>
            </>
          )}
          {dialog?.kind === "history" && (
            <>
              <DialogHeader>
                <DialogTitle>History · {dialog.row.certificate_number}</DialogTitle>
              </DialogHeader>
              <ul className="max-h-[60vh] overflow-y-auto space-y-2 text-sm">
                {(history.data ?? []).map((e) => (
                  <li key={e.id} className="border-b border-border pb-2">
                    <div className="font-medium">{EVENT_LABEL[e.kind] ?? e.kind}<span className="ml-2 text-xs text-muted-foreground">by {e.actor_kind}</span></div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("en-IN")}
                      {typeof e.detail?.to === "string" ? ` · to ${e.detail.to}` : ""}
                      {typeof e.detail?.reason === "string" ? ` · ${e.detail.reason}` : ""}
                      {typeof e.detail?.new_name === "string" ? ` · ${String(e.detail.old_name)} → ${e.detail.new_name}` : ""}
                      {typeof e.detail?.error === "string" ? ` · ${e.detail.error}` : ""}
                    </div>
                  </li>
                ))}
                {history.isLoading && <li className="text-muted-foreground">Loading…</li>}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
