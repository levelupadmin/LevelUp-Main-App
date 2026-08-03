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
import { Loader2, Download, Users, UserPlus, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";

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

interface GrantResult {
  input: { full_name?: string; email?: string; phone?: string };
  status: string;
  user_id?: string;
  detail?: string;
}

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

/** Map a parsed CSV to student objects. Header row is matched loosely
 *  (name / email / phone|mobile|number|whatsapp); with no recognisable
 *  header, columns are assumed to be name,email,phone in that order. */
function csvToStudents(rows: string[][]): { students: { full_name?: string; email?: string; phone?: string }[]; skipped: number } {
  if (!rows.length) return { students: [], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    name: header.findIndex((h) => h.includes("name")),
    email: header.findIndex((h) => h.includes("email") || h.includes("mail")),
    phone: header.findIndex((h) => h.includes("phone") || h.includes("mobile") || h.includes("whatsapp") || h.includes("number")),
  };
  const hasHeader = idx.name !== -1 || idx.email !== -1 || idx.phone !== -1;
  const body = hasHeader ? rows.slice(1) : rows;
  const pick = hasHeader
    ? (r: string[]) => ({
        full_name: idx.name !== -1 ? r[idx.name]?.trim() : undefined,
        email: idx.email !== -1 ? r[idx.email]?.trim() : undefined,
        phone: idx.phone !== -1 ? r[idx.phone]?.trim() : undefined,
      })
    : (r: string[]) => ({ full_name: r[0]?.trim(), email: r[1]?.trim(), phone: r[2]?.trim() });
  const students: { full_name?: string; email?: string; phone?: string }[] = [];
  let skipped = 0;
  for (const r of body) {
    const s = pick(r);
    if (s.email || s.phone) students.push(s);
    else skipped++;
  }
  return { students, skipped };
}

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
  const [csvStudents, setCsvStudents] = useState<{ full_name?: string; email?: string; phone?: string }[]>([]);
  const [csvSkipped, setCsvSkipped] = useState(0);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvRunning, setCsvRunning] = useState(false);
  const [csvResults, setCsvResults] = useState<GrantResult[] | null>(null);

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

  const callGrant = async (students: { full_name?: string; email?: string; phone?: string }[]) => {
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
    try {
      const { counts, results } = await callGrant(csvStudents);
      setCsvResults(results);
      const ok = (counts.enrolled || 0) + (counts.created_and_enrolled || 0) + (counts.repaired_and_enrolled || 0) + (counts.reactivated || 0);
      toast.success(`Done — ${ok} granted, ${counts.already_enrolled || 0} already had access${counts.error ? `, ${counts.error} failed` : ""}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
    setCsvRunning(false);
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

  const exportCsv = () => {
    const cols = ["name", "email", "phone", "status", "source", "enrolled_on", "expires_on", "paid_inr"];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      cols.join(","),
      ...filtered.map((r) =>
        [r.user_full_name, r.user_email, r.user_phone, r.status, r.source, r.created_at?.slice(0, 10), r.expires_at?.slice(0, 10) ?? "", r.total_paid_inr ?? ""].map(esc).join(",")
      ),
    ];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offering-${offeringId}-students.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="text-sm text-muted-foreground py-4">No student matches “{q}”.</p>
          )}
        </div>
      )}

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
      <Dialog open={csvOpen} onOpenChange={(o) => { setCsvOpen(o); if (!o) { setCsvStudents([]); setCsvFileName(""); setCsvResults(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import students from CSV</DialogTitle>
            <DialogDescription>
              Columns: <code>name, email, phone</code> (a header row is detected automatically;
              extra columns are ignored). Existing accounts are matched by phone, then email;
              everyone else gets a pre-verified account created automatically.
            </DialogDescription>
          </DialogHeader>

          {!csvResults ? (
            <div className="space-y-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onCsvFile(e.target.files?.[0] || null)}
                className="text-xs"
              />
              {csvFileName && (
                <div className="text-sm">
                  <p>
                    <strong>{csvStudents.length}</strong> students found in {csvFileName}
                    {csvSkipped > 0 && (
                      <span className="text-muted-foreground"> · {csvSkipped} rows skipped (no email/phone)</span>
                    )}
                  </p>
                  {csvStudents.slice(0, 4).map((s, i) => (
                    <p key={i} className="text-xs text-muted-foreground truncate">
                      {[s.full_name, s.email, s.phone].filter(Boolean).join(" · ")}
                    </p>
                  ))}
                  {csvStudents.length > 4 && (
                    <p className="text-xs text-muted-foreground">…and {csvStudents.length - 4} more</p>
                  )}
                </div>
              )}
              <Button onClick={runCsv} disabled={!csvStudents.length || csvRunning} className="w-full gap-2">
                {csvRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {csvRunning ? "Granting access…" : `Grant access to ${csvStudents.length} student${csvStudents.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {csvResults.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {r.status === "error" ? (
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <span className="truncate">
                      {[r.input.full_name, r.input.email, r.input.phone].filter(Boolean).join(" · ") || "(row)"}
                    </span>
                    <span className="text-muted-foreground"> — {RESULT_LABEL[r.status] || r.status}</span>
                    {r.detail && <div className="text-xs text-red-500">{r.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
