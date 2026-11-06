import { ExploreOrderDialog } from "@/components/admin/ExploreOrderDialog";
import { ACCESS, OFFERING_STATUS } from "@/lib/catalogue";
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
  access: string;
  course_count: number;
  enrolment_count: number;
  /** titles of the courses inside */
  inside: string[];
  /** "Show on Explore": off / on (row place) / carousel */
  explore: { show: "off" | "on" | "carousel"; position: number } | null;
}

const AdminOfferings = () => {
  const [offerings, setOfferings] = useState<OfferingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [orderOpen, setOrderOpen] = useState(false);
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
      .select("id, title, slug, type, price_inr, mrp_inr, status, is_public, access")
      .order("created_at", { ascending: false });
    if (!offs) {
      setLoading(false);
      return;
    }

    const offIds = offs.map((o) => o.id);
    // Students are counted in the database (admin_catalogue_counts): the
    // browser stops at 1,000 rows and used to count revoked access too.
    const [ocRes, countRes, pageRes] = await Promise.all([
      supabase.from("offering_courses").select("offering_id, courses(title)").in("offering_id", offIds),
      supabase.rpc("admin_catalogue_counts"),
      supabase.from("pages").select("button_offering_id, listing, position"),
    ]);

    const inside: Record<string, string[]> = {};
    ((ocRes.data || []) as { offering_id: string; courses: { title: string } | null }[]).forEach((oc) => {
      (inside[oc.offering_id] ||= []).push(oc.courses?.title ?? "Course");
    });
    const enrolCounts: Record<string, number> = {};
    (Array.isArray(countRes.data) ? countRes.data : []).forEach((r) => { enrolCounts[r.offering_id] = Number(r.students) || 0; });
    const explore: Record<string, OfferingRow["explore"]> = {};
    (pageRes.data || []).forEach((p) => {
      if (!p.button_offering_id) return;
      const show = p.listing === "featured" ? "carousel" : p.listing === "listed" ? "on" : "off";
      if (!explore[p.button_offering_id] || show !== "off") explore[p.button_offering_id] = { show, position: p.position };
    });

    setOfferings(
      offs.map((o) => ({
        ...o,
        is_public: o.is_public ?? false,
        access: o.access ?? "buy",
        inside: inside[o.id] || [],
        course_count: (inside[o.id] || []).length,
        enrolment_count: enrolCounts[o.id] || 0,
        explore: explore[o.id] ?? null,
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
    const url = `${window.location.origin}/checkout/${slug}`;
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
          <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Selling</SelectItem>
            <SelectItem value="archived">Closed (students keep access)</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setOrderOpen(true)}>Explore order</Button>
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
              <th className="px-5 py-3 font-medium">Offering (its checkout page)</th>
              <th className="px-5 py-3 font-medium">Price</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">How people get it</th>
              <th className="px-5 py-3 font-medium">Courses inside</th>
              <th className="px-5 py-3 font-medium">On Explore</th>
              <th className="px-5 py-3 font-medium">Students</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
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
                      <p className="text-xs text-muted-foreground mt-0.5">/checkout/{o.slug}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
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
                      {OFFERING_STATUS[o.status]?.label ?? o.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs" title={ACCESS[o.access]?.hint}>{ACCESS[o.access]?.label ?? o.access}</td>
                  <td className="px-5 py-3 text-xs max-w-[240px]">
                    {o.inside.length === 0 ? <span className="text-muted-foreground">None yet</span> : (
                      <span title={o.inside.join("\n")}>
                        {o.inside.slice(0, 2).join(", ")}{o.inside.length > 2 ? ` +${o.inside.length - 2} more` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs whitespace-nowrap">
                    {o.explore?.show === "carousel" ? "Yes + carousel" : o.explore?.show === "on" ? "Yes" : <span className="text-muted-foreground">No</span>}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{o.enrolment_count.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      {o.slug && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyLink(o.slug);
                          }}
                          className="p-1.5 rounded hover:bg-secondary"
                          title="Copy checkout link"
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

      <ExploreOrderDialog open={orderOpen} onOpenChange={(v) => { setOrderOpen(v); if (!v) void load(); }} />

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
