import { Flame } from "lucide-react";
import { userProfile } from "@/data/mockData";

const StreakCard = () => {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Flame className="h-6 w-6 animate-streak-flame text-streak" />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-foreground">
              {userProfile.streak}
              <span className="ml-1 text-sm font-medium text-muted-foreground">day streak</span>
            </p>
            <p className="text-xs text-muted-foreground">Keep it up! Watch a lesson today</p>
          </div>
        </div>
        <div className="flex gap-1">
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              className={`h-6 w-1.5 rounded-full ${
                i < 5 ? "bg-primary" : "bg-secondary"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StreakCard;
