import { useState, useRef } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import {
  FileText, Search, Plus, MoreHorizontal, Star, ArrowLeft, Trash2,
  GripVertical, ChevronDown, ChevronRight, Video, BookOpen, Save, X,
  Upload, File, FileQuestion, ClipboardList, Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Course = Tables<"courses">;
type Module = Tables<"course_modules">;
type Lesson = Tables<"lessons">;

const statusStyles: Record<string, string> = {
  published: "bg-green-500/10 text-green-400 border-green-500/20",
  draft: "bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20",
  archived: "bg-muted text-muted-foreground border-border",
};

const difficultyLabel: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const CATEGORIES = ["Cinematography", "Editing", "Writing", "Sound", "Post-Production", "Filmmaking", "VFX", "General"];

// ─── Hooks ───
const useCourses = () =>
  useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Course[];
    },
  });

const useModules = (courseId: string | null) =>
  useQuery({
    queryKey: ["admin-modules", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_modules")
        .select("*")
        .eq("course_id", courseId!)
        .order("sort_order");
      if (error) throw error;
      return data as Module[];
    },
  });

const useLessons = (courseId: string | null) =>
  useQuery({
    queryKey: ["admin-lessons", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("*")
        .eq("course_id", courseId!)
        .order("sort_order");
      if (error) throw error;
      return data as Lesson[];
    },
  });

// ─── Create Course Form ───
const emptyCourse: Partial<TablesInsert<"courses">> = {
  title: "",
  slug: "",
  description: "",
  short_description: "",
  category: "General",
  difficulty: "beginner",
  status: "draft",
  instructor_name: "",
  price: 0,
  is_free: false,
  estimated_duration: "",
  tags: [],
};

// ─── Main Component ───
const AdminContent = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === "super_admin";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState<Partial<TablesInsert<"courses">> | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Module/Lesson creation
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newLessonData, setNewLessonData] = useState<{
    moduleId: string; title: string; duration: string; type: string;
    videoUrl: string; file: File | null; content: string; uploading: boolean;
  } | null>(null);

  const { data: courses = [], isLoading } = useCourses();
  const { data: modules = [] } = useModules(selectedCourseId);
  const { data: lessons = [] } = useLessons(selectedCourseId);

  const filteredCourses = courses
    .filter((c) => search === "" || c.title.toLowerCase().includes(search.toLowerCase()) || c.instructor_name.toLowerCase().includes(search.toLowerCase()))
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) => categoryFilter === "all" || c.category === categoryFilter);

  // ── Mutations ──
  const createCourse = useMutation({
    mutationFn: async (course: TablesInsert<"courses">) => {
      const { data, error } = await supabase.from("courses").insert(course).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      toast({ title: "Course created" });
      setShowCreateDialog(false);
      setEditingCourse(null);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateCourse = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Course> & { id: string }) => {
      const { error } = await supabase.from("courses").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      toast({ title: "Course updated" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteCourse = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      toast({ title: "Course deleted" });
      setShowDeleteDialog(null);
      if (selectedCourseId) setSelectedCourseId(null);
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createModule = useMutation({
    mutationFn: async (mod: TablesInsert<"course_modules">) => {
      const { error } = await supabase.from("course_modules").insert(mod);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-modules"] });
      setNewModuleTitle("");
      toast({ title: "Module added" });
    },
  });

  const deleteModule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("course_modules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-modules"] });
      queryClient.invalidateQueries({ queryKey: ["admin-lessons"] });
      toast({ title: "Module deleted" });
    },
  });

  const createLesson = useMutation({
    mutationFn: async (lesson: TablesInsert<"lessons">) => {
      const { error } = await supabase.from("lessons").insert(lesson);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-lessons"] });
      setNewLessonData(null);
      toast({ title: "Lesson added" });
    },
  });

  const deleteLesson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lessons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-lessons"] });
      toast({ title: "Lesson deleted" });
    },
  });

  const handleStatusChange = (courseId: string, newStatus: "draft" | "published" | "archived") => {
    updateCourse.mutate({ id: courseId, status: newStatus });
  };

  const handleCreateSubmit = () => {
    if (!editingCourse?.title || !editingCourse?.slug) {
      toast({ title: "Title and slug are required", variant: "destructive" });
      return;
    }
    createCourse.mutate(editingCourse as TablesInsert<"courses">);
  };

  const toggleModule = (id: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  // ─── DETAIL VIEW ───
  if (selectedCourse) {
    const courseLessons = lessons;
    return (
      <AdminLayout>
        <div className="space-y-5">
          <button onClick={() => setSelectedCourseId(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to courses
          </button>

          {/* Course Header */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold text-foreground truncate">{selectedCourse.title}</h2>
                  <Badge variant="outline" className={statusStyles[selectedCourse.status]}>{selectedCourse.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{selectedCourse.instructor_name} • {selectedCourse.category} • {difficultyLabel[selectedCourse.difficulty]}</p>
                <p className="text-sm text-muted-foreground mt-1">{selectedCourse.short_description}</p>
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  <span>{selectedCourse.student_count} students</span>
                  {selectedCourse.rating > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-[hsl(var(--highlight))] text-[hsl(var(--highlight))]" />
                      {selectedCourse.rating}
                    </span>
                  )}
                  <span>{selectedCourse.is_free ? "Free" : `₹${selectedCourse.price.toLocaleString()}`}</span>
                  {selectedCourse.estimated_duration && <span>{selectedCourse.estimated_duration}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {selectedCourse.status === "draft" && (
                  <Button size="sm" onClick={() => handleStatusChange(selectedCourse.id, "published")} className="bg-green-600 hover:bg-green-700 text-white">
                    Publish
                  </Button>
                )}
                {selectedCourse.status === "published" && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedCourse.id, "draft")}>
                    Unpublish
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Modules & Lessons */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Modules & Lessons</h3>
              <span className="text-xs text-muted-foreground">{modules.length} modules • {courseLessons.length} lessons</span>
            </div>

            {modules.map((mod) => {
              const modLessons = courseLessons.filter((l) => l.module_id === mod.id);
              const isExpanded = expandedModules.has(mod.id);
              return (
                <div key={mod.id} className="rounded-lg border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => toggleModule(mod.id)}
                    className="flex w-full items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-medium text-foreground">{mod.title}</span>
                      <span className="text-xs text-muted-foreground">{modLessons.length} lessons</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteModule.mutate(mod.id); }}
                      className="rounded-md p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border">
                      {modLessons.map((lesson) => {
                        const LessonIcon = lesson.type === "video" ? Video : lesson.type === "pdf" ? FileText : lesson.type === "text" ? BookOpen : lesson.type === "quiz" ? FileQuestion : ClipboardList;
                        return (
                          <div key={lesson.id} className="flex items-center justify-between px-4 py-2.5 pl-14 border-b border-border last:border-b-0 hover:bg-secondary/20">
                            <div className="flex items-center gap-2 min-w-0">
                              <LessonIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm text-foreground truncate">{lesson.title}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{lesson.type}</Badge>
                              {lesson.is_free && <Badge variant="outline" className="text-[10px] px-1 py-0 bg-green-500/10 text-green-400 border-green-500/20">Free</Badge>}
                              {lesson.duration && <span className="text-xs text-muted-foreground">{lesson.duration}</span>}
                              {(lesson.file_url || lesson.video_url) && <span className="text-xs text-muted-foreground truncate max-w-[120px]">📎 attached</span>}
                            </div>
                            <button
                              onClick={() => deleteLesson.mutate(lesson.id)}
                              className="rounded-md p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}

                      {/* Add Lesson inline */}
                      {newLessonData?.moduleId === mod.id ? (
                        <div className="px-4 py-3 pl-14 border-t border-border bg-secondary/20 space-y-2">
                          <div className="flex gap-2">
                            <Input
                              placeholder="Lesson title"
                              value={newLessonData.title}
                              onChange={(e) => setNewLessonData({ ...newLessonData, title: e.target.value })}
                              className="flex-1"
                            />
                            <Input
                              placeholder="Duration"
                              value={newLessonData.duration}
                              onChange={(e) => setNewLessonData({ ...newLessonData, duration: e.target.value })}
                              className="w-24"
                            />
                            <Select value={newLessonData.type} onValueChange={(v) => setNewLessonData({ ...newLessonData, type: v, file: null, videoUrl: "", content: "" })}>
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="video">Video</SelectItem>
                                <SelectItem value="pdf">PDF</SelectItem>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="quiz">Quiz</SelectItem>
                                <SelectItem value="assignment">Assignment</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Type-specific inputs */}
                          {newLessonData.type === "video" && (
                            <div className="space-y-2">
                              <Input
                                placeholder="Video URL (YouTube/Vimeo)"
                                value={newLessonData.videoUrl}
                                onChange={(e) => setNewLessonData({ ...newLessonData, videoUrl: e.target.value })}
                              />
                              <div className="text-xs text-muted-foreground">Or upload a video file:</div>
                              <Input
                                type="file"
                                accept="video/mp4,video/quicktime,video/webm"
                                onChange={(e) => setNewLessonData({ ...newLessonData, file: e.target.files?.[0] || null })}
                              />
                            </div>
                          )}

                          {newLessonData.type === "pdf" && (
                            <div>
                              <Input
                                type="file"
                                accept="application/pdf"
                                onChange={(e) => setNewLessonData({ ...newLessonData, file: e.target.files?.[0] || null })}
                              />
                              <div className="text-xs text-muted-foreground mt-1">Upload a PDF document</div>
                            </div>
                          )}

                          {newLessonData.type === "text" && (
                            <Textarea
                              placeholder="Lesson content..."
                              value={newLessonData.content}
                              onChange={(e) => setNewLessonData({ ...newLessonData, content: e.target.value })}
                              rows={4}
                            />
                          )}

                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setNewLessonData(null)}>
                              <X className="h-3.5 w-3.5 mr-1" /> Cancel
                            </Button>
                            <Button
                              size="sm"
                              disabled={!newLessonData.title || newLessonData.uploading}
                              onClick={async () => {
                                setNewLessonData({ ...newLessonData, uploading: true });
                                let fileUrl: string | null = null;
                                let videoUrl: string | null = newLessonData.videoUrl || null;

                                // Upload file if present
                                if (newLessonData.file) {
                                  const ext = newLessonData.file.name.split(".").pop();
                                  const path = `${selectedCourse.id}/${Date.now()}.${ext}`;
                                  const { error: uploadError } = await supabase.storage
                                    .from("course-content")
                                    .upload(path, newLessonData.file);
                                  if (uploadError) {
                                    toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
                                    setNewLessonData({ ...newLessonData, uploading: false });
                                    return;
                                  }
                                  const { data: urlData } = supabase.storage.from("course-content").getPublicUrl(path);
                                  if (newLessonData.type === "video") {
                                    videoUrl = urlData.publicUrl;
                                  } else {
                                    fileUrl = urlData.publicUrl;
                                  }
                                }

                                createLesson.mutate({
                                  module_id: mod.id,
                                  course_id: selectedCourse.id,
                                  title: newLessonData.title,
                                  duration: newLessonData.duration,
                                  sort_order: modLessons.length,
                                  type: newLessonData.type as any,
                                  video_url: videoUrl,
                                  file_url: fileUrl,
                                  content: newLessonData.content || null,
                                });
                              }}
                            >
                              {newLessonData.uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                              {newLessonData.uploading ? "Uploading..." : "Save"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setNewLessonData({ moduleId: mod.id, title: "", duration: "", type: "video", videoUrl: "", file: null, content: "", uploading: false })}
                          className="w-full px-4 py-2 pl-14 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-colors text-left"
                        >
                          + Add lesson
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add Module */}
            <div className="flex gap-2">
              <Input
                placeholder="New module title..."
                value={newModuleTitle}
                onChange={(e) => setNewModuleTitle(e.target.value)}
                className="flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!newModuleTitle}
                onClick={() =>
                  createModule.mutate({
                    course_id: selectedCourse.id,
                    title: newModuleTitle,
                    sort_order: modules.length,
                  })
                }
              >
                <Plus className="h-4 w-4 mr-1" /> Add Module
              </Button>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ─── LIST VIEW ───
  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Content Management</h1>
            <p className="text-sm text-muted-foreground">
              {isSuperAdmin ? "Manage all courses and learning content" : "Your assigned courses"}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => { setEditingCourse({ ...emptyCourse }); setShowCreateDialog(true); }}
            className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90"
          >
            <Plus className="h-4 w-4 mr-1" /> Create Course
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search courses..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="flex gap-3">
          {[
            { label: "Published", value: courses.filter((c) => c.status === "published").length },
            { label: "Draft", value: courses.filter((c) => c.status === "draft").length },
            { label: "Archived", value: courses.filter((c) => c.status === "archived").length },
            { label: "Total Students", value: courses.reduce((s, c) => s + c.student_count, 0) },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5">
              <span className="text-lg font-bold text-foreground">{s.value}</span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading courses...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Instructor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Category</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Students</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Rating</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Price</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCourses.map((course) => (
                    <tr
                      key={course.id}
                      className="border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedCourseId(course.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <span className="font-medium text-foreground truncate block max-w-[220px]">{course.title}</span>
                            <span className="text-xs text-muted-foreground">{difficultyLabel[course.difficulty]}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{course.instructor_name}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{course.category}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={statusStyles[course.status]}>{course.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">{course.student_count}</td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        {course.rating > 0 ? (
                          <span className="flex items-center justify-end gap-1 text-muted-foreground">
                            <Star className="h-3 w-3 fill-[hsl(var(--highlight))] text-[hsl(var(--highlight))]" />
                            {Number(course.rating).toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                        {course.is_free ? "Free" : `₹${course.price.toLocaleString()}`}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="rounded-md p-1.5 hover:bg-secondary transition-colors">
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedCourseId(course.id)}>
                              View & Edit
                            </DropdownMenuItem>
                            {course.status === "published" ? (
                              <DropdownMenuItem onClick={() => handleStatusChange(course.id, "draft")}>Unpublish</DropdownMenuItem>
                            ) : course.status === "draft" ? (
                              <DropdownMenuItem onClick={() => handleStatusChange(course.id, "published")}>Publish</DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem onClick={() => handleStatusChange(course.id, "archived")}>Archive</DropdownMenuItem>
                            {isSuperAdmin && (
                              <DropdownMenuItem onClick={() => setShowDeleteDialog(course.id)} className="text-destructive">Delete</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!isLoading && filteredCourses.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No courses found.</div>
          )}
        </div>
      </div>

      {/* Create Course Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Course</DialogTitle>
            <DialogDescription>Fill in the course details below</DialogDescription>
          </DialogHeader>
          {editingCourse && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
                <Input value={editingCourse.title || ""} onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Slug *</label>
                <Input
                  value={editingCourse.slug || ""}
                  onChange={(e) => setEditingCourse({ ...editingCourse, slug: e.target.value })}
                  placeholder="course-url-slug"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Short Description</label>
                <Input value={editingCourse.short_description || ""} onChange={(e) => setEditingCourse({ ...editingCourse, short_description: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                <Textarea value={editingCourse.description || ""} onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })} className="min-h-[80px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
                  <Select value={editingCourse.category || "General"} onValueChange={(v) => setEditingCourse({ ...editingCourse, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Difficulty</label>
                  <Select value={editingCourse.difficulty || "beginner"} onValueChange={(v: "beginner" | "intermediate" | "advanced") => setEditingCourse({ ...editingCourse, difficulty: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Instructor Name</label>
                  <Input value={editingCourse.instructor_name || ""} onChange={(e) => setEditingCourse({ ...editingCourse, instructor_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration</label>
                  <Input value={editingCourse.estimated_duration || ""} onChange={(e) => setEditingCourse({ ...editingCourse, estimated_duration: e.target.value })} placeholder="e.g. 12 hours" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Price (₹)</label>
                  <Input type="number" value={editingCourse.price || 0} onChange={(e) => setEditingCourse({ ...editingCourse, price: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <Switch checked={editingCourse.is_free || false} onCheckedChange={(v) => setEditingCourse({ ...editingCourse, is_free: v })} />
                  <label className="text-sm text-muted-foreground">Free course</label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={createCourse.isPending}
              className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90"
            >
              {createCourse.isPending ? "Creating..." : "Create Course"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Course</DialogTitle>
            <DialogDescription>
              This will permanently delete the course and all its modules and lessons. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => showDeleteDialog && deleteCourse.mutate(showDeleteDialog)} disabled={deleteCourse.isPending}>
              {deleteCourse.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminContent;
