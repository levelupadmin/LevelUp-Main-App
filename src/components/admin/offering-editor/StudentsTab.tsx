import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { Loader2, Download, Users, UserPlus, FileSpreadsheet, CheckCircle2, AlertCircle, FileDown, Ban, RotateCcw } from "lucide-react";
import { resolveImportPhone } from "@shared/phone";
import { useAuth } from "@/contexts/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  offeringId: string;
}

interface Row {
  id: string;
  user_id: string;
  status: string;
  source: string;
  created_at: string;
  expires_at: string | null;
  total_paid_inr: number | null;
  user_email: string | null;
  user_phone: string | null;
  user_full_name: string | null;
}

/** One CSV row / one manual entry, exactly as the edge function receives it. */
interface Student {
  full_name?: string;
  email?: string;
  phone?: string;
  country_code?: string;
}

interface GrantResult {
  input: Student;
  status: string;
  user_id?: string;
  detail?: string;
}

/** The E.164 number this row will actually create an account on — the same
 *  shared resolver the edge function uses, so the preview cannot promise one
 *  number and the import create another. */
const resolvedPhone = (s: Student): string | null => {
  const digits = resolveImportPhone(s.phone, s.country_code);
  return digits ? `+${digits}` : null;
};

/** Rows are sent in slices because the edge function caps one call at 300 —
 *  a 2,000-row CRM export still imports in a single click. */
const CHUNK_SIZE = 200;

const csvEscape = (v: unknown) => {
  const str = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/** Trigger a client-side download of `text` as `filename`. */
const downloadCsv = (filename: string, text: string) => {
  // The BOM keeps Excel from mangling non-ASCII names on open.
  const blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const SOURCE_LABEL: Record<string, string> = {
  checkout: "Bought in app",
  purchase: "Bought in app",
  admin_grant: "Granted by admin",
  admin_manual: "Granted by admin",
  manual: "Granted by admin",
  bulk_import: "CSV import",
  migration: "Migrated",
  legacy: "Legacy purchase",
  import: "Imported",
  free: "Free",
};

const RESULT_LABEL: Record<string, string> = {
  enrolled: "Access granted",
  created_and_enrolled: "Account created + access granted",
  repaired_and_enrolled: "Account repaired + access granted",
  already_enrolled: "Already had access",
  reactivated: "Access re-activated",
  error: "Failed",
};

/** Very small CSV parser — handles quoted fields and commas inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

/** Map a parsed CSV to student objects. The header row is matched loosely, so
 *  a CRM export can be imported as-exported: `name` / `email` /
 *  `phone|mobile|whatsapp|number` / `country_code|country code|cc|dial code`.
 *  Extra columns are ignored. With no recognisable header at all, columns are
 *  assumed to be name,email,phone,country_code in that order.
 *
 *  The dial code is matched on "country"/"dial"/exact "cc" rather than on the
 *  bare word "code", so a coupon- or referral-code column can't be mistaken for
 *  it and silently rewrite everybody's phone number. */
function csvToStudents(rows: string[][]): { students: Student[]; skipped: number } {
  if (!rows.length) return { students: [], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const isCountryCode = (h: string) =>
    h.includes("country") || h.includes("dial") || h === "cc" || h === "isd";
  const idx = {
    name: header.findIndex((h) => h.includes("name")),
    email: header.findIndex((h) => h.includes("email") || h.includes("mail")),
    phone: header.findIndex(
      (h) =>
        !isCountryCode(h) &&
        (h.includes("phone") || h.includes("mobile") || h.includes("whatsapp") || h.includes("number")),
    ),
    countryCode: header.findIndex(isCountryCode),
  };
  const hasHeader = idx.name !== -1 || idx.email !== -1 || idx.phone !== -1 || idx.countryCode !== -1;
  const body = hasHeader ? rows.slice(1) : rows;
  const at = (r: string[], i: number) => (i !== -1 ? r[i]?.trim() || undefined : undefined);
  const pick = hasHeader
    ? (r: string[]): Student => ({
        full_name: at(r, idx.name),
        email: at(r, idx.email),
        phone: at(r, idx.phone),
        country_code: at(r, idx.countryCode),
      })
    : (r: string[]): Student => ({
        full_name: r[0]?.trim() || undefined,
        email: r[1]?.trim() || undefined,
        phone: r[2]?.trim() || undefined,
        country_code: r[3]?.trim() || undefined,
      });
  const students: Student[] = [];
  let skipped = 0;
  for (const r of body) {
    const s = pick(r);
    if (s.email || s.phone) students.push(s);
    else skipped++;
  }
  return { students, skipped };
}

/** The blank CSV handed to the admin team — the exact header the parser wants,
 *  with one India row and one overseas row showing both accepted phone forms. */
const CSV_TEMPLATE = [
  "name,email,phone,country_code",
  "Asha Rao,asha@example.com,9876543210,91",
  "Sam Field,sam@example.com,7911123456,44",
].join("\n");

/** "Students" tab for the offering editor. Lists everyone with access AND lets
 *  the admin grant it right here — pick an existing user, create a brand-new
 *  account, or import a CSV. All writes go through the admin-grant-access edge
 *  function (service role) so account creation, half-provisioned repair and
 *  duplicate-enrolment checks live in ONE place. */
export default function StudentsTab({ offeringId }: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // Add-student dialog
  const [addOpen, setAddOpen] = useState(false);
  const [userQ, setUserQ] = useState("");
  const [userHits, setUserHits] = useState<{ id: string; full_name: string | null; email: string | null; phone: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [granting, setGranting] = useState(false);

  // CSV dialog
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvStudents, setCsvStudents] = useState<Student[]>([]);
  const [csvSkipped, setCsvSkipped] = useState(0);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvRunning, setCsvRunning] = useState(false);
  const [csvResults, setCsvResults] = useState<GrantResult[] | null>(null);
  /** rows sent so far / total — drives the progress line on a chunked run. */
  const [csvProgress, setCsvProgress] = useState({ done: 0, total: 0 });

  // Revoke / restore one student's access to THIS offering.
  const { profile } = useAuth();
  const [revokeTarget, setRevokeTarget] = useState<Row | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [accessBusy, setAccessBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!offeringId) return;
    setLoading(true);
    const { data } = await supabase
      .from("enrolments_unified")
      .select(
        "id, user_id, status, source, created_at, expires_at, total_paid_inr, user_email, user_phone, user_full_name"
      )
      .eq("offering_id", offeringId)
      // enrolments_unified UNIONs real enrolments with legacy_enrolments.
      // Only 'live' rows are actual enrolments; without this filter an
      // offering with legacy history lists tens of thousands of people who
      // have never signed in. Unclaimed legacy purchases belong on the
      // Access tab, not here.
      .eq("enrolment_kind", "live")
      .order("created_at", { ascending: false });
    setRows(((data || []) as unknown) as Row[]);
    setLoading(false);
  }, [offeringId]);

  useEffect(() => { load(); }, [load]);

  // Live user search inside the Add dialog.
  useEffect(() => {
    if (!addOpen) return;
    const needle = userQ.trim();
    if (needle.length < 2) { setUserHits([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      const like = `%${needle}%`;
      const { data } = await supabase
        .from("users")
        .select("id, full_name, email, phone")
        .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
        .limit(8);
      if (!cancelled) { setUserHits(data || []); setSearching(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [userQ, addOpen]);

  const callGrant = async (students: Student[]) => {
    const { data, error } = await supabase.functions.invoke("admin-grant-access", {
      body: { offering_id: offeringId, students },
    });
    if (error) throw new Error(error.message || "Request failed");
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    return data as { counts: Record<string, number>; results: GrantResult[] };
  };

  const grantExisting = async (u: { id: string; full_name: string | null; email: string | null; phone: string | null }) => {
    setGranting(true);
    try {
      const { results } = await callGrant([{ full_name: u.full_name || undefined, email: u.email || undefined, phone: u.phone || undefined }]);
      const r = results[0];
      if (r.status === "error") throw new Error(r.detail);
      toast.success(`${u.full_name || u.email || u.phone}: ${RESULT_LABEL[r.status] || r.status}`);
      setAddOpen(false);
      setUserQ("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Grant failed");
    }
    setGranting(false);
  };

  const grantNew = async () => {
    if (!newEmail.trim() && !newPhone.trim()) {
      toast.error("Give at least an email or a phone number");
      return;
    }
    setGranting(true);
    try {
      const { results } = await callGrant([{ full_name: newName.trim() || undefined, email: newEmail.trim() || undefined, phone: newPhone.trim() || undefined }]);
      const r = results[0];
      if (r.status === "error") throw new Error(r.detail);
      toast.success(`${newName || newEmail || newPhone}: ${RESULT_LABEL[r.status] || r.status}`);
      setAddOpen(false);
      setNewName(""); setNewEmail(""); setNewPhone(""); setUserQ("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Grant failed");
    }
    setGranting(false);
  };

  const onCsvFile = async (f: File | null) => {
    setCsvResults(null);
    if (!f) { setCsvStudents([]); setCsvFileName(""); return; }
    const text = await f.text();
    const { students, skipped } = csvToStudents(parseCsv(text));
    setCsvStudents(students);
    setCsvSkipped(skipped);
    setCsvFileName(f.name);
  };

  const runCsv = async () => {
    if (!csvStudents.length) return;
    setCsvRunning(true);
    setCsvProgress({ done: 0, total: csvStudents.length });
    // Sent in slices: the edge function caps one call at 300 rows, and a whole
    // CRM export used to fail outright at that wall rather than import. A slice
    // that throws is recorded as failed rows and the run CONTINUES — one bad
    // chunk must not discard the students who imported before it.
    const collected: GrantResult[] = [];
    for (let i = 0; i < csvStudents.length; i += CHUNK_SIZE) {
      const slice = csvStudents.slice(i, i + CHUNK_SIZE);
      try {
        const { results } = await callGrant(slice);
        collected.push(...results);
      } catch (e) {
        const detail = e instanceof Error ? e.message : "Request failed";
        collected.push(...slice.map((input) => ({ input, status: "error", detail })));
      }
      setCsvProgress({ done: Math.min(i + slice.length, csvStudents.length), total: csvStudents.length });
      setCsvResults([...collected]);
    }
    const counts: Record<string, number> = {};
    for (const r of collected) counts[r.status] = (counts[r.status] || 0) + 1;
    const ok = (counts.enrolled || 0) + (counts.created_and_enrolled || 0) + (counts.repaired_and_enrolled || 0) + (counts.reactivated || 0);
    if (counts.error) {
      toast.error(`${ok} granted, ${counts.already_enrolled || 0} already had access, ${counts.error} failed — download the report`);
    } else {
      toast.success(`Done — ${ok} granted, ${counts.already_enrolled || 0} already had access`);
    }
    setCsvRunning(false);
    load();
  };

  /** Row-by-row outcome of the last import, so a failed row can be fixed and
   *  re-uploaded without re-deriving which ones they were. */
  const exportCsvResults = () => {
    if (!csvResults) return;
    const lines = [
      "name,email,phone,country_code,resolved_phone,result,detail",
      ...csvResults.map((r) =>
        [
          r.input.full_name, r.input.email, r.input.phone, r.input.country_code,
          resolvedPhone(r.input) ?? "", RESULT_LABEL[r.status] || r.status, r.detail ?? "",
        ].map(csvEscape).join(","),
      ),
    ];
    downloadCsv(`offering-${offeringId}-import-report.csv`, lines.join("\n"));
  };

  const rowLabel = (r: Row) => r.user_full_name || r.user_email || r.user_phone || "this student";

  /** Revoke = flip the enrolment to `revoked` (never delete). The row keeps its
   *  history, the audit log records who/why, and Restore below undoes it. Access
   *  is decided purely by `enrolments.status = 'active'` (RLS + has_offering_access),
   *  so this takes effect on the student's next page load. */
  const revokeAccess = async () => {
    if (!revokeTarget) return;
    setAccessBusy(revokeTarget.id);
    const reason = revokeReason.trim() || null;
    const { error } = await supabase
      .from("enrolments")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: profile?.id ?? null,
        revoked_reason: reason,
      })
      .eq("id", revokeTarget.id);
    if (error) {
      toast.error(error.message);
    } else {
      if (profile?.id) {
        await supabase.from("admin_audit_logs").insert({
          actor_user_id: profile.id,
          action: "enrolment.revoked",
          target_table: "enrolments",
          target_id: revokeTarget.id,
          metadata: { offering_id: offeringId, user_id: revokeTarget.user_id, reason, via: "offering-editor" },
        });
      }
      toast.success(`${rowLabel(revokeTarget)}: access revoked`);
      setRevokeTarget(null);
      setRevokeReason("");
      load();
    }
    setAccessBusy(null);
  };

  const restoreAccess = async (r: Row) => {
    setAccessBusy(r.id);
    const { error } = await supabase
      .from("enrolments")
      .update({ status: "active", revoked_at: null, revoked_by: null, revoked_reason: null })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
    } else {
      if (profile?.id) {
        await supabase.from("admin_audit_logs").insert({
          actor_user_id: profile.id,
          action: "enrolment.restored",
          target_table: "enrolments",
          target_id: r.id,
          metadata: { offering_id: offeringId, user_id: r.user_id, via: "offering-editor" },
        });
      }
      toast.success(`${rowLabel(r)}: access restored`);
      load();
    }
    setAccessBusy(null);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.user_full_name, r.user_email, r.user_phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [rows, q]);

  const activeCount = rows.filter((r) => r.status === "active").length;

  /** Rows whose phone cell cannot become an E.164 number — a missing or wrong
   *  `country_code` is the usual cause. Surfaced before the run because such a
   *  row does not fail loudly: it imports on email alone (or not at all) and the
   *  student simply never gets a working phone login. */
  const unusablePhones = useMemo(
    () => csvStudents.filter((s) => s.phone && !resolvedPhone(s)).length,
    [csvStudents],
  );
  const emailOnlyRows = useMemo(
    () => csvStudents.filter((s) => s.phone && !resolvedPhone(s) && s.email).length,
    [csvStudents],
  );

  const exportCsv = () => {
    const cols = ["name", "email", "phone", "status", "source", "enrolled_on", "expires_on", "paid_inr"];
    const rows = [
      cols.join(","),
      ...filtered.map((r) =>
        [r.user_full_name, r.user_email, r.user_phone, r.status, r.source, r.created_at?.slice(0, 10), r.expires_at?.slice(0, 10) ?? "", r.total_paid_inr ?? ""].map(csvEscape).join(",")
      ),
    ];
    downloadCsv(`offering-${offeringId}-students.csv`, rows.join("\n"));
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading students…
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            <strong>{activeCount}</strong> with access
            {rows.length !== activeCount && (
              <span className="text-muted-foreground"> · {rows.length - activeCount} inactive</span>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or phone…"
            className="w-56"
          />
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <UserPlus className="h-4 w-4" /> Add student
          </Button>
          <Button variant="outline" onClick={() => { setCsvOpen(true); setCsvResults(null); }} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Import CSV
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length} className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {!rows.length ? (
        <p className="text-sm text-muted-foreground py-6">
          Nobody is enrolled in this offering yet. Use <strong>Add student</strong> or{" "}
          <strong>Import CSV</strong> above to grant access.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-4 font-medium">Student</th>
                <th className="py-2 pr-4 font-medium">Contact</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">How</th>
                <th className="py-2 pr-4 font-medium">Enrolled</th>
                <th className="py-2 pl-2 font-medium text-right">Access</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() =>
                    navigate(`/admin/users?q=${encodeURIComponent(r.user_email || r.user_phone || "")}`)
                  }
                  className="border-b border-border/50 hover:bg-secondary/40 cursor-pointer"
                  title="Open this student in Users"
                >
                  <td className="py-2 pr-4">
                    {r.user_full_name || <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-2 pr-4">
                    <div>{r.user_email}</div>
                    <div className="text-muted-foreground text-xs">{r.user_phone}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={r.status === "active" ? "text-emerald-500" : "text-muted-foreground"}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{SOURCE_LABEL[r.source] || r.source}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.created_at?.slice(0, 10)}</td>
                  <td className="py-2 pl-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {r.status === "active" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-muted-foreground hover:text-destructive"
                        disabled={accessBusy === r.id}
                        onClick={() => { setRevokeReason(""); setRevokeTarget(r); }}
                        title="Revoke this student's access to this product"
                      >
                        <Ban className="h-3.5 w-3.5" /> Revoke
                      </Button>
                    ) : r.status === "revoked" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-muted-foreground hover:text-emerald-500"
                        disabled={accessBusy === r.id}
                        onClick={() => restoreAccess(r)}
                        title="Give this student access again"
                      >
                        {accessBusy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                      </Button>
                    ) : (
                      // Expired / cancelled rows are not one-click restorable:
                      // an expiry has its own date and a cancellation usually
                      // means a refund. Re-grant deliberately via Add student.
                      <span className="text-xs text-muted-foreground" title="Use “Add student” to grant access again">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="text-sm text-muted-foreground py-4">No student matches “{q}”.</p>
          )}
        </div>
      )}

      {/* ── Revoke access (confirm) ─────────────────────────────────────── */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => { if (!o) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access for {revokeTarget ? rowLabel(revokeTarget) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this product immediately. Nothing is deleted — their
              progress and this enrolment stay on record, and you can <strong>Restore</strong> it
              from this list at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <label className="text-xs font-medium">Reason (optional, kept in the audit log)</label>
            <Textarea
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              rows={2}
              placeholder="e.g. Refunded on 5 Sep, moved to Batch 24, duplicate account…"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!accessBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); revokeAccess(); }}
              disabled={!!accessBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {accessBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Revoke access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Add one student ─────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a student to this product</DialogTitle>
            <DialogDescription>
              Search existing accounts first — or create a new one below. New accounts are
              pre-verified: the student just logs in with their phone OTP (or email) and
              everything is already there.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-xs font-medium">Find an existing user</label>
            <Input
              value={userQ}
              onChange={(e) => setUserQ(e.target.value)}
              placeholder="Name, email or phone…"
              autoFocus
            />
            {searching && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
              </p>
            )}
            {userHits.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-secondary/30">
                <div className="min-w-0">
                  <div className="text-sm truncate">{u.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[u.email, u.phone].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Button size="sm" disabled={granting} onClick={() => grantExisting(u)}>
                  Grant
                </Button>
              </div>
            ))}
            {userQ.trim().length >= 2 && !searching && !userHits.length && (
              <p className="text-xs text-muted-foreground">No existing account matches — create one below.</p>
            )}
          </div>

          <div className="border-t border-border pt-4 space-y-2">
            <label className="text-xs font-medium">…or create a new student</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
            <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email (optional if phone given)" type="email" />
            <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone — 10 digits = India, else include country code" />
            <p className="text-[11px] text-muted-foreground">
              Phone is how students log in (OTP) — for non-Indian numbers include the country code, e.g. +447… Their access is linked the moment the account exists.
            </p>
            <Button onClick={grantNew} disabled={granting} className="w-full gap-2">
              {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Create account &amp; grant access
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CSV import ──────────────────────────────────────────────────── */}
      <Dialog open={csvOpen} onOpenChange={(o) => { setCsvOpen(o); if (!o) { setCsvStudents([]); setCsvFileName(""); setCsvResults(null); setCsvProgress({ done: 0, total: 0 }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import students from CSV</DialogTitle>
            <DialogDescription>
              Columns: <code>name, email, phone, country_code</code> (a header row is detected
              automatically; extra columns are ignored). Existing accounts are matched by phone,
              then email; everyone else gets a pre-verified account created automatically.
            </DialogDescription>
          </DialogHeader>

          {!csvResults ? (
            <div className="space-y-3">
              <Button variant="outline" size="sm" onClick={() => downloadCsv("levelup-student-import-template.csv", CSV_TEMPLATE)} className="gap-2">
                <FileDown className="h-4 w-4" /> Download the template
              </Button>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onCsvFile(e.target.files?.[0] || null)}
                className="text-xs"
              />
              {csvFileName && (
                <div className="text-sm space-y-1">
                  <p>
                    <strong>{csvStudents.length}</strong> students found in {csvFileName}
                    {csvSkipped > 0 && (
                      <span className="text-muted-foreground"> · {csvSkipped} rows skipped (no email/phone)</span>
                    )}
                  </p>
                  {/* The resolved number is shown BEFORE anything is written: it is
                      what the account gets created on, and a wrong country code
                      fails silently at login rather than loudly here. */}
                  {csvStudents.slice(0, 4).map((s, i) => (
                    <p key={i} className="text-xs text-muted-foreground truncate">
                      {[s.full_name, s.email].filter(Boolean).join(" · ")}
                      {s.phone && (
                        resolvedPhone(s)
                          ? <span> · {resolvedPhone(s)}</span>
                          : <span className="text-amber-500"> · “{s.phone}” isn’t a usable number</span>
                      )}
                    </p>
                  ))}
                  {csvStudents.length > 4 && (
                    <p className="text-xs text-muted-foreground">…and {csvStudents.length - 4} more</p>
                  )}
                  {unusablePhones > 0 && (
                    <p className="text-xs text-amber-500">
                      {unusablePhones === 1 ? "1 row has" : `${unusablePhones} rows have`} a phone we can’t read
                      {emailOnlyRows > 0 ? " — those with an email still import, by email." : "."}{" "}
                      Check the <code>country_code</code> column.
                    </p>
                  )}
                  {csvStudents.length > CHUNK_SIZE && (
                    <p className="text-xs text-muted-foreground">
                      Sent in {Math.ceil(csvStudents.length / CHUNK_SIZE)} batches — keep this tab open.
                    </p>
                  )}
                </div>
              )}
              <Button onClick={runCsv} disabled={!csvStudents.length || csvRunning} className="w-full gap-2">
                {csvRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {csvRunning
                  ? `Granting access… ${csvProgress.done}/${csvProgress.total}`
                  : `Grant access to ${csvStudents.length} student${csvStudents.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {csvRunning ? `Working… ${csvProgress.done}/${csvProgress.total}` : `${csvResults.length} rows processed`}
                </p>
                <Button variant="outline" size="sm" onClick={exportCsvResults} className="gap-2">
                  <FileDown className="h-4 w-4" /> Download report
                </Button>
              </div>
              <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                {csvResults.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    {r.status === "error" ? (
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <span className="truncate">
                        {[r.input.full_name, r.input.email, resolvedPhone(r.input) ?? r.input.phone].filter(Boolean).join(" · ") || "(row)"}
                      </span>
                      <span className="text-muted-foreground"> — {RESULT_LABEL[r.status] || r.status}</span>
                      {r.detail && <div className="text-xs text-red-500">{r.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
