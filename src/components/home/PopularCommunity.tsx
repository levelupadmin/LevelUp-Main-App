import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUp, MessageSquare } from "lucide-react";

// ── Popular in Community ──
// Read moved to react-query (P6-T1) — cached under `["popular-community"]` so a
// Home revisit within staleTime fires zero refetches; pull-to-refresh invalidates
// the key. The query shape is unchanged.
const PopularCommunity = () => {
  const { data: posts = [] } = useQuery({
    queryKey: ["popular-community"],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qna_posts")
        .select("id, title, body, upvote_count, reply_count, created_at, user_id")
        .order("upvote_count", { ascending: false })
        .limit(8);
      if (error) {
        if (import.meta.env.DEV) console.error("Failed to load community posts:", error);
        // Preserve the old behaviour: an error yields no posts (section hides),
        // never a thrown error that would bubble to an ErrorState.
        return [];
      }
      return data ?? [];
    },
  });

  // No posts → no section. Placeholder copy reads as a dead feature.
  if (!posts.length) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Popular in community</h2>
      <div className="flex gap-4 overflow-x-auto snap-x hide-scrollbar pb-2">
        {posts.map((p) => (
          <div
            key={p.id}
            className="min-w-[75vw] sm:min-w-[340px] max-w-[360px] h-[200px] bg-surface border border-border rounded-2xl p-5 card-hover flex-shrink-0 snap-start flex flex-col justify-between"
          >
            <div>
              <h3 className="text-sm font-semibold line-clamp-2">{p.title}</h3>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{p.body}</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
              <span className="flex items-center gap-1"><ArrowUp className="h-3 w-3" /> {p.upvote_count}</span>
              <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {p.reply_count}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default PopularCommunity;
