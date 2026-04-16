import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, X, Download, Award, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Form defaults                                                      */
/* ------------------------------------------------------------------ */

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  description: "",
  detailed_description: "",
  event_type: "online",
  image_url: "",
  category_id: "",
  starts_at: "",
  ends_at: "",
  duration_minutes: 60,
  venue_type: "zoom",
  venue_label: "Zoom",
  venue_link: "",
  venue_address: "",
  city: "",
  pricing_type: "free",
  price_inr: 0,
  gst_enabled: false,
  early_bird_price_inr: 0,
  early_bird_deadline: "",
  max_capacity: 0,
  is_featured: false,
  is_active: true,
  sort_order: 0,
  status: "draft" as string,
  issue_certificate: false,
  certificate_template_id: "",
};

const EMPTY_SPEAKER = { name: "", title: "", bio: "", avatar_url: "" };

/* ------------------------------------------------------------------ */
/*  Status flow helpers                                                */
/* ------------------------------------------------------------------ */

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft", color: "bg-yellow-500/20 text-yellow-400" },
  { value: "published", label: "Published", color: "bg-blue-500/20 text-blue-400" },
  { value: "live", label: "Live", color: "bg-green-500/20 text-green-400" },
  { value: "completed", label: "Completed", color: "bg-muted text-muted-foreground" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-500/20 text-red-400" },
];

const statusColor = (status: string) =>
  STATUS_OPTIONS.find((s) => s.value === status)?.color ?? "bg-muted text-muted-foreground";

/* ------------------------------------------------------------------ */
/*  CSV helpers                                                        */
/* ------------------------------------------------------------------ */

const escapeCSV = (v: string) => {
  let s = v.replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (s.includes(",") || s.includes('"') || s.includes("\n")) s = `"${s}"`;
  return s;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const AdminEvents = () => {
  const { toast } = useToast();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [speakers, setSpeakers] = useState([{ ...EMPTY_SPEAKER }]);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [showRegs, setShowRegs] = useState<string | null>(null);
  const [regCounts, setRegCounts] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [certTemplates, setCertTemplates] = useState<{ id: string; course_title: string }[]>([]);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [previewEvent, setPreviewEvent] = useState<any | null>(null);

  /* ---- Data loading ---- */

  const load = async () => {
    const { data } = await supabase
      .from("events_safe")
      .select("*")
      .order("starts_at", { ascending: false });
    setEvents(data ?? []);
    setLoading(false);

    const eventIds = (data ?? []).map((e: any) => e.id);
    if (eventIds.length) {
      const countMap: Record<string, number> = {};
      await Promise.all(
        eventIds.map(async (eid: string) => {
          const { data: c } = await supabase.rpc("get_event_registration_count", {
            p_event_id: eid,
          });
          countMap[eid] = (c as number | null) ?? 0;
        })
      );
      setRegCounts(countMap);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    supabase.from("courses").select("id, title, product_tier").order("sort_order").then(({ data }) => setCourses(data ?? []));
    supabase.from("course_categories").select("id, name").order("sort_order").then(({ data }) => setCategories(data ?? []));
    // Load certificate templates for linking
    supabase
      .from("certificate_templates")
      .select("id, course_id, courses:course_id(title)")
      .eq("is_active", true)
      .then(({ data }) => {
        setCertTemplates(
          (data ?? []).map((t: any) => ({
            id: t.id,
            course_title: t.courses?.title ?? "Unknown",
          }))
        );
      });
  }, []);

  /* ---- Dialog open/close ---- */

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSpeakers([{ ...EMPTY_SPEAKER }]);
    setSelectedCourseIds([]);
    setExpandedSection(null);
    setDialogOpen(true);
  };

  const openEdit = async (ev: any) => {
    setEditingId(ev.id);
    const { data: linkData } = await supabase.rpc("get_event_venue_link", {
      p_event_id: ev.id,
    });
    setForm({
      title: ev.title || "",
      subtitle: ev.subtitle || "",
      description: ev.description || "",
      detailed_description: ev.detailed_description || "",
      event_type: ev.event_type || "online",
      image_url: ev.image_url || "",
      category_id: ev.category_id || "",
      starts_at: ev.starts_at ? ev.starts_at.slice(0, 16) : "",
      ends_at: ev.ends_at ? ev.ends_at.slice(0, 16) : "",
      duration_minutes: ev.duration_minutes || 60,
      venue_type: ev.venue_type || "zoom",
      venue_label: ev.venue_label || "",
      venue_link: (linkData as string | null) || "",
      venue_address: ev.venue_address || "",
      city: ev.city || "",
      pricing_type: ev.pricing_type || "free",
      price_inr: ev.price_inr || 0,
      gst_enabled: ev.gst_enabled ?? false,
      early_bird_price_inr: ev.early_bird_price_inr || 0,
      early_bird_deadline: ev.early_bird_deadline ? ev.early_bird_deadline.slice(0, 16) : "",
      max_capacity: ev.max_capacity || 0,
      is_featured: ev.is_featured ?? false,
      is_active: ev.is_active ?? true,
      sort_order: ev.sort_order || 0,
      status: ev.status || "draft",
      issue_certificate: ev.issue_certificate ?? false,
      certificate_template_id: ev.certificate_template_id || "",
    });

    // Load speakers
    const { data: spks } = await supabase
      .from("event_speakers")
      .select("name, title, avatar_url")
      .eq("event_id", ev.id)
      .order("sort_order");

    if (spks && spks.length > 0) {
      setSpeakers(spks.map((s: any) => ({
        name: s.name || "",
        title: s.title || "",
        bio: (s as any).bio || "",
        avatar_url: s.avatar_url || "",
      })));
    } else {
      setSpeakers([{
        name: ev.host_name || "",
        title: ev.host_title || "",
        bio: "",
        avatar_url: ev.host_avatar_url || "",
      }]);
    }

    const { data: efc } = await supabase.from("event_free_courses").select("course_id").eq("event_id", ev.id);
    setSelectedCourseIds((efc ?? []).map((r: any) => r.course_id));
    setExpandedSection(null);
    setDialogOpen(true);
  };

  /* ---- Save ---- */

  const handleSave = async () => {
    const validSpeakers = speakers.filter((s) => s.name.trim());
    if (!form.title.trim() || !form.starts_at) {
      toast({ title: "Title and start date are required", variant: "destructive" });
      return;
    }
    if (validSpeakers.length === 0) {
      toast({ title: "At least one speaker with a name is required", variant: "destructive" });
      return;
    }
    if (form.pricing_type !== "free" && (!form.price_inr || form.price_inr <= 0)) {
      toast({ title: "Price must be greater than 0 for paid events", variant: "destructive" });
      return;
    }
    if (form.max_capacity && form.max_capacity < 0) {
      toast({ title: "Max capacity must be positive", variant: "destructive" });
      return;
    }
    if (form.early_bird_price_inr && form.early_bird_price_inr >= form.price_inr) {
      toast({ title: "Early bird price must be less than regular price", variant: "destructive" });
      return;
    }

    setSaving(true);

    const firstSpeaker = validSpeakers[0];
    const payload: any = {
      title: form.title,
      subtitle: form.subtitle || null,
      description: form.description || null,
      detailed_description: form.detailed_description || null,
      event_type: form.event_type,
      image_url: form.image_url || null,
      category_id: form.category_id || null,
      starts_at: form.starts_at,
      ends_at: form.ends_at || null,
      duration_minutes: form.duration_minutes || null,
      venue_type: form.venue_type,
      venue_label: form.venue_label || null,
      venue_link: form.venue_link || null,
      venue_address: form.venue_address || null,
      city: form.city || null,
      host_name: firstSpeaker.name,
      host_title: firstSpeaker.title || null,
      host_avatar_url: firstSpeaker.avatar_url || null,
      pricing_type: form.pricing_type,
      price_inr: form.pricing_type === "free" ? null : (form.price_inr || null),
      gst_enabled: form.gst_enabled,
      early_bird_price_inr: form.early_bird_price_inr || null,
      early_bird_deadline: form.early_bird_deadline || null,
      max_capacity: form.max_capacity || null,
      is_featured: form.is_featured,
      is_active: form.is_active,
      sort_order: form.sort_order,
      status: form.status,
      issue_certificate: form.issue_certificate,
      certificate_template_id: form.certificate_template_id || null,
    };

    let eventId = editingId;
    let error;
    if (editingId) {
      const res = await supabase.from("events").update(payload).eq("id", editingId);
      error = res.error;
    } else {
      const res = await supabase.from("events").insert(payload).select("id").single();
      error = res.error;
      if (res.data) eventId = res.data.id;
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Save event_free_courses
    if (eventId && form.pricing_type === "free_for_enrolled") {
      await supabase.from("event_free_courses").delete().eq("event_id", eventId);
      if (selectedCourseIds.length > 0) {
        await supabase.from("event_free_courses").insert(
          selectedCourseIds.map((cid) => ({ event_id: eventId!, course_id: cid }))
        );
      }
    }

    // Save speakers
    if (eventId) {
      await supabase.from("event_speakers").delete().eq("event_id", eventId);
      if (validSpeakers.length > 0) {
        await supabase.from("event_speakers").insert(
          validSpeakers.map((s, idx) => ({
            event_id: eventId!,
            name: s.name,
            title: s.title || null,
            bio: s.bio || null,
            avatar_url: s.avatar_url || null,
            sort_order: idx,
          }))
        );
      }
    }

    toast({ title: editingId ? "Event updated" : "Event created" });
    setDialogOpen(false);
    setSaving(false);
    load();
  };

  /* ---- Delete ---- */

  const handleDelete = async (id: string) => {
    const { count } = await supabase
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id);
    const regCount = count ?? 0;
    const msg = regCount > 0
      ? `This event has ${regCount} registration${regCount !== 1 ? "s" : ""}. Delete anyway?`
      : "Delete this event?";
    if (!confirm(msg)) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete event", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Event deleted" });
    load();
  };

  /* ---- Registrations ---- */

  const viewRegistrations = async (eventId: string) => {
    const { data } = await supabase
      .from("event_registrations")
      .select("*, users:user_id(full_name, email)")
      .eq("event_id", eventId)
      .order("registered_at", { ascending: false });
    setRegistrations(data ?? []);
    setShowRegs(eventId);
  };

  const exportRegistrationsCSV = () => {
    if (registrations.length === 0) return;
    const ev = events.find((e) => e.id === showRegs);
    const headers = ["Name", "Email", "Status", "Amount Paid", "Registered At"];
    const rows = registrations.map((r: any) => [
      escapeCSV(r.users?.full_name || ""),
      escapeCSV(r.users?.email || ""),
      escapeCSV(r.status || ""),
      r.amount_paid ? `${(r.amount_paid / 100).toFixed(2)}` : "0",
      escapeCSV(r.registered_at ? format(new Date(r.registered_at), "yyyy-MM-dd HH:mm") : ""),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrations-${(ev?.title || "event").replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ---- Filtering ---- */

  const filtered = statusFilter === "all" ? events : events.filter((e) => e.status === statusFilter);

  /* ---- Helpers ---- */

  const toggleCourse = (id: string) => {
    setSelectedCourseIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  const updateSpeaker = (idx: number, key: string, value: string) => {
    const updated = [...speakers];
    updated[idx] = { ...updated[idx], [key]: value };
    setSpeakers(updated);
  };

  const toggleSection = (name: string) => {
    setExpandedSection((prev) => (prev === name ? null : name));
  };

  const field = (label: string, key: string, type: "text" | "number" | "datetime-local" = "text") => (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <Input
        type={type}
        value={(form as any)[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
      />
    </div>
  );

  const priceDisplay = (ev: any) => {
    if (ev.pricing_type === "free") return "Free";
    if (ev.price_inr) return `₹${(ev.price_inr / 100).toLocaleString("en-IN")}`;
    return "Free";
  };

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <>
      {/* ---- Top bar ---- */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2 flex-wrap">
          {["all", "draft", "published", "live", "completed", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium capitalize border",
                statusFilter === s ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <Button onClick={openNew} className="bg-cream text-cream-text hover:opacity-90">
          <Plus className="h-4 w-4 mr-2" /> Create Event
        </Button>
      </div>

      {/* ---- Events table ---- */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Pricing</TableHead>
              <TableHead>Registrations</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No events found</TableCell></TableRow>
            ) : (
              filtered.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{ev.title}</p>
                      {ev.subtitle && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{ev.subtitle}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{format(new Date(ev.starts_at), "MMM d, yyyy · h:mm a")}</TableCell>
                  <TableCell className="capitalize text-xs">{ev.event_type}</TableCell>
                  <TableCell className="text-xs">
                    <span className="font-medium">{priceDisplay(ev)}</span>
                    {ev.gst_enabled && <span className="text-muted-foreground ml-1">+GST</span>}
                    {ev.early_bird_price_inr > 0 && (
                      <span className="block text-[10px] text-green-400">
                        Early: ₹{(ev.early_bird_price_inr / 100).toLocaleString("en-IN")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => viewRegistrations(ev.id)}
                      className="font-mono text-xs hover:underline cursor-pointer"
                    >
                      {regCounts[ev.id] || 0}{ev.max_capacity ? `/${ev.max_capacity}` : ""}
                    </button>
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono",
                      statusColor(ev.status)
                    )}>
                      {ev.status}
                    </span>
                    {ev.issue_certificate && (
                      <Award className="h-3 w-3 text-yellow-400 inline ml-1.5" title="Certificate enabled" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setPreviewEvent(ev)} title="Student preview">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => viewRegistrations(ev.id)} title="View registrations">
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(ev)} title="Edit event">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(ev.id)} title="Delete event">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ================================================================ */}
      {/*  Registrations dialog                                             */}
      {/* ================================================================ */}
      <Dialog open={!!showRegs} onOpenChange={() => setShowRegs(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                Registrations
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({registrations.length} total)
                </span>
              </DialogTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={exportRegistrationsCSV}
                disabled={registrations.length === 0}
              >
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </div>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No registrations</TableCell></TableRow>
              ) : (
                registrations.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.users?.full_name || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.users?.email || "—"}</TableCell>
                    <TableCell className="capitalize text-xs">{r.status}</TableCell>
                    <TableCell className="font-mono text-xs">{r.amount_paid ? `₹${(r.amount_paid / 100).toLocaleString()}` : "Free"}</TableCell>
                    <TableCell className="font-mono text-xs">{format(new Date(r.registered_at), "MMM d, yyyy")}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* ================================================================ */}
      {/*  Create / Edit dialog                                             */}
      {/* ================================================================ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Event" : "New Event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">

            {/* ── Basic Info ── */}
            {field("Title", "title")}
            {field("Subtitle", "subtitle")}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <Select value={form.category_id} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Event Type</label>
                <Select value={form.event_type} onValueChange={(v) => setForm((f) => ({ ...f, event_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {field("Image / Thumbnail URL", "image_url")}
            {form.image_url && (
              <img src={form.image_url} alt="" className="w-48 h-28 object-cover rounded-lg border border-border" />
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Short Description</label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="Brief summary shown on event cards" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Detailed Description</label>
              <Textarea
                value={form.detailed_description}
                onChange={(e) => setForm((f) => ({ ...f, detailed_description: e.target.value }))}
                rows={5}
                placeholder="Full description shown on the event detail page. Supports line breaks."
              />
            </div>

            {/* ── Date & Time ── */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold mb-3">Date & Time</p>
              <div className="grid grid-cols-2 gap-3">
                {field("Starts At", "starts_at", "datetime-local")}
                {field("Ends At", "ends_at", "datetime-local")}
              </div>
              <div className="mt-3">
                {field("Duration (min)", "duration_minutes", "number")}
              </div>
            </div>

            {/* ── Venue ── */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold mb-3">Venue Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Venue Type</label>
                  <Select value={form.venue_type} onValueChange={(v) => setForm((f) => ({ ...f, venue_type: v, venue_label: v === "in_person" ? "" : v.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zoom">Zoom</SelectItem>
                      <SelectItem value="google_meet">Google Meet</SelectItem>
                      <SelectItem value="youtube_live">YouTube Live</SelectItem>
                      <SelectItem value="in_person">In-Person</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {field("Venue Label", "venue_label")}
              </div>
              {form.venue_type !== "in_person" && (
                <div className="mt-3">
                  {field("Venue Link (join URL)", "venue_link")}
                </div>
              )}
              {(form.event_type === "offline" || form.event_type === "hybrid" || form.venue_type === "in_person") && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Venue Address</label>
                    <Textarea
                      value={form.venue_address}
                      onChange={(e) => setForm((f) => ({ ...f, venue_address: e.target.value }))}
                      rows={2}
                      placeholder="Full address for offline/hybrid events"
                    />
                  </div>
                  {field("City", "city")}
                </div>
              )}
            </div>

            {/* ── Speakers ── */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Speakers / Hosts</p>
                {speakers.length < 5 && (
                  <button
                    type="button"
                    onClick={() => setSpeakers([...speakers, { ...EMPTY_SPEAKER }])}
                    className="text-xs text-cream hover:underline"
                  >
                    + Add Speaker
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {speakers.map((speaker, idx) => (
                  <div key={idx} className="bg-surface-2 border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-mono text-muted-foreground">Speaker {idx + 1}</p>
                      {speakers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSpeakers(speakers.filter((_, i) => i !== idx))}
                          className="text-xs text-destructive hover:underline flex items-center gap-0.5"
                        >
                          <X className="h-3 w-3" /> Remove
                        </button>
                      )}
                    </div>
                    <Input
                      placeholder="Name *"
                      value={speaker.name}
                      onChange={(e) => updateSpeaker(idx, "name", e.target.value)}
                    />
                    <Input
                      placeholder="Title (e.g. Product Manager at Razorpay)"
                      value={speaker.title}
                      onChange={(e) => updateSpeaker(idx, "title", e.target.value)}
                    />
                    <Textarea
                      placeholder="Short bio (2-3 lines)"
                      value={speaker.bio}
                      onChange={(e) => updateSpeaker(idx, "bio", e.target.value)}
                      rows={2}
                    />
                    <Input
                      placeholder="Avatar URL"
                      value={speaker.avatar_url}
                      onChange={(e) => updateSpeaker(idx, "avatar_url", e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Pricing & Payment ── */}
            <div className="border-t border-border pt-4">
              <button
                type="button"
                className="flex items-center justify-between w-full text-left"
                onClick={() => toggleSection("pricing")}
              >
                <p className="text-sm font-semibold">Pricing & Payment</p>
                {expandedSection === "pricing" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {/* Always show pricing type selector */}
              <div className="mt-3">
                <Select value={form.pricing_type} onValueChange={(v) => setForm((f) => ({ ...f, pricing_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free for All</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="free_for_enrolled">Free for Enrolled Students</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(form.pricing_type !== "free" || expandedSection === "pricing") && (
                <div className="mt-3 space-y-3">
                  {form.pricing_type !== "free" && (
                    <>
                      <div>
                        {field("Price (in paise)", "price_inr", "number")}
                        <p className="text-xs text-muted-foreground mt-1">Enter in paise -- e.g. 49900 = ₹499</p>
                      </div>

                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={form.gst_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, gst_enabled: v }))} />
                        Add GST (18%) on top of price
                      </label>

                      {/* Early bird */}
                      <div className="bg-surface-2 border border-border rounded-lg p-3 space-y-2">
                        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Early Bird Pricing (optional)</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium mb-1">Early Bird Price (paise)</label>
                            <Input
                              type="number"
                              value={form.early_bird_price_inr}
                              onChange={(e) => setForm((f) => ({ ...f, early_bird_price_inr: Number(e.target.value) }))}
                              placeholder="0 = no early bird"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Deadline</label>
                            <Input
                              type="datetime-local"
                              value={form.early_bird_deadline}
                              onChange={(e) => setForm((f) => ({ ...f, early_bird_deadline: e.target.value }))}
                            />
                          </div>
                        </div>
                        {form.early_bird_price_inr > 0 && (
                          <p className="text-xs text-green-400">
                            Early bird: ₹{(form.early_bird_price_inr / 100).toLocaleString("en-IN")} (save ₹{((form.price_inr - form.early_bird_price_inr) / 100).toLocaleString("en-IN")})
                            {form.early_bird_deadline && ` until ${format(new Date(form.early_bird_deadline), "MMM d, yyyy h:mm a")}`}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {form.pricing_type === "free_for_enrolled" && (
                    <div>
                      <p className="text-sm font-medium mb-2">Free Access Courses</p>
                      <p className="text-xs text-muted-foreground mb-2">Students enrolled in any of these courses can attend for free.</p>
                      <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-3 space-y-2">
                        {courses.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={selectedCourseIds.includes(c.id)}
                              onCheckedChange={() => toggleCourse(c.id)}
                            />
                            <span className="truncate">{c.title}</span>
                            <span className="text-[10px] font-mono text-muted-foreground ml-auto">{c.product_tier}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Certificate ── */}
            <div className="border-t border-border pt-4">
              <button
                type="button"
                className="flex items-center justify-between w-full text-left"
                onClick={() => toggleSection("certificate")}
              >
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Award className="h-4 w-4" /> Certificate
                </p>
                {expandedSection === "certificate" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {expandedSection === "certificate" && (
                <div className="mt-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={form.issue_certificate} onCheckedChange={(v) => setForm((f) => ({ ...f, issue_certificate: v }))} />
                    Issue attendance certificate after event completes
                  </label>

                  {form.issue_certificate && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Certificate Template</label>
                      <Select
                        value={form.certificate_template_id}
                        onValueChange={(v) => setForm((f) => ({ ...f, certificate_template_id: v }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select template (optional)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Auto-generate (default)</SelectItem>
                          {certTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.course_title} template</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        When enabled, certificates are auto-generated for all attendees once the event status is set to "Completed". Leave blank to use default template.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Status, Capacity & Visibility ── */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold mb-3">Status & Visibility</p>
              <div className="grid grid-cols-2 gap-3">
                {field("Max Capacity", "max_capacity", "number")}
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <Select value={form.status} onValueChange={(v) => {
                    // Warn on certain transitions
                    if (form.status === "published" && v === "draft") {
                      if (!confirm("Moving from Published to Draft will hide the event. Continue?")) return;
                    }
                    if (form.status !== "cancelled" && v === "cancelled") {
                      if (!confirm("Cancel this event? Registered attendees will see it as cancelled.")) return;
                    }
                    setForm((f) => ({ ...f, status: v }));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                {field("Sort Order", "sort_order", "number")}
                <div />
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.is_featured} onCheckedChange={(v) => setForm((f) => ({ ...f, is_featured: v }))} />
                  Featured
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                  Active (visible to students)
                </label>
              </div>
            </div>

            {/* ── Save button ── */}
            <Button onClick={handleSave} disabled={saving} className="w-full bg-cream text-cream-text hover:opacity-90 mt-2">
              {saving ? "Saving..." : editingId ? "Update Event" : "Create Event"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Student Preview Dialog */}
      <Dialog open={!!previewEvent} onOpenChange={() => setPreviewEvent(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xs font-mono uppercase text-muted-foreground tracking-wider">Student Preview</DialogTitle>
          </DialogHeader>
          {previewEvent && (
            <div className="space-y-5">
              {/* Event header */}
              <div>
                <h2 className="text-xl font-bold">{previewEvent.title}</h2>
                {previewEvent.subtitle && <p className="text-muted-foreground mt-1">{previewEvent.subtitle}</p>}
              </div>

              {/* Date & venue */}
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-mono">{previewEvent.starts_at ? format(new Date(previewEvent.starts_at), "EEEE, MMMM d, yyyy") : "TBA"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Time:</span>
                  <span className="font-mono">
                    {previewEvent.starts_at ? format(new Date(previewEvent.starts_at), "h:mm a") : ""}
                    {previewEvent.ends_at ? ` – ${format(new Date(previewEvent.ends_at), "h:mm a")}` : ""}
                  </span>
                </div>
              </div>

              {/* Venue */}
              <div className="bg-secondary/30 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground text-xs uppercase font-mono mb-1">Venue</p>
                <p className="font-medium">{previewEvent.venue_label || previewEvent.venue_type}</p>
                {previewEvent.venue_address && <p className="text-muted-foreground text-xs mt-0.5">{previewEvent.venue_address}</p>}
              </div>

              {/* Pricing */}
              <div className="flex items-center gap-3">
                {previewEvent.pricing_type === "free" ? (
                  <span className="text-lg font-bold text-[hsl(var(--accent-emerald))]">FREE</span>
                ) : (
                  <span className="text-lg font-bold">₹{(previewEvent.price_inr || 0).toLocaleString("en-IN")}</span>
                )}
                {previewEvent.early_bird_price_inr > 0 && (
                  <span className="text-sm text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                    Early bird: ₹{previewEvent.early_bird_price_inr.toLocaleString("en-IN")}
                  </span>
                )}
                {previewEvent.gst_enabled && <span className="text-xs text-muted-foreground">+GST</span>}
              </div>

              {/* Description */}
              {previewEvent.description && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">About this Event</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{previewEvent.description}</p>
                </div>
              )}

              {previewEvent.detailed_description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{previewEvent.detailed_description}</p>
              )}

              {/* Speakers */}
              {previewEvent.speakers && previewEvent.speakers.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3">Speakers</h4>
                  <div className="space-y-3">
                    {(Array.isArray(previewEvent.speakers) ? previewEvent.speakers : []).map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
                          {(s.name || "?")[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{s.name}</p>
                          {(s.bio || s.title) && <p className="text-xs text-muted-foreground">{s.bio || s.title}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Capacity */}
              {previewEvent.max_capacity > 0 && (
                <div className="text-xs text-muted-foreground">
                  {regCounts[previewEvent.id] || 0} / {previewEvent.max_capacity} spots filled
                </div>
              )}

              {/* CTA */}
              <Button className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90" disabled>
                Register Now (Preview Only)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminEvents;
