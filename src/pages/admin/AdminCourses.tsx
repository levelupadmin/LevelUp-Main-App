import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Eye, Pencil, Trash2, MoreVertical, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useDebounce } from "@/hooks/useDebounce";

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
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteCascadeInfo, setDeleteCascadeInfo] = useState<{
    sectionCount: number;
    chapterCount: number;
    enrolmentCount: number;
  } | null>(null);
  const [loadingCascade, setLoadingCascade] = useState(false);
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

  /* ── Open delete dialog with cascade info ── */
  const openDeleteDialog = async (courseId: string) => {
    setDeleteId(courseId);
    setDeleteCascadeInfo(null);
    setLoadingCascade(true);

    try {
      // Fetch sections
      const { data: secs } = await supabase
        .from("sections")
        .select("id")
        .eq("course_id", courseId);
      const sectionCount = secs?.length || 0;

      // Fetch chapters
      let chapterCount = 0;
      if (secs && secs.length > 0) {
        const secIds = secs.map((s) => s.id);
        const { data: chaps } = await supabase
          .from("chapters")
          .select("id")
          .in("section_id", secIds);
        chapterCount = chaps?.length || 0;
      }

      // Fetch active enrolments via offering_courses
      let enrolmentCount = 0;
      const { data: ocs } = await supabase
        .from("offering_courses")
        .select("offering_id")
        .eq("course_id", courseId);
      if (ocs && ocs.length > 0) {
        const offIds = [...new Set(ocs.map((oc) => oc.offering_id))];
        const { data: enrols } = await supabase
          .from("enrolments")
          .select("id")
          .in("offering_id", offIds)
          .eq("status", "active");
        enrolmentCount = enrols?.length || 0;
      }

      setDeleteCascadeInfo({ sectionCount, chapterCount, enrolmentCount });
    } catch {
      // If fetch fails, still show the dialog with a generic warning
      setDeleteCascadeInfo(null);
    }
    setLoadingCascade(false);
  };

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
  const filtered = courses.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (c.instructor_display_name || "").toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
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
                    onDelete={() => openDeleteDialog(c.id)}
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
                    onDelete={() => openDeleteDialog(c.id)}
                    onToggleBrowse={() => toggleBrowse(c.id, c.show_on_browse)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => { setDeleteId(null); setDeleteCascadeInfo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete course?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will permanently delete all sections, chapters, resources,
                  and revoke access for enrolled students. This action cannot be undone.
                </p>
                {loadingCascade ? (
                  <p className="text-xs text-muted-foreground">Loading impact details...</p>
                ) : deleteCascadeInfo ? (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm space-y-1">
                    <p><span className="font-mono font-semibold">{deleteCascadeInfo.sectionCount}</span> section{deleteCascadeInfo.sectionCount !== 1 ? "s" : ""} will be deleted</p>
                    <p><span className="font-mono font-semibold">{deleteCascadeInfo.chapterCount}</span> chapter{deleteCascadeInfo.chapterCount !== 1 ? "s" : ""} will be deleted</p>
                    {deleteCascadeInfo.enrolmentCount > 0 && (
                      <p className="text-destructive font-medium">
                        <span className="font-mono font-semibold">{deleteCascadeInfo.enrolmentCount}</span> active enrolment{deleteCascadeInfo.enrolmentCount !== 1 ? "s" : ""} will be affected
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
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
