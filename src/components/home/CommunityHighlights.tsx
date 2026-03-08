import { Heart, MessageCircle, ArrowRight } from "lucide-react";
import { communityPosts } from "@/data/mockData";
import { useNavigate } from "react-router-dom";

const CommunityHighlights = () => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Community</h2>
        <button
          onClick={() => navigate("/community")}
          className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          View all <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {communityPosts.slice(0, 2).map((post) => (
          <div key={post.id} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-3">
              <img src={post.avatar} alt={post.author} className="h-8 w-8 rounded-full object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{post.author}</p>
                <p className="text-xs text-muted-foreground">{post.authorLevel} · {post.timeAgo}</p>
              </div>
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                {post.tag}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/90 line-clamp-2">{post.content}</p>
            <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
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
