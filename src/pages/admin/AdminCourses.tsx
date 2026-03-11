import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import {
  Search, Plus, MoreHorizontal, Loader2, Eye, Copy, EyeOff,
  Trash2, FileText, BookOpen, Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useCourses, useCreateCourse, useDeleteCourse, useUpdateCourse, useCloneCourse,
  statusStyles, courseTypeStyles, courseTypeLabel,
  type Course,
} from "@/hooks/useCourseAdmin";
import { TablesInsert } from "@/integrations/supabase/types";

const AdminCourses = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newType, setNewType] = useState("masterclass");

  const { data: courses = [], isLoading } = useCourses();
  const createCourse = useCreateCourse();
  const deleteCourse = useDeleteCourse();
  const updateCourse = useUpdateCourse();
  const cloneCourse = useCloneCourse();

  const filtered = courses
    .filter((c) => !search || c.title.toLowerCase().includes(search.toLowerCase()))
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) => typeFilter === "all" || c.course_type === typeFilter);

  const stats = {
    total: courses.length,
    published: courses.filter((c) => c.status === "published").length,
    draft: courses.filter((c) => c.status === "draft").length,
  };

  const handleCreate = () => {
    if (!newTitle.trim() || !newSlug.trim()) {
      toast({ title: "Title and slug are required", variant: "destructive" });
      return;
    }
    createCourse.mutate(
      { title: newTitle.trim(), slug: newSlug.trim(), course_type: newType as any } as TablesInsert<"courses">,
      {
        onSuccess: (data) => {
          setShowCreateDialog(false);
          setNewTitle("");
          setNewSlug("");
          if (data?.id) navigate(`/admin/courses/${data.id}`);
        },
      }
    );
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteCourse.mutate(deleteTarget, {
        onSuccess: () => setDeleteTarget(null),
      });
    }
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Courses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {stats.total} total · {stats.published} published · {stats.draft} drafts
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" />
          Create Course
        </Button>
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="masterclass">Masterclass</SelectItem>
            <SelectItem value="workshop">Workshop</SelectItem>
            <SelectItem value="cohort">Cohort</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Card Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 mt-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No courses found</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onEdit={() => navigate(`/admin/courses/${course.id}`)}
              onClone={() => cloneCourse.mutate(course.id)}
              onTogglePublish={() =>
                updateCourse.mutate({
                  id: course.id,
                  status: course.status === "published" ? "draft" : "published",
                })
              }
              onDelete={() => setDeleteTarget(course.id)}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Course</DialogTitle>
            <DialogDescription>Enter basic details to create a new course</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newTitle}
                onChange={(e) => {
                  setNewTitle(e.target.value);
                  setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
                }}
                placeholder="Course title"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Slug</label>
              <Input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="course-slug" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="masterclass">Masterclass</SelectItem>
                  <SelectItem value="workshop">Workshop</SelectItem>
                  <SelectItem value="cohort">Cohort</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createCourse.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Course</DialogTitle>
            <DialogDescription>This will permanently delete the course and all its content. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteCourse.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

// ─── Course Card ───

interface CardProps {
  course: Course;
  onEdit: () => void;
  onClone: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
}

const CourseCard = ({ course, onEdit, onClone, onTogglePublish, onDelete }: CardProps) => {
  const isPublished = course.status === "published";

  return (
    <div className="group rounded-xl border border-border bg-card overflow-hidden hover:border-[hsl(var(--highlight))]/30 transition-colors shadow-card">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-secondary overflow-hidden">
        {course.thumbnail_url ? (
          <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full">
            <BookOpen className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}

        {/* Status badge */}
        <Badge
          variant="outline"
          className={`absolute top-2.5 left-2.5 text-[10px] ${statusStyles[course.status] || ""}`}
        >
          {course.status}
        </Badge>

        {/* Type badge */}
        <Badge
          variant="outline"
          className={`absolute top-2.5 right-2.5 text-[10px] ${courseTypeStyles[course.course_type] || ""}`}
        >
          {courseTypeLabel[course.course_type] || course.course_type}
        </Badge>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-foreground truncate">{course.title}</h3>
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {course.instructor_name} · {course.category}
        </p>

        <div className="flex items-center justify-between mt-4">
          <Button size="sm" className="gap-1.5 text-xs" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
            Edit Course
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onEdit}>
                <Eye className="h-3.5 w-3.5 mr-2" /> View as Customer
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <FileText className="h-3.5 w-3.5 mr-2" /> Course Overview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClone}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Clone Course
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onTogglePublish}>
                <EyeOff className="h-3.5 w-3.5 mr-2" />
                {isPublished ? "Unpublish" : "Publish"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};

export default AdminCourses;
