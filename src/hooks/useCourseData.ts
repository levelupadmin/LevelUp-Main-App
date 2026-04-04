import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { isPreviewEnrolled, setPreviewEnrolled } from "@/lib/previewEnrollment";

export type Course = Tables<"courses">;
export type Module = Tables<"course_modules">;
export type Lesson = Tables<"lessons">;
export type LessonProgress = Tables<"lesson_progress">;
export type Enrollment = Tables<"enrollments">;

export const useCourse = (slug: string) =>
  useQuery({
    queryKey: ["course", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return data as Course | null;
    },
  });

export const useCourseModules = (courseId: string | undefined) =>
  useQuery({
    queryKey: ["course-modules", courseId],
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

export const useCourseLessons = (courseId: string | undefined) =>
  useQuery({
    queryKey: ["course-lessons", courseId],
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

export const useLesson = (lessonId: string) =>
  useQuery({
    queryKey: ["lesson", lessonId],
    enabled: !!lessonId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("*")
        .eq("id", lessonId)
        .maybeSingle();
      if (error) throw error;
      return data as Lesson | null;
    },
  });

export const useLessonCourse = (courseId: string | undefined) =>
  useQuery({
    queryKey: ["lesson-course", courseId],
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

/* ─── Enrollment ─── */

export const useEnrollment = (courseId: string | undefined) =>
  useQuery({
    queryKey: ["enrollment", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from("enrollments")
          .select("*")
          .eq("course_id", courseId!)
          .eq("user_id", user.id)
          .eq("status", "active")
          .maybeSingle();
        if (error) throw error;
        return data as Enrollment | null;
      }
      // Preview/dev mode fallback: check sessionStorage
      try {
        const { useDevAuth } = require("@/contexts/DevAuthContext");
        const devUser = useDevAuth?.()?.user;
        if (devUser && isPreviewEnrolled(devUser.id, courseId!)) {
          return { id: `preview-${courseId}`, course_id: courseId!, user_id: devUser.id, status: "active", enrolled_at: new Date().toISOString() } as unknown as Enrollment;
        }
      } catch {}
      return null;
    },
  });

export const useEnrollInCourse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, courseTitle, utmParams }: { courseId: string; courseTitle?: string; utmParams?: { utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; utm_term?: string | null; utm_content?: string | null; referrer?: string; landing_page?: string } }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("enrollments")
        .insert({ course_id: courseId, user_id: user.id })
        .select()
        .single();
      if (error) throw error;

      // Save UTM attribution (fire-and-forget)
      if (utmParams && (utmParams.utm_source || utmParams.utm_medium || utmParams.utm_campaign || utmParams.referrer)) {
        supabase
          .from("utm_tracking" as any)
          .insert({
            enrollment_id: data.id,
            user_id: user.id,
            course_id: courseId,
            utm_source: utmParams.utm_source || null,
            utm_medium: utmParams.utm_medium || null,
            utm_campaign: utmParams.utm_campaign || null,
            utm_term: utmParams.utm_term || null,
            utm_content: utmParams.utm_content || null,
            referrer: utmParams.referrer || null,
            landing_page: utmParams.landing_page || null,
          })
          .then(() => {});
      }

      // Fire enrollment notification (fire-and-forget)
      supabase.functions.invoke("send-notification", {
        body: {
          trigger_type: "enrollment",
          user_id: user.id,
          course_id: courseId,
          data: { course_title: courseTitle || "" },
        },
      }).catch(() => {});

      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["enrollment", vars.courseId] });
    },
  });
};

/* ─── Lesson Progress ─── */

export const useCourseProgress = (courseId: string | undefined) =>
  useQuery({
    queryKey: ["course-progress", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("course_id", courseId!)
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []) as LessonProgress[];
    },
  });

export const useMarkLessonComplete = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lessonId, courseId }: { lessonId: string; courseId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("lesson_progress")
        .upsert(
          {
            lesson_id: lessonId,
            course_id: courseId,
            user_id: user.id,
            status: "completed" as const,
            progress_pct: 100,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,lesson_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["course-progress", vars.courseId] });
    },
  });
};

export const useSaveLessonNotes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lessonId, courseId, notes }: { lessonId: string; courseId: string; notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("lesson_progress")
        .upsert(
          {
            lesson_id: lessonId,
            course_id: courseId,
            user_id: user.id,
            notes,
          } as any,
          { onConflict: "user_id,lesson_id" }
        );
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["course-progress", vars.courseId] });
    },
  });
};
