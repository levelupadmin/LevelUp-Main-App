import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
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
import { Plus, Pencil, Trash2, Users, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const EMPTY_FORM = {
  title: "",
  description: "",
  event_type: "online",
  image_url: "",
  starts_at: "",
  ends_at: "",
  duration_minutes: 60,
  venue_type: "zoom",
  venue_label: "Zoom",
  venue_link: "",
  city: "",
  pricing_type: "free",
  price_inr: 0,
  max_capacity: 0,
  is_featured: false,
  is_active: true,
  sort_order: 0,
  status: "upcoming",
};

const EMPTY_SPEAKER = { name: "", title: "", avatar_url: "" };

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

  const load = async () => {
    // venue_link is column-revoked from authenticated; read the safe view.
    // Admin pulls each event's venue_link via the get_event_venue_link RPC
    // when opening the edit dialog.
    const { data } = await supabase
      .from("events_safe")
      .select("*")
      .order("starts_at", { ascending: false });
    setEvents(data ?? []);
    setLoading(false);

    // Fetch registration counts
    const eventIds = (data ?? []).map((e: any) => e.id);
    if (eventIds.length) {
      const { data: regs } = await supabase
        .from("event_registrations")
        .select("event_id")
        .in("event_id", eventIds)
        .eq("status", "registered");
      const countMap: Record<string, number> = {};
      (regs ?? []).forEach((r: any) => {
        countMap[r.event_id] = (countMap[r.event_id] || 0) + 1;
      });
      setRegCounts(countMap);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    supabase.from("courses").select("id, title, product_tier").order("sort_order").then(({ data }) => setCourses(data ?? []));
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSpeakers([{ ...EMPTY_SPEAKER }]);
    setSelectedCourseIds([]);
    setDialogOpen(true);
  };

  const openEdit = async (ev: any) => {
    setEditingId(ev.id);
    // venue_link is not in events_safe — fetch via the gated RPC.
    const { data: linkData } = await supabase.rpc("get_event_venue_link", {
      p_event_id: ev.id,
    });
    setForm({
      title: ev.title || "",
      description: ev.description || "",
      event_type: ev.event_type || "online",
      image_url: ev.image_url || "",
      starts_at: ev.starts_at ? ev.starts_at.slice(0, 16) : "",
      ends_at: ev.ends_at ? ev.ends_at.slice(0, 16) : "",
      duration_minutes: ev.duration_minutes || 60,
      venue_type: ev.venue_type || "zoom",
      venue_label: ev.venue_label || "",
      venue_link: (linkData as string | null) || "",
      city: ev.city || "",
      pricing_type: ev.pricing_type || "free",
      price_inr: ev.price_inr || 0,
      max_capacity: ev.max_capacity || 0,
      is_featured: ev.is_featured ?? false,
      is_active: ev.is_active ?? true,
      sort_order: ev.sort_order || 0,
      status: ev.status || "upcoming",
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
        avatar_url: s.avatar_url || "",
      })));
    } else {
      setSpeakers([{
        name: ev.host_name || "",
        title: ev.host_title || "",
        avatar_url: ev.host_avatar_url || "",
      }]);
    }

    const { data: efc } = await supabase.from("event_free_courses").select("course_id").eq("event_id", ev.id);
    setSelectedCourseIds((efc ?? []).map((r: any) => r.course_id));
    setDialogOpen(true);
  };

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

    setSaving(true);

    // Use first speaker as host_name for backward compat
    const firstSpeaker = validSpeakers[0];
    const payload: any = {
      title: form.title,
      description: form.description || null,
      event_type: form.event_type,
      image_url: form.image_url || null,
      starts_at: form.starts_at,
      ends_at: form.ends_at || null,
      duration_minutes: form.duration_minutes || null,
      venue_type: form.venue_type,
      venue_label: form.venue_label || null,
      venue_link: form.venue_link || null,
      city: form.city || null,
      host_name: firstSpeaker.name,
      host_title: firstSpeaker.title || null,
      host_avatar_url: firstSpeaker.avatar_url || null,
      pricing_type: form.pricing_type,
      price_inr: form.pricing_type === "free" ? null : (form.price_inr || null),
      max_capacity: form.max_capacity || null,
      is_featured: form.is_featured,
      is_active: form.is_active,
      sort_order: form.sort_order,
      status: form.status,
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    await supabase.from("events").delete().eq("id", id);
    toast({ title: "Event deleted" });
    load();
  };

  const viewRegistrations = async (eventId: string) => {
    const { data } = await supabase
      .from("event_registrations")
      .select("*, users:user_id(full_name, email)")
      .eq("event_id", eventId)
      .order("registered_at", { ascending: false });
    setRegistrations(data ?? []);
    setShowRegs(eventId);
  };

  const filtered = statusFilter === "all" ? events : events.filter((e) => e.status === statusFilter);

  const toggleCourse = (id: string) => {
    setSelectedCourseIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  const updateSpeaker = (idx: number, key: string, value: string) => {
    const updated = [...speakers];
    updated[idx] = { ...updated[idx], [key]: value };
    setSpeakers(updated);
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

  return (
    <AdminLayout title="Events">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          {["all", "upcoming", "live", "completed", "cancelled"].map((s) => (
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
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No events found</TableCell></TableRow>
            ) : (
              filtered.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell className="font-medium">{ev.title}</TableCell>
                  <TableCell className="font-mono text-xs">{format(new Date(ev.starts_at), "MMM d, yyyy · h:mm a")}</TableCell>
                  <TableCell className="capitalize text-xs">{ev.event_type}</TableCell>
                  <TableCell className="capitalize text-xs">{ev.pricing_type.replace("_", " ")}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {regCounts[ev.id] || 0}{ev.max_capacity ? `/${ev.max_capacity}` : ""}
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono",
                      ev.status === "upcoming" ? "bg-blue-500/20 text-blue-400" :
                      ev.status === "live" ? "bg-green-500/20 text-green-400" :
                      ev.status === "completed" ? "bg-muted text-muted-foreground" :
                      "bg-red-500/20 text-red-400"
                    )}>
                      {ev.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => viewRegistrations(ev.id)}><Users className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(ev)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(ev.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Registrations dialog */}
      <Dialog open={!!showRegs} onOpenChange={() => setShowRegs(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Registrations</DialogTitle></DialogHeader>
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

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Event" : "New Event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {field("Title", "title")}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
              {field("Image URL", "image_url")}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {field("Starts At", "starts_at", "datetime-local")}
              {field("Ends At", "ends_at", "datetime-local")}
            </div>
            {field("Duration (min)", "duration_minutes", "number")}

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
            {field("Venue Link (join URL)", "venue_link")}
            {(form.event_type === "offline" || form.event_type === "hybrid") && field("City", "city")}

            {/* Speakers */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Speakers / Hosts</p>
                {speakers.length < 3 && (
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
                    <Input
                      placeholder="Avatar URL"
                      value={speaker.avatar_url}
                      onChange={(e) => updateSpeaker(idx, "avatar_url", e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium mb-2">Pricing</p>
              <div>
                <Select value={form.pricing_type} onValueChange={(v) => setForm((f) => ({ ...f, pricing_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free for All</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="free_for_enrolled">Free for Enrolled Students</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.pricing_type !== "free" && (
                <div className="mt-3">
                  {field("Price (₹)", "price_inr", "number")}
                  <p className="text-xs text-muted-foreground mt-1">In paise (e.g. 49900 = ₹499)</p>
                </div>
              )}
              {form.pricing_type === "free_for_enrolled" && (
                <div className="mt-3">
                  <p className="text-sm font-medium mb-2">Free Access Courses</p>
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

            <div className="border-t border-border pt-4 grid grid-cols-2 gap-3">
              {field("Max Capacity", "max_capacity", "number")}
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="sold_out">Sold Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.is_featured} onCheckedChange={(v) => setForm((f) => ({ ...f, is_featured: v }))} />
                Featured on Dashboard
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                Active
              </label>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full bg-cream text-cream-text hover:opacity-90">
              {saving ? "Saving…" : editingId ? "Update Event" : "Create Event"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminEvents;
