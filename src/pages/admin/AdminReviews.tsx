import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Star, CheckCircle2, XCircle, Trash2, Search } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";

interface ReviewRow {
  id: string;
  course_id: string;
  user_id: string;
  rating: number;
  review_text: string | null;
  status: string;
  helpful_count: number;
  is_verified_purchase: boolean;
  created_at: string;
  course_title: string;
  student_name: string;
}

const PAGE_SIZE = 50;

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  approved: "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]",
  rejected: "bg-destructive/10 text-destructive",
};

const AdminReviews = () => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const load = async () => {
    setLoading(true);

    let query = supabase
      .from("course_reviews")
      .select("id, course_id, user_id, rating, review_text, status, helpful_count, is_verified_purchase, created_at, course:courses(title), student:users(full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, count, error } = await query;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const mapped: ReviewRow[] = (data || []).map((r: any) => ({
      id: r.id,
      course_id: r.course_id,
      user_id: r.user_id,
      rating: r.rating,
      review_text: r.review_text,
      status: r.status,
      helpful_count: r.helpful_count,
      is_verified_purchase: r.is_verified_purchase,
      created_at: r.created_at,
      course_title: r.course?.title || "Unknown Course",
      student_name: r.student?.full_name || "Unknown User",
    }));

    setReviews(mapped);
    setTotalCount(count ?? 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, [page, statusFilter]);

  const auditLog = async (action: string, entityId: string, details: Record<string, any>) => {
    if (!user) return;
    await (supabase as any).from("admin_audit_logs").insert({
      admin_user_id: user.id,
      action,
      entity_type: "course_review",
      entity_id: entityId,
      details,
    });
  };

  const handleStatusChange = async (reviewId: string, newStatus: string) => {
    const { error } = await supabase
      .from("course_reviews")
      .update({ status: newStatus } as any)
      .eq("id", reviewId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Review ${newStatus}`);
    await auditLog(newStatus === "approved" ? "approve" : "reject", reviewId, { new_status: newStatus });
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("course_reviews").delete().eq("id", deleteId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Review deleted");
      await auditLog("delete", deleteId, {});
      load();
    }
    setDeleteId(null);
  };

  const filtered = reviews.filter((r) => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      r.student_name.toLowerCase().includes(q) ||
      (r.review_text || "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const renderStars = (rating: number) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-3.5 w-3.5 ${s <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search student or review text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Course</th>
              <th className="px-5 py-3 font-medium">Student</th>
              <th className="px-5 py-3 font-medium">Rating</th>
              <th className="px-5 py-3 font-medium">Review</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                  No reviews found
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                  <td className="px-5 py-3 max-w-[180px] truncate" title={r.course_title}>
                    {r.course_title}
                  </td>
                  <td className="px-5 py-3">{r.student_name}</td>
                  <td className="px-5 py-3">{renderStars(r.rating)}</td>
                  <td className="px-5 py-3 max-w-[240px]">
                    <span className="truncate block" title={r.review_text || ""}>
                      {r.review_text
                        ? r.review_text.length > 100
                          ? r.review_text.slice(0, 100) + "..."
                          : r.review_text
                        : <span className="text-muted-foreground italic">No text</span>}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${statusColors[r.status] || "bg-secondary text-muted-foreground"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      {r.status !== "approved" && (
                        <button
                          onClick={() => handleStatusChange(r.id, "approved")}
                          className="p-1.5 rounded hover:bg-secondary text-[hsl(var(--accent-emerald))]"
                          title="Approve"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      {r.status !== "rejected" && (
                        <button
                          onClick={() => handleStatusChange(r.id, "rejected")}
                          className="p-1.5 rounded hover:bg-secondary text-warning"
                          title="Reject"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteId(r.id)}
                        className="p-1.5 rounded hover:bg-secondary text-destructive"
                        title="Delete review"
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} ({totalCount} total)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete review?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this review. This action cannot be undone.
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
    </>
  );
};

export default AdminReviews;
