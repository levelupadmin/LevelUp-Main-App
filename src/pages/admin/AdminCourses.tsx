import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Eye, Pencil, Trash2, MoreVertical, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { TierBadge, TIER_SECTION_CONFIG } from "@/components/TierBadge";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────── */
/*  Types & Constants                                 */
/* ────────────────────────────────────────────────── */
const TIER_ORDER = ["live_cohort", "masterclass", "advanced_program", "workshop"] as const;

interface CourseCard {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  instructor_display_name: string | null;
  product_tier: string;
  sort_order: number;
  status: string;
  show_on_browse: boolean;
  chapter_count: number;
}

/* ────────────────────────────────────────────────── */
/*  Component                                         */
/* ────────────────────────────────────────────────── */
const AdminCourses = () => {
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  /* ── Load ── */
  const load = async () => {
    setLoading(true);
    // Use select("*") so the query doesn't fail if show_on_browse column
    // hasn't been created by the migration yet
    const { data } = await supabase
      .from("courses")
      .select("*")
      .order("sort_order", { ascending: true });

    if (!data) {
      setLoading(false);
      return;
    }

    // Chapter counts
    const courseIds = data.map((c) => c.id);
    const { data: sections } = await supabase
      .from("sections")
      .select("id, course_id")
      .in("course_id", courseIds);

    const sectionIds = (sections || []).map((s) => s.id);
    const chapterCounts: Record<string, number> = {};

    if (sectionIds.length > 0) {
      const { data: chapters } = await supabase
        .from("chapters")
        .select("id, section_id")
        .in("section_id", sectionIds);

      const sectionToCourse: Record<string, string> = {};
      (sections || []).forEach((s) => {
        sectionToCourse[s.id] = s.course_id;
      });
      (chapters || []).forEach((ch) => {
        const cid = sectionToCourse[ch.section_id];
        if (cid) chapterCounts[cid] = (chapterCounts[cid] || 0) + 1;
      });
    }

    setCourses(
      data.map((c: any) => ({
        ...c,
        show_on_browse: c.show_on_browse ?? true,
        chapter_count: chapterCounts[c.id] || 0,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  /* ── Delete ── */
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

  /* ── Toggle show_on_browse ── */
  const toggleBrowse = async (courseId: string, current: boolean) => {
    const next = !current;
    // Optimistic update
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, show_on_browse: next } : c))
    );
    const { error } = await supabase
      .from("courses")
      .update({ show_on_browse: next } as any)
      .eq("id", courseId);
    if (error) {
      // Revert on failure — column may not exist yet if migration hasn't run
      setCourses((prev) =>
        prev.map((c) => (c.id === courseId ? { ...c, show_on_browse: current } : c))
      );
      if (error.message.includes("show_on_browse")) {
        toast({
          title: "Migration pending",
          description: "The show_on_browse feature will be available after the next deploy.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } else {
      toast({
        title: next ? "Shown on Browse" : "Hidden from Browse",
        description: next
          ? "Students can now discover this course"
          : "Course hidden from Browse page (enrolled students still have access)",
      });
    }
  };

  /* ── Filter & Group ── */
  const filtered = courses.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.instructor_display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const groupedByTier = TIER_ORDER.map((tier) => ({
    tier,
    config: TIER_SECTION_CONFIG[tier],
    items: filtered.filter((c) => c.product_tier === tier),
  })).filter((g) => g.items.length > 0);

  // Courses with tiers not in TIER_ORDER
  const ungrouped = filtered.filter(
    (c) => !TIER_ORDER.includes(c.product_tier as any)
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
          <Plus className="h-4 w-4 mr-2" /> New Course
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-xl h-[300px] animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-lg text-muted-foreground">No courses found</p>
        </div>
      ) : (
        <div className="space-y-10">
          {groupedByTier.map(({ tier, config, items }) => (
            <section key={tier}>
              <div className="flex items-center gap-3 mb-4">
                <div className={cn("w-1 h-6 rounded-full", config.accentColor)} />
                <h2 className="text-lg font-semibold">{config.heading}</h2>
                <span className="text-sm text-muted-foreground font-mono">
                  ({items.length})
                </span>
              </div>
              <div
                className={cn(
                  "grid gap-4",
                  tier === "workshop"
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                )}
              >
                {items.map((c) => (
                  <CourseCardComponent
                    key={c.id}
                    course={c}
                    tier={tier}
                    onEdit={() => navigate(`/admin/courses/${c.id}/edit`)}
                    onPreview={() => navigate(`/admin/courses/${c.id}/preview`)}
                    onDelete={() => setDeleteId(c.id)}
                    onToggleBrowse={() => toggleBrowse(c.id, c.show_on_browse)}
                  />
                ))}
              </div>
            </section>
          ))}
          {ungrouped.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-6 rounded-full bg-muted" />
                <h2 className="text-lg font-semibold">Other</h2>
                <span className="text-sm text-muted-foreground font-mono">
                  ({ungrouped.length})
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ungrouped.map((c) => (
                  <CourseCardComponent
                    key={c.id}
                    course={c}
                    tier={c.product_tier}
                    onEdit={() => navigate(`/admin/courses/${c.id}/edit`)}
                    onPreview={() => navigate(`/admin/courses/${c.id}/preview`)}
                    onDelete={() => setDeleteId(c.id)}
                    onToggleBrowse={() => toggleBrowse(c.id, c.show_on_browse)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete course?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this course and all associated sections
              and chapters.
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
/*  Card Component                                    */
/* ────────────────────────────────────────────────── */
function CourseCardComponent({
  course: c,
  tier,
  onEdit,
  onPreview,
  onDelete,
  onToggleBrowse,
}: {
  course: CourseCard;
  tier: string;
  onEdit: () => void;
  onPreview: () => void;
  onDelete: () => void;
  onToggleBrowse: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden group relative">
      {/* Thumbnail */}
      <div className="aspect-video bg-secondary relative">
        {c.thumbnail_url ? (
          <img
            src={c.thumbnail_url}
            alt={c.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            No thumbnail
          </div>
        )}
        <div className="absolute top-2 left-2">
          <TierBadge tier={c.product_tier} />
        </div>
        <div className="absolute top-2 right-2">
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono",
              c.status === "published"
                ? "bg-[hsl(var(--accent-emerald)/0.9)] text-white"
                : c.status === "archived"
                ? "bg-destructive/80 text-white"
                : "bg-foreground/70 text-background"
            )}
          >
            {c.status}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={cn(
              "font-semibold line-clamp-2 flex-1",
              tier === "workshop" ? "text-base" : "text-lg leading-snug"
            )}
          >
            {c.title}
          </h3>

          {/* Three-dot menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-secondary shrink-0 -mt-0.5">
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPreview}>
                <Eye className="h-4 w-4 mr-2" /> Student Preview
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {c.instructor_display_name && (
          <p className="text-sm text-muted-foreground line-clamp-1">
            {c.instructor_display_name}
          </p>
        )}
        {tier !== "workshop" && c.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
        )}

        {/* Footer: chapter count + browse toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground font-mono">
            {c.chapter_count} chapter{c.chapter_count !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <Switch
              checked={c.show_on_browse}
              onCheckedChange={onToggleBrowse}
              className="scale-75 origin-right"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminCourses;
