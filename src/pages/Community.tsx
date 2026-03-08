import AppShell from "@/components/layout/AppShell";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, Compass, Users, ChevronRight, MapPin, Sparkles } from "lucide-react";
import { cohortCommunities } from "@/data/communityData";
import { cityCommunities, skillCommunities } from "@/data/communityData";
import { directoryCreators } from "@/data/communityData";
import { batchCohorts } from "@/data/batchData";
import instructor1 from "@/assets/instructor-1.jpg";
import instructor2 from "@/assets/instructor-2.jpg";

type Tab = "cohorts" | "explore" | "directory";

const Community = () => {
  const [activeTab, setActiveTab] = useState<Tab>("cohorts");
  const navigate = useNavigate();

  const tabs: { id: Tab; label: string; icon: typeof GraduationCap }[] = [
    { id: "cohorts", label: "My Cohorts", icon: GraduationCap },
    { id: "explore", label: "Discover", icon: Compass },
    { id: "directory", label: "Meet Creators", icon: Users },
  ];

  // Enrolled batch cohorts
  const enrolledBatches = batchCohorts;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Community</h1>
          <p className="text-sm text-muted-foreground">Your creative network — cohorts, communities, and creators</p>
        </div>

        {/* ── My Batches (always at top if enrolled) ── */}
        {enrolledBatches.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">My Batches</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
              {enrolledBatches.map((batch) => {
                const onlineMembers = batch.members.filter((m) => m.isOnline).slice(0, 4);
                return (
                  <button
                    key={batch.id}
                    onClick={() => navigate(`/community/batch/${batch.id}`)}
                    className="group min-w-[280px] max-w-[320px] shrink-0 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-muted-foreground/30 hover:shadow-card"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-bold text-foreground leading-tight">{batch.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Batch {batch.batchNumber}</p>
                      </div>
                      {batch.unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">
                          {batch.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex -space-x-2">
                          {onlineMembers.map((m, i) => (
                            <img
                              key={m.id}
                              src={m.avatar}
                              alt={m.name}
                              className="h-6 w-6 rounded-full border-2 border-card object-cover"
                              style={{ zIndex: onlineMembers.length - i }}
                            />
                          ))}
                        </div>
                        <span className="ml-2 text-[10px] text-muted-foreground">{batch.memberCount} members</span>
                      </div>
                      {batch.nextSession && (
                        <span className="text-[10px] font-medium text-[hsl(var(--highlight))]">Next: {batch.nextSession}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {enrolledBatches.length === 0 && (
          <div className="mb-6 rounded-xl border border-dashed border-border bg-card/50 p-6 text-center">
            <GraduationCap className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">Join a cohort program for a dedicated batch community</p>
            <button
              onClick={() => navigate("/learn")}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--highlight))] hover:underline"
            >
              Browse Cohorts <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}

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

// ── My Cohorts — Banner Cards ──
function MyCohorts({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const enrolled = cohortCommunities;
  return (
    <div className="space-y-4">
      {enrolled.length > 0 ? (
        enrolled.map((cc) => {
          const totalUnread = cc.channels.reduce((sum, c) => sum + (c.unread || 0), 0);
          return (
            <button
              key={cc.id}
              onClick={() => navigate(`/community/cohort/${cc.cohortId}`)}
              className="group relative w-full overflow-hidden rounded-2xl text-left transition-transform hover:scale-[1.01]"
            >
              {/* Banner image */}
              <div className="relative h-44 sm:h-52">
                <img
                  src={cc.image}
                  alt={cc.title}
                  className="h-full w-full object-cover"
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                {/* Unread badge */}
                {totalUnread > 0 && (
                  <div className="absolute top-3 right-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground">
                    {totalUnread} new
                  </div>
                )}

                {/* Bottom text overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                  <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">{cc.title}</h3>
                  <div className="mt-1.5 flex items-center gap-3 text-white/70 text-xs sm:text-sm">
                    <span>{cc.batchLabel}</span>
                    <span className="h-1 w-1 rounded-full bg-white/40" />
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {cc.memberCount} members
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })
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

// ── Explore Communities — Image Cards ──
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
        <>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Cities</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cityCommunities.map((city) => (
              <button
                key={city.id}
                onClick={() => navigate(`/community/city/${city.slug}`)}
                className="group relative overflow-hidden rounded-xl text-left transition-transform hover:scale-[1.02]"
              >
                <div className="relative aspect-[4/5]">
                  <img
                    src={city.image}
                    alt={city.name}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-sm font-bold text-white">{city.name}</p>
                    <p className="text-[10px] text-white/60">{city.memberCount} creators</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Skill communities */}
      {exploreMode === "skill" && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Skills</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {skillCommunities.map((skill) => (
              <button
                key={skill.id}
                onClick={() => navigate(`/community/skill/${skill.slug}`)}
                className="group relative overflow-hidden rounded-xl text-left transition-transform hover:scale-[1.02]"
              >
                <div className="relative aspect-[4/5]">
                  <img
                    src={skill.image}
                    alt={skill.name}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-sm font-bold text-white">{skill.name}</p>
                    <p className="text-[10px] text-white/60">{skill.memberCount} creators</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
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
