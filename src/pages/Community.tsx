import AppShell from "@/components/layout/AppShell";
import { communityPosts } from "@/data/mockData";
import { MessageCircle, Plus, TrendingUp, Hash, MessageSquare, HelpCircle, Calendar, Users, Award } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const spaces = [
  { id: "all", label: "All Posts", icon: Hash },
  { id: "show-tell", label: "Show & Tell", icon: Award },
  { id: "feedback", label: "Feedback", icon: MessageSquare },
  { id: "collaboration", label: "Collaboration", icon: Users },
  { id: "qa", label: "Q&A", icon: HelpCircle },
  { id: "events", label: "Events", icon: Calendar },
];

const Community = () => {
  const [activeSpace, setActiveSpace] = useState("all");
  const navigate = useNavigate();

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-3.5rem)]">
        {/* Spaces sidebar - Desktop */}
        <aside className="hidden w-56 shrink-0 border-r border-border bg-sidebar lg:block">
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Spaces</h2>
              <button className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <nav className="space-y-0.5">
              {spaces.map((space) => {
                const Icon = space.icon;
                const active = activeSpace === space.id;
                return (
                  <button
                    key={space.id}
                    onClick={() => setActiveSpace(space.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {space.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Directory link */}
          <div className="border-t border-border p-4">
            <button
              onClick={() => navigate("/community/directory")}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Users className="h-4 w-4" />
              Creator Directory
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl p-4 lg:p-6">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Community</h1>
                <p className="text-sm text-muted-foreground">Connect with fellow creators</p>
              </div>
              <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New Post</span>
              </button>
            </div>

            {/* Trending */}
            <div className="mb-5 rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-foreground" />
                <span className="font-semibold text-foreground">Trending:</span>
                <span className="text-foreground">#GoldenHourChallenge</span>
                <span className="text-muted-foreground">· 89 posts today</span>
              </div>
            </div>

            {/* Mobile space tabs */}
            <div className="mb-5 flex gap-2 overflow-x-auto hide-scrollbar lg:hidden">
              {spaces.map((space) => (
                <button
                  key={space.id}
                  onClick={() => setActiveSpace(space.id)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeSpace === space.id
                      ? "bg-foreground text-background"
                      : "bg-accent text-secondary-foreground"
                  }`}
                >
                  {space.label}
                </button>
              ))}
            </div>

            {/* Posts */}
            <div className="space-y-3">
              {communityPosts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-muted-foreground/20 cursor-pointer"
                  onClick={() => navigate(`/community/post/${post.id}`)}
                >
                  <div className="mb-3 flex items-center gap-3">
                    <img src={post.avatar} alt={post.author} className="h-10 w-10 rounded-full object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">{post.author}</p>
                      <p className="text-xs text-muted-foreground">
                        {post.authorLevel} · {post.timeAgo}
                      </p>
                    </div>
                    <span className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                      {post.tag}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-secondary-foreground">{post.content}</p>
                  <div className="mt-3 flex items-center gap-5 border-t border-border pt-3 text-muted-foreground">
                    <button className="flex items-center gap-1.5 text-xs transition-colors hover:text-foreground">
                      ♡ {post.likes}
                    </button>
                    <button className="flex items-center gap-1.5 text-xs transition-colors hover:text-foreground">
                      <MessageCircle className="h-3.5 w-3.5" /> {post.comments}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default Community;
