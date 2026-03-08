import { BookOpen, Award, Users } from "lucide-react";

const activities = [
  {
    icon: BookOpen,
    text: "Completed lesson: Lighting Fundamentals",
    time: "2h ago",
    color: "text-xp",
  },
  {
    icon: Award,
    text: "Earned badge: 7-Day Streak 🔥",
    time: "1d ago",
    color: "text-highlight",
  },
  {
    icon: Users,
    text: "Joined cohort: Cinematography Masterclass",
    time: "3d ago",
    color: "text-info",
  },
];

const RecentActivity = () => (
  <div>
    <h2 className="mb-3 text-base font-bold text-foreground">Recent Activity</h2>
    <div className="space-y-0 rounded-xl border border-border bg-card overflow-hidden">
      {activities.map((activity, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/30 ${
            i > 0 ? "border-t border-border" : ""
          }`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <activity.icon className={`h-4 w-4 ${activity.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground truncate">{activity.text}</p>
          </div>
          <span className="text-[11px] text-muted-foreground shrink-0">{activity.time}</span>
        </div>
      ))}
    </div>
  </div>
);

export default RecentActivity;
