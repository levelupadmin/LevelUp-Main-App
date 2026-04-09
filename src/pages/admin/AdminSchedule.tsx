import { useEffect, useState, useRef, useCallback } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Upload,
  Pencil,
  Trash2,
  Video,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  CalendarIcon,
  ChevronUp,
  ChevronDown,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfDay, isBefore } from "date-fns";

/* ────────────────────────────────────────────────── */
/*  Types                                             */
/* ────────────────────────────────────────────────── */
interface LiveSession {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  zoom_link: string | null;
  recording_url: string | null;
  status: string;
  course_title?: string;
  attendance_count?: number;
}

interface CourseOption {
  id: string;
  title: string;
}

const EMPTY_FORM = {
  course_id: "",
  title: "",
  description: "",
  date: null as Date | null,
  hour: 10,
  minute: 0,
  period: "AM" as "AM" | "PM",
  duration_minutes: 60,
  zoom_link: "",
  recording_url: "",
  status: "scheduled",
  repeat_weeks: 0,
};

/* ────────────────────────────────────────────────── */
/*  Helpers                                           */
/* ────────────────────────────────────────────────── */
function isoToFormFields(iso: string) {
  const d = new Date(iso);
  let h = d.getHours();
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return { date: d, hour: h, minute: d.getMinutes(), period };
}

function formFieldsToIso(date: Date | null, hour: number, minute: number, period: "AM" | "PM"): string | null {
  if (!date) return null;
  let h24 = hour;
  if (period === "AM" && hour === 12) h24 = 0;
  else if (period === "PM" && hour !== 12) h24 = hour + 12;
  const d = new Date(date);
  d.setHours(h24, minute, 0, 0);
  return d.toISOString();
}

/* ── Scroll-based time picker ── */
function TimePicker({
  hour,
  minute,
  period,
  onHourChange,
  onMinuteChange,
  onPeriodChange,
}: {
  hour: number;
  minute: number;
  period: "AM" | "PM";
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  onPeriodChange: (p: "AM" | "PM") => void;
}) {
  const incHour = () => onHourChange(hour >= 12 ? 1 : hour + 1);
  const decHour = () => onHourChange(hour <= 1 ? 12 : hour - 1);
  const incMinute = () => onMinuteChange(minute >= 55 ? 0 : minute + 5);
  const decMinute = () => onMinuteChange(minute <= 0 ? 55 : minute - 5);
  const togglePeriod = () => onPeriodChange(period === "AM" ? "PM" : "AM");

  const columnClass = "flex flex-col items-center gap-0.5";
  const arrowBtn = "p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors";
  const valueClass = "text-xl font-semibold tabular-nums w-10 text-center select-none";

  return (
    <div className="flex items-center gap-1 justify-center">
      {/* Hour */}
      <div className={columnClass}>
        <button type="button" onClick={incHour} className={arrowBtn}><ChevronUp className="h-4 w-4" /></button>
        <span className={valueClass}>{String(hour).padStart(2, "0")}</span>
        <button type="button" onClick={decHour} className={arrowBtn}><ChevronDown className="h-4 w-4" /></button>
      </div>

      <span className="text-xl font-semibold select-none pb-0.5">:</span>

      {/* Minute */}
      <div className={columnClass}>
        <button type="button" onClick={incMinute} className={arrowBtn}><ChevronUp className="h-4 w-4" /></button>
        <span className={valueClass}>{String(minute).padStart(2, "0")}</span>
        <button type="button" onClick={decMinute} className={arrowBtn}><ChevronDown className="h-4 w-4" /></button>
      </div>

      {/* AM / PM */}
      <div className={columnClass + " ml-1"}>
        <button type="button" onClick={togglePeriod} className={arrowBtn}><ChevronUp className="h-4 w-4" /></button>
        <span className={cn(valueClass, "text-base font-medium w-10")}>{period}</span>
        <button type="button" onClick={togglePeriod} className={arrowBtn}><ChevronDown className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────── */
/*  Component                                         */
/* ────────────────────────────────────────────────── */
const AdminSchedule = () => {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [attendanceSession, setAttendanceSession] = useState<LiveSession | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [enrolledStudents, setEnrolledStudents] = useState<{id: string; name: string; email: string}[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const f = (key: keyof typeof EMPTY_FORM, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /* ── Load ── */
  const load = async () => {
    setLoading(true);
    const [sessRes, courseRes] = await Promise.all([
      supabase
        .from("live_sessions")
        .select("*")
        .order("scheduled_at", { ascending: true }),
      supabase.from("courses").select("id, title").order("title"),
    ]);

    const courseMap: Record<string, string> = {};
    (courseRes.data || []).forEach((c) => {
      courseMap[c.id] = c.title;
    });
    setCourses(courseRes.data || []);

    const sessionsList = (sessRes.data || []).map((s: any) => ({
      ...s,
      course_title: courseMap[s.course_id] || "Unknown course",
    }));

    // Fetch attendance counts for sessions
    const sessionIds = sessionsList.map((s: any) => s.id);
    if (sessionIds.length > 0) {
      const { data: attCounts } = await (supabase as any)
        .from("session_attendance")
        .select("session_id")
        .eq("status", "present")
        .in("session_id", sessionIds);
      const countMap: Record<string, number> = {};
      (attCounts || []).forEach((a: any) => { countMap[a.session_id] = (countMap[a.session_id] || 0) + 1; });
      sessionsList.forEach((s: any) => { s.attendance_count = countMap[s.id] || 0; });
    }

    setSessions(sessionsList);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  /* ── Open dialog ── */
  const openAdd = () => {
    setForm({ ...EMPTY_FORM, course_id: filterCourse !== "all" ? filterCourse : "" });
    setEditId(null);
    setDialogOpen(true);
  };

  const openEdit = (s: LiveSession) => {
    const { date, hour, minute, period } = isoToFormFields(s.scheduled_at);
    setForm({
      course_id: s.course_id,
      title: s.title,
      description: s.description || "",
      date,
      hour,
      minute,
      period,
      duration_minutes: s.duration_minutes || 60,
      zoom_link: s.zoom_link || "",
      recording_url: s.recording_url || "",
      status: s.status,
    });
    setEditId(s.id);
    setDialogOpen(true);
  };

  /* ── Save ── */
  const handleSave = async () => {
    if (!form.course_id) {
      toast({ title: "Select a course", variant: "destructive" });
      return;
    }
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (!form.date) {
      toast({ title: "Pick a date", variant: "destructive" });
      return;
    }

    const scheduledIso = formFieldsToIso(form.date, form.hour, form.minute, form.period);
    if (!scheduledIso) {
      toast({ title: "Date & time is required", variant: "destructive" });
      return;
    }

    // Block scheduling in the past (only for new sessions — allow edits to past sessions)
    if (!editId && new Date(scheduledIso) < new Date()) {
      toast({ title: "Cannot schedule in the past", description: "Pick a future date and time.", variant: "destructive" });
      return;
    }

    // Conflict check: look for overlapping sessions on the same course
    const sessionStart = new Date(scheduledIso);
    const sessionEnd = new Date(sessionStart.getTime() + (form.duration_minutes || 60) * 60000);
    const { data: conflicts } = await supabase
      .from("live_sessions")
      .select("id, title, scheduled_at, duration_minutes")
      .eq("course_id", form.course_id)
      .neq("id", editId || "00000000-0000-0000-0000-000000000000")
      .gte("scheduled_at", new Date(sessionStart.getTime() - 24 * 60 * 60000).toISOString())
      .lte("scheduled_at", sessionEnd.toISOString());

    const overlapping = (conflicts || []).filter((s) => {
      const sStart = new Date(s.scheduled_at);
      const sEnd = new Date(sStart.getTime() + (s.duration_minutes || 60) * 60000);
      return sessionStart < sEnd && sessionEnd > sStart;
    });

    if (overlapping.length > 0) {
      toast({
        title: "Schedule conflict",
        description: `Overlaps with "${overlapping[0].title}" at ${new Date(overlapping[0].scheduled_at).toLocaleString("en-IN")}`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const payload = {
      course_id: form.course_id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      scheduled_at: scheduledIso,
      duration_minutes: form.duration_minutes || 60,
      zoom_link: form.zoom_link.trim() || null,
      recording_url: form.recording_url.trim() || null,
      status: form.status,
    };

    if (editId) {
      const { error } = await supabase.from("live_sessions").update(payload).eq("id", editId);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Session updated" });
      }
    } else if (form.repeat_weeks > 0) {
      // Create recurring sessions — check conflicts for all weeks
      const rows = [];
      for (let w = 0; w <= form.repeat_weeks; w++) {
        const dt = new Date(scheduledIso);
        dt.setDate(dt.getDate() + w * 7);
        rows.push({ ...payload, scheduled_at: dt.toISOString() });
      }

      // Check all recurring dates for conflicts
      const firstStart = new Date(rows[0].scheduled_at);
      const lastEnd = new Date(new Date(rows[rows.length - 1].scheduled_at).getTime() + (form.duration_minutes || 60) * 60000);
      const { data: allConflicts } = await supabase
        .from("live_sessions")
        .select("id, title, scheduled_at, duration_minutes")
        .eq("course_id", form.course_id)
        .gte("scheduled_at", new Date(firstStart.getTime() - 24 * 60 * 60000).toISOString())
        .lte("scheduled_at", lastEnd.toISOString());

      const conflictingWeek = rows.find((row) => {
        const rStart = new Date(row.scheduled_at);
        const rEnd = new Date(rStart.getTime() + (form.duration_minutes || 60) * 60000);
        return (allConflicts || []).some((s) => {
          const sStart = new Date(s.scheduled_at);
          const sEnd = new Date(sStart.getTime() + (s.duration_minutes || 60) * 60000);
          return rStart < sEnd && rEnd > sStart;
        });
      });

      if (conflictingWeek) {
        toast({
          title: "Schedule conflict in recurring series",
          description: `Session on ${new Date(conflictingWeek.scheduled_at).toLocaleDateString("en-IN")} overlaps with an existing session`,
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      const { error } = await supabase.from("live_sessions").insert(rows);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: `${rows.length} sessions created` });
      }
    } else {
      const { error } = await supabase.from("live_sessions").insert(payload);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Session created" });
      }
    }

    setSaving(false);
    setDialogOpen(false);
    load();
  };

  /* ── Delete ── */
  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("live_sessions").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session deleted" });
      load();
    }
    setDeleteId(null);
  };

  /* ── Attendance ── */
  const openAttendance = async (session: LiveSession) => {
    setAttendanceSession(session);
    setAttendanceLoading(true);
    setEnrolledStudents([]);
    setAttendanceMap({});

    try {
      // Get offering_ids for this course
      const { data: offeringCourses } = await (supabase as any)
        .from("offering_courses")
        .select("offering_id")
        .eq("course_id", session.course_id);
      const offeringIds = (offeringCourses || []).map((oc: any) => oc.offering_id);

      let students: {id: string; name: string; email: string}[] = [];
      if (offeringIds.length > 0) {
        // Get active enrolments
        const { data: enrolments } = await (supabase as any)
          .from("enrolments")
          .select("user_id")
          .in("offering_id", offeringIds)
          .eq("status", "active");
        const userIds = [...new Set((enrolments || []).map((e: any) => e.user_id))] as string[];

        if (userIds.length > 0) {
          const { data: users } = await (supabase as any)
            .from("users")
            .select("id, full_name, email")
            .in("id", userIds);
          students = (users || []).map((u: any) => ({ id: u.id, name: u.full_name || "", email: u.email || "" }));
        }
      }

      // Fetch existing attendance
      const { data: existing } = await (supabase as any)
        .from("session_attendance")
        .select("user_id, status")
        .eq("session_id", session.id);
      const map: Record<string, string> = {};
      (existing || []).forEach((a: any) => { map[a.user_id] = a.status; });

      setEnrolledStudents(students);
      setAttendanceMap(map);
    } catch (err: any) {
      toast({ title: "Error loading attendance", description: err.message, variant: "destructive" });
    }
    setAttendanceLoading(false);
  };

  const saveAttendance = async () => {
    if (!attendanceSession) return;
    setSaving(true);
    const records = enrolledStudents.map(s => ({
      session_id: attendanceSession.id,
      user_id: s.id,
      status: attendanceMap[s.id] || "absent",
    }));
    const { error } = await (supabase as any).from("session_attendance").upsert(records, { onConflict: "session_id,user_id" });
    if (error) {
      toast({ title: "Error saving attendance", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Attendance saved" });
      setAttendanceSession(null);
      load();
    }
    setSaving(false);
  };

  /* ── CSV Upload ── */
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const courseId = filterCourse !== "all" ? filterCourse : "";
    if (!courseId) {
      toast({
        title: "Select a course first",
        description: "Filter by a course before uploading CSV so sessions are tagged correctly.",
        variant: "destructive",
      });
      if (csvInputRef.current) csvInputRef.current.value = "";
      return;
    }

    setCsvUploading(true);
    try {
      const text = await file.text();
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      // Skip header row if it looks like one
      const startIdx = lines[0]?.toLowerCase().includes("title") ? 1 : 0;

      const rows: { course_id: string; title: string; scheduled_at: string; zoom_link: string | null }[] = [];
      const errors: string[] = [];

      for (let i = startIdx; i < lines.length; i++) {
        // Support both comma and tab delimited
        const parts = lines[i].includes("\t")
          ? lines[i].split("\t")
          : lines[i].split(",").map((p) => p.trim().replace(/^"|"$/g, ""));

        if (parts.length < 2) {
          errors.push(`Row ${i + 1}: needs at least title and date/time`);
          continue;
        }

        const title = parts[0].trim();
        const dateStr = parts[1].trim();
        const zoomLink = parts[2]?.trim() || null;

        const parsed = new Date(dateStr);
        if (isNaN(parsed.getTime())) {
          errors.push(`Row ${i + 1}: invalid date "${dateStr}"`);
          continue;
        }

        rows.push({
          course_id: courseId,
          title,
          scheduled_at: parsed.toISOString(),
          zoom_link: zoomLink,
        });
      }

      if (errors.length > 0) {
        toast({
          title: `${errors.length} row(s) skipped`,
          description: errors.slice(0, 3).join("; "),
          variant: "destructive",
        });
      }

      if (rows.length > 0) {
        const { error } = await supabase.from("live_sessions").insert(rows);
        if (error) {
          toast({ title: "Upload failed", description: error.message, variant: "destructive" });
        } else {
          toast({ title: `${rows.length} session(s) created` });
          load();
        }
      }
    } catch (err: any) {
      toast({ title: "Error reading CSV", description: err.message, variant: "destructive" });
    }
    setCsvUploading(false);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  /* ── Filter ── */
  const filtered =
    filterCourse === "all"
      ? sessions
      : sessions.filter((s) => s.course_id === filterCourse);

  const upcoming = filtered.filter((s) => s.status === "scheduled" && new Date(s.scheduled_at) >= new Date());
  const past = filtered.filter((s) => s.status !== "scheduled" || new Date(s.scheduled_at) < new Date());

  /* ── Status helpers ── */
  const statusBadge = (status: string, scheduledAt: string) => {
    const isPast = new Date(scheduledAt) < new Date();
    if (status === "completed") return { label: "Completed", color: "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]", icon: CheckCircle2 };
    if (status === "cancelled") return { label: "Cancelled", color: "bg-destructive/15 text-destructive", icon: XCircle };
    if (isPast) return { label: "Past", color: "bg-secondary text-muted-foreground", icon: Clock };
    return { label: "Upcoming", color: "bg-blue-500/15 text-blue-400", icon: Clock };
  };

  return (
    <AdminLayout title="Schedule Classes">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <SearchableSelect
            options={[
              { value: "all", label: "All courses" },
              ...courses.map((c) => ({ value: c.id, label: c.title })),
            ]}
            value={filterCourse}
            onValueChange={setFilterCourse}
            placeholder="All courses"
            searchPlaceholder="Search courses…"
            triggerClassName="w-56"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={handleCsvUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => csvInputRef.current?.click()}
            disabled={csvUploading}
          >
            {csvUploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload CSV
          </Button>
          <Button
            onClick={openAdd}
            className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Session
          </Button>
        </div>
      </div>

      {/* Upcoming sessions */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No sessions found</p>
          <p className="text-sm mt-1">Add a session or upload a CSV to get started</p>
        </div>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Upcoming ({upcoming.length})
              </h2>
              <div className="space-y-2">
                {upcoming.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    badge={statusBadge(s.status, s.scheduled_at)}
                    onEdit={() => openEdit(s)}
                    onDelete={() => setDeleteId(s.id)}
                    onAttendance={() => openAttendance(s)}
                  />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Past / Completed ({past.length})
              </h2>
              <div className="space-y-2">
                {past.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    badge={statusBadge(s.status, s.scheduled_at)}
                    onEdit={() => openEdit(s)}
                    onDelete={() => setDeleteId(s.id)}
                    onAttendance={() => openAttendance(s)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-lg max-h-[85vh] flex flex-col"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>{editId ? "Edit Session" : "Add Session"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            <div>
              <Label>Course</Label>
              <SearchableSelect
                options={courses.map((c) => ({ value: c.id, label: c.title }))}
                value={form.course_id}
                onValueChange={(v) => f("course_id", v)}
                placeholder="Select course"
                searchPlaceholder="Search courses…"
              />
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => f("title", e.target.value)}
                placeholder="e.g., Week 3: Cinematography Basics"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => f("description", e.target.value)}
                rows={2}
                placeholder="Notes for students"
              />
            </div>
            {/* Date picker */}
            <div>
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !form.date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.date ? format(form.date, "EEE, MMM d, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.date ?? undefined}
                    onSelect={(day) => f("date", day ?? null)}
                    disabled={(day) => isBefore(day, startOfDay(new Date()))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time + Duration row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Time</Label>
                <div className="border border-input rounded-md px-3 py-2 bg-background">
                  <TimePicker
                    hour={form.hour}
                    minute={form.minute}
                    period={form.period}
                    onHourChange={(h) => f("hour", h)}
                    onMinuteChange={(m) => f("minute", m)}
                    onPeriodChange={(p) => f("period", p)}
                  />
                </div>
              </div>
              <div>
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={form.duration_minutes}
                  onChange={(e) => f("duration_minutes", Number(e.target.value))}
                />
              </div>
            </div>
            {!editId && (
              <div>
                <Label>Repeat weekly for</Label>
                <Select
                  value={String(form.repeat_weeks)}
                  onValueChange={(v) => f("repeat_weeks", Number(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No repeat (single session)</SelectItem>
                    <SelectItem value="3">4 weeks</SelectItem>
                    <SelectItem value="7">8 weeks</SelectItem>
                    <SelectItem value="11">12 weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Zoom Link</Label>
              <Input
                value={form.zoom_link}
                onChange={(e) => f("zoom_link", e.target.value)}
                placeholder="https://zoom.us/j/..."
              />
            </div>
            <div>
              <Label>Recording URL (add after class)</Label>
              <Input
                value={form.recording_url}
                onChange={(e) => f("recording_url", e.target.value)}
                placeholder="Zoom cloud recording link"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => f("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
            >
              {saving ? "Saving…" : editId ? "Update Session" : "Create Session"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attendance Dialog */}
      <Dialog open={!!attendanceSession} onOpenChange={() => setAttendanceSession(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Attendance: {attendanceSession?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">
              {Object.values(attendanceMap).filter(s => s === 'present').length} / {enrolledStudents.length} present
            </span>
            <Button variant="outline" size="sm" onClick={() => {
              const newMap: Record<string, string> = {};
              enrolledStudents.forEach(s => { newMap[s.id] = 'present'; });
              setAttendanceMap(newMap);
            }}>
              Mark All Present
            </Button>
          </div>
          {attendanceLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : enrolledStudents.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No enrolled students found</p>
          ) : (
            <div className="space-y-1 overflow-y-auto flex-1">
              {enrolledStudents.map(s => (
                <div key={s.id} className="flex items-center justify-between py-2 px-3 rounded hover:bg-secondary/50">
                  <div>
                    <p className="text-sm font-medium">{s.name || 'Unnamed'}</p>
                    <p className="text-xs text-muted-foreground">{s.email}</p>
                  </div>
                  <Select value={attendanceMap[s.id] || 'absent'} onValueChange={(v) => setAttendanceMap(prev => ({...prev, [s.id]: v}))}>
                    <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                      <SelectItem value="excused">Excused</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
          <Button onClick={saveAttendance} disabled={saving} className="w-full mt-3 bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
            {saving ? 'Saving…' : 'Save Attendance'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this scheduled session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

/* ────────────────────────────────────────────────── */
/*  Session Row Component                             */
/* ────────────────────────────────────────────────── */
function SessionRow({
  session: s,
  badge,
  onEdit,
  onDelete,
  onAttendance,
}: {
  session: LiveSession;
  badge: { label: string; color: string; icon: any };
  onEdit: () => void;
  onDelete: () => void;
  onAttendance: () => void;
}) {
  const Icon = badge.icon;
  const isPastOrCompleted = s.status === "completed" || s.status === "cancelled" || new Date(s.scheduled_at) < new Date();
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
      {/* Date block */}
      <div className="text-center shrink-0 w-14">
        <p className="text-xs text-muted-foreground font-mono uppercase">
          {new Date(s.scheduled_at).toLocaleDateString("en-IN", { month: "short" })}
        </p>
        <p className="text-2xl font-bold leading-tight">
          {new Date(s.scheduled_at).getDate()}
        </p>
        <p className="text-[10px] text-muted-foreground font-mono">
          {new Date(s.scheduled_at).toLocaleDateString("en-IN", { weekday: "short" })}
        </p>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className="font-medium text-sm truncate">{s.title}</h3>
          <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1", badge.color)}>
            <Icon className="h-3 w-3" />
            {badge.label}
          </span>
          {isPastOrCompleted && s.attendance_count !== undefined && s.attendance_count > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))] flex items-center gap-1">
              <Users className="h-3 w-3" />
              {s.attendance_count} attended
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {s.course_title} · {new Date(s.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
          {s.duration_minutes ? ` · ${s.duration_minutes}min` : ""}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          {s.zoom_link && (
            <a
              href={s.zoom_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline flex items-center gap-1"
            >
              <Video className="h-3 w-3" /> Zoom
            </a>
          )}
          {s.recording_url && (
            <a
              href={s.recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[hsl(var(--cream))] hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" /> Recording
            </a>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {isPastOrCompleted && (
          <button onClick={onAttendance} className="p-1.5 rounded hover:bg-secondary" title="Attendance">
            <Users className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <button onClick={onEdit} className="p-1.5 rounded hover:bg-secondary" title="Edit">
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded hover:bg-destructive/20" title="Delete">
          <Trash2 className="h-4 w-4 text-destructive" />
        </button>
      </div>
    </div>
  );
}

export default AdminSchedule;
