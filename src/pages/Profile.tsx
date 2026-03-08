import AppShell from "@/components/layout/AppShell";
import { userProfile } from "@/data/mockData";
import { Settings, ChevronRight, Flame, Trophy, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Profile = () => {
  const xpPercent = (userProfile.xp / userProfile.xpToNext) * 100;
  const navigate = useNavigate();

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-5">
            <div className="relative">
              <img src={userProfile.avatar} alt={userProfile.name} className="h-16 w-16 rounded-full object-cover ring-2 ring-primary lg:h-20 lg:w-20" />
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                Lv.{userProfile.creatorLevel}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground lg:text-2xl">{userProfile.name}</h1>
              <p className="text-xs font-semibold text-primary">{userProfile.levelName}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{userProfile.bio}</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/settings")}
            className="rounded-md p-2 text-muted-foreground hover:bg-secondary transition-colors"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {/* XP Progress */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">Level {userProfile.creatorLevel}: {userProfile.levelName}</span>
            <span className="text-xs text-muted-foreground font-mono">
              {userProfile.xp}/{userProfile.xpToNext} XP
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${xpPercent}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {userProfile.xpToNext - userProfile.xp} XP to {userProfile.levelNames[userProfile.creatorLevel]}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Flame, label: "Streak", value: `${userProfile.streak} days`, color: "text-streak" },
            { icon: BookOpen, label: "Completed", value: `${userProfile.coursesCompleted} courses`, color: "text-xp" },
            { icon: Trophy, label: "Badges", value: `${userProfile.badges.filter(b => b.earned).length} earned`, color: "text-primary" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-4 text-center">
              <stat.icon className={`mx-auto h-5 w-5 ${stat.color}`} />
              <p className="mt-1.5 text-sm font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Badges */}
        <div>
          <h2 className="mb-3 text-lg font-bold text-foreground">Badges</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {userProfile.badges.map((badge) => (
              <div
                key={badge.id}
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 ${
                  badge.earned
                    ? "border-primary/20 bg-primary/5"
                    : "border-border bg-card opacity-40"
                }`}
              >
                <span className="text-2xl">{badge.icon}</span>
                <span className="text-xs font-medium text-foreground text-center">{badge.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Menu items */}
        <div className="rounded-lg border border-border bg-card">
          {["My Portfolio", "Subscription", "Notifications", "Help & Support", "About"].map((item, i) => (
            <button
              key={item}
              onClick={() => {
                if (item === "Subscription") navigate("/settings/subscription");
                if (item === "Notifications") navigate("/notifications");
              }}
              className={`flex w-full items-center justify-between px-5 py-3.5 text-sm text-foreground transition-colors hover:bg-secondary ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              {item}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
};

export default Profile;
