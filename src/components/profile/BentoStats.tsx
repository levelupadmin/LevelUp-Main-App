import { Flame, BookOpen, Trophy } from "lucide-react";
import { userProfile } from "@/data/mockData";

const BentoStats = () => {
  const stats = [
    {
      icon: Flame,
      label: "Day Streak",
      value: userProfile.streak,
      color: "text-streak",
      bgGradient: "from-streak/10 to-streak/5",
      featured: true,
      pulse: true,
    },
    {
      icon: BookOpen,
      label: "Courses Done",
      value: userProfile.coursesCompleted,
      color: "text-xp",
      bgGradient: "from-xp/10 to-xp/5",
    },
    {
      icon: Trophy,
      label: "Badges",
      value: userProfile.badges.filter((b) => b.earned).length,
      color: "text-highlight",
      bgGradient: "from-highlight/10 to-highlight/5",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`group relative overflow-hidden rounded-xl border border-border bg-gradient-to-br ${s.bgGradient} p-4 text-center transition-all duration-300 hover:border-highlight/30 hover:shadow-[0_0_16px_hsl(var(--highlight)/0.1)] ${s.featured ? "ring-1 ring-streak/20" : ""}`}
        >
          <s.icon className={`mx-auto h-6 w-6 ${s.color} ${s.pulse ? "animate-pulse" : ""}`} />
          <p className="mt-2 text-xl font-bold text-foreground">{s.value}</p>
          <p className="text-[11px] font-medium text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
};

export default BentoStats;
