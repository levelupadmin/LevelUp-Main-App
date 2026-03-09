import AppShell, { type CommunitySection } from "@/components/layout/AppShell";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap, Users, MapPin, Sparkles, Heart, MessageCircle, Send, Image,
  Search, Filter, ExternalLink, X, ChevronDown, TrendingUp, UserPlus,
} from "lucide-react";
import {
  cohortCommunities, cityCommunities, skillCommunities,
  directoryCreators, directoryFilters,
  feedPosts, trendingPosts,
  type FeedPost, type DirectoryCreator,
} from "@/data/communityData";
import { useAuth } from "@/contexts/AuthContext";
import { useSpaces, usePosts, useCreatePost, useToggleLike } from "@/hooks/useCommunity";
import { formatDistanceToNow } from "date-fns";

const Community = () => {
  const [activeSection, setActiveSection] = useState<CommunitySection>("feed");
  const navigate = useNavigate();

  return (
    <AppShell communitySection={activeSection} onCommunitySection={setActiveSection}>
      <div className="mx-auto max-w-2xl px-4 py-6 lg:px-6">
        {activeSection === "feed" && <FeedView />}
        {activeSection === "spaces" && <MySpacesView navigate={navigate} />}
        {activeSection === "discover" && <DiscoverView navigate={navigate} />}
        {activeSection === "creators" && <MeetCreatorsView />}
      </div>
    </AppShell>
  );
};

/* ═══════════════════════════════════════════
   FEED VIEW
   ═══════════════════════════════════════════ */
function FeedView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostBody, setNewPostBody] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState("");

  const { data: spaces = [] } = useSpaces();
  const { data: posts = [], isLoading } = usePosts();
  const createPost = useCreatePost();
  const toggleLikeMut = useToggleLike();

  const handlePost = () => {
    if (!newPostTitle.trim() || !selectedSpace) return;
    createPost.mutate(
      { spaceId: selectedSpace, title: newPostTitle.trim(), body: newPostBody.trim() || undefined },
      { onSuccess: () => { setNewPostTitle(""); setNewPostBody(""); setComposerOpen(false); setSelectedSpace(""); } }
    );
  };

  return (
    <div className="space-y-5">
      {/* Composer */}
      <div className="rounded-xl border border-border bg-card p-4">
        {!composerOpen ? (
          <button onClick={() => setComposerOpen(true)} className="flex w-full items-center gap-3 text-left">
            <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center text-sm font-bold text-foreground">
              {(user?.name || "U").charAt(0)}
            </div>
            <span className="flex-1 text-sm text-muted-foreground">What's on your mind?</span>
          </button>
        ) : (
          <div className="space-y-3">
            <select
              value={selectedSpace}
              onChange={(e) => setSelectedSpace(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 px-3 text-sm text-foreground outline-none"
            >
              <option value="">Select a space...</option>
              {spaces.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
            <input
              value={newPostTitle}
              onChange={(e) => setNewPostTitle(e.target.value)}
              placeholder="Post title"
              className="w-full rounded-lg border border-border bg-background py-2 px-3 text-sm font-medium text-foreground placeholder:text-muted-foreground outline-none"
            />
            <textarea
              value={newPostBody}
              onChange={(e) => setNewPostBody(e.target.value)}
              placeholder="Share your work, ask a question..."
              className="w-full resize-none rounded-lg border border-border bg-background py-2 px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none min-h-[80px]"
            />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => { setComposerOpen(false); setNewPostTitle(""); setNewPostBody(""); }} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button disabled={!newPostTitle.trim() || !selectedSpace || createPost.isPending} onClick={handlePost} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40">
                {createPost.isPending ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Posts from database */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-32 rounded-xl bg-card animate-pulse" />)}</div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <MessageCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No posts yet</p>
          <p className="text-xs text-muted-foreground mt-1">Be the first to share something!</p>
        </div>
      ) : (
        posts.map((post) => (
          <div key={post.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <button onClick={() => navigate(`/community/post/${post.id}`)} className="w-full p-4 text-left hover:bg-accent/30 transition-colors">
              <div className="flex items-center gap-3 mb-2">
                {post.author_avatar ? (
                  <img src={post.author_avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center text-sm font-bold text-foreground">{(post.author_name || "U").charAt(0)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{post.author_name}</p>
                  <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</p>
                </div>
              </div>
              <h3 className="text-sm font-bold text-foreground">{post.title}</h3>
              {post.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{post.body}</p>}
            </button>
            {post.image_url && <img src={post.image_url} alt="" className="w-full max-h-80 object-cover" />}
            <div className="flex items-center gap-1 border-t border-border px-4 py-2">
              <button onClick={() => toggleLikeMut.mutate({ postId: post.id, hasLiked: post.has_liked || false })} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${post.has_liked ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}>
                <Heart className={`h-3.5 w-3.5 ${post.has_liked ? "fill-current" : ""}`} /> {post.like_count || 0}
              </button>
              <button onClick={() => navigate(`/community/post/${post.id}`)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                <MessageCircle className="h-3.5 w-3.5" /> {post.comment_count || 0}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// FeedPostCard removed — feed now renders from database directly

/* ═══════════════════════════════════════════
   MY SPACES VIEW
   ═══════════════════════════════════════════ */
function MySpacesView({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const enrolled = cohortCommunities;
  return (
    <div className="space-y-4">
      <div className="mb-2"><h2 className="text-lg font-bold text-foreground">My Spaces</h2><p className="text-xs text-muted-foreground">Your enrolled cohort communities</p></div>
      {enrolled.length > 0 ? enrolled.map((cc) => {
        const totalUnread = cc.channels.reduce((sum, c) => sum + (c.unread || 0), 0);
        return (
          <button key={cc.id} onClick={() => navigate(`/community/cohort/${cc.cohortId}`)} className="group relative w-full overflow-hidden rounded-2xl text-left transition-transform hover:scale-[1.01]">
            <div className="relative h-44 sm:h-52">
              <img src={cc.image} alt={cc.title} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              {totalUnread > 0 && <div className="absolute top-3 right-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground">{totalUnread} new</div>}
              <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">{cc.title}</h3>
                <div className="mt-1.5 flex items-center gap-3 text-white/70 text-xs sm:text-sm">
                  <span>{cc.batchLabel}</span><span className="h-1 w-1 rounded-full bg-white/40" /><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{cc.memberCount} members</span>
                </div>
              </div>
            </div>
          </button>
        );
      }) : (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <GraduationCap className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No active cohorts</p>
          <p className="mt-1 text-xs text-muted-foreground">Enroll in a cohort to unlock your private batch community</p>
          <button onClick={() => navigate("/learn")} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">Browse Cohorts</button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   DISCOVER VIEW
   ═══════════════════════════════════════════ */
function DiscoverView({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [exploreMode, setExploreMode] = useState<"city" | "skill">("city");
  const { data: dbCitySpaces = [] } = useSpaces("city");
  const { data: dbSkillSpaces = [] } = useSpaces("skill");

  return (
    <div className="space-y-5">
      <div className="mb-2"><h2 className="text-lg font-bold text-foreground">Discover Communities</h2><p className="text-xs text-muted-foreground">Find your tribe by city or skill</p></div>
      <div className="flex gap-2">
        <button onClick={() => setExploreMode("city")} className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${exploreMode === "city" ? "bg-foreground text-background" : "bg-accent text-secondary-foreground hover:text-foreground"}`}><MapPin className="h-3.5 w-3.5" /> By City</button>
        <button onClick={() => setExploreMode("skill")} className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${exploreMode === "skill" ? "bg-foreground text-background" : "bg-accent text-secondary-foreground hover:text-foreground"}`}><Sparkles className="h-3.5 w-3.5" /> By Skill</button>
      </div>
      {exploreMode === "city" && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Cities</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {dbCitySpaces.map((space) => (
              <button key={space.id} onClick={() => navigate(`/community/city/${space.slug}`)} className="group relative overflow-hidden rounded-xl text-left transition-transform hover:scale-[1.02]">
                <div className="relative aspect-[4/5] bg-secondary">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center text-4xl">{space.icon || "📍"}</div>
                  <div className="absolute bottom-0 left-0 right-0 p-3"><p className="text-sm font-bold text-white">{space.name}</p><p className="text-[10px] text-white/60">{space.description}</p></div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {exploreMode === "skill" && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Skills</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {dbSkillSpaces.map((space) => (
              <button key={space.id} onClick={() => navigate(`/community/skill/${space.slug}`)} className="group relative overflow-hidden rounded-xl text-left transition-transform hover:scale-[1.02]">
                <div className="relative aspect-[4/5] bg-secondary">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center text-4xl">{space.icon || "✨"}</div>
                  <div className="absolute bottom-0 left-0 right-0 p-3"><p className="text-sm font-bold text-white">{space.name}</p><p className="text-[10px] text-white/60">{space.description}</p></div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MEET CREATORS VIEW
   ═══════════════════════════════════════════ */
function MeetCreatorsView() {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedSkill, setSelectedSkill] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedExp, setSelectedExp] = useState("");
  const [selectedAvail, setSelectedAvail] = useState("");
  const hasFilters = selectedCity || selectedSkill || selectedRole || selectedExp || selectedAvail;

  const filtered = useMemo(() => {
    return directoryCreators.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.role.toLowerCase().includes(search.toLowerCase()) && !c.skills.some((s) => s.toLowerCase().includes(search.toLowerCase()))) return false;
      if (selectedCity && c.city !== selectedCity) return false;
      if (selectedSkill && !c.skills.some((s) => s.toLowerCase().includes(selectedSkill.toLowerCase()))) return false;
      if (selectedRole && c.role !== selectedRole) return false;
      if (selectedExp && c.experienceLevel !== selectedExp) return false;
      if (selectedAvail === "Available" && !c.available) return false;
      if (selectedAvail === "Not Available" && c.available) return false;
      return true;
    });
  }, [search, selectedCity, selectedSkill, selectedRole, selectedExp, selectedAvail]);

  const clearFilters = () => { setSelectedCity(""); setSelectedSkill(""); setSelectedRole(""); setSelectedExp(""); setSelectedAvail(""); };

  return (
    <div className="space-y-4">
      <div className="mb-2"><h2 className="text-lg font-bold text-foreground">Meet Creators</h2><p className="text-xs text-muted-foreground">Discover creators by skill, city, and availability</p></div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, role, or skill..." className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-muted-foreground/40" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2.5 text-sm font-medium transition-colors ${showFilters || hasFilters ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
          <Filter className="h-4 w-4" /><span className="hidden sm:inline">Filters</span>
          {hasFilters && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground">{[selectedCity, selectedSkill, selectedRole, selectedExp, selectedAvail].filter(Boolean).length}</span>}
        </button>
      </div>
      {showFilters && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Filters</p>
            {hasFilters && <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /> Clear all</button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FilterSelect label="City" value={selectedCity} onChange={setSelectedCity} options={directoryFilters.cities} />
            <FilterSelect label="Skill" value={selectedSkill} onChange={setSelectedSkill} options={directoryFilters.skills} />
            <FilterSelect label="Role" value={selectedRole} onChange={setSelectedRole} options={directoryFilters.roles} />
            <FilterSelect label="Experience" value={selectedExp} onChange={setSelectedExp} options={[...directoryFilters.experienceLevels]} />
            <FilterSelect label="Availability" value={selectedAvail} onChange={setSelectedAvail} options={[...directoryFilters.availability]} />
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{filtered.length} creator{filtered.length !== 1 ? "s" : ""} found</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((creator) => <CreatorCard key={creator.id} creator={creator} />)}
      </div>
      {filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-card py-12 text-center">
          <p className="text-sm text-muted-foreground">No creators match your filters</p>
          <button onClick={clearFilters} className="mt-2 text-xs font-semibold text-foreground hover:underline">Clear filters</button>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground outline-none focus:border-muted-foreground/40">
          <option value="">All</option>
          {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

function CreatorCard({ creator }: { creator: DirectoryCreator }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-muted-foreground/30">
      <div className="flex items-start gap-3 mb-3">
        <img src={creator.avatar} alt={creator.name} className="h-11 w-11 rounded-full object-cover" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{creator.name}</p>
          <p className="text-xs text-muted-foreground">{creator.role} · {creator.city}</p>
          <p className="text-xs text-muted-foreground">{creator.experience}</p>
        </div>
        {creator.available ? <span className="shrink-0 rounded-full bg-[hsl(var(--success))] px-2 py-0.5 text-[10px] font-semibold text-background">Available</span> : <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Unavailable</span>}
      </div>
      <p className="text-xs text-secondary-foreground leading-relaxed line-clamp-2 mb-2">{creator.description}</p>
      {creator.notableWork && <p className="text-[10px] font-medium text-[hsl(var(--highlight))] mb-2">🏆 {creator.notableWork}</p>}
      <div className="flex flex-wrap gap-1 mb-3">
        {creator.skills.slice(0, 4).map((s) => <span key={s} className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>)}
      </div>
      <div className="flex gap-2">
        {creator.portfolioUrl && <button onClick={() => window.open(creator.portfolioUrl, "_blank")} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"><ExternalLink className="h-3 w-3" /> Portfolio</button>}
        <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"><UserPlus className="h-3 w-3" /> Connect</button>
      </div>
    </div>
  );
}

export default Community;
