import { Lock } from "lucide-react";
import { userProfile } from "@/data/mockData";

const BadgeShowcase = () => (
  <div>
    <h2 className="mb-3 text-base font-bold text-foreground">Badges</h2>
    <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
      {userProfile.badges.map((badge) => (
        <div
          key={badge.id}
          className={`relative flex flex-col items-center gap-2 rounded-xl border p-4 min-w-[80px] snap-center transition-all duration-300 ${
            badge.earned
              ? "border-highlight/20 bg-highlight/5 hover:shadow-[0_0_16px_hsl(var(--highlight)/0.15)]"
              : "border-border bg-card/50 opacity-50 grayscale"
          }`}
        >
          {/* Glow behind earned badges */}
          {badge.earned && (
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-highlight/10 to-transparent pointer-events-none" />
          )}
          <span className="relative text-2xl">{badge.icon}</span>
          {!badge.earned && (
            <Lock className="absolute top-2 right-2 h-3 w-3 text-muted-foreground" />
          )}
          <span className="relative text-[10px] font-medium text-foreground text-center leading-tight">
            {badge.name}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export default BadgeShowcase;
