import { useEffect, useState, useRef } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus, Search, Upload, Award, Download, FileUp } from "lucide-react";
import { generateAndSaveCertificate, VariablePosition } from "@/lib/certificate-generator";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";

interface EnrolmentRow {
  id: string;
  status: string;
  created_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  offering_id: string;
  offering_title: string;
  payment_order_id: string | null;
}

/* ── CSV Import types ── */
interface CsvRow {
  full_name: string;
  email: string;
  phone: string;
  offering_id: string;
}

interface CsvReadyRow extends CsvRow {
  existing_user_id: string;
}

interface CsvNewRow extends CsvRow {}

interface CsvConflictRow extends CsvRow {
  existing_user_id: string;
  existing_email: string;
  existing_phone: string;
  conflict_type: "email_match_phone_diff" | "phone_match_email_diff";
  action: "force" | "skip" | null;
}

const AdminEnrolments = () => {
  const PAGE_SIZE = 50;
  const [enrolments, setEnrolments] = useState<EnrolmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [offeringFilter, setOfferingFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
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
  const [csvReady, setCsvReady] = useState<CsvReadyRow[]>([]);
  const [csvNew, setCsvNew] = useState<CsvNewRow[]>([]);
  const [csvConflicts, setCsvConflicts] = useState<CsvConflictRow[]>([]);
  const [csvParseErrors, setCsvParseErrors] = useState<string[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvProgress, setCsvProgress] = useState(0);
  const [csvTotal, setCsvTotal] = useState(0);

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

  const load = async (p = page) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    /* ── Build server-side query with offering filter ── */
    let countQuery = supabase.from("enrolments").select("id", { count: "exact", head: true });
    let dataQuery = supabase
      .from("enrolments")
      .select("id, status, created_at, user_id, offering_id, payment_order_id")
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
        // No offerings match — return empty
        setEnrolments([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
      countQuery = countQuery.in("offering_id", targetOfferingIds);
      dataQuery = dataQuery.in("offering_id", targetOfferingIds);
    }

    if (statusFilter !== "all") {
      countQuery = countQuery.eq("status", statusFilter);
      dataQuery = dataQuery.eq("status", statusFilter);
    }

    const { count } = await countQuery;
    setTotalCount(count ?? 0);

    const { data: enrols } = await dataQuery.range(from, to);

    if (!enrols) { setLoading(false); return; }

    const userIds = [...new Set(enrols.map((e) => e.user_id))];
    const offIds = [...new Set(enrols.map((e) => e.offering_id))];

    const [uRes, oRes] = await Promise.all([
      userIds.length > 0
        ? supabase.from("users").select("id, full_name, email").in("id", userIds)
        : { data: [] },
      offIds.length > 0
        ? supabase.from("offerings").select("id, title").in("id", offIds)
        : { data: [] },
    ]);

    const uMap = Object.fromEntries((uRes.data || []).map((u) => [u.id, u]));
    const oMap = Object.fromEntries((oRes.data || []).map((o) => [o.id, o]));

    let rows = enrols.map((e) => ({
      id: e.id,
      status: e.status,
      created_at: e.created_at,
      user_id: e.user_id,
      user_name: uMap[e.user_id]?.full_name || "Unknown",
      user_email: uMap[e.user_id]?.email || "",
      offering_id: e.offering_id,
      offering_title: oMap[e.offering_id]?.title || "Unknown",
      payment_order_id: e.payment_order_id,
    }));

    setEnrolments(rows);
    setLoading(false);
  };

  useEffect(() => { load(page); }, [page, statusFilter, offeringFilter, courseFilter]);

  const handleStatusChange = async (enrolId: string, newStatus: string) => {
    const { error } = await supabase.from("enrolments").update({ status: newStatus }).eq("id", enrolId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      if (profile?.id) {
        await (supabase as any).from("admin_audit_logs").insert({
          admin_user_id: profile.id,
          action: "update",
          entity_type: "enrolment",
          entity_id: enrolId,
          details: { new_status: newStatus },
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
    setAllUsers(uRes.data || []);
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
          admin_user_id: profile.id,
          action: "create",
          entity_type: "enrolment",
          entity_id: `${manualUserId}:${manualOfferingId}`,
          details: { user_id: manualUserId, offering_id: manualOfferingId, source: "admin_manual" },
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
        failed.push(`${entry} — invalid format`);
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
        failed.push(`${email} — user not found`);
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
        skipped.push(`${email} — already has active enrolment`);
        continue;
      }

      const { error } = await supabase.from("enrolments").insert({
        user_id: user.id,
        offering_id: bulkOfferingId,
        source: "admin_manual",
        status: "active",
      });

      if (error) {
        failed.push(`${email} — ${error.message}`);
      } else {
        success++;
      }
    }

    setBulkResult({ success, failed, skipped });
    if (success > 0) {
      if (profile?.id) {
        await (supabase as any).from("admin_audit_logs").insert({
          admin_user_id: profile.id,
          action: "bulk_create",
          entity_type: "enrolment",
          entity_id: bulkOfferingId,
          details: { offering_id: bulkOfferingId, success, failed: failed.length, skipped: skipped.length },
        });
      }
      toast({ title: `${success} users enrolled` });
      load(page);
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
          admin_user_id: profile.id,
          action: "bulk_update",
          entity_type: "enrolment",
          entity_id: ids.join(","),
          details: { enrolment_ids: ids, new_status: newStatus, count: ids.length },
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
          generatedBy: "admin",
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

    if (emailIdx === -1) return { rows: [], errors: ["CSV must have an 'email' column."] };

    const rows: CsvRow[] = [];
    const errors: string[] = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const email = (cols[emailIdx] || "").trim().toLowerCase();
      const full_name = nameIdx >= 0 ? (cols[nameIdx] || "").trim() : "";
      const phone = phoneIdx >= 0 ? (cols[phoneIdx] || "").trim().replace(/\D/g, "") : "";
      const offering_id = offeringIdx >= 0 ? (cols[offeringIdx] || "").trim() : "";

      if (!email) { errors.push(`Row ${i + 1}: missing email`); continue; }
      if (!emailRegex.test(email)) { errors.push(`Row ${i + 1}: invalid email "${email}"`); continue; }
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

    // Now check users in DB
    const ready: CsvReadyRow[] = [];
    const newRows: CsvNewRow[] = [];
    const conflicts: CsvConflictRow[] = [];
    const parseErrors = [...errors];

    // Batch lookup: get all users by email
    const emails = [...new Set(rows.map((r) => r.email))];
    const phones = [...new Set(rows.map((r) => r.phone).filter((p) => p.length > 0))];

    // Fetch users matching any of these emails
    let emailUsers: { id: string; email: string; phone: string | null; full_name: string | null }[] = [];
    if (emails.length > 0) {
      // Supabase .in() has a limit, so batch in chunks of 100
      for (let i = 0; i < emails.length; i += 100) {
        const chunk = emails.slice(i, i + 100);
        const { data } = await supabase
          .from("users")
          .select("id, email, phone, full_name")
          .in("email", chunk);
        if (data) emailUsers = emailUsers.concat(data);
      }
    }

    // Also fetch users matching phones (to detect phone conflicts)
    let phoneUsers: { id: string; email: string; phone: string | null; full_name: string | null }[] = [];
    if (phones.length > 0) {
      for (let i = 0; i < phones.length; i += 100) {
        const chunk = phones.slice(i, i + 100);
        const { data } = await supabase
          .from("users")
          .select("id, email, phone, full_name")
          .in("phone", chunk);
        if (data) phoneUsers = phoneUsers.concat(data);
      }
    }

    const emailMap = new Map(emailUsers.map((u) => [u.email, u]));
    const phoneMap = new Map(phoneUsers.filter((u) => u.phone).map((u) => [u.phone!, u]));

    for (const row of rows) {
      const byEmail = emailMap.get(row.email);
      const byPhone = row.phone ? phoneMap.get(row.phone) : undefined;

      if (byEmail && byPhone && byEmail.id === byPhone.id) {
        // Both match same user — ready to enroll
        ready.push({ ...row, existing_user_id: byEmail.id });
      } else if (byEmail && !row.phone) {
        // Email matches, no phone in CSV — treat as ready
        ready.push({ ...row, existing_user_id: byEmail.id });
      } else if (byEmail) {
        // Email matches but phone differs
        const existingPhone = byEmail.phone || "";
        if (existingPhone === row.phone || !existingPhone) {
          // Phone matches or user has no phone — ready
          ready.push({ ...row, existing_user_id: byEmail.id });
        } else {
          // Phone conflict
          conflicts.push({
            ...row,
            existing_user_id: byEmail.id,
            existing_email: byEmail.email,
            existing_phone: existingPhone,
            conflict_type: "email_match_phone_diff",
            action: null,
          });
        }
      } else if (byPhone) {
        // Phone matches but email doesn't
        conflicts.push({
          ...row,
          existing_user_id: byPhone.id,
          existing_email: byPhone.email,
          existing_phone: byPhone.phone || "",
          conflict_type: "phone_match_email_diff",
          action: null,
        });
      } else {
        // No match at all — new user
        newRows.push(row);
      }
    }

    setCsvReady(ready);
    setCsvNew(newRows);
    setCsvConflicts(conflicts);
    setCsvParseErrors(parseErrors);
    setCsvProgress(0);
    setCsvTotal(0);
    setCsvImporting(false);
    setCsvPreviewOpen(true);
  };

  const setConflictAction = (idx: number, action: "force" | "skip") => {
    setCsvConflicts((prev) => prev.map((c, i) => i === idx ? { ...c, action } : c));
  };

  const handleCsvImport = async () => {
    setCsvImporting(true);
    let enrolled = 0;
    let usersCreated = 0;
    let skipped = 0;

    const forcedConflicts = csvConflicts.filter((c) => c.action === "force");
    const skippedConflicts = csvConflicts.filter((c) => c.action === "skip" || c.action === null);
    skipped += skippedConflicts.length;

    const totalItems = csvReady.length + csvNew.length + forcedConflicts.length;
    setCsvTotal(totalItems);
    let processed = 0;

    const updateProgress = () => {
      processed++;
      setCsvProgress(Math.round((processed / totalItems) * 100));
    };

    // 1. Enrol ready users
    for (const row of csvReady) {
      // Check for duplicate
      const { data: existing } = await supabase
        .from("enrolments")
        .select("id")
        .eq("user_id", row.existing_user_id)
        .eq("offering_id", row.offering_id)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        skipped++;
      } else {
        const { error } = await supabase.from("enrolments").insert({
          user_id: row.existing_user_id,
          offering_id: row.offering_id,
          source: "admin_csv_import",
          status: "active",
        });
        if (!error) enrolled++;
        else skipped++;
      }
      updateProgress();
    }

    // 2. Create new users and enrol
    for (const row of csvNew) {
      // Create user via auth.signUp with a random password (they can reset)
      const tempPassword = crypto.randomUUID().slice(0, 20) + "Aa1!";
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: row.email,
        password: tempPassword,
        options: {
          data: {
            full_name: row.full_name,
            phone: row.phone,
          },
        },
      });

      if (signUpError || !signUpData.user) {
        skipped++;
        updateProgress();
        continue;
      }

      // Wait briefly for the trigger to create the users row, then enrol
      // The user row should be created by the auth trigger
      let userId = signUpData.user.id;
      usersCreated++;

      // Try to enrol — the users table row may take a moment
      let retries = 3;
      let enrollSuccess = false;
      while (retries > 0) {
        const { error } = await supabase.from("enrolments").insert({
          user_id: userId,
          offering_id: row.offering_id,
          source: "admin_csv_import",
          status: "active",
        });
        if (!error) {
          enrolled++;
          enrollSuccess = true;
          break;
        }
        retries--;
        if (retries > 0) await new Promise((r) => setTimeout(r, 1000));
      }
      if (!enrollSuccess) skipped++;
      updateProgress();
    }

    // 3. Force-update conflicts and enrol
    for (const row of forcedConflicts) {
      // Update user's phone/email
      if (row.conflict_type === "email_match_phone_diff") {
        await supabase.from("users").update({ phone: row.phone }).eq("id", row.existing_user_id);
      } else {
        await supabase.from("users").update({ email: row.email }).eq("id", row.existing_user_id);
      }

      // Check for duplicate enrolment
      const { data: existing } = await supabase
        .from("enrolments")
        .select("id")
        .eq("user_id", row.existing_user_id)
        .eq("offering_id", row.offering_id)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        skipped++;
      } else {
        const { error } = await supabase.from("enrolments").insert({
          user_id: row.existing_user_id,
          offering_id: row.offering_id,
          source: "admin_csv_import",
          status: "active",
        });
        if (!error) enrolled++;
        else skipped++;
      }
      updateProgress();
    }

    // Audit log
    if (profile?.id) {
      await (supabase as any).from("admin_audit_logs").insert({
        admin_user_id: profile.id,
        action: "csv_import",
        entity_type: "enrolment",
        entity_id: "csv_bulk",
        details: { enrolled, users_created: usersCreated, skipped },
      });
    }

    setCsvImporting(false);
    toast({
      title: "CSV Import Complete",
      description: `${enrolled} enrolled, ${usersCreated} users created, ${skipped} skipped`,
    });
    setCsvPreviewOpen(false);
    load(page);
    loadFilterData();
  };

  /* ── Client-side search filter (on already-loaded page) ── */
  const filtered = enrolments.filter((e) => {
    const matchesSearch = e.user_name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      e.user_email.toLowerCase().includes(debouncedSearch.toLowerCase());
    return matchesSearch;
  });

  return (
    <AdminLayout title="Enrolments">
      {/* ── Filters Row ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={courseFilter} onValueChange={(v) => { setCourseFilter(v); setPage(0); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Course" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            {allCourses.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={offeringFilter} onValueChange={(v) => { setOfferingFilter(v); setPage(0); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Offering" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Offerings</SelectItem>
            {allOfferings.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-3 py-3 w-10">
                <Checkbox
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th className="px-5 py-3 font-medium">Student</th>
              <th className="px-5 py-3 font-medium">Offering</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Enrolled</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">No enrolments found</td></tr>
            ) : filtered.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-3 py-3">
                  <Checkbox
                    checked={selectedIds.has(e.id)}
                    onCheckedChange={() => toggleSelect(e.id)}
                  />
                </td>
                <td className="px-5 py-3">
                  <p className="font-medium">{e.user_name}</p>
                  <p className="text-xs text-muted-foreground">{e.user_email}</p>
                </td>
                <td className="px-5 py-3">{e.offering_title}</td>
                <td className="px-5 py-3">
                  <Select value={e.status} onValueChange={(v) => handleStatusChange(e.id, v)}>
                    <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-5 py-3 font-mono text-xs">{new Date(e.created_at).toLocaleDateString("en-IN")}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{e.payment_order_id ? "Paid" : "Manual"}</span>
                    {e.status === "active" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        disabled={generatingCertFor === e.id}
                        onClick={() => handleGenerateCertificate(e)}
                        title="Generate Certificate"
                      >
                        <Award className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

          {/* Ready to enroll */}
          {csvReady.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-green-400 mb-2">
                Ready to enroll ({csvReady.length})
              </h3>
              <div className="bg-green-400/5 border border-green-400/20 rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-green-400/20 text-left text-muted-foreground">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Offering ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvReady.map((r, i) => (
                      <tr key={i} className="border-b border-green-400/10 last:border-0">
                        <td className="px-3 py-1.5">{r.full_name || "—"}</td>
                        <td className="px-3 py-1.5">{r.email}</td>
                        <td className="px-3 py-1.5 font-mono text-[10px]">{r.offering_id.slice(0, 8)}...</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* New users */}
          {csvNew.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-blue-400 mb-2">
                New users — will be created ({csvNew.length})
              </h3>
              <div className="bg-blue-400/5 border border-blue-400/20 rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-blue-400/20 text-left text-muted-foreground">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">Offering ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvNew.map((r, i) => (
                      <tr key={i} className="border-b border-blue-400/10 last:border-0">
                        <td className="px-3 py-1.5">{r.full_name || "—"}</td>
                        <td className="px-3 py-1.5">{r.email}</td>
                        <td className="px-3 py-1.5">{r.phone || "—"}</td>
                        <td className="px-3 py-1.5 font-mono text-[10px]">{r.offering_id.slice(0, 8)}...</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Conflicts */}
          {csvConflicts.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-yellow-400 mb-2">
                Conflicts — review required ({csvConflicts.length})
              </h3>
              <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-yellow-400/20 text-left text-muted-foreground">
                      <th className="px-3 py-2">CSV Email</th>
                      <th className="px-3 py-2">CSV Phone</th>
                      <th className="px-3 py-2">Existing Email</th>
                      <th className="px-3 py-2">Existing Phone</th>
                      <th className="px-3 py-2">Conflict</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvConflicts.map((c, i) => (
                      <tr key={i} className="border-b border-yellow-400/10 last:border-0">
                        <td className="px-3 py-1.5">{c.email}</td>
                        <td className="px-3 py-1.5">{c.phone || "—"}</td>
                        <td className="px-3 py-1.5">{c.existing_email}</td>
                        <td className="px-3 py-1.5">{c.existing_phone || "—"}</td>
                        <td className="px-3 py-1.5">
                          {c.conflict_type === "email_match_phone_diff"
                            ? "Email matches, phone differs"
                            : "Phone matches, email differs"}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex gap-1">
                            <button
                              onClick={() => setConflictAction(i, "force")}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                                c.action === "force"
                                  ? "bg-yellow-500 text-black border-yellow-500"
                                  : "border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/10"
                              }`}
                            >
                              Force Update
                            </button>
                            <button
                              onClick={() => setConflictAction(i, "skip")}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                                c.action === "skip"
                                  ? "bg-muted text-foreground border-border"
                                  : "border-border text-muted-foreground hover:bg-muted/50"
                              }`}
                            >
                              Skip
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* No data */}
          {csvReady.length === 0 && csvNew.length === 0 && csvConflicts.length === 0 && (
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

          {/* Summary & confirm */}
          {!csvImporting && (csvReady.length > 0 || csvNew.length > 0 || csvConflicts.some((c) => c.action === "force")) && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {csvReady.length} ready, {csvNew.length} new users, {csvConflicts.filter((c) => c.action === "force").length} force-updated, {csvConflicts.filter((c) => c.action === "skip" || c.action === null).length} skipped
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
    </AdminLayout>
  );
};

export default AdminEnrolments;
