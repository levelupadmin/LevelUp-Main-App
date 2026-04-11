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
import { Plus, Mail, Eye, EyeOff, Loader2 } from "lucide-react";
import DOMPurify from "dompurify";

interface CampaignRow {
  id: string;
  subject: string;
  html_body: string;
  text_body: string;
  audience_type: string;
  audience_id: string | null;
  sent_by: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  created_at: string;
  sent_at: string | null;
  audience_label?: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-secondary text-muted-foreground",
  sending: "bg-blue-500/15 text-blue-400",
  sent: "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]",
  failed: "bg-destructive/15 text-destructive",
};

const PAGE_SIZE = 20;

const AdminEmailCampaigns = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [audienceType, setAudienceType] = useState<"all" | "cohort" | "course">("all");
  const [audienceId, setAudienceId] = useState("");

  // Lookup data
  const [cohorts, setCohorts] = useState<{ value: string; label: string }[]>([]);
  const [courses, setCourses] = useState<{ value: string; label: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE;

    const { data } = await (supabase as any)
      .from("email_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    const rows = (data || []) as CampaignRow[];
    setHasMore(rows.length > PAGE_SIZE);
    const pageRows = rows.slice(0, PAGE_SIZE);

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

    setCampaigns(pageRows);
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const openDialog = async () => {
    setSubject("");
    setHtmlBody("");
    setAudienceType("all");
    setAudienceId("");
    setShowPreview(false);

    const { data: ch } = await (supabase as any)
      .from("cohort_batches")
      .select("id, name")
      .order("name");
    setCohorts((ch || []).map((c: any) => ({ value: c.id, label: c.name })));

    const { data: co } = await supabase
      .from("courses")
      .select("id, title")
      .order("title");
    setCourses((co || []).map((c: any) => ({ value: c.id, label: c.title })));

    setDialogOpen(true);
  };

  const renderPreview = (html: string) => {
    const rendered = html.replaceAll("{{student_name}}", "Jane Doe");
    return DOMPurify.sanitize(rendered);
  };

  const handleSend = async () => {
    if (!profile) return;
    setConfirmOpen(false);
    setSending(true);

    try {
      // 1. Insert campaign as draft
      const { data: inserted, error: insertErr } = await (supabase as any)
        .from("email_campaigns")
        .insert({
          subject,
          html_body: htmlBody,
          text_body: "",
          audience_type: audienceType,
          audience_id: (audienceType !== "all" && audienceId) ? audienceId : null,
          sent_by: profile.id,
          status: "draft",
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        toast({ title: "Failed to create campaign", description: insertErr?.message, variant: "destructive" });
        setSending(false);
        return;
      }

      // 2. Invoke send-bulk-email edge function
      const { data: fnData, error: fnErr } = await supabase.functions.invoke("send-bulk-email", {
        body: { campaign_id: inserted.id },
      });

      if (fnErr) {
        toast({ title: "Failed to send campaign", description: fnErr.message, variant: "destructive" });
        // Mark as failed
        await (supabase as any)
          .from("email_campaigns")
          .update({ status: "failed" })
          .eq("id", inserted.id);
      } else {
        const enqueued = fnData?.enqueued ?? 0;
        toast({ title: `Campaign sent`, description: `${enqueued} emails enqueued` });
      }

      setDialogOpen(false);
      load();
    } catch (err) {
      console.error(err);
      toast({ title: "Error sending campaign", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const canSend = subject.trim() && htmlBody.trim() && (audienceType === "all" || audienceId);

  return (
    <AdminLayout title="Email Campaigns">
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground text-sm">
          Create and send email campaigns to your user base.
        </p>
        <Button onClick={openDialog} className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
          <Plus className="h-4 w-4 mr-2" /> New Campaign
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Subject</th>
              <th className="px-5 py-3 font-medium">Audience</th>
              <th className="px-5 py-3 font-medium">Recipients</th>
              <th className="px-5 py-3 font-medium">Sent</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                  <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No campaigns yet
                </td>
              </tr>
            ) : campaigns.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-5 py-3 font-medium max-w-[250px] truncate">{c.subject}</td>
                <td className="px-5 py-3 text-muted-foreground">{c.audience_label || c.audience_type}</td>
                <td className="px-5 py-3 font-mono text-xs">{c.total_recipients.toLocaleString()}</td>
                <td className="px-5 py-3 font-mono text-xs">{c.sent_count.toLocaleString()}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${STATUS_COLORS[c.status] || "bg-secondary text-muted-foreground"}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-xs">
                  {new Date(c.sent_at || c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
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

      {/* New Campaign Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!sending) setDialogOpen(open); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Email Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Subject */}
            <div>
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject line"
                maxLength={500}
              />
            </div>

            {/* HTML Body */}
            <div>
              <Label>HTML Body</Label>
              <p className="text-xs text-muted-foreground mb-1">
                Available variable: <code className="bg-secondary px-1 rounded">{`{{student_name}}`}</code>
              </p>
              <Textarea
                value={htmlBody}
                onChange={(e) => setHtmlBody(e.target.value)}
                rows={20}
                className="font-mono text-xs"
                placeholder="<div>...</div>"
              />
            </div>

            {/* Audience */}
            <div>
              <Label className="mb-2 block">Audience</Label>
              <RadioGroup
                value={audienceType}
                onValueChange={(v) => { setAudienceType(v as any); setAudienceId(""); }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="camp-all" />
                  <Label htmlFor="camp-all" className="font-normal cursor-pointer">All Users</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cohort" id="camp-cohort" />
                  <Label htmlFor="camp-cohort" className="font-normal cursor-pointer">Cohort</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="course" id="camp-course" />
                  <Label htmlFor="camp-course" className="font-normal cursor-pointer">Course Enrollees</Label>
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

            {/* Preview toggle */}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="gap-2"
              >
                {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showPreview ? "Hide Preview" : "Show Preview"}
              </Button>

              {showPreview && htmlBody.trim() && (
                <div className="mt-3 border border-border rounded-lg overflow-hidden">
                  <div className="bg-secondary/50 px-4 py-2 text-xs text-muted-foreground border-b border-border">
                    Preview (with sample data)
                  </div>
                  <div
                    className="p-4 bg-white text-black"
                    dangerouslySetInnerHTML={{ __html: renderPreview(htmlBody) }}
                  />
                </div>
              )}
            </div>

            {/* Send */}
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!canSend || sending}
              className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
            >
              {sending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
              ) : "Send Campaign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send email campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send an email to{" "}
              {audienceType === "all" ? "all users" : audienceType === "cohort" ? "cohort members" : "course enrollees"}.
              Emails will be queued and delivered in batches. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend}>Send Campaign</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminEmailCampaigns;
