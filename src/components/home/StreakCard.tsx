import { Flame } from "lucide-react";
import { userProfile } from "@/data/mockData";

const StreakCard = () => {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
            <Flame className="h-5 w-5 text-streak" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{userProfile.streak}</p>
            <p className="text-xs text-muted-foreground">day streak</p>
          </div>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={`h-6 w-2 rounded-full ${
                i < Math.min(userProfile.streak, 7) ? "bg-foreground" : "bg-accent"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StreakCard;
