import AppShell from "@/components/layout/AppShell";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MapPin, Flame, BookOpen, Trophy, Heart, Eye, UserPlus, MessageCircle, Briefcase, Play } from "lucide-react";
import { usePortfolioProjects } from "@/hooks/usePortfolio";
import ProfileAvatar from "@/components/profile/ProfileAvatar";
import instructor1 from "@/assets/instructor-1.jpg";
import { useState } from "react";
import ProjectLightbox from "@/components/portfolio/ProjectLightbox";
import type { PortfolioProject } from "@/hooks/usePortfolio";

// Mock public profile data (would come from DB in production)
const mockPublic = {
  id: "mock-user-id",
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
  const [selectedProject, setSelectedProject] = useState<PortfolioProject | null>(null);

  // Fetch real portfolio projects for this user
  const { data: portfolioProjects = [] } = usePortfolioProjects(handle);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5 pb-6 animate-fade-in">
        {/* Cover */}
        <div className="relative h-36 rounded-b-2xl bg-gradient-to-br from-highlight/15 via-secondary to-background lg:h-48">
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
            <ProfileAvatar avatarUrl={p.avatar} name={p.name} level={p.level} />
          </div>
        </div>

        <div className="mt-14 space-y-5 px-4 lg:px-6">
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
            <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-highlight py-2.5 text-sm font-bold text-highlight-foreground hover:opacity-90 transition-opacity">
              <UserPlus className="h-4 w-4" /> Follow
            </button>
            <button className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:bg-secondary transition-colors">
              <Briefcase className="h-4 w-4" /> Connect
            </button>
            <button className="flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2.5 text-foreground hover:bg-secondary transition-colors">
              <MessageCircle className="h-4 w-4" />
            </button>
          </div>

          {/* XP */}
          <div className="rounded-xl border border-border bg-card p-4">
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
              <div key={s.label} className="rounded-xl border border-border bg-card p-3 text-center">
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
                <span key={s} className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">{s}</span>
              ))}
            </div>
          </div>

          {/* Portfolio — real projects from DB */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">Portfolio</h2>
              {portfolioProjects.length > 0 && (
                <span className="text-xs text-muted-foreground">{portfolioProjects.length} project{portfolioProjects.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {portfolioProjects.length > 0 ? (
              <div className="columns-2 gap-3">
                {portfolioProjects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => setSelectedProject(project)}
                    className="group relative mb-3 cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:scale-[1.02] hover:border-highlight/30 hover:shadow-[0_0_20px_hsl(var(--highlight)/0.12)] break-inside-avoid"
                  >
                    <div className="relative">
                      {project.thumbnail_url ? (
                        <img
                          src={project.thumbnail_url}
                          alt={project.title}
                          className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          style={{ aspectRatio: project.is_pinned ? "16/9" : "4/3" }}
                        />
                      ) : (
                        <div className="flex w-full items-center justify-center bg-secondary" style={{ aspectRatio: "4/3" }}>
                          <Play className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      {project.is_pinned && (
                        <span className="absolute left-2 top-2 rounded-full bg-highlight/90 px-2 py-0.5 text-[10px] font-bold text-highlight-foreground">📌 Featured</span>
                      )}
                      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                        <p className="text-xs font-semibold text-white line-clamp-1 flex-1 mr-2">{project.title}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="flex items-center gap-0.5 text-[10px] text-white/80">
                            <Heart className="h-3 w-3" /> {project.appreciations}
                          </span>
                          <span className="flex items-center gap-0.5 text-[10px] text-white/80">
                            <Eye className="h-3 w-3" /> {project.views}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card/50 py-8 text-center">
                <p className="text-sm text-muted-foreground">No projects yet.</p>
              </div>
            )}
          </div>

          {/* Badges */}
          <div>
            <h2 className="mb-3 text-base font-bold text-foreground">Badges</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
              {p.badges.map((b) => (
                <div
                  key={b.id}
                  className={`relative flex flex-col items-center gap-2 rounded-xl border p-4 min-w-[80px] snap-center transition-all ${
                    b.earned
                      ? "border-highlight/20 bg-highlight/5"
                      : "border-border bg-card/50 opacity-50 grayscale"
                  }`}
                >
                  <span className="text-2xl">{b.icon}</span>
                  <span className="text-[10px] font-medium text-foreground text-center leading-tight">{b.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {selectedProject && (
        <ProjectLightbox
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          isOwner={false}
        />
      )}
    </AppShell>
  );
};

export default ProfilePublic;
