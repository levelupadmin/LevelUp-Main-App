import AppShell from "@/components/layout/AppShell";
import { userProfile } from "@/data/mockData";
import { Settings, ChevronRight, Flame, Trophy, BookOpen } from "lucide-react";

const Profile = () => {
  const xpPercent = (userProfile.xp / userProfile.xpToNext) * 100;

  return (
    <AppShell>
      <div className="space-y-5 py-4">
        {/* Header */}
        <div className="flex items-start justify-between px-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img src={userProfile.avatar} alt={userProfile.name} className="h-16 w-16 rounded-full object-cover ring-2 ring-primary" />
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full gradient-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                Lv.{userProfile.creatorLevel}
              </span>
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">{userProfile.name}</h1>
              <p className="text-xs text-primary font-semibold">{userProfile.levelName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{userProfile.bio}</p>
            </div>
          </div>
          <button className="rounded-full p-2 text-muted-foreground hover:bg-secondary">
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {/* XP Progress */}
        <div className="mx-4 rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">Level {userProfile.creatorLevel}: {userProfile.levelName}</span>
            <span className="text-xs text-muted-foreground">
              {userProfile.xp}/{userProfile.xpToNext} XP
            </span>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-secondary">
            <div
              className="h-full rounded-full gradient-primary transition-all"
              style={{ width: `${xpPercent}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {userProfile.xpToNext - userProfile.xp} XP to {userProfile.levelNames[userProfile.creatorLevel]}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 px-4">
          {[
            { icon: Flame, label: "Streak", value: `${userProfile.streak} days`, color: "text-streak" },
            { icon: BookOpen, label: "Completed", value: `${userProfile.coursesCompleted} courses`, color: "text-xp" },
            { icon: Trophy, label: "Badges", value: `${userProfile.badges.filter(b => b.earned).length} earned`, color: "text-primary" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-3 text-center shadow-card">
              <stat.icon className={`mx-auto h-5 w-5 ${stat.color}`} />
              <p className="mt-1 text-sm font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Badges */}
        <div className="px-4">
          <h2 className="mb-3 font-display text-lg font-bold text-foreground">Badges</h2>
          <div className="grid grid-cols-3 gap-3">
            {userProfile.badges.map((badge) => (
              <div
                key={badge.id}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 ${
                  badge.earned
                    ? "border-primary/30 bg-primary/5"
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
        <div className="px-4">
          {["My Portfolio", "Subscription", "Notifications", "Help & Support", "About"].map((item) => (
            <button
              key={item}
              className="flex w-full items-center justify-between border-b border-border py-3.5 text-sm text-foreground transition-colors hover:text-primary"
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
