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
import { Plus, Pencil, Search, Copy, Archive, Trash2 } from "lucide-react";
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

  const filtered = offerings.filter((o) => {
    const matchesSearch = o.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`https://app.leveluplearning.in/p/${slug}`);
    sonnerToast("Link copied!");
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
                  className="border-b border-border last:border-0 hover:bg-secondary/30"
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
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/admin/offerings/${o.id}/edit`)}
                        className="p-1.5 rounded hover:bg-secondary"
                        title="Edit offering"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => toggleArchive(o)}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground"
                        title={o.status === "archived" ? "Restore offering" : "Archive offering"}
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(o.id)}
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
