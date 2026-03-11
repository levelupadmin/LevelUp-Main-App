import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

export type Course = Tables<"courses">;
export type Module = Tables<"course_modules">;
export type Lesson = Tables<"lessons"> & { file_url?: string | null };

export const CATEGORIES = [
  "Cinematography", "Editing", "Writing", "Sound",
  "Post-Production", "Filmmaking", "VFX", "General",
];

export const DAY_LABELS = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

export const statusStyles: Record<string, string> = {
  published: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20",
  draft: "bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20",
  archived: "bg-muted text-muted-foreground border-border",
};

export const courseTypeStyles: Record<string, string> = {
  masterclass: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  workshop: "bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/20",
  cohort: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20",
};

export const courseTypeLabel: Record<string, string> = {
  masterclass: "Masterclass",
  workshop: "Workshop",
  cohort: "Cohort",
};

export const difficultyLabel: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

// ─── Query Hooks ───

export const useCourses = () =>
  useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Course[];
    },
  });

export const useAdminCourse = (courseId: string | undefined) =>
  useQuery({
    queryKey: ["admin-course", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId!)
        .maybeSingle();
      if (error) throw error;
      return data as Course | null;
    },
  });

export const useModules = (courseId: string | null | undefined) =>
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

export const useLessons = (courseId: string | null | undefined) =>
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

export const useSchedules = (courseId: string | null | undefined) =>
  useQuery({
    queryKey: ["admin-schedules", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_schedules")
        .select("*")
        .eq("course_id", courseId!)
        .order("day_of_week");
      if (error) throw error;
      return data;
    },
  });

export const useAccessGrants = (courseId: string | null | undefined) =>
  useQuery({
    queryKey: ["admin-access-grants", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_access_grants")
        .select("*")
        .eq("source_course_id", courseId!);
      if (error) throw error;
      return data;
    },
  });

export const usePricingVariants = (courseId: string | null | undefined) =>
  useQuery({
    queryKey: ["admin-pricing-variants", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_pricing_variants")
        .select("*")
        .eq("course_id", courseId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

export const useCourseResources = (courseId: string | null | undefined) =>
  useQuery({
    queryKey: ["admin-resources", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_resources")
        .select("*")
        .eq("course_id", courseId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

// ─── Mutation Hooks ───

export const useCreateCourse = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (course: TablesInsert<"courses">) => {
      const { data, error } = await supabase.from("courses").insert(course).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-courses"] });
      toast({ title: "Course created" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });
};

export const useUpdateCourse = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Course> & { id: string }) => {
      const { error } = await supabase.from("courses").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-courses"] });
      qc.invalidateQueries({ queryKey: ["admin-course"] });
      toast({ title: "Course updated" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });
};

export const useDeleteCourse = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-courses"] });
      toast({ title: "Course deleted" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });
};

export const useCreateModule = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (mod: TablesInsert<"course_modules">) => {
      const { error } = await supabase.from("course_modules").insert(mod);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-modules"] });
      toast({ title: "Section added" });
    },
  });
};

export const useUpdateModule = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; description?: string; sort_order?: number }) => {
      const { error } = await supabase.from("course_modules").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-modules"] });
      toast({ title: "Section updated" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });
};

export const useDeleteModule = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("course_modules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-modules"] });
      qc.invalidateQueries({ queryKey: ["admin-lessons"] });
      toast({ title: "Section deleted" });
    },
  });
};

export const useCreateLesson = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (lesson: TablesInsert<"lessons"> & { file_url?: string | null }) => {
      const { error } = await supabase.from("lessons").insert(lesson as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-lessons"] });
      toast({ title: "Chapter added" });
    },
  });
};

export const useUpdateLesson = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from("lessons").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-lessons"] });
      toast({ title: "Chapter updated" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });
};

export const useDeleteLesson = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lessons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-lessons"] });
      toast({ title: "Chapter deleted" });
    },
  });
};

export const useCloneCourse = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (courseId: string) => {
      // Fetch original course
      const { data: original, error: fetchErr } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId)
        .single();
      if (fetchErr || !original) throw fetchErr || new Error("Course not found");

      // Clone course
      const { id, created_at, updated_at, student_count, rating, ...rest } = original;
      const { data: cloned, error: cloneErr } = await supabase
        .from("courses")
        .insert({
          ...rest,
          title: `${rest.title} (Copy)`,
          slug: `${rest.slug}-copy-${Date.now()}`,
          status: "draft" as const,
          student_count: 0,
          rating: 0,
        })
        .select()
        .single();
      if (cloneErr) throw cloneErr;

      // Clone modules
      const { data: mods } = await supabase
        .from("course_modules")
        .select("*")
        .eq("course_id", courseId)
        .order("sort_order");
      if (mods?.length) {
        for (const mod of mods) {
          const { id: modId, created_at: _, updated_at: __, ...modRest } = mod;
          const { data: newMod } = await supabase
            .from("course_modules")
            .insert({ ...modRest, course_id: cloned.id })
            .select()
            .single();

          // Clone lessons for this module
          const { data: modLessons } = await supabase
            .from("lessons")
            .select("*")
            .eq("module_id", modId)
            .order("sort_order");
          if (modLessons?.length && newMod) {
            const clonedLessons = modLessons.map((l) => {
              const { id: _id, created_at: _c, updated_at: _u, ...lRest } = l;
              return { ...lRest, course_id: cloned.id, module_id: newMod.id };
            });
            await supabase.from("lessons").insert(clonedLessons as any);
          }
        }
      }

      return cloned;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-courses"] });
      toast({ title: "Course cloned successfully" });
    },
    onError: (err) => toast({ title: "Error cloning", description: err.message, variant: "destructive" }),
  });
};
