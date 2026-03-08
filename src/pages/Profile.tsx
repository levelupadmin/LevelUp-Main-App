import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { userProfile } from "@/data/mockData";
import { useNavigate } from "react-router-dom";
import {
  Settings, Edit2, MapPin, Share2, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import ProfileAvatar from "@/components/profile/ProfileAvatar";
import ProfileCompletionRing from "@/components/profile/ProfileCompletionRing";
import BentoStats from "@/components/profile/BentoStats";
import CinematicPortfolio from "@/components/profile/CinematicPortfolio";
import BadgeShowcase from "@/components/profile/BadgeShowcase";
import RecentActivity from "@/components/profile/RecentActivity";

const availabilityConfig = {
  "open-to-work": { label: "Open to work", dotClass: "bg-success" },
  "open-to-collaborate": { label: "Open to collaborate", dotClass: "bg-warning" },
  "not-looking": { label: "Not looking", dotClass: "bg-muted-foreground" },
};

const Profile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const xpPercent = (userProfile.xp / userProfile.xpToNext) * 100;
  const availability = user?.availability ?? "open-to-collaborate";
  const avail = availabilityConfig[availability];

  const fields = [user?.name, user?.bio, user?.city, (user?.roles?.length ?? 0) > 0, (user?.skills?.length ?? 0) > 0, (user?.interests?.length ?? 0) > 0];
  const completionPct = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5 pb-6 animate-fade-in">
        {/* Cover */}
        <div className="relative h-36 rounded-b-2xl bg-gradient-to-br from-highlight/15 via-secondary to-background lg:h-48">
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
            <ProfileAvatar
              avatarUrl={user?.avatar_url}
              name={user?.name}
              level={userProfile.creatorLevel}
            />
          </div>
          <button
            onClick={() => navigate("/settings")}
            className="absolute right-3 top-3 rounded-lg bg-background/60 p-2.5 text-foreground backdrop-blur-sm hover:bg-background/80 transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-14 space-y-5 px-4 lg:px-6">
          {/* Completion ring */}
          <ProfileCompletionRing percentage={completionPct} />

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
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-foreground">Level {userProfile.creatorLevel} — {userProfile.levelName}</span>
              <span className="font-mono text-xs text-muted-foreground">{userProfile.xp}/{userProfile.xpToNext} XP</span>
            </div>
            <Progress value={xpPercent} className="mt-2 h-2" />
          </div>

          {/* Bento Stats */}
          <BentoStats />

          {/* Action buttons: Edit + Share */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate("/profile/edit")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
            >
              <Edit2 className="h-4 w-4" /> Edit Profile
            </button>
            <button
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
          </div>

          {/* Skills */}
          <div>
            <h2 className="mb-3 text-base font-bold text-foreground">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {(user?.skills ?? ["Premiere Pro", "DaVinci Resolve", "Color Grading"]).map((s) => (
                <span key={s} className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-highlight/30">{s}</span>
              ))}
            </div>
          </div>

          {/* Portfolio */}
          <CinematicPortfolio />

          {/* Badges */}
          <BadgeShowcase />

          {/* Recent Activity */}
          <RecentActivity />

          {/* Quick links */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {[
              { label: "My Portfolio", action: () => navigate("/portfolio") },
              { label: "Subscription", action: () => navigate("/settings/subscription") },
              { label: "Notifications", action: () => navigate("/notifications") },
            ].map((item, i) => (
              <button
                key={item.label}
                onClick={item.action}
                className={`flex w-full items-center justify-between px-4 py-3.5 text-sm text-foreground hover:bg-secondary/30 transition-colors ${i > 0 ? "border-t border-border" : ""}`}
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
