import { Zap, Clock, Users } from "lucide-react";
import { dailyChallenge } from "@/data/mockData";

const DailyChallengeCard = () => {
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/20 gradient-primary p-4 shadow-glow">
      <div className="relative z-10">
        <div className="mb-2 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/80">
            Daily Challenge
          </span>
        </div>
        <h3 className="mb-3 text-lg font-display font-bold text-primary-foreground">
          {dailyChallenge.title}
        </h3>
        <div className="flex items-center gap-4 text-xs text-primary-foreground/70">
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" /> +{dailyChallenge.xpReward} XP
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {dailyChallenge.participants} joined
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {dailyChallenge.timeLeft}
          </span>
        </div>
        <button className="mt-3 w-full rounded-lg bg-primary-foreground/20 py-2.5 text-sm font-semibold text-primary-foreground backdrop-blur-sm transition-colors hover:bg-primary-foreground/30">
          Take the Challenge
        </button>
      </div>
    </div>
  );
};

export default DailyChallengeCard;
