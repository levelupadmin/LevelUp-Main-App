import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

const CommunityHighlights = () => {
  const navigate = useNavigate();

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["community-highlights"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select("id, title, body, created_at, user_id, space_id")
        .order("created_at", { ascending: false })
        .limit(4);
      if (error) throw error;

      // Fetch profiles for authors
      const userIds = [...new Set(data.map((p) => p.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", userIds);

      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

      return data.map((post) => ({
        id: post.id,
        title: post.title,
        body: post.body || "",
        author: profileMap[post.user_id]?.name || "Anonymous",
        avatar: profileMap[post.user_id]?.avatar_url || "/placeholder.svg",
        timeAgo: formatDistanceToNow(new Date(post.created_at), { addSuffix: true }),
      }));
    },
  });

  if (isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-6 w-56" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </section>
    );
  }

  if (posts.length === 0) return null;

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
        {posts.slice(0, 4).map((post) => (
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
            <h3 className="text-sm font-semibold text-foreground line-clamp-1">{post.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-secondary-foreground line-clamp-2">{post.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default CommunityHighlights;
