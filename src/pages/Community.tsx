import AppShell from "@/components/layout/AppShell";
import { communityPosts } from "@/data/mockData";
import { Heart, MessageCircle, Plus, TrendingUp } from "lucide-react";
import { useState } from "react";

const spaces = ["All", "Show & Tell", "Feedback", "Collaboration", "Q&A", "Events"];

const Community = () => {
  const [activeSpace, setActiveSpace] = useState("All");

  return (
    <AppShell>
      <div className="space-y-5 py-4">
        <div className="flex items-center justify-between px-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Community</h1>
            <p className="text-sm text-muted-foreground">Connect with fellow creators</p>
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-full gradient-primary text-primary-foreground shadow-glow">
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {/* Trending */}
        <div className="mx-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-primary">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-semibold">Trending:</span>
            <span className="text-xs text-foreground">#GoldenHourChallenge</span>
            <span className="text-xs text-muted-foreground">· 89 posts today</span>
          </div>
        </div>

        {/* Spaces */}
        <div className="flex gap-2 overflow-x-auto px-4 hide-scrollbar">
          {spaces.map((space) => (
            <button
              key={space}
              onClick={() => setActiveSpace(space)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeSpace === space
                  ? "gradient-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {space}
            </button>
          ))}
        </div>

        {/* Posts */}
        <div className="space-y-3 px-4">
          {communityPosts.map((post) => (
            <div key={post.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="mb-3 flex items-center gap-3">
                <img src={post.avatar} alt={post.author} className="h-10 w-10 rounded-full object-cover" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{post.author}</p>
                  <p className="text-xs text-muted-foreground">
                    {post.authorLevel} · {post.timeAgo}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  {post.tag}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{post.content}</p>
              <div className="mt-3 flex items-center gap-5 border-t border-border pt-3 text-muted-foreground">
                <button className="flex items-center gap-1.5 text-xs transition-colors hover:text-primary">
                  <Heart className="h-4 w-4" /> {post.likes}
                </button>
                <button className="flex items-center gap-1.5 text-xs transition-colors hover:text-primary">
                  <MessageCircle className="h-4 w-4" /> {post.comments}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
};

export default Community;
