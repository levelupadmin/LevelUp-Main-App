import { Heart, MessageCircle } from "lucide-react";
import { communityPosts } from "@/data/mockData";

const CommunityHighlights = () => {
  return (
    <div>
      <h2 className="mb-3 px-4 font-display text-lg font-bold text-foreground">Community</h2>
      <div className="space-y-3 px-4">
        {communityPosts.slice(0, 2).map((post) => (
          <div key={post.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="mb-2 flex items-center gap-3">
              <img src={post.avatar} alt={post.author} className="h-8 w-8 rounded-full object-cover" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{post.author}</p>
                <p className="text-xs text-muted-foreground">{post.authorLevel} · {post.timeAgo}</p>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                {post.tag}
              </span>
            </div>
            <p className="text-sm text-foreground/90">{post.content}</p>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <button className="flex items-center gap-1 transition-colors hover:text-primary">
                <Heart className="h-3.5 w-3.5" /> {post.likes}
              </button>
              <button className="flex items-center gap-1 transition-colors hover:text-primary">
                <MessageCircle className="h-3.5 w-3.5" /> {post.comments}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommunityHighlights;
