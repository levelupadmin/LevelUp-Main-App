import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Plus, Pencil, Search, Copy, Link2, Archive, Trash2, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast as sonnerToast } from "sonner";

interface OfferingRow {
  id: string;
  title: string;
  slug: string;
  type: string;
  price_inr: number;
  mrp_inr: number | null;
  status: string;
  is_public: boolean | null;
  course_count: number;
  enrolment_count: number;
}

const AdminOfferings = () => {
  const [offerings, setOfferings] = useState<OfferingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Duplicate dialog
  const [dupTarget, setDupTarget] = useState<OfferingRow | null>(null);
  const [dupTitle, setDupTitle] = useState("");
  const [dupCopyCurriculum, setDupCopyCurriculum] = useState(true);
  const [duplicating, setDuplicating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data: offs } = await supabase
      .from("offerings")
      .select("id, title, slug, type, price_inr, mrp_inr, status, is_public")
      .order("created_at", { ascending: false });
    if (!offs) {
      setLoading(false);
      return;
    }

    const offIds = offs.map((o) => o.id);
    const [ocRes, enRes] = await Promise.all([
      supabase.from("offering_courses").select("offering_id, course_id").in("offering_id", offIds),
      supabase.from("enrolments").select("offering_id").in("offering_id", offIds),
    ]);

    const courseCounts: Record<string, number> = {};
    (ocRes.data || []).forEach((oc) => {
      courseCounts[oc.offering_id] = (courseCounts[oc.offering_id] || 0) + 1;
    });
    const enrolCounts: Record<string, number> = {};
    (enRes.data || []).forEach((e) => {
      enrolCounts[e.offering_id] = (enrolCounts[e.offering_id] || 0) + 1;
    });

    setOfferings(
      offs.map((o) => ({
        ...o,
        is_public: o.is_public ?? false,
        course_count: courseCounts[o.id] || 0,
        enrolment_count: enrolCounts[o.id] || 0,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleArchive = async (offering: OfferingRow) => {
    const newStatus = offering.status === "archived" ? "active" : "archived";
    const { error } = await supabase
      .from("offerings")
      .update({ status: newStatus })
      .eq("id", offering.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: newStatus === "archived" ? "Offering archived" : "Offering restored" });
      load();
    }
  };

  const handleDeleteOffering = async () => {
    if (!deleteId) return;
    const offering = offerings.find((o) => o.id === deleteId);
    if (offering && offering.enrolment_count > 0) {
      toast({
        title: "Cannot delete",
        description: "This offering has active enrolments. Archive it instead.",
        variant: "destructive",
      });
      setDeleteId(null);
      return;
    }
    const { error } = await supabase.from("offerings").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Offering deleted" });
      load();
    }
    setDeleteId(null);
  };

  const openDuplicate = (o: OfferingRow) => {
    setDupTitle(`${o.title} (copy)`);
    setDupCopyCurriculum(true);
    setDupTarget(o);
  };

  /** One transaction on the server (admin_duplicate_offering): the offering as a
   *  private draft + its form fields, bumps, upsells, and — by default — a deep
   *  copy of its courses so the new batch's curriculum can be edited without
   *  touching the batch that is already running. Enrolments are never copied. */
  const runDuplicate = async () => {
    if (!dupTarget) return;
    setDuplicating(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_duplicate_offering", {
      p_offering_id: dupTarget.id,
      p_new_title: dupTitle.trim() || null,
      p_copy_curriculum: dupCopyCurriculum,
    });
    setDuplicating(false);
    if (error || !data) {
      toast({ title: "Couldn't duplicate", description: error?.message || "No id returned", variant: "destructive" });
      return;
    }
    toast({ title: "Offering duplicated", description: "Opening the copy — it stays a private draft until you set it Active." });
    setDupTarget(null);
    navigate(`/admin/offerings/${data}/edit`);
  };

  const filtered = offerings.filter((o) => {
    const matchesSearch = o.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const copyLink = async (slug: string) => {
    // Build the link against the current host so it works in local dev,
    // Vercel preview deploys, and production without code changes.
    const url = `${window.location.origin}/p/${slug}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        sonnerToast.success("Link copied", { description: url });
        return;
      }
      throw new Error("Clipboard API unavailable");
    } catch {
      // Fallback: legacy execCommand path for browsers/contexts that
      // refuse the async clipboard API (Safari background tab, http://
      // contexts, locked-down corporate browsers, etc.).
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        sonnerToast.success("Link copied", { description: url });
      } catch {
        // Last resort: surface the URL so the user can copy it manually.
        sonnerToast.error("Copy blocked by your browser", { description: url, duration: 30000 });
      }
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search offerings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={() => navigate("/admin/offerings/new/edit")}
          className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-2" /> New Offering
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Price</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Courses</th>
              <th className="px-5 py-3 font-medium">Enrolments</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                  No offerings found
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/admin/offerings/${o.id}/edit`)}
                  className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer"
                  title="Click to edit"
                >
                  <td className="px-5 py-3">
                    <span className="font-medium">{o.title}</span>
                    {o.slug && (
                      <p className="text-xs text-muted-foreground mt-0.5">/p/{o.slug}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{o.type}</td>
                  <td className="px-5 py-3">
                    ₹{o.price_inr}
                    {o.mrp_inr && o.mrp_inr > o.price_inr && (
                      <span className="text-muted-foreground line-through ml-2 text-xs">
                        ₹{o.mrp_inr}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs font-mono px-2 py-0.5 rounded ${
                        o.status === "active"
                          ? "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{o.course_count}</td>
                  <td className="px-5 py-3 font-mono text-xs">{o.enrolment_count}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      {o.slug && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyLink(o.slug);
                          }}
                          className="p-1.5 rounded hover:bg-secondary"
                          title="Copy public link"
                        >
                          <Link2 className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); openDuplicate(o); }}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground"
                        title="Duplicate offering (new batch)"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/admin/offerings/${o.id}/edit`); }}
                        className="p-1.5 rounded hover:bg-secondary"
                        title="Edit offering"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleArchive(o); }}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground"
                        title={o.status === "archived" ? "Restore offering" : "Archive offering"}
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteId(o.id); }}
                        className="p-1.5 rounded hover:bg-secondary text-destructive"
                        title="Delete offering"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Duplicate */}
      <Dialog open={!!dupTarget} onOpenChange={(o) => { if (!o && !duplicating) setDupTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate “{dupTarget?.title}”</DialogTitle>
            <DialogDescription>
              Makes a new <strong>private draft</strong> with the same price, checkout, thank-you
              page, tracking and cohort settings. Students, applications and payments are never
              copied — the copy starts with nobody enrolled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">New title</label>
              <Input
                value={dupTitle}
                onChange={(e) => setDupTitle(e.target.value)}
                placeholder="e.g. The Breakthrough Filmmakers' Program — Batch 24"
                autoFocus
              />
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={dupCopyCurriculum}
                onCheckedChange={(v) => setDupCopyCurriculum(v === true)}
                className="mt-0.5"
              />
              <span>
                Also copy the curriculum
                <span className="block text-xs text-muted-foreground">
                  {dupTarget?.course_count
                    ? `Deep-copies ${dupTarget.course_count === 1 ? "the course" : `all ${dupTarget.course_count} courses`} (sections, chapters, resources, quizzes). Videos and PDFs are referenced, not re-uploaded. Untick to share the existing course instead.`
                    : "This offering has no courses linked; nothing to copy."}
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupTarget(null)} disabled={duplicating}>Cancel</Button>
            <Button onClick={runDuplicate} disabled={duplicating || !dupTitle.trim()} className="gap-2">
              {duplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              {duplicating ? "Duplicating…" : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete offering?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const offering = offerings.find((o) => o.id === deleteId);
                if (offering && offering.enrolment_count > 0) {
                  return `This offering has ${offering.enrolment_count} enrolment(s). It cannot be deleted while students are enrolled. Consider archiving it instead.`;
                }
                return "This will permanently delete this offering and its course associations. This action cannot be undone.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOffering}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminOfferings;
