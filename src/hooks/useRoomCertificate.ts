import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { checkAndGenerateCertificate } from "@/hooks/useCertificateAutoGenerate";

export interface RoomCertificateCourse {
  id: string;
  title: string;
  completedCount: number;
  totalCount: number;
}

export interface RoomCertificateRow {
  id: string;
  course_id: string;
  image_url: string;
  certificate_number: string;
  created_at: string;
  course_name: string;
}

export interface RoomCertificateData {
  courses: RoomCertificateCourse[];
  certificates: RoomCertificateRow[];
}

const certificateKey = (offeringId: string | null | undefined, userId: string | null | undefined) =>
  ["cohort-rooms", "certificate-moment", offeringId ?? null, userId ?? null] as const;

async function fetchRoomCertificateData(
  offeringId: string,
  userId: string,
): Promise<RoomCertificateData> {
  const { data: links, error: linksError } = await supabase
    .from("offering_courses")
    .select("course_id")
    .eq("offering_id", offeringId);
  if (linksError) throw new Error(linksError.message);
  const courseIds = [...new Set((links ?? []).map((link) => link.course_id).filter(Boolean))];
  if (courseIds.length === 0) return { courses: [], certificates: [] };

  const [{ data: courseRows, error: courseError }, { data: certRows, error: certError }] =
    await Promise.all([
      supabase.from("courses").select("id,title").in("id", courseIds),
      supabase
        .from("certificates")
        .select("id,course_id,image_url,certificate_number,created_at")
        .eq("user_id", userId)
        .in("course_id", courseIds)
        .order("created_at", { ascending: false }),
    ]);
  if (courseError) throw new Error(courseError.message);
  if (certError) throw new Error(certError.message);
  const names = new Map((courseRows ?? []).map((course) => [course.id, course.title]));

  const courses = await Promise.all(
    (courseRows ?? []).map(async (course): Promise<RoomCertificateCourse> => {
      const { data: sections, error: sectionError } = await supabase
        .from("sections")
        .select("id")
        .eq("course_id", course.id);
      if (sectionError) throw new Error(sectionError.message);
      const sectionIds = (sections ?? []).map((section) => section.id);
      if (sectionIds.length === 0) {
        return { id: course.id, title: course.title, completedCount: 0, totalCount: 0 };
      }
      const { data: chapters, error: chapterError } = await supabase
        .from("chapters")
        .select("id")
        .in("section_id", sectionIds);
      if (chapterError) throw new Error(chapterError.message);
      const chapterIds = (chapters ?? []).map((chapter) => chapter.id);
      if (chapterIds.length === 0) {
        return { id: course.id, title: course.title, completedCount: 0, totalCount: 0 };
      }
      const { count, error: progressError } = await supabase
        .from("chapter_progress")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("chapter_id", chapterIds)
        .not("completed_at", "is", null);
      if (progressError) throw new Error(progressError.message);
      return {
        id: course.id,
        title: course.title,
        completedCount: count ?? 0,
        totalCount: chapterIds.length,
      };
    }),
  );

  return {
    courses,
    certificates: (certRows ?? []).map((certificate) => ({
      ...certificate,
      course_name: names.get(certificate.course_id) ?? "Completion",
    })),
  };
}

export function useRoomCertificateData(
  offeringId: string | null | undefined,
  userId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: certificateKey(offeringId, userId),
    queryFn: () => fetchRoomCertificateData(offeringId as string, userId as string),
    enabled: !!offeringId && !!userId && options?.enabled !== false,
    staleTime: 30_000,
  });
}

export function useClaimRoomCertificates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      offeringId: string;
      userId: string;
      studentName: string;
      memberNumber: string | null;
      courses: RoomCertificateCourse[];
    }) => {
      for (const course of input.courses) {
        if (course.totalCount === 0 || course.completedCount < course.totalCount) continue;
        await checkAndGenerateCertificate(
          input.userId,
          course.id,
          course.completedCount,
          course.totalCount,
          input.studentName,
          input.memberNumber,
        );
      }
      return input;
    },
    onSuccess: (input) => {
      void queryClient.invalidateQueries({ queryKey: certificateKey(input.offeringId, input.userId) });
    },
  });
}
