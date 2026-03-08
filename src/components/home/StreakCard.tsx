import { Flame } from "lucide-react";
import { userProfile } from "@/data/mockData";

const StreakCard = () => {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
            <Flame className="h-5 w-5 animate-streak-flame text-streak" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">
              {userProfile.streak}
              <span className="ml-1.5 text-sm font-medium text-muted-foreground">day streak</span>
            </p>
            <p className="text-xs text-muted-foreground">Keep it up — watch a lesson today</p>
          </div>
        </div>
        <div className="flex gap-1">
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              className={`h-7 w-1.5 rounded-full ${
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
