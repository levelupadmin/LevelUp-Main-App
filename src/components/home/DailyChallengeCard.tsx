import { Zap, Clock, Users } from "lucide-react";
import { dailyChallenge } from "@/data/mockData";

const DailyChallengeCard = () => {
  return (
    <div className="relative overflow-hidden rounded-lg border border-primary/20 bg-primary/5 p-5">
      <div className="relative z-10">
        <div className="mb-2 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            Daily Challenge
          </span>
        </div>
        <h3 className="mb-3 text-lg font-bold text-foreground">
          {dailyChallenge.title}
        </h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-primary" /> +{dailyChallenge.xpReward} XP
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {dailyChallenge.participants} joined
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {dailyChallenge.timeLeft}
          </span>
        </div>
        <button className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          Take the Challenge
        </button>
      </div>
    </div>
  );
};

export default DailyChallengeCard;
