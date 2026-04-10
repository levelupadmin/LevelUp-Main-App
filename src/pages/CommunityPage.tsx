import { useEffect, useState, useCallback } from "react";
import StudentLayout from "@/components/layout/StudentLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import usePageTitle from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import InitialsAvatar from "@/components/InitialsAvatar";
import { Heart, MessageCircle, Pin, Send, Loader2, BellOff, Bell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

interface Post {
  id: string;
  content_text: string;
  user_id: string;
  is_pinned: boolean;
  is_admin_post: boolean;
  created_at: string;
  user_name: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

const CommunityPage = () => {
  usePageTitle("Community");
  const { user, profile } = useAuth();
  const { toast: showToast } = useToast();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState("");
  const [posting, setPosting] = useState(false);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, { id: string; comment_text: string; user_name: string; created_at: string }[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentLoading, setCommentLoading] = useState(false);

  // Muted threads — stored in localStorage so muted state persists
  const [mutedThreads, setMutedThreads] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("muted_threads");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const toggleMute = (postId: string) => {
    setMutedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      localStorage.setItem("muted_threads", JSON.stringify([...next]));
      return next;
    });
  };

  const isThreadMuted = (postId: string) => mutedThreads.has(postId);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const { data: postsData } = await supabase
      .from("community_posts")
      .select("id, content_text, user_id, is_pinned, is_admin_post, created_at")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (!postsData) { setLoading(false); return; }

    // Get user names
    const userIds = [...new Set(postsData.map((p) => p.user_id))];
    const { data: users } = await supabase.from("users").select("id, full_name").in("id", userIds);
    const userMap = Object.fromEntries((users || []).map((u) => [u.id, u.full_name || "Anonymous"]));

    // Get like & comment counts
    const postIds = postsData.map((p) => p.id);
    const [likesRes, commentsRes, myLikesRes] = await Promise.all([
      supabase.from("community_post_likes").select("post_id").in("post_id", postIds),
      supabase.from("community_post_comments").select("post_id").in("post_id", postIds),
      user ? supabase.from("community_post_likes").select("post_id").in("post_id", postIds).eq("user_id", user.id) : Promise.resolve({ data: [] }),
    ]);

    const likeCounts: Record<string, number> = {};
    (likesRes.data || []).forEach((l) => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; });
    const commentCounts: Record<string, number> = {};
    (commentsRes.data || []).forEach((c) => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });
    const myLikes = new Set((myLikesRes.data || []).map((l) => l.post_id));

    setPosts(postsData.map((p) => ({
      ...p,
      user_name: userMap[p.user_id] || "Anonymous",
      like_count: likeCounts[p.id] || 0,
      comment_count: commentCounts[p.id] || 0,
      liked_by_me: myLikes.has(p.id),
    })));
    setLoading(false);
  }, [user]);

  const { isRefreshing, pullProgress, pullDistance } = usePullToRefresh({
    onRefresh: async () => { await loadPosts(); },
  });

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handlePost = async () => {
    if (!newPost.trim() || !user) return;
    setPosting(true);
    const { error } = await supabase.from("community_posts").insert({
      content_text: newPost.trim(),
      user_id: user.id,
      is_admin_post: profile?.role === "admin",
    });
    if (error) {
      showToast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewPost("");
      loadPosts();
      toast.success("Post shared");
    }
    setPosting(false);
  };

  const toggleLike = async (postId: string, liked: boolean) => {
    if (!user) return;
    if (liked) {
      await supabase.from("community_post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
    } else {
      await supabase.from("community_post_likes").insert({ post_id: postId, user_id: user.id });
    }
    setPosts((prev) => prev.map((p) =>
      p.id === postId
        ? { ...p, liked_by_me: !liked, like_count: p.like_count + (liked ? -1 : 1) }
        : p
    ));
  };

  const fetchComments = async (postId: string) => {
    const { data } = await supabase
      .from("community_post_comments")
      .select("id, comment_text, user_id, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (data) {
      const uids = [...new Set(data.map((c) => c.user_id))];
      const { data: users } = await supabase.from("users").select("id, full_name").in("id", uids);
      const uMap = Object.fromEntries((users || []).map((u) => [u.id, u.full_name || "Anonymous"]));
      setComments((prev) => ({
        ...prev,
        [postId]: data.map((c) => ({ ...c, user_name: uMap[c.user_id] || "Anonymous" })),
      }));
    }
  };

  const toggleComments = async (postId: string) => {
    if (expandedPost === postId) { setExpandedPost(null); return; }
    setExpandedPost(postId);
    await fetchComments(postId);
  };

  const handleComment = async (postId: string) => {
    const draft = (commentDrafts[postId] || "").trim();
    if (!draft || !user) return;
    setCommentLoading(true);
    const { error } = await supabase.from("community_post_comments").insert({
      post_id: postId,
      comment_text: draft,
      user_id: user.id,
    });
    if (error) {
      showToast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Notify the post author about the reply (skip if commenting on own post or thread is muted)
      const post = posts.find((p) => p.id === postId);
      if (post && post.user_id !== user.id && !isThreadMuted(postId)) {
        await (supabase as any).from("notifications").insert({
          user_id: post.user_id,
          type: "community_reply",
          title: "New comment on your post",
          body: draft.slice(0, 100),
          link: "/community",
        });
      }

      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
      await fetchComments(postId);
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p));
      toast.success("Comment added");
    }
    setCommentLoading(false);
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <StudentLayout title="Community">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Pull-to-refresh indicator */}
        {(pullDistance > 0 || isRefreshing) && (
          <div className="flex justify-center" style={{ height: pullDistance > 0 ? pullDistance : 40 }}>
            <Loader2
              className="h-5 w-5 text-muted-foreground"
              style={{
                opacity: isRefreshing ? 1 : pullProgress,
                transform: `rotate(${pullProgress * 360}deg)`,
                animation: isRefreshing ? "spin 1s linear infinite" : "none",
              }}
            />
          </div>
        )}
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-semibold leading-tight">Community</h1>
          <p className="text-base text-muted-foreground mt-1">Connect with fellow creators</p>
        </div>

        {/* New post */}
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <Textarea
            placeholder="Share something with the community..."
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            rows={3}
            className="bg-surface-2 border-border resize-none"
          />
          <div className="flex justify-end">
            <Button
              onClick={handlePost}
              disabled={posting || !newPost.trim()}
              size="sm"
              className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Post
            </Button>
          </div>
        </div>

        {/* Posts */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-4 space-y-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-surface-2 flex-shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 bg-surface-2 rounded w-28" />
                    <div className="h-2 bg-surface-2 rounded w-16" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-surface-2 rounded w-full" />
                  <div className="h-3 bg-surface-2 rounded w-5/6" />
                  <div className="h-3 bg-surface-2 rounded w-2/3" />
                </div>
                <div className="flex items-center gap-4 pt-1">
                  <div className="h-3 bg-surface-2 rounded w-10" />
                  <div className="h-3 bg-surface-2 rounded w-10" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium text-foreground mb-1">No posts yet — be the first!</p>
            <p className="text-muted-foreground text-sm">Share a thought, your work, or start a conversation.</p>
            <button
              onClick={() => {
                const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Share something with the community..."]');
                if (textarea) { textarea.focus(); textarea.scrollIntoView({ behavior: "smooth", block: "center" }); }
              }}
              className="mt-4 px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
            >
              <Send className="h-4 w-4" /> Write a Post
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <div key={post.id} className="bg-surface border border-border rounded-xl p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <InitialsAvatar name={post.user_name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{post.user_name}</span>
                      {post.is_admin_post && (
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))]">
                          Admin
                        </span>
                      )}
                      {post.is_pinned && <Pin className="h-3 w-3 text-[hsl(var(--cream))]" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</span>
                  </div>
                </div>

                {/* Content */}
                <p className="text-sm text-foreground whitespace-pre-line">{post.content_text}</p>

                {/* Actions */}
                <div className="flex items-center gap-4 pt-1">
                  <button
                    onClick={() => toggleLike(post.id, post.liked_by_me)}
                    className={`flex items-center gap-1.5 text-xs transition-colors ${
                      post.liked_by_me ? "text-red-400" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${post.liked_by_me ? "fill-current heart-bounce" : ""}`} />
                    {post.like_count > 0 && post.like_count}
                  </button>
                  <button
                    onClick={() => toggleComments(post.id)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {post.comment_count > 0 && post.comment_count}
                  </button>
                  {user && post.user_id === user.id && (
                    <button
                      onClick={() => toggleMute(post.id)}
                      className={`flex items-center gap-1.5 text-xs transition-colors ${
                        isThreadMuted(post.id) ? "text-amber-400" : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={isThreadMuted(post.id) ? "Unmute this thread" : "Mute this thread"}
                    >
                      {isThreadMuted(post.id) ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                      {isThreadMuted(post.id) ? "Muted" : "Mute"}
                    </button>
                  )}
                </div>

                {/* Comments */}
                {expandedPost === post.id && (
                  <div className="pt-2 border-t border-border space-y-3">
                    {(comments[post.id] || []).map((c) => (
                      <div key={c.id} className="flex gap-2">
                        <InitialsAvatar name={c.user_name} size={24} />
                        <div>
                          <span className="text-xs font-medium">{c.user_name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{timeAgo(c.created_at)}</span>
                          <p className="text-sm text-muted-foreground">{c.comment_text}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Write a comment..."
                        value={commentDrafts[post.id] || ""}
                        onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                        rows={1}
                        className="text-sm bg-surface-2 border-border resize-none flex-1"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleComment(post.id)}
                        disabled={commentLoading || !(commentDrafts[post.id] || "").trim()}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default CommunityPage;
