import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

interface CourseRow {
  id: string;
  title: string;
  instructor_display_name: string | null;
  status: string;
  created_at: string;
  chapter_count: number;
}

const AdminCourses = () => {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("courses")
      .select("id, title, instructor_display_name, status, created_at")
      .order("created_at", { ascending: false });

    if (data) {
      // Get chapter counts
      const courseIds = data.map((c) => c.id);
      const { data: sections } = await supabase
        .from("sections")
        .select("id, course_id")
        .in("course_id", courseIds);

      const sectionIds = (sections || []).map((s) => s.id);
      let chapterCounts: Record<string, number> = {};

      if (sectionIds.length > 0) {
        const { data: chapters } = await supabase
          .from("chapters")
          .select("id, section_id")
          .in("section_id", sectionIds);

        const sectionToCourse: Record<string, string> = {};
        (sections || []).forEach((s) => { sectionToCourse[s.id] = s.course_id; });

        (chapters || []).forEach((ch) => {
          const cid = sectionToCourse[ch.section_id];
          if (cid) chapterCounts[cid] = (chapterCounts[cid] || 0) + 1;
        });
      }

      setCourses(
        data.map((c) => ({
          ...c,
          chapter_count: chapterCounts[c.id] || 0,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("courses").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Course deleted" });
      load();
    }
    setDeleteId(null);
  };

  const filtered = courses.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.instructor_display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout title="Courses">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => navigate("/admin/courses/new")}
          className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Course
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Instructor</th>
              <th className="px-5 py-3 font-medium">Chapters</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Created</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">No courses found</td></tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer"
                  onClick={() => navigate(`/admin/courses/${c.id}/edit`)}
                >
                  <td className="px-5 py-3 font-medium">{c.title}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.instructor_display_name || "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs">{c.chapter_count}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                      c.status === "published"
                        ? "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]"
                        : "bg-secondary text-muted-foreground"
                    }`}>{c.status}</span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{new Date(c.created_at).toLocaleDateString("en-IN")}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/admin/courses/${c.id}/edit`)}
                        className="p-1.5 rounded hover:bg-secondary"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(c.id)}
                        className="p-1.5 rounded hover:bg-destructive/20 text-destructive"
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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete course?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this course and all associated sections and chapters.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminCourses;
