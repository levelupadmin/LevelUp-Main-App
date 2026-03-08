import AppShell from "@/components/layout/AppShell";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, Compass, Users, ChevronRight, MapPin, Sparkles, Lock } from "lucide-react";
import { cohortCommunities } from "@/data/communityData";
import { cityCommunities, skillCommunities } from "@/data/communityData";
import { directoryCreators } from "@/data/communityData";

type Tab = "cohorts" | "explore" | "directory";

const Community = () => {
  const [activeTab, setActiveTab] = useState<Tab>("cohorts");
  const navigate = useNavigate();

  const tabs: { id: Tab; label: string; icon: typeof GraduationCap }[] = [
    { id: "cohorts", label: "My Cohorts", icon: GraduationCap },
    { id: "explore", label: "Explore", icon: Compass },
    { id: "directory", label: "Directory", icon: Users },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Community</h1>
          <p className="text-sm text-muted-foreground">Your creative network — cohorts, communities, and creators</p>
        </div>

        {/* Top tabs */}
        <div className="mb-6 flex gap-1 rounded-xl bg-muted p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(" ").pop()}</span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "cohorts" && <MyCohorts navigate={navigate} />}
        {activeTab === "explore" && <ExploreCommunities navigate={navigate} />}
        {activeTab === "directory" && <DirectoryPreview navigate={navigate} />}
      </div>
    </AppShell>
  );
};

// ── My Cohorts ──
function MyCohorts({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const enrolled = cohortCommunities;
  return (
    <div className="space-y-4">
      {enrolled.length > 0 ? (
        enrolled.map((cc) => (
          <button
            key={cc.id}
            onClick={() => navigate(`/community/cohort/${cc.cohortId}`)}
            className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/30"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{cc.title}</p>
              <p className="text-xs text-muted-foreground">{cc.batchLabel} · {cc.memberCount} members</p>
            </div>
            <div className="flex items-center gap-2">
              {cc.channels.filter((c) => c.unread).reduce((sum, c) => sum + (c.unread || 0), 0) > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-bold text-background">
                  {cc.channels.filter((c) => c.unread).reduce((sum, c) => sum + (c.unread || 0), 0)}
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>
        ))
      ) : (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <GraduationCap className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No active cohorts</p>
          <p className="mt-1 text-xs text-muted-foreground">Enroll in a cohort to unlock your private batch community</p>
          <button
            onClick={() => navigate("/learn")}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Browse Cohorts
          </button>
        </div>
      )}
    </div>
  );
}

// ── Explore Communities ──
function ExploreCommunities({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [exploreMode, setExploreMode] = useState<"city" | "skill">("city");

  return (
    <div className="space-y-5">
      {/* Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setExploreMode("city")}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            exploreMode === "city" ? "bg-foreground text-background" : "bg-accent text-secondary-foreground hover:text-foreground"
          }`}
        >
          <MapPin className="h-3.5 w-3.5" />
          By City
        </button>
        <button
          onClick={() => setExploreMode("skill")}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            exploreMode === "skill" ? "bg-foreground text-background" : "bg-accent text-secondary-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          By Skill
        </button>
      </div>

      {/* City communities */}
      {exploreMode === "city" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {cityCommunities.map((city) => (
            <button
              key={city.id}
              onClick={() => navigate(`/community/city/${city.slug}`)}
              className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/30"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-lg">
                📍
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{city.name}</p>
                <p className="text-xs text-muted-foreground">{city.memberCount} creators</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {/* Skill communities */}
      {exploreMode === "skill" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {skillCommunities.map((skill) => (
            <button
              key={skill.id}
              onClick={() => navigate(`/community/skill/${skill.slug}`)}
              className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/30"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-lg">
                ✨
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{skill.name}</p>
                <p className="text-xs text-muted-foreground">{skill.memberCount} creators</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Directory Preview ──
function DirectoryPreview({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const preview = directoryCreators.slice(0, 4);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Discover creators by skill, city, and availability</p>
        <button
          onClick={() => navigate("/community/directory")}
          className="text-xs font-semibold text-foreground hover:underline"
        >
          View All →
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {preview.map((creator) => (
          <div
            key={creator.id}
            className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-muted-foreground/30"
          >
            <div className="flex items-center gap-3 mb-3">
              <img src={creator.avatar} alt={creator.name} className="h-10 w-10 rounded-full object-cover" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{creator.name}</p>
                <p className="text-xs text-muted-foreground">{creator.role} · {creator.city}</p>
              </div>
              {creator.available && (
                <span className="ml-auto shrink-0 rounded-full bg-[hsl(var(--success))] px-2 py-0.5 text-[10px] font-semibold text-background">
                  Available
                </span>
              )}
            </div>
            <p className="text-xs text-secondary-foreground line-clamp-2 mb-2">{creator.description}</p>
            <div className="flex flex-wrap gap-1">
              {creator.skills.slice(0, 3).map((s) => (
                <span key={s} className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => navigate("/community/directory")}
        className="w-full rounded-xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
      >
        Browse Full Directory
      </button>
    </div>
  );
}

export default Community;
