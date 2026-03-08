import { Zap, Clock, Users } from "lucide-react";
import { dailyChallenge } from "@/data/mockData";

const DailyChallengeCard = () => {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Daily Challenge
        </span>
      </div>
      <h3 className="text-base font-bold text-foreground">{dailyChallenge.title}</h3>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {dailyChallenge.timeLeft}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" />
          {dailyChallenge.participants} joined
        </span>
        <span className="font-semibold text-foreground">+{dailyChallenge.xpReward} XP</span>
      </div>
    </div>
  );
};

export default DailyChallengeCard;
