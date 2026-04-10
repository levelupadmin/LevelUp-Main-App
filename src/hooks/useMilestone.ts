import { useState, useCallback } from "react";

const MILESTONES = [25, 50, 75, 100];

const MILESTONE_MESSAGES: Record<number, { title: string; subtitle: string }> = {
  25: {
    title: "Quarter of the way there!",
    subtitle: "Great momentum — keep building.",
  },
  50: {
    title: "Halfway through!",
    subtitle: "You're putting in the work. It shows.",
  },
  75: {
    title: "Almost there!",
    subtitle: "The finish line is in sight. You've got this.",
  },
  100: {
    title: "Course complete!",
    subtitle: "You showed up, did the work, and finished. That's rare.",
  },
};

export function checkMilestone(
  completedBefore: number,
  completedAfter: number,
  total: number
): { pct: number; title: string; subtitle: string } | null {
  if (total === 0) return null;
  const pctBefore = Math.round((completedBefore / total) * 100);
  const pctAfter = Math.round((completedAfter / total) * 100);

  for (const m of MILESTONES) {
    if (pctBefore < m && pctAfter >= m) {
      return { pct: m, ...MILESTONE_MESSAGES[m] };
    }
  }
  return null;
}

export function useMilestone() {
  const [milestone, setMilestone] = useState<{
    pct: number;
    title: string;
    subtitle: string;
  } | null>(null);

  const trigger = useCallback(
    (completedBefore: number, completedAfter: number, total: number) => {
      const hit = checkMilestone(completedBefore, completedAfter, total);
      if (hit) {
        setMilestone(hit);
        setTimeout(() => setMilestone(null), 4000);
      }
    },
    []
  );

  return { milestone, trigger };
}
