import { Flame } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const StreakCard = () => {
  const { user } = useAuth();

  // Calculate streak from lesson_progress completed_at dates
  const { data: streak = 0 } = useQuery({
    queryKey: ["streak", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_progress")
        .select("completed_at")
        .eq("user_id", user!.id)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false });

      if (error || !data || data.length === 0) return 0;

      // Count consecutive days from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const uniqueDays = new Set(
        data.map((d) => {
          const date = new Date(d.completed_at!);
          date.setHours(0, 0, 0, 0);
          return date.getTime();
        })
      );

      let streakCount = 0;
      const dayMs = 86400000;
      let checkDate = today.getTime();

      // If nothing completed today, start from yesterday
      if (!uniqueDays.has(checkDate)) {
        checkDate -= dayMs;
      }

      while (uniqueDays.has(checkDate)) {
        streakCount++;
        checkDate -= dayMs;
      }

      return streakCount;
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
            <Flame className="h-5 w-5 text-streak" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{streak}</p>
            <p className="text-xs text-muted-foreground">day streak</p>
          </div>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={`h-6 w-2 rounded-full ${
                i < Math.min(streak, 7) ? "bg-foreground" : "bg-accent"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StreakCard;
