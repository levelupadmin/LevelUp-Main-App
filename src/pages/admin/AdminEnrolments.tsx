import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
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
import { Plus, Upload, Download, FileUp } from "lucide-react";
import { generateAndSaveCertificate, VariablePosition } from "@/lib/certificate-generator";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaginatedTable } from "@/hooks/usePaginatedTable";
import type { EnrolmentRow, CsvRow } from "@/components/admin/enrolments/types";
import EnrolmentFilters from "@/components/admin/enrolments/EnrolmentFilters";
import EnrolmentTable from "@/components/admin/enrolments/EnrolmentTable";

/** One CSV row and what admin-grant-access did with it. */
interface CsvGrantResult {
  row: CsvRow;
  status: string;
  detail?: string;
}

/** admin-grant-access caps one call at 300 rows. */
const CSV_CHUNK_SIZE = 100;

/** admin-grant-access statuses that mean the student now has access. */
const GRANTED_STATUSES = ["enrolled", "created_and_enrolled", "repaired_and_enrolled", "reactivated", "phone_belongs_to_another_account"];

const CSV_RESULT_LABEL: Record<string, string> = {
  enrolled: "granted",
  created_and_enrolled: "account created + granted",
  repaired_and_enrolled: "account repaired + granted",
  reactivated: "re-activated",
  already_enrolled: "already had access",
  // Access WAS granted; phone login will not reach it until the accounts are merged.
  phone_belongs_to_another_account: "granted, but the phone is on another account",
  error: "failed",
};

const AdminEnrolments = () => {
  const PAGE_SIZE = 50;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [offeringFilter, setOfferingFilter] = useState("all");
  const [manualOpen, setManualOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [allOfferings, setAllOfferings] = useState<{ id: string; title: string }[]>([]);
  const [allCourses, setAllCourses] = useState<{ id: string; title: string }[]>([]);
  const [offeringCourseMap, setOfferingCourseMap] = useState<Record<string, string[]>>({});
  const [manualUserId, setManualUserId] = useState("");
  const [manualOfferingId, setManualOfferingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkOfferingId, setBulkOfferingId] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: string[]; skipped: string[] } | null>(null);
  const [bulkStatusConfirm, setBulkStatusConfirm] = useState<string | null>(null);
  const { toast } = useToast();
  const { profile } = useAuth();

  /* ── CSV Import state ── */
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvParseErrors, setCsvParseErrors] = useState<string[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvProgress, setCsvProgress] = useState(0);
  const [csvResults, setCsvResults] = useState<CsvGrantResult[] | null>(null);

  /* ── Load filter dropdown data ── */
  const loadFilterData = async () => {
    const [coursesRes, offeringsRes, ocRes] = await Promise.all([
      supabase.from("courses").select("id, title").order("title"),
      supabase.from("offerings").select("id, title").order("title"),
      supabase.from("offering_courses").select("offering_id, course_id"),
    ]);
    setAllCourses(coursesRes.data || []);
    setAllOfferings(offeringsRes.data || []);

    const ocMap: Record<string, string[]> = {};
    (ocRes.data || []).forEach((oc) => {
      if (!ocMap[oc.offering_id]) ocMap[oc.offering_id] = [];
      ocMap[oc.offering_id].push(oc.course_id);
    });
    setOfferingCourseMap(ocMap);
  };

  useEffect(() => { loadFilterData(); }, []);

  /* ── Server-side paginated load against the unified view ──
   * enrolments_unified UNIONs:
   *   - live enrolments (from public.enrolments)
   *   - legacy enrolments (from public.legacy_enrolments, ~73K rows)
   * The view exposes user_email/phone/full_name + offering_title + an
   * `enrolment_kind` column so the UI can badge live vs legacy.
   * Search is applied client-side (see `filtered` below); status/course/
   * offering filters are server-side and drive a refetch via `deps`. */
  const {
    rows: enrolments,
    loading,
    page,
    setPage,
    total: totalCount,
    refetch: load,
  } = usePaginatedTable<EnrolmentRow>({
    pageSize: PAGE_SIZE,
    deps: [statusFilter, offeringFilter, courseFilter],
    keepRowsOnError: true,
    fetchPage: async ({ from, to }) => {
      let countQuery = (supabase as any).from("enrolments_unified").select("id", { count: "exact", head: true });
      let dataQuery = (supabase as any)
        .from("enrolments_unified")
        .select("id, status, created_at, user_id, offering_id, payment_order_id, enrolment_kind, total_paid_inr, legacy_purchased_at, user_email, user_phone, user_full_name, offering_title")
        .order("created_at", { ascending: false });

      // Apply offering filter (also used by course filter)
      let targetOfferingIds: string[] | null = null;

      if (offeringFilter !== "all") {
        targetOfferingIds = [offeringFilter];
      }

      if (courseFilter !== "all") {
        // Find all offerings linked to this course
        const offeringIdsForCourse = Object.entries(offeringCourseMap)
          .filter(([, courseIds]) => courseIds.includes(courseFilter))
          .map(([offId]) => offId);

        if (targetOfferingIds) {
          // Intersect with offering filter
          targetOfferingIds = targetOfferingIds.filter((id) => offeringIdsForCourse.includes(id));
        } else {
          targetOfferingIds = offeringIdsForCourse;
        }
      }

      if (targetOfferingIds !== null) {
        if (targetOfferingIds.length === 0) {
          // No offerings match - empty result
          return { rows: [], count: 0 };
        }
        countQuery = countQuery.in("offering_id", targetOfferingIds);
        dataQuery = dataQuery.in("offering_id", targetOfferingIds);
      }

      if (statusFilter !== "all") {
        countQuery = countQuery.eq("status", statusFilter);
        dataQuery = dataQuery.eq("status", statusFilter);
      }

      const { count } = await countQuery;
      const { data: enrols } = await dataQuery.range(from, to);

      // Null data means the query failed - keepRowsOnError holds the current page.
      if (!enrols) throw new Error("Failed to load enrolments");

      const rows: EnrolmentRow[] = (enrols as any[]).map((e) => ({
        id: e.id,
        status: e.status,
        created_at: e.created_at,
        user_id: e.user_id,
        user_name: e.user_full_name || e.user_email || e.user_phone || "Unknown",
        user_email: e.user_email || "",
        user_phone: e.user_phone || "",
        offering_id: e.offering_id,
        offering_title: e.offering_title || (e.enrolment_kind === "legacy" ? "(unmapped legacy)" : "Unknown"),
        payment_order_id: e.payment_order_id,
        enrolment_kind: e.enrolment_kind,
        total_paid_inr: e.total_paid_inr ?? null,
        legacy_purchased_at: e.legacy_purchased_at ?? null,
      }));

      return { rows, count: count ?? 0 };
    },
  });

  const handleStatusChange = async (enrolId: string, newStatus: string) => {
    const { error } = await supabase.from("enrolments").update({ status: newStatus }).eq("id", enrolId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      if (profile?.id) {
        await (supabase as any).from("admin_audit_logs").insert({
          actor_user_id: profile.id,
          action: "update",
          target_table: "enrolments",
          target_id: enrolId,
          metadata: { new_status: newStatus },
        });
      }
      toast({ title: "Status updated" });
      load();
    }
  };

  const openManualEnrol = async () => {
    const [uRes, oRes] = await Promise.all([
      supabase.from("users").select("id, full_name, email").order("full_name").limit(500),
      supabase.from("offerings").select("id, title").order("title"),
    ]);
    setAllUsers((uRes.data || []).map((u) => ({ id: u.id, full_name: u.full_name ?? "", email: u.email ?? "" })));
    setAllOfferings(oRes.data || []);
    setManualUserId("");
    setManualOfferingId("");
    setManualOpen(true);
  };

  const handleManualEnrol = async () => {
    if (!manualUserId || !manualOfferingId) {
      toast({ title: "Select both user and offering", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("enrolments").insert({
      user_id: manualUserId,
      offering_id: manualOfferingId,
      source: "admin_manual",
      status: "active",
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      if (profile?.id) {
        await (supabase as any).from("admin_audit_logs").insert({
          actor_user_id: profile.id,
          action: "create",
          target_table: "enrolments",
          target_id: null,
          metadata: { user_id: manualUserId, offering_id: manualOfferingId, source: "admin_manual" },
        });
      }
      toast({ title: "User enrolled" });
      setManualOpen(false);
      load();
    }
    setSaving(false);
  };

  const openBulkEnrol = async () => {
    const { data } = await supabase.from("offerings").select("id, title").order("title");
    setAllOfferings(data || []);
    setBulkEmails("");
    setBulkOfferingId("");
    setBulkResult(null);
    setBulkOpen(true);
  };

  const handleBulkEnrol = async () => {
    if (!bulkOfferingId || !bulkEmails.trim()) {
      toast({ title: "Select an offering and enter emails", variant: "destructive" });
      return;
    }
    setSaving(true);
    setBulkResult(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const rawEntries = bulkEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);

    const emails: string[] = [];
    let success = 0;
    const failed: string[] = [];
    const skipped: string[] = [];

    for (const entry of rawEntries) {
      if (!emailRegex.test(entry)) {
        failed.push(`${entry}: invalid format`);
      } else {
        emails.push(entry);
      }
    }

    for (const email of emails) {
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (!user) {
        failed.push(`${email}: user not found`);
        continue;
      }

      const { data: existing } = await supabase
        .from("enrolments")
        .select("id")
        .eq("user_id", user.id)
        .eq("offering_id", bulkOfferingId)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        skipped.push(`${email}: already has active enrolment`);
        continue;
      }

      const { error } = await supabase.from("enrolments").insert({
        user_id: user.id,
        offering_id: bulkOfferingId,
        source: "admin_manual",
        status: "active",
      });

      if (error) {
        failed.push(`${email}: ${error.message}`);
      } else {
        success++;
      }
    }

    setBulkResult({ success, failed, skipped });
    if (success > 0) {
      if (profile?.id) {
        await (supabase as any).from("admin_audit_logs").insert({
          actor_user_id: profile.id,
          action: "bulk_create",
          target_table: "enrolments",
          target_id: bulkOfferingId,
          metadata: { offering_id: bulkOfferingId, success, failed: failed.length, skipped: skipped.length },
        });
      }
      toast({ title: `${success} users enrolled` });
      load();
    }
    setSaving(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((e) => e.id)));
    }
  };

  const requestBulkStatusChange = (newStatus: string) => {
    if (selectedIds.size === 0) return;
    setBulkStatusConfirm(newStatus);
  };

  const confirmBulkStatusChange = async () => {
    if (!bulkStatusConfirm || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const newStatus = bulkStatusConfirm;
    setBulkStatusConfirm(null);
    const { error } = await supabase.from("enrolments").update({ status: newStatus }).in("id", ids);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      if (profile?.id) {
        await (supabase as any).from("admin_audit_logs").insert({
          actor_user_id: profile.id,
          action: "bulk_update",
          target_table: "enrolments",
          target_id: null,
          metadata: { enrolment_ids: ids, new_status: newStatus, count: ids.length },
        });
      }
      toast({ title: `${ids.length} enrolment(s) updated to ${newStatus}` });
      setSelectedIds(new Set());
      load();
    }
  };

  const [generatingCertFor, setGeneratingCertFor] = useState<string | null>(null);

  const handleGenerateCertificate = async (enrolment: EnrolmentRow) => {
    setGeneratingCertFor(enrolment.id);
    try {
      const { data: ocs } = await supabase
        .from("offering_courses")
        .select("course_id")
        .eq("offering_id", enrolment.offering_id);

      if (!ocs || ocs.length === 0) {
        toast({ title: "No courses linked to this offering", variant: "destructive" });
        setGeneratingCertFor(null);
        return;
      }

      let generated = 0;
      for (const oc of ocs) {
        const { data: template } = await (supabase as any)
          .from("certificate_templates")
          .select("id, background_image_url, variable_positions, completion_threshold, is_active")
          .eq("course_id", oc.course_id)
          .eq("is_active", true)
          .maybeSingle();

        if (!template) continue;

        const { data: existing } = await (supabase as any)
          .from("certificates")
          .select("id")
          .eq("user_id", enrolment.user_id)
          .eq("course_id", oc.course_id)
          .maybeSingle();

        if (existing) continue;

        const { data: course } = await supabase
          .from("courses")
          .select("title")
          .eq("id", oc.course_id)
          .maybeSingle();

        await generateAndSaveCertificate({
          templateId: template.id,
          templateImageUrl: template.background_image_url,
          variablePositions: (template.variable_positions || []) as VariablePosition[],
          variableValues: {
            student_name: enrolment.user_name,
            member_id: "",
            batch_number: enrolment.offering_title,
            course_name: course?.title ?? "",
            completion_date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
            certificate_number: "",
          },
          userId: enrolment.user_id,
          courseId: oc.course_id,
          generatedBy: "admin_manual",
        });
        generated++;
      }

      if (generated === 0) {
        toast({ title: "No certificate templates found", description: "Set up a certificate template for the course first.", variant: "destructive" });
      } else {
        toast({ title: `${generated} certificate(s) generated for ${enrolment.user_name}` });
      }
    } catch (err: any) {
      toast({ title: "Certificate generation failed", description: err?.message || "Unknown error", variant: "destructive" });
    }
    setGeneratingCertFor(null);
  };

  /* ─────────────────────────────────────────────── */
  /*  CSV Template Download                          */
  /* ─────────────────────────────────────────────── */
  const downloadCsvTemplate = () => {
    const header = "full_name,email,phone,offering_id,offering_title_reference";
    const exampleOffering = allOfferings.length > 0 ? allOfferings[0] : { id: "offering-uuid-here", title: "Example Offering" };
    const example = `John Doe,john@example.com,9876543210,${exampleOffering.id},${exampleOffering.title}`;
    const csv = `${header}\n${example}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "enrolment_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ─────────────────────────────────────────────── */
  /*  CSV Upload & Parsing                           */
  /* ─────────────────────────────────────────────── */
  const parseCsvText = (text: string): { rows: CsvRow[]; errors: string[] } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return { rows: [], errors: ["CSV must have a header row and at least one data row."] };

    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(",").map((h) => h.trim());

    const nameIdx = headers.findIndex((h) => h === "full_name" || h === "name");
    const emailIdx = headers.findIndex((h) => h === "email");
    const phoneIdx = headers.findIndex((h) => h === "phone");
    const offeringIdx = headers.findIndex((h) => h === "offering_id");

    if (emailIdx === -1 && phoneIdx === -1) return { rows: [], errors: ["CSV must have an 'email' or a 'phone' column."] };

    const rows: CsvRow[] = [];
    const errors: string[] = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const email = emailIdx >= 0 ? (cols[emailIdx] || "").trim().toLowerCase() : "";
      const full_name = nameIdx >= 0 ? (cols[nameIdx] || "").trim() : "";
      // Kept as typed: admin-grant-access resolves it (10 digits = India).
      const phone = phoneIdx >= 0 ? (cols[phoneIdx] || "").trim() : "";
      const offering_id = offeringIdx >= 0 ? (cols[offeringIdx] || "").trim() : "";

      if (!email && !phone) { errors.push(`Row ${i + 1}: needs an email or a phone`); continue; }
      if (email && !emailRegex.test(email)) { errors.push(`Row ${i + 1}: invalid email "${email}"`); continue; }
      if (!offering_id) { errors.push(`Row ${i + 1}: missing offering_id`); continue; }

      rows.push({ full_name, email, phone, offering_id });
    }

    return { rows, errors };
  };

  /** Handle quoted CSV fields */
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  };

  const handleCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";

    const text = await file.text();
    const { rows, errors } = parseCsvText(text);

    if (rows.length === 0) {
      toast({ title: "CSV parse error", description: errors.join("; "), variant: "destructive" });
      return;
    }

    setCsvRows(rows);
    setCsvParseErrors(errors);
    setCsvProgress(0);
    setCsvResults(null);
    setCsvImporting(false);
    setCsvPreviewOpen(true);
  };

  /** Rows grouped by offering, in file order. */
  const csvGroups = (() => {
    const groups = new Map<string, CsvRow[]>();
    for (const r of csvRows) groups.set(r.offering_id, [...(groups.get(r.offering_id) || []), r]);
    return [...groups.entries()].map(([offering_id, rows]) => ({
      offering_id,
      title: allOfferings.find((o) => o.id === offering_id)?.title ?? null,
      rows,
    }));
  })();

  /* All writes go through admin-grant-access, the same edge function the
     offering editor's Students tab uses. It finds or creates each account on
     the server, writes source 'bulk_import' and logs each grant. The old
     browser import inserted source 'admin_csv_import', which the enrolments
     check constraint rejects, so every row failed and showed as "skipped". */
  const handleCsvImport = async () => {
    setCsvImporting(true);
    setCsvProgress(0);
    const results: CsvGrantResult[] = [];
    const total = csvRows.length;
    let done = 0;

    for (const group of csvGroups) {
      // admin-grant-access takes one offering and at most 300 rows per call.
      for (let i = 0; i < group.rows.length; i += CSV_CHUNK_SIZE) {
        const slice = group.rows.slice(i, i + CSV_CHUNK_SIZE);
        const students = slice.map((r) => ({
          full_name: r.full_name || undefined,
          email: r.email || undefined,
          phone: r.phone || undefined,
        }));
        try {
          if (!group.title) throw new Error("Offering not found");
          const { data, error } = await supabase.functions.invoke("admin-grant-access", {
            body: { offering_id: group.offering_id, students, source: "bulk_import" },
          });
          if (error) throw new Error(error.message || "Request failed");
          if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
          const rowResults = (data as { results: { status: string; detail?: string }[] }).results;
          slice.forEach((row, j) => results.push({ row, status: rowResults[j]?.status ?? "error", detail: rowResults[j]?.detail }));
        } catch (err) {
          const detail = err instanceof Error ? err.message : "Request failed";
          slice.forEach((row) => results.push({ row, status: "error", detail }));
        }
        done += slice.length;
        setCsvProgress(Math.round((done / total) * 100));
        setCsvResults([...results]);
      }
    }

    const counts: Record<string, number> = {};
    for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
    const granted = GRANTED_STATUSES.reduce((n, st) => n + (counts[st] || 0), 0);
    setCsvImporting(false);
    toast({
      title: "CSV Import Complete",
      description: `${granted} granted, ${counts.already_enrolled || 0} already had access, ${counts.error || 0} failed`,
      variant: counts.error ? "destructive" : undefined,
    });
    load();
    loadFilterData();
  };

  const downloadCsvReport = () => {
    if (!csvResults) return;
    const esc = (v: string | undefined) => {
      const str = v ?? "";
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = ["full_name,email,phone,offering_id,status,detail"].concat(
      csvResults.map((r) => [r.row.full_name, r.row.email, r.row.phone, r.row.offering_id, r.status, r.detail].map(esc).join(",")),
    );
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "enrolment_import_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Client-side search filter (on already-loaded page) ── */
  const filtered = enrolments.filter((e) => {
    const matchesSearch = e.user_name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      e.user_email.toLowerCase().includes(debouncedSearch.toLowerCase());
    return matchesSearch;
  });

  return (
    <>
      {/* ── Filters Row ── */}
      <EnrolmentFilters
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        courseFilter={courseFilter}
        setCourseFilter={setCourseFilter}
        offeringFilter={offeringFilter}
        setOfferingFilter={setOfferingFilter}
        setPage={setPage}
        allCourses={allCourses}
        allOfferings={allOfferings}
      />

      {/* ── Actions Row ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Button onClick={openManualEnrol} className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
          <Plus className="h-4 w-4 mr-2" /> Manual Enrol
        </Button>
        <Button variant="outline" onClick={openBulkEnrol}>
          <Upload className="h-4 w-4 mr-2" /> Bulk Enrol
        </Button>
        <Button variant="outline" onClick={downloadCsvTemplate}>
          <Download className="h-4 w-4 mr-2" /> Download CSV Template
        </Button>
        <Button variant="outline" onClick={() => csvInputRef.current?.click()}>
          <FileUp className="h-4 w-4 mr-2" /> Bulk Import from CSV
        </Button>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleCsvFileSelect}
        />
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-surface border border-border rounded-lg">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Select onValueChange={requestBulkStatusChange}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Bulk set status..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Set Active</SelectItem>
              <SelectItem value="expired">Set Expired</SelectItem>
              <SelectItem value="cancelled">Set Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground ml-auto">Clear</button>
        </div>
      )}

      <EnrolmentTable
        rows={filtered}
        loading={loading}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onStatusChange={handleStatusChange}
        onGenerateCertificate={handleGenerateCertificate}
        generatingCertFor={generatingCertFor}
      />

      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* ── Manual Enrol Dialog ── */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Manual Enrolment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">User</label>
              <SearchableSelect
                options={allUsers.map((u) => ({ value: u.id, label: u.full_name || u.email }))}
                value={manualUserId}
                onValueChange={setManualUserId}
                placeholder="Select user"
                searchPlaceholder="Search users..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Offering</label>
              <SearchableSelect
                options={allOfferings.map((o) => ({ value: o.id, label: o.title }))}
                value={manualOfferingId}
                onValueChange={setManualOfferingId}
                placeholder="Select offering"
                searchPlaceholder="Search offerings..."
              />
            </div>
            <Button onClick={handleManualEnrol} disabled={saving} className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
              {saving ? "Enrolling..." : "Enrol User"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk status change confirmation ── */}
      <AlertDialog open={!!bulkStatusConfirm} onOpenChange={() => setBulkStatusConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm bulk status change</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to set <span className="font-mono font-semibold">{selectedIds.size}</span> enrolment{selectedIds.size !== 1 ? "s" : ""} to <span className="font-semibold">{bulkStatusConfirm}</span>. This action will take effect immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkStatusChange}>
              Update {selectedIds.size} Enrolment{selectedIds.size !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Enrol by Email Dialog ── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Bulk Enrol Users</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Offering</label>
              <SearchableSelect
                options={allOfferings.map((o) => ({ value: o.id, label: o.title }))}
                value={bulkOfferingId}
                onValueChange={setBulkOfferingId}
                placeholder="Select offering"
                searchPlaceholder="Search offerings..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email addresses (one per line or comma-separated)</label>
              <Textarea
                value={bulkEmails}
                onChange={(e) => setBulkEmails(e.target.value)}
                rows={6}
                placeholder={"student1@example.com\nstudent2@example.com"}
              />
            </div>
            {bulkResult && (
              <div className="text-sm space-y-1">
                <p className="text-green-400">{bulkResult.success} enrolled successfully</p>
                {bulkResult.skipped.length > 0 && (
                  <div className="text-yellow-400">
                    <p>{bulkResult.skipped.length} skipped (duplicates):</p>
                    <ul className="list-disc list-inside text-xs mt-1 max-h-32 overflow-y-auto">
                      {bulkResult.skipped.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {bulkResult.failed.length > 0 && (
                  <div className="text-red-400">
                    <p>{bulkResult.failed.length} failed:</p>
                    <ul className="list-disc list-inside text-xs mt-1 max-h-32 overflow-y-auto">
                      {bulkResult.failed.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <Button onClick={handleBulkEnrol} disabled={saving} className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
              {saving ? "Enrolling..." : "Enrol All"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CSV Import Preview Dialog ── */}
      <Dialog open={csvPreviewOpen} onOpenChange={(open) => { if (!csvImporting) setCsvPreviewOpen(open); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>CSV Import Preview</DialogTitle></DialogHeader>

          {csvParseErrors.length > 0 && (
            <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3 mb-4">
              <p className="font-medium mb-1">Parse warnings ({csvParseErrors.length}):</p>
              <ul className="list-disc list-inside text-xs max-h-24 overflow-y-auto">
                {csvParseErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {/* Rows per offering */}
          {csvGroups.length > 0 && (
            <div className="mb-4 bg-surface border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-2">Offering</th>
                    <th className="px-3 py-2">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {csvGroups.map((g) => (
                    <tr key={g.offering_id} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5">
                        {g.title ?? <span className="text-red-400">Unknown offering {g.offering_id.slice(0, 8)}... (these rows will fail)</span>}
                      </td>
                      <td className="px-3 py-1.5">{g.rows.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-muted-foreground mb-4">
            Each student is matched by phone, then email. A student with no account gets one, and can sign in with the phone number from the file.
          </p>

          {/* No data */}
          {csvRows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No valid rows found in CSV.</p>
          )}

          {/* Progress bar */}
          {csvImporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Importing...</span>
                <span>{csvProgress}%</span>
              </div>
              <Progress value={csvProgress} className="h-2" />
            </div>
          )}

          {/* Results */}
          {!csvImporting && csvResults && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {Object.entries(
                  csvResults.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}),
                ).map(([status, n]) => `${n} ${CSV_RESULT_LABEL[status] || status}`).join(", ")}
              </p>
              <Button variant="outline" onClick={downloadCsvReport}>
                <Download className="h-4 w-4 mr-2" /> Download report
              </Button>
            </div>
          )}

          {/* Confirm */}
          {!csvImporting && !csvResults && csvRows.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {csvRows.length} rows across {csvGroups.length} {csvGroups.length === 1 ? "offering" : "offerings"}
              </p>
              <Button
                onClick={handleCsvImport}
                className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
              >
                Confirm Import
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminEnrolments;
