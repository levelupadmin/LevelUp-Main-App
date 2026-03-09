import { useMemo } from "react";
import { Tables } from "@/integrations/supabase/types";

type Course = Tables<"courses">;
type Lesson = Tables<"lessons">;
type Enrollment = Tables<"enrollments">;
type LessonProgress = Tables<"lesson_progress">;
type Module = Tables<"course_modules">;

interface DripResult {
  isLocked: boolean;
  unlockDate?: Date;
  reason?: string;
}

/**
 * Determines which lessons are drip-locked based on course drip_mode:
 * - "none": all unlocked
 * - "enrollment_date": unlock N days after enrollment, per module sort_order
 * - "completion": unlock after previous lesson completed
 */
export function useDripLockMap(
  course: Course | null | undefined,
  modules: Module[],
  lessons: Lesson[],
  enrollment: Enrollment | null | undefined,
  progress: LessonProgress[]
): Map<string, DripResult> {
  return useMemo(() => {
    const map = new Map<string, DripResult>();
    if (!course || !enrollment) return map;

    const dripMode = course.drip_mode || "none";
    if (dripMode === "none" && !course.drip_enabled) {
      // All unlocked
      lessons.forEach((l) => map.set(l.id, { isLocked: false }));
      return map;
    }

    const sortedLessons = [...lessons].sort((a, b) => {
      const modA = modules.find((m) => m.id === a.module_id);
      const modB = modules.find((m) => m.id === b.module_id);
      return (modA?.sort_order ?? 0) - (modB?.sort_order ?? 0) || a.sort_order - b.sort_order;
    });

    const completedSet = new Set(
      progress.filter((p) => p.status === "completed").map((p) => p.lesson_id)
    );
    const enrolledAt = new Date(enrollment.enrolled_at);
    const intervalDays = course.drip_interval_days ?? 7;

    if (dripMode === "enrollment_date" || (course.drip_enabled && dripMode === "none")) {
      // Group lessons by module, unlock each module N*interval days after enrollment
      const moduleOrder = [...modules].sort((a, b) => a.sort_order - b.sort_order);
      moduleOrder.forEach((mod, idx) => {
        const unlockDate = new Date(enrolledAt.getTime() + idx * intervalDays * 24 * 60 * 60 * 1000);
        const isLocked = new Date() < unlockDate;
        const modLessons = sortedLessons.filter((l) => l.module_id === mod.id);
        modLessons.forEach((l) => {
          // First module always unlocked, free lessons always unlocked
          if (idx === 0 || l.is_free) {
            map.set(l.id, { isLocked: false });
          } else {
            map.set(l.id, { isLocked, unlockDate, reason: isLocked ? `Unlocks on ${unlockDate.toLocaleDateString()}` : undefined });
          }
        });
      });
    } else if (dripMode === "completion") {
      // Each lesson unlocks after previous is completed
      sortedLessons.forEach((l, idx) => {
        if (idx === 0 || l.is_free) {
          map.set(l.id, { isLocked: false });
        } else {
          const prevLesson = sortedLessons[idx - 1];
          const prevCompleted = completedSet.has(prevLesson.id);
          map.set(l.id, {
            isLocked: !prevCompleted,
            reason: !prevCompleted ? "Complete the previous lesson to unlock" : undefined,
          });
        }
      });
    } else {
      // Default: all unlocked
      lessons.forEach((l) => map.set(l.id, { isLocked: false }));
    }

    return map;
  }, [course, modules, lessons, enrollment, progress]);
}
