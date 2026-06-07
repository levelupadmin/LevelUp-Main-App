import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUp, MessageSquare } from "lucide-react";

// ── Popular in Community ──
const PopularCommunity = () => {
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("qna_posts")
      .select("id, title, body, upvote_count, reply_count, created_at, user_id")
      .order("upvote_count", { ascending: false })
      .limit(8)
      .then(({ data, error }) => {
        if (error) {
          if (import.meta.env.DEV) console.error("Failed to load community posts:", error);
          return;
        }
        setPosts(data ?? []);
      });
  }, []);

  if (!posts.length) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-4">Popular in Community</h2>
        <p className="text-sm text-muted-foreground">The community feed is warming up — check back soon.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Popular in Community</h2>
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
