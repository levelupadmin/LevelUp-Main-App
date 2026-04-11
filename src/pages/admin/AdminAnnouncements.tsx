import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Megaphone, Loader2 } from "lucide-react";

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  link: string | null;
  audience_type: string;
  audience_id: string | null;
  sent_by: string;
  recipient_count: number;
  created_at: string;
  sender_name?: string;
  audience_label?: string;
}

const PAGE_SIZE = 20;

const AdminAnnouncements = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState("");

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [audienceType, setAudienceType] = useState<"all" | "cohort" | "course">("all");
  const [audienceId, setAudienceId] = useState("");

  // Lookup data
  const [cohorts, setCohorts] = useState<{ value: string; label: string }[]>([]);
  const [courses, setCourses] = useState<{ value: string; label: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE;

    const { data, error } = await (supabase as any)
      .from("admin_announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const rows = (data || []) as AnnouncementRow[];
    setHasMore(rows.length > PAGE_SIZE);
    const pageRows = rows.slice(0, PAGE_SIZE);

    // Enrich with sender names
    const senderIds = [...new Set(pageRows.map((r) => r.sent_by))];
    if (senderIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name")
        .in("id", senderIds);
      const nameMap: Record<string, string> = {};
      (users || []).forEach((u: any) => { nameMap[u.id] = u.full_name || "Admin"; });
      pageRows.forEach((r) => { r.sender_name = nameMap[r.sent_by] || "Admin"; });
    }

    // Enrich audience labels
    const cohortIds = pageRows.filter((r) => r.audience_type === "cohort" && r.audience_id).map((r) => r.audience_id!);
    const courseIds = pageRows.filter((r) => r.audience_type === "course" && r.audience_id).map((r) => r.audience_id!);

    const labelMap: Record<string, string> = {};

    if (cohortIds.length > 0) {
      const { data: ch } = await (supabase as any)
        .from("cohort_batches")
        .select("id, name")
        .in("id", cohortIds);
      (ch || []).forEach((c: any) => { labelMap[c.id] = c.name; });
    }
    if (courseIds.length > 0) {
      const { data: co } = await supabase
        .from("courses")
        .select("id, title")
        .in("id", courseIds);
      (co || []).forEach((c: any) => { labelMap[c.id] = c.title; });
    }

    pageRows.forEach((r) => {
      if (r.audience_type === "all") r.audience_label = "All Users";
      else if (r.audience_id) r.audience_label = `${r.audience_type === "cohort" ? "Cohort" : "Course"}: ${labelMap[r.audience_id] || r.audience_id}`;
    });

    setAnnouncements(pageRows);
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const openDialog = async () => {
    setTitle("");
    setBody("");
    setLink("");
    setAudienceType("all");
    setAudienceId("");

    // Load cohorts
    const { data: ch } = await (supabase as any)
      .from("cohort_batches")
      .select("id, name")
      .order("name");
    setCohorts((ch || []).map((c: any) => ({ value: c.id, label: c.name })));

    // Load courses
    const { data: co } = await supabase
      .from("courses")
      .select("id, title")
      .order("title");
    setCourses((co || []).map((c: any) => ({ value: c.id, label: c.title })));

    setDialogOpen(true);
  };

  const resolveRecipients = async (): Promise<string[]> => {
    if (audienceType === "all") {
      const { data } = await supabase.from("users").select("id").limit(50000);
      return (data || []).map((u: any) => u.id);
    }
    if (audienceType === "cohort" && audienceId) {
      const { data } = await (supabase as any)
        .from("enrolments")
        .select("user_id")
        .eq("cohort_batch_id", audienceId)
        .eq("status", "active")
        .limit(50000);
      return [...new Set((data || []).map((e: any) => e.user_id))] as string[];
    }
    if (audienceType === "course" && audienceId) {
      const { data: ocs } = await (supabase as any)
        .from("offering_courses")
        .select("offering_id")
        .eq("course_id", audienceId);
      const offeringIds = (ocs || []).map((oc: any) => oc.offering_id);
      if (offeringIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("enrolments")
        .select("user_id")
        .in("offering_id", offeringIds)
        .eq("status", "active")
        .limit(50000);
      return [...new Set((data || []).map((e: any) => e.user_id))] as string[];
    }
    return [];
  };

  const handleSend = async () => {
    if (!profile) return;
    setConfirmOpen(false);
    setSending(true);
    setSendProgress("Resolving recipients...");

    try {
      const recipientIds = await resolveRecipients();
      if (recipientIds.length === 0) {
        toast({ title: "No recipients found", variant: "destructive" });
        setSending(false);
        return;
      }

      // Batch insert notifications (50 at a time)
      let sent = 0;
      for (let i = 0; i < recipientIds.length; i += 50) {
        const batch = recipientIds.slice(i, i + 50).map((userId) => ({
          user_id: userId,
          type: "admin_announcement",
          title,
          body,
          link: link || null,
          is_read: false,
        }));
        const { error } = await (supabase as any).from("notifications").insert(batch);
        if (error) console.error("Batch insert error:", error);
        sent += batch.length;
        setSendProgress(`Sending... ${sent}/${recipientIds.length}`);
      }

      // Record announcement
      await (supabase as any).from("admin_announcements").insert({
        title,
        body,
        link: link || null,
        audience_type: audienceType,
        audience_id: (audienceType !== "all" && audienceId) ? audienceId : null,
        sent_by: profile.id,
        recipient_count: recipientIds.length,
      });

      // Audit log
      await (supabase as any).from("admin_audit_logs").insert({
        admin_user_id: profile.id,
        action: "send_announcement",
        entity_type: "admin_announcement",
        entity_id: title,
        details: { audience_type: audienceType, audience_id: audienceId || null, recipient_count: recipientIds.length },
      });

      toast({ title: `Announcement sent to ${recipientIds.length} users` });
      setDialogOpen(false);
      load();
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to send announcement", variant: "destructive" });
    } finally {
      setSending(false);
      setSendProgress("");
    }
  };

  const canSend = title.trim() && body.trim() && (audienceType === "all" || audienceId);

  return (
    <AdminLayout title="Announcements">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground text-sm">
          Send in-app notifications to all users or targeted audiences.
        </p>
        <Button onClick={openDialog} className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
          <Plus className="h-4 w-4 mr-2" /> New Announcement
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Audience</th>
              <th className="px-5 py-3 font-medium">Recipients</th>
              <th className="px-5 py-3 font-medium">Sent By</th>
              <th className="px-5 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>
            ) : announcements.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                  <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No announcements yet
                </td>
              </tr>
            ) : announcements.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-5 py-3 font-medium max-w-[300px] truncate">{a.title}</td>
                <td className="px-5 py-3 text-muted-foreground">{a.audience_label || a.audience_type}</td>
                <td className="px-5 py-3 font-mono text-xs">{a.recipient_count.toLocaleString()}</td>
                <td className="px-5 py-3 text-muted-foreground">{a.sender_name || "Admin"}</td>
                <td className="px-5 py-3 font-mono text-xs">
                  {new Date(a.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(page > 0 || hasMore) && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* New Announcement Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!sending) setDialogOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Announcement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Announcement title"
                maxLength={200}
              />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Announcement message..."
                rows={4}
                maxLength={2000}
              />
            </div>
            <div>
              <Label>Link (optional)</Label>
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="/courses/abc or https://..."
              />
            </div>
            <div>
              <Label className="mb-2 block">Audience</Label>
              <RadioGroup
                value={audienceType}
                onValueChange={(v) => { setAudienceType(v as any); setAudienceId(""); }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="aud-all" />
                  <Label htmlFor="aud-all" className="font-normal cursor-pointer">All Users</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cohort" id="aud-cohort" />
                  <Label htmlFor="aud-cohort" className="font-normal cursor-pointer">Cohort</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="course" id="aud-course" />
                  <Label htmlFor="aud-course" className="font-normal cursor-pointer">Course Enrollees</Label>
                </div>
              </RadioGroup>
            </div>

            {audienceType === "cohort" && (
              <SearchableSelect
                options={cohorts}
                value={audienceId}
                onValueChange={setAudienceId}
                placeholder="Select cohort..."
                searchPlaceholder="Search cohorts..."
              />
            )}

            {audienceType === "course" && (
              <SearchableSelect
                options={courses}
                value={audienceId}
                onValueChange={setAudienceId}
                placeholder="Select course..."
                searchPlaceholder="Search courses..."
              />
            )}

            {sending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {sendProgress}
              </div>
            )}

            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!canSend || sending}
              className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
            >
              {sending ? "Sending..." : "Send Announcement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send an in-app notification to{" "}
              {audienceType === "all" ? "all users" : audienceType === "cohort" ? "cohort members" : "course enrollees"}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend}>Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminAnnouncements;
