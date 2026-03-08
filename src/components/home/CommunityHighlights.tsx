import { useNavigate } from "react-router-dom";
import { communityPosts } from "@/data/mockData";
import { ArrowRight } from "lucide-react";

const CommunityHighlights = () => {
  const navigate = useNavigate();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">
          Popular in the <em className="font-light italic">community</em>
        </h2>
        <button
          onClick={() => navigate("/community")}
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {communityPosts.slice(0, 2).map((post) => (
          <div
            key={post.id}
            onClick={() => navigate(`/community/post/${post.id}`)}
            className="cursor-pointer rounded-xl border border-border bg-card p-5 transition-colors hover:border-muted-foreground/20"
          >
            <div className="mb-3 flex items-center gap-3">
              <img src={post.avatar} alt={post.author} className="h-10 w-10 rounded-full object-cover" />
              <div>
                <p className="text-sm font-bold text-foreground">{post.author}</p>
                <p className="text-xs text-muted-foreground">{post.timeAgo}</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-secondary-foreground line-clamp-3">{post.content}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default CommunityHighlights;
