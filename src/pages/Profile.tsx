import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { userProfile } from "@/data/mockData";
import { useNavigate } from "react-router-dom";
import {
  Settings, Flame, Trophy, BookOpen, MapPin, Edit2,
  Heart, ChevronRight, Share2, Briefcase,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import instructor1 from "@/assets/instructor-1.jpg";
import courseCinematography from "@/assets/course-cinematography.jpg";
import courseEditing from "@/assets/course-editing.jpg";
import courseContent from "@/assets/course-content.jpg";

const availabilityConfig = {
  "open-to-work": { label: "Open to work", dotClass: "bg-success" },
  "open-to-collaborate": { label: "Open to collaborate", dotClass: "bg-warning" },
  "not-looking": { label: "Not looking", dotClass: "bg-muted-foreground" },
};

const thumbnails = [courseCinematography, courseEditing, courseContent, courseCinematography];

const Profile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const xpPercent = (userProfile.xp / userProfile.xpToNext) * 100;
  const availability = user?.availability ?? "open-to-collaborate";
  const avail = availabilityConfig[availability];

  // Profile completion
  const fields = [user?.name, user?.bio, user?.city, (user?.roles?.length ?? 0) > 0, (user?.skills?.length ?? 0) > 0, (user?.interests?.length ?? 0) > 0];
  const completionPct = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5 pb-6">
        {/* Cover */}
        <div className="relative h-32 rounded-b-xl bg-gradient-to-br from-highlight/20 via-secondary to-background lg:h-44">
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
            <img
              src={user?.avatar_url || instructor1}
              alt={user?.name}
              className="h-20 w-20 rounded-full border-4 border-background object-cover lg:h-24 lg:w-24"
            />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md bg-highlight px-2 py-0.5 text-[10px] font-bold text-highlight-foreground">
              Lv.{userProfile.creatorLevel}
            </span>
          </div>
          <button
            onClick={() => navigate("/settings")}
            className="absolute right-3 top-3 rounded-md bg-background/60 p-2 text-foreground backdrop-blur-sm hover:bg-background/80"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-12 space-y-5 px-4 lg:px-6">
          {/* Completion nudge */}
          {completionPct < 80 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Complete your profile</span>
                <span className="text-xs text-muted-foreground">{completionPct}%</span>
              </div>
              <Progress value={completionPct} className="mt-2 h-1.5" />
            </div>
          )}

          {/* Name & info */}
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">{user?.name || userProfile.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
              {(user?.roles ?? ["Filmmaker"]).slice(0, 3).map((r) => (
                <Badge key={r} className="bg-highlight/15 text-highlight border-highlight/30 text-xs">{r}</Badge>
              ))}
            </div>
            {(user?.city || "Mumbai") && (
              <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {user?.city || "Mumbai"}
              </p>
            )}
          </div>

          {/* Availability */}
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground">
              <span className={`h-2 w-2 rounded-full ${avail.dotClass}`} />
              {avail.label}
            </span>
          </div>

          {/* Bio */}
          <p className="text-center text-sm text-muted-foreground">{user?.bio || userProfile.bio}</p>

          {/* XP + Level */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-foreground">Level {userProfile.creatorLevel} — {userProfile.levelName}</span>
              <span className="font-mono text-xs text-muted-foreground">{userProfile.xp}/{userProfile.xpToNext} XP</span>
            </div>
            <Progress value={xpPercent} className="mt-2 h-2" />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Flame, label: "Streak", value: `${userProfile.streak} days`, color: "text-streak" },
              { icon: BookOpen, label: "Completed", value: `${userProfile.coursesCompleted} courses`, color: "text-xp" },
              { icon: Trophy, label: "Badges", value: `${userProfile.badges.filter((b) => b.earned).length} earned`, color: "text-highlight" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-3 text-center">
                <s.icon className={`mx-auto h-5 w-5 ${s.color}`} />
                <p className="mt-1 text-sm font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Edit Profile */}
          <button
            onClick={() => navigate("/profile/edit")}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
          >
            <Edit2 className="h-4 w-4" /> Edit Profile
          </button>

          {/* Skills */}
          <div>
            <h2 className="mb-3 text-base font-bold text-foreground">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {(user?.skills ?? ["Premiere Pro", "DaVinci Resolve", "Color Grading"]).map((s) => (
                <span key={s} className="rounded-md border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground">{s}</span>
              ))}
            </div>
          </div>

          {/* Portfolio */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">Portfolio</h2>
              <button className="text-xs font-medium text-highlight hover:underline">See all</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                { id: "p1", title: "Golden Hour – Short Film", thumbnail: "", appreciations: 42 },
                { id: "p2", title: "City Rhythms – Documentary", thumbnail: "", appreciations: 28 },
                { id: "p3", title: "Monsoon Diaries", thumbnail: "", appreciations: 15 },
                { id: "p4", title: "Street Food Stories", thumbnail: "", appreciations: 63 },
              ]).map((p, i) => (
                <div key={p.id} className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="aspect-video bg-secondary">
                    <img src={thumbnails[i % thumbnails.length]} alt={p.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-medium text-foreground line-clamp-1">{p.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Heart className="h-3 w-3" /> {p.appreciations}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Badges */}
          <div>
            <h2 className="mb-3 text-base font-bold text-foreground">Badges</h2>
            {userProfile.badges.filter((b) => b.earned).length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {userProfile.badges.map((badge) => (
                  <div
                    key={badge.id}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 min-w-[72px] ${
                      badge.earned ? "border-highlight/20 bg-highlight/5" : "border-border bg-card opacity-40"
                    }`}
                  >
                    <span className="text-2xl">{badge.icon}</span>
                    <span className="text-[10px] font-medium text-foreground text-center">{badge.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Complete courses to earn badges.</p>
            )}
          </div>

          {/* Quick links */}
          <div className="rounded-lg border border-border bg-card">
            {[
              { label: "My Portfolio", action: () => {} },
              { label: "Subscription", action: () => navigate("/settings/subscription") },
              { label: "Notifications", action: () => navigate("/notifications") },
            ].map((item, i) => (
              <button
                key={item.label}
                onClick={item.action}
                className={`flex w-full items-center justify-between px-4 py-3 text-sm text-foreground hover:bg-secondary transition-colors ${i > 0 ? "border-t border-border" : ""}`}
              >
                {item.label}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default Profile;
