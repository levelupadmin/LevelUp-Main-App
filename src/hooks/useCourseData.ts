import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

export type Course = Tables<"courses">;
export type Module = Tables<"course_modules">;
export type Lesson = Tables<"lessons">;

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
