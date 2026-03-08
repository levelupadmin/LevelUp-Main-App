import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import {
  FileText, Search, Plus, MoreHorizontal, Star, ArrowLeft, Trash2,
  GripVertical, ChevronDown, ChevronRight, Video, BookOpen, Save, X,
  Upload, File, FileQuestion, ClipboardList, Loader2, Eye, Calendar,
  Link2, Tag, Award, Clock, Repeat, Settings2,
} from "lucide-react";
import StudentCoursePreview from "@/components/admin/StudentCoursePreview";
import CourseSetupChecklist from "@/components/admin/CourseSetupChecklist";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
type Lesson = Tables<"lessons"> & { file_url?: string | null };

const statusStyles: Record<string, string> = {
  published: "bg-green-500/10 text-green-400 border-green-500/20",
  draft: "bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20",
  archived: "bg-muted text-muted-foreground border-border",
};

const courseTypeStyles: Record<string, string> = {
  masterclass: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  workshop: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  cohort: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const courseTypeLabel: Record<string, string> = {
  masterclass: "Masterclass",
  workshop: "Workshop",
  cohort: "Cohort",
};

const difficultyLabel: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const CATEGORIES = ["Cinematography", "Editing", "Writing", "Sound", "Post-Production", "Filmmaking", "VFX", "General"];
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
      const { data, error } = await supabase.from("course_modules").select("*").eq("course_id", courseId!).order("sort_order");
      if (error) throw error;
      return data as Module[];
    },
  });

const useLessons = (courseId: string | null) =>
  useQuery({
    queryKey: ["admin-lessons", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase.from("lessons").select("*").eq("course_id", courseId!).order("sort_order");
      if (error) throw error;
      return data as Lesson[];
    },
  });

const useSchedules = (courseId: string | null) =>
  useQuery({
    queryKey: ["admin-schedules", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase.from("course_schedules").select("*").eq("course_id", courseId!).order("day_of_week");
      if (error) throw error;
      return data;
    },
  });

const useAccessGrants = (courseId: string | null) =>
  useQuery({
    queryKey: ["admin-access-grants", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase.from("course_access_grants").select("*").eq("source_course_id", courseId!);
      if (error) throw error;
      return data;
    },
  });

// ─── Main Component ───
const AdminCourses = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === "super_admin";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState<Partial<TablesInsert<"courses">> | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [showStudentPreview, setShowStudentPreview] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState("content");

  // Module/Lesson creation
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newLessonData, setNewLessonData] = useState<{
    moduleId: string; title: string; duration: string; type: string;
    videoUrl: string; file: File | null; content: string; uploading: boolean;
  } | null>(null);

  // Schedule creation
  const [newSchedule, setNewSchedule] = useState<{
    day_of_week: number; start_time: string; end_time: string; zoom_link: string; label: string;
  } | null>(null);

  const { data: courses = [], isLoading } = useCourses();
  const { data: modules = [] } = useModules(selectedCourseId);
  const { data: lessons = [] } = useLessons(selectedCourseId);
  const { data: schedules = [] } = useSchedules(selectedCourseId);
  const { data: accessGrants = [] } = useAccessGrants(selectedCourseId);

  const filteredCourses = courses
    .filter((c) => search === "" || c.title.toLowerCase().includes(search.toLowerCase()) || c.instructor_name.toLowerCase().includes(search.toLowerCase()))
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) => typeFilter === "all" || (c as any).course_type === typeFilter);

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
    mutationFn: async (lesson: TablesInsert<"lessons"> & { file_url?: string | null }) => {
      const { error } = await supabase.from("lessons").insert(lesson as any);
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

  const createSchedule = useMutation({
    mutationFn: async (schedule: any) => {
      const { error } = await supabase.from("course_schedules").insert(schedule);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-schedules"] });
      setNewSchedule(null);
      toast({ title: "Schedule slot added" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("course_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-schedules"] });
      toast({ title: "Schedule slot removed" });
    },
  });

  const createAccessGrant = useMutation({
    mutationFn: async (grant: any) => {
      const { error } = await supabase.from("course_access_grants").insert(grant);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-access-grants"] });
      toast({ title: "Access grant added" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteAccessGrant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("course_access_grants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-access-grants"] });
      toast({ title: "Access grant removed" });
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
    const courseType = (selectedCourse as any).course_type || "masterclass";
    const isRecurring = (selectedCourse as any).is_recurring || false;

    return (
      <AdminLayout>
        <div className="space-y-5">
          <button onClick={() => { setSelectedCourseId(null); setActiveDetailTab("content"); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to courses
          </button>

          {/* Course Header */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-32 space-y-2">
                <div className="aspect-video rounded-lg overflow-hidden bg-secondary border border-border">
                  {selectedCourse.thumbnail_url ? (
                    <img src={selectedCourse.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Upload className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <label className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                  <Upload className="h-3 w-3" />
                  {selectedCourse.thumbnail_url ? "Change" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const ext = file.name.split(".").pop();
                      const path = `thumbnails/${selectedCourse.id}.${ext}`;
                      const { error: uploadError } = await supabase.storage.from("course-content").upload(path, file, { upsert: true });
                      if (uploadError) { toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" }); return; }
                      const { data: urlData } = supabase.storage.from("course-content").getPublicUrl(path);
                      updateCourse.mutate({ id: selectedCourse.id, thumbnail_url: urlData.publicUrl });
                    }}
                  />
                </label>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold text-foreground truncate">{selectedCourse.title}</h2>
                  <Badge variant="outline" className={courseTypeStyles[courseType]}>{courseTypeLabel[courseType]}</Badge>
                  <Badge variant="outline" className={statusStyles[selectedCourse.status]}>{selectedCourse.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{selectedCourse.instructor_name} • {selectedCourse.category} • {difficultyLabel[selectedCourse.difficulty]}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span>{selectedCourse.student_count} students</span>
                  {selectedCourse.rating > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-[hsl(var(--highlight))] text-[hsl(var(--highlight))]" />
                      {selectedCourse.rating}
                    </span>
                  )}
                  <span>{selectedCourse.is_free ? "Free" : `₹${selectedCourse.price.toLocaleString()}`}</span>
                  {isRecurring && <span className="flex items-center gap-1"><Repeat className="h-3 w-3" /> Recurring</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setShowStudentPreview(true)} className="gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> Preview
                </Button>
                {selectedCourse.status === "draft" && (
                  <Button size="sm" onClick={() => handleStatusChange(selectedCourse.id, "published")} className="bg-green-600 hover:bg-green-700 text-white">Publish</Button>
                )}
                {selectedCourse.status === "published" && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedCourse.id, "draft")}>Unpublish</Button>
                )}
              </div>
            </div>
          </div>

          {/* Setup Checklist */}
          <CourseSetupChecklist
            course={selectedCourse}
            modulesCount={modules.length}
            lessonsCount={lessons.length}
            schedulesCount={schedules.length}
            onNavigateTab={setActiveDetailTab}
          />

          {/* Detail Tabs */}
          <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab}>
            <TabsList className="bg-secondary/50 border border-border">
              <TabsTrigger value="content" className="gap-1.5 text-xs"><BookOpen className="h-3.5 w-3.5" />Content</TabsTrigger>
              {(courseType === "workshop" || courseType === "cohort") && (
                <TabsTrigger value="schedule" className="gap-1.5 text-xs"><Calendar className="h-3.5 w-3.5" />Schedule</TabsTrigger>
              )}
              <TabsTrigger value="pricing" className="gap-1.5 text-xs"><Tag className="h-3.5 w-3.5" />Pricing</TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-xs"><Settings2 className="h-3.5 w-3.5" />Settings</TabsTrigger>
            </TabsList>

            {/* ── CONTENT TAB ── */}
            <TabsContent value="content" className="space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">Modules & Lessons</h3>
                <span className="text-xs text-muted-foreground">{modules.length} modules • {lessons.length} lessons</span>
              </div>

              {modules.map((mod) => {
                const modLessons = lessons.filter((l) => l.module_id === mod.id);
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
                              </div>
                              <button onClick={() => deleteLesson.mutate(lesson.id)} className="rounded-md p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}

                        {/* Add Lesson inline */}
                        {newLessonData?.moduleId === mod.id ? (
                          <div className="px-4 py-3 pl-14 border-t border-border bg-secondary/20 space-y-2">
                            <div className="flex gap-2">
                              <Input placeholder="Lesson title" value={newLessonData.title} onChange={(e) => setNewLessonData({ ...newLessonData, title: e.target.value })} className="flex-1" />
                              <Input placeholder="Duration" value={newLessonData.duration} onChange={(e) => setNewLessonData({ ...newLessonData, duration: e.target.value })} className="w-24" />
                              <Select value={newLessonData.type} onValueChange={(v) => setNewLessonData({ ...newLessonData, type: v, file: null, videoUrl: "", content: "" })}>
                                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="video">Video</SelectItem>
                                  <SelectItem value="pdf">PDF</SelectItem>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="quiz">Quiz</SelectItem>
                                  <SelectItem value="assignment">Assignment</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {newLessonData.type === "video" && (
                              <div className="space-y-2">
                                <Input placeholder="Video URL (YouTube/Vimeo)" value={newLessonData.videoUrl} onChange={(e) => setNewLessonData({ ...newLessonData, videoUrl: e.target.value })} />
                                <div className="text-xs text-muted-foreground">Or upload a video file:</div>
                                <Input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => setNewLessonData({ ...newLessonData, file: e.target.files?.[0] || null })} />
                              </div>
                            )}
                            {newLessonData.type === "pdf" && (
                              <Input type="file" accept="application/pdf" onChange={(e) => setNewLessonData({ ...newLessonData, file: e.target.files?.[0] || null })} />
                            )}
                            {newLessonData.type === "text" && (
                              <Textarea placeholder="Lesson content..." value={newLessonData.content} onChange={(e) => setNewLessonData({ ...newLessonData, content: e.target.value })} rows={4} />
                            )}
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => setNewLessonData(null)}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
                              <Button
                                size="sm"
                                disabled={!newLessonData.title || newLessonData.uploading}
                                onClick={async () => {
                                  setNewLessonData({ ...newLessonData, uploading: true });
                                  let fileUrl: string | null = null;
                                  let videoUrl: string | null = newLessonData.videoUrl || null;
                                  if (newLessonData.file) {
                                    const ext = newLessonData.file.name.split(".").pop();
                                    const path = `${selectedCourse.id}/${Date.now()}.${ext}`;
                                    const { error: uploadError } = await supabase.storage.from("course-content").upload(path, newLessonData.file);
                                    if (uploadError) { toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" }); setNewLessonData({ ...newLessonData, uploading: false }); return; }
                                    const { data: urlData } = supabase.storage.from("course-content").getPublicUrl(path);
                                    if (newLessonData.type === "video") videoUrl = urlData.publicUrl;
                                    else fileUrl = urlData.publicUrl;
                                  }
                                  createLesson.mutate({
                                    module_id: mod.id, course_id: selectedCourse.id, title: newLessonData.title,
                                    duration: newLessonData.duration, sort_order: modLessons.length, type: newLessonData.type as any,
                                    video_url: videoUrl, file_url: fileUrl, content: newLessonData.content || null,
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

              <div className="flex gap-2">
                <Input placeholder="New module title..." value={newModuleTitle} onChange={(e) => setNewModuleTitle(e.target.value)} className="flex-1" />
                <Button size="sm" variant="outline" disabled={!newModuleTitle} onClick={() => createModule.mutate({ course_id: selectedCourse.id, title: newModuleTitle, sort_order: modules.length })}>
                  <Plus className="h-4 w-4 mr-1" /> Add Module
                </Button>
              </div>
            </TabsContent>

            {/* ── SCHEDULE TAB ── */}
            <TabsContent value="schedule" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Schedule Slots</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {courseType === "workshop" ? "Add recurring weekly time slots. Students pick their preferred slot at enrollment." : "Set cohort session schedule."}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={isRecurring}
                      onCheckedChange={(v) => updateCourse.mutate({ id: selectedCourse.id, is_recurring: v } as any)}
                    />
                    <span className="text-xs text-muted-foreground">Recurring</span>
                  </div>
                </div>
              </div>

              {/* Zoom Link (course-level) */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <label className="text-xs font-medium text-muted-foreground block">Default Zoom/Meeting Link</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://zoom.us/j/..."
                    value={(selectedCourse as any).zoom_link || ""}
                    onChange={() => {}}
                    className="flex-1"
                  />
                  <Button size="sm" variant="outline" onClick={() => {
                    const input = document.querySelector<HTMLInputElement>('[placeholder="https://zoom.us/j/..."]');
                    if (input) updateCourse.mutate({ id: selectedCourse.id, zoom_link: input.value } as any);
                  }}>
                    <Save className="h-3.5 w-3.5 mr-1" /> Save
                  </Button>
                </div>
              </div>

              {/* Existing Schedule Slots */}
              <div className="space-y-2">
                {schedules.map((s: any) => {
                  const slotSlug = s.slug || `${DAY_LABELS[s.day_of_week]?.toLowerCase()}-${s.start_time?.slice(0, 5)?.replace(":", "")}`;
                  const landingUrl = `${window.location.origin}/course/${selectedCourse.slug}?slot=${slotSlug}`;
                  return (
                    <div key={s.id} className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-24">
                            <span className="text-sm font-medium text-foreground">{DAY_LABELS[s.day_of_week]}</span>
                          </div>
                          <span className="text-sm text-muted-foreground">{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5) || "–"}</span>
                          {s.label && <Badge variant="outline" className="text-[10px]">{s.label}</Badge>}
                          {s.zoom_link && <span className="text-xs text-muted-foreground flex items-center gap-1"><Link2 className="h-3 w-3" /> Custom link</span>}
                        </div>
                        <button onClick={() => deleteSchedule.mutate(s.id)} className="rounded-md p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          className="flex-1 text-xs h-8 font-mono"
                          value={landingUrl}
                          readOnly
                        />
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => {
                          navigator.clipboard.writeText(landingUrl);
                          toast({ title: "Link copied!", description: `Landing page link for ${DAY_LABELS[s.day_of_week]} slot copied.` });
                        }}>
                          <Link2 className="h-3 w-3" /> Copy Link
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-muted-foreground shrink-0">Slug:</label>
                        <Input
                          className="h-7 text-xs w-40 font-mono"
                          defaultValue={s.slug || slotSlug}
                          onBlur={async (e) => {
                            const { error } = await supabase.from("course_schedules").update({ slug: e.target.value } as any).eq("id", s.id);
                            if (!error) {
                              queryClient.invalidateQueries({ queryKey: ["admin-schedules"] });
                              toast({ title: "Slug updated" });
                            }
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Schedule Slot */}
              {newSchedule ? (
                <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Day</label>
                      <Select value={String(newSchedule.day_of_week)} onValueChange={(v) => setNewSchedule({ ...newSchedule, day_of_week: parseInt(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DAY_LABELS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Time</label>
                      <Input type="time" value={newSchedule.start_time} onChange={(e) => setNewSchedule({ ...newSchedule, start_time: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">End Time</label>
                      <Input type="time" value={newSchedule.end_time} onChange={(e) => setNewSchedule({ ...newSchedule, end_time: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Label</label>
                      <Input placeholder="e.g. Batch A" value={newSchedule.label} onChange={(e) => setNewSchedule({ ...newSchedule, label: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Override Zoom Link (optional)</label>
                    <Input placeholder="https://zoom.us/j/..." value={newSchedule.zoom_link} onChange={(e) => setNewSchedule({ ...newSchedule, zoom_link: e.target.value })} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setNewSchedule(null)}>Cancel</Button>
                    <Button size="sm" disabled={!newSchedule.start_time} onClick={() => {
                      createSchedule.mutate({
                        course_id: selectedCourse.id,
                        day_of_week: newSchedule.day_of_week,
                        start_time: newSchedule.start_time,
                        end_time: newSchedule.end_time || null,
                        zoom_link: newSchedule.zoom_link || null,
                        label: newSchedule.label || null,
                      });
                    }}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Slot
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setNewSchedule({ day_of_week: 1, start_time: "19:00", end_time: "20:00", zoom_link: "", label: "" })}>
                  <Plus className="h-4 w-4 mr-1" /> Add Schedule Slot
                </Button>
              )}
            </TabsContent>

            {/* ── PRICING TAB ── */}
            <TabsContent value="pricing" className="space-y-4 mt-4">
              <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                <h3 className="text-base font-semibold text-foreground">Pricing & Payment</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Price (₹)</label>
                    <Input
                      type="number"
                      defaultValue={selectedCourse.price}
                      onBlur={(e) => updateCourse.mutate({ id: selectedCourse.id, price: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <Switch
                      checked={selectedCourse.is_free}
                      onCheckedChange={(v) => updateCourse.mutate({ id: selectedCourse.id, is_free: v })}
                    />
                    <label className="text-sm text-muted-foreground">Free course</label>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment Page URL (Razorpay / Stripe)</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://rzp.io/..."
                      defaultValue={(selectedCourse as any).payment_page_url || ""}
                      id="payment-url-input"
                    />
                    <Button size="sm" variant="outline" onClick={() => {
                      const input = document.getElementById("payment-url-input") as HTMLInputElement;
                      if (input) updateCourse.mutate({ id: selectedCourse.id, payment_page_url: input.value } as any);
                    }}>
                      <Save className="h-3.5 w-3.5 mr-1" /> Save
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── SETTINGS TAB ── */}
            <TabsContent value="settings" className="space-y-4 mt-4">
              {/* Drip Release */}
              <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> Drip Release</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Release lessons on a schedule after enrollment</p>
                  </div>
                  <Switch
                    checked={(selectedCourse as any).drip_enabled || false}
                    onCheckedChange={(v) => updateCourse.mutate({ id: selectedCourse.id, drip_enabled: v } as any)}
                  />
                </div>
                {(selectedCourse as any).drip_enabled && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Interval (days between lessons)</label>
                    <Input
                      type="number"
                      defaultValue={(selectedCourse as any).drip_interval_days || 7}
                      className="w-32"
                      onBlur={(e) => updateCourse.mutate({ id: selectedCourse.id, drip_interval_days: parseInt(e.target.value) || 7 } as any)}
                    />
                  </div>
                )}
              </div>

              {/* Certificates */}
              <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2"><Award className="h-4 w-4" /> Auto Certificate</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Automatically issue certificate on completion</p>
                  </div>
                  <Switch
                    checked={(selectedCourse as any).certificate_enabled || false}
                    onCheckedChange={(v) => updateCourse.mutate({ id: selectedCourse.id, certificate_enabled: v } as any)}
                  />
                </div>
                {(selectedCourse as any).certificate_enabled && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Completion threshold (%)</label>
                    <Input
                      type="number"
                      defaultValue={(selectedCourse as any).certificate_threshold || 70}
                      className="w-32"
                      onBlur={(e) => updateCourse.mutate({ id: selectedCourse.id, certificate_threshold: parseInt(e.target.value) || 70 } as any)}
                    />
                  </div>
                )}
              </div>

              {/* Access Tags / Cross-Course Grants */}
              <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2"><Tag className="h-4 w-4" /> Access Grants</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">When someone buys this course, also give them access to:</p>
                </div>
                <div className="space-y-2">
                  {accessGrants.map((g: any) => {
                    const grantedCourse = courses.find((c) => c.id === g.granted_course_id);
                    return (
                      <div key={g.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
                        <span className="text-sm text-foreground">{grantedCourse?.title || g.granted_course_id}</span>
                        <button onClick={() => deleteAccessGrant.mutate(g.id)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <Select onValueChange={(courseId) => {
                  if (courseId && courseId !== selectedCourse.id) {
                    createAccessGrant.mutate({ source_course_id: selectedCourse.id, granted_course_id: courseId });
                  }
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="+ Grant access to another course..." />
                  </SelectTrigger>
                  <SelectContent>
                    {courses
                      .filter((c) => c.id !== selectedCourse.id && !accessGrants.some((g: any) => g.granted_course_id === c.id))
                      .map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>

          <StudentCoursePreview open={showStudentPreview} onOpenChange={setShowStudentPreview} course={selectedCourse} modules={modules} lessons={lessons as any} />
        </div>
      </AdminLayout>
    );
  }

  // ─── LIST VIEW ───
  const typeCounts = {
    masterclass: courses.filter((c) => (c as any).course_type === "masterclass").length,
    workshop: courses.filter((c) => (c as any).course_type === "workshop").length,
    cohort: courses.filter((c) => (c as any).course_type === "cohort").length,
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Courses</h1>
            <p className="text-sm text-muted-foreground">Manage masterclasses, workshops, and cohorts</p>
          </div>
          <Button
            size="sm"
            onClick={() => { setEditingCourse({ title: "", slug: "", description: "", short_description: "", category: "General", difficulty: "beginner", status: "draft", instructor_name: "", price: 0, is_free: false, estimated_duration: "", tags: [], course_type: "masterclass" as any }); setShowCreateDialog(true); }}
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
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="masterclass">Masterclass</SelectItem>
              <SelectItem value="workshop">Workshop</SelectItem>
              <SelectItem value="cohort">Cohort</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="flex gap-3 flex-wrap">
          {[
            { label: "Total", value: courses.length },
            { label: "Masterclasses", value: typeCounts.masterclass },
            { label: "Workshops", value: typeCounts.workshop },
            { label: "Cohorts", value: typeCounts.cohort },
            { label: "Published", value: courses.filter((c) => c.status === "published").length },
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
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Instructor</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Students</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Price</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCourses.map((course) => {
                    const cType = (course as any).course_type || "masterclass";
                    return (
                      <tr key={course.id} className="border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => setSelectedCourseId(course.id)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <span className="font-medium text-foreground truncate block max-w-[220px]">{course.title}</span>
                              <span className="text-xs text-muted-foreground">{course.category} • {difficultyLabel[course.difficulty]}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <Badge variant="outline" className={courseTypeStyles[cType]}>{courseTypeLabel[cType]}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{course.instructor_name}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={statusStyles[course.status]}>{course.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">{course.student_count}</td>
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
                              <DropdownMenuItem onClick={() => setSelectedCourseId(course.id)}>View & Edit</DropdownMenuItem>
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
                    );
                  })}
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
            <DialogDescription>Choose a type and fill in the details</DialogDescription>
          </DialogHeader>
          {editingCourse && (
            <div className="space-y-4">
              {/* Course Type Picker */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Course Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["masterclass", "workshop", "cohort"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setEditingCourse({ ...editingCourse, course_type: t as any })}
                      className={`rounded-lg border p-3 text-center transition-colors ${
                        (editingCourse as any).course_type === t
                          ? "border-[hsl(var(--highlight))] bg-[hsl(var(--highlight))]/10"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <span className="text-sm font-medium text-foreground">{courseTypeLabel[t]}</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {t === "masterclass" ? "Self-paced video course" : t === "workshop" ? "Live sessions, recurring" : "Structured program"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
                <Input value={editingCourse.title || ""} onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Slug *</label>
                <Input value={editingCourse.slug || ""} onChange={(e) => setEditingCourse({ ...editingCourse, slug: e.target.value })} placeholder="auto-generated-from-title" />
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
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Difficulty</label>
                  <Select value={editingCourse.difficulty || "beginner"} onValueChange={(v: any) => setEditingCourse({ ...editingCourse, difficulty: v })}>
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
            <DialogDescription>This will permanently delete the course and all its modules, lessons, and schedules.</DialogDescription>
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

export default AdminCourses;
