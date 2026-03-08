import AppShell from "@/components/layout/AppShell";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MapPin, Flame, BookOpen, Trophy, Heart, UserPlus, MessageCircle, Briefcase } from "lucide-react";
import instructor1 from "@/assets/instructor-1.jpg";
import courseCinematography from "@/assets/course-cinematography.jpg";
import courseEditing from "@/assets/course-editing.jpg";

// Mock public profile data
const mockPublic = {
  name: "Vikram Das",
  avatar: instructor1,
  bio: "Cinematographer & filmmaker based in Mumbai. Passionate about visual storytelling and documentary work.",
  city: "Mumbai",
  roles: ["Cinematographer", "Director"],
  skills: ["Cinema Camera", "Natural Light", "Documentary", "DaVinci Resolve"],
  availability: "open-to-work" as const,
  level: 4,
  levelName: "Craftsperson",
  xp: 3200,
  xpToNext: 5000,
  streak: 24,
  coursesCompleted: 5,
  badgesEarned: 4,
  portfolio: [
    { id: "1", title: "Sunrise on the Ghats", thumbnail: courseCinematography, appreciations: 89 },
    { id: "2", title: "Urban Pulse – Mumbai", thumbnail: courseEditing, appreciations: 56 },
  ],
  badges: [
    { id: "b1", name: "First Lesson", icon: "🎯", earned: true },
    { id: "b2", name: "7-Day Streak", icon: "🔥", earned: true },
    { id: "b3", name: "Portfolio Pro", icon: "💼", earned: true },
    { id: "b4", name: "Community Star", icon: "⭐", earned: true },
    { id: "b5", name: "Mentor", icon: "🧑‍🏫", earned: false },
  ],
};

const availConfig = {
  "open-to-work": { label: "Open to work", dot: "bg-success" },
  "open-to-collaborate": { label: "Open to collaborate", dot: "bg-warning" },
  "not-looking": { label: "Not looking", dot: "bg-muted-foreground" },
};

const ProfilePublic = () => {
  const { handle } = useParams();
  const p = mockPublic;
  const avail = availConfig[p.availability];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5 pb-6">
        {/* Cover */}
        <div className="relative h-32 rounded-b-xl bg-gradient-to-br from-highlight/20 via-secondary to-background lg:h-44">
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
            <img src={p.avatar} alt={p.name} className="h-20 w-20 rounded-full border-4 border-background object-cover lg:h-24 lg:w-24" />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md bg-highlight px-2 py-0.5 text-[10px] font-bold text-highlight-foreground">
              Lv.{p.level}
            </span>
          </div>
        </div>

        <div className="mt-12 space-y-5 px-4 lg:px-6">
          {/* Name */}
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">{p.name}</h1>
            <p className="text-xs text-muted-foreground">@{handle}</p>
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
              {p.roles.map((r) => (
                <Badge key={r} className="bg-highlight/15 text-highlight border-highlight/30 text-xs">{r}</Badge>
              ))}
            </div>
            <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {p.city}
            </p>
          </div>

          {/* Availability */}
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground">
              <span className={`h-2 w-2 rounded-full ${avail.dot}`} />
              {avail.label}
            </span>
          </div>

          {/* Bio */}
          <p className="text-center text-sm text-muted-foreground">{p.bio}</p>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button className="flex flex-1 items-center justify-center gap-2 rounded-md bg-highlight py-2.5 text-sm font-bold text-highlight-foreground hover:opacity-90">
              <UserPlus className="h-4 w-4" /> Follow
            </button>
            <button className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:bg-secondary">
              <Briefcase className="h-4 w-4" /> Connect
            </button>
            <button className="flex items-center justify-center rounded-md border border-border bg-card px-3 py-2.5 text-foreground hover:bg-secondary">
              <MessageCircle className="h-4 w-4" />
            </button>
          </div>

          {/* XP */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-foreground">Level {p.level} — {p.levelName}</span>
              <span className="font-mono text-xs text-muted-foreground">{p.xp}/{p.xpToNext} XP</span>
            </div>
            <Progress value={(p.xp / p.xpToNext) * 100} className="mt-2 h-2" />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Flame, label: "Streak", value: `${p.streak} days`, color: "text-streak" },
              { icon: BookOpen, label: "Completed", value: `${p.coursesCompleted} courses`, color: "text-xp" },
              { icon: Trophy, label: "Badges", value: `${p.badgesEarned} earned`, color: "text-highlight" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-3 text-center">
                <s.icon className={`mx-auto h-5 w-5 ${s.color}`} />
                <p className="mt-1 text-sm font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Skills */}
          <div>
            <h2 className="mb-3 text-base font-bold text-foreground">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {p.skills.map((s) => (
                <span key={s} className="rounded-md border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground">{s}</span>
              ))}
            </div>
          </div>

          {/* Portfolio */}
          <div>
            <h2 className="mb-3 text-base font-bold text-foreground">Portfolio</h2>
            <div className="grid grid-cols-2 gap-3">
              {p.portfolio.map((proj) => (
                <div key={proj.id} className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="aspect-video bg-secondary">
                    <img src={proj.thumbnail} alt={proj.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-medium text-foreground line-clamp-1">{proj.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Heart className="h-3 w-3" /> {proj.appreciations}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Badges */}
          <div>
            <h2 className="mb-3 text-base font-bold text-foreground">Badges</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {p.badges.map((b) => (
                <div
                  key={b.id}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 min-w-[72px] ${
                    b.earned ? "border-highlight/20 bg-highlight/5" : "border-border bg-card opacity-40"
                  }`}
                >
                  <span className="text-2xl">{b.icon}</span>
                  <span className="text-[10px] font-medium text-foreground text-center">{b.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default ProfilePublic;
