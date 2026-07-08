import { useEffect, useState, useCallback, useRef } from "react";
import { LayoutGroup, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import usePageTitle from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MotionButton } from "@/components/motion/MotionButton";
import { SurfaceCard } from "@/components/patterns/SurfaceCard";
import ErrorState from "@/components/patterns/ErrorState";
import InitialsAvatar from "@/components/InitialsAvatar";
import { Heart, MessageCircle, Pin, Send, Loader2, BellOff, Bell, Users, Globe, MessageSquare } from "lucide-react";
import { useActiveCohort } from "@/hooks/useActiveCohort";
import { useToast } from "@/hooks/use-toast";
import { toast } from "@/lib/toast";
import PullIndicator from "@/components/patterns/PullIndicator";
import PostSkeleton from "@/components/skeletons/PostSkeleton";
import PeerReviewBoard from "@/components/cohort/PeerReviewBoard";
import { useMotionSafe } from "@/lib/motion";
import { tapTick, confirm } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface Post {
  id: string;
  content_text: string;
  user_id: string;
  is_pinned: boolean;
  is_admin_post: boolean;
  created_at: string;
  cohort_batch_id?: string | null;
  post_type?: string;
  user_name: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

type FeedScope = "everyone" | "my_cohort" | "peer_review";

// Segmented feed-scope tabs — rebuilt on Learn's LayoutGroup pill pattern.
const SCOPES: { key: FeedScope; label: string; Icon: typeof Globe }[] = [
  { key: "everyone", label: "Everyone", Icon: Globe },
  { key: "my_cohort", label: "My Cohort", Icon: Users },
  { key: "peer_review", label: "Peer Reviews", Icon: MessageSquare },
];

const CommunityPage = () => {
  usePageTitle("Community");
  const { user, profile } = useAuth();
  const { toast: showToast } = useToast();
  const motionSafe = useMotionSafe();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPost, setNewPost] = useState("");
  const [posting, setPosting] = useState(false);
  const [scope, setScope] = useState<FeedScope>("everyone");
  const { offeringId: activeCohortId } = useActiveCohort();
  // Resolve the user's cohort batch id (for filtering + tagging new posts).
  const [myBatchId, setMyBatchId] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id || !activeCohortId) { setMyBatchId(null); return; }
    (async () => {
      const { data } = await supabase
        .from("cohort_batch_members")
        .select("batch_id, enrolments:enrolment_id (offering_id, user_id)")
        .eq("enrolments.user_id", user.id);
      const match = (data || []).find((m: any) => m.enrolments?.offering_id === activeCohortId);
      setMyBatchId(match?.batch_id ?? null);
    })();
  }, [user?.id, activeCohortId]);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, { id: string; comment_text: string; user_name: string; created_at: string }[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentLoading, setCommentLoading] = useState(false);

  // Composer: ref for prompt-chip focus/prefill (no DOM lookups), and a
  // focus flag driving the lift choreography (scale + border + shadow).
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const canPost = newPost.trim().length > 0;

  // Roving-tabindex focus management for the scope tabs, mirroring Learn's
  // segmented control: only the active tab is tabbable, arrows/Home/End move
  // both selection and DOM focus per the WAI-ARIA tabs pattern.
  const scopeTabRefs = useRef<Record<FeedScope, HTMLButtonElement | null>>({
    everyone: null,
    my_cohort: null,
    peer_review: null,
  });
  const changeScope = (k: FeedScope) => {
    if (k === scope) return;
    void tapTick();
    setScope(k);
  };
  const focusScope = (k: FeedScope) => {
    changeScope(k);
    scopeTabRefs.current[k]?.focus();
  };
  const onScopeKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = SCOPES.findIndex((s) => s.key === scope);
    let next: FeedScope | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = SCOPES[(i + 1) % SCOPES.length].key;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = SCOPES[(i - 1 + SCOPES.length) % SCOPES.length].key;
        break;
      case "Home":
        next = SCOPES[0].key;
        break;
      case "End":
        next = SCOPES[SCOPES.length - 1].key;
        break;
      default:
        return;
    }
    e.preventDefault();
    focusScope(next);
  };

  // Muted threads, stored in localStorage so muted state persists
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
    setError(null);
    try {
      let query = supabase
        .from("community_posts")
        .select("id, content_text, user_id, is_pinned, is_admin_post, created_at, cohort_batch_id, post_type")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (scope === "my_cohort" && myBatchId) {
        query = query.eq("cohort_batch_id", myBatchId);
      }
      const { data: postsData, error: postsError } = await query;

      if (postsError) throw postsError;
      if (!postsData) { setPosts([]); setLoading(false); return; }

      // Get user names. Uses the public_user_profiles view (not the
      // users table directly) because the users RLS policy restricts
      // non-admins to reading their OWN row, so authenticated peers need
      // the view to see each other's names. The view exposes only
      // id/full_name/avatar_url/member_number/occupation; email, phone,
      // bio and city are never returned through this path.
      const userIds = [...new Set(postsData.map((p) => p.user_id))];
      const { data: users } = await supabase
        .from("public_user_profiles" as any)
        .select("id, full_name")
        .in("id", userIds);
      const userMap = Object.fromEntries(((users as any[]) || []).map((u: any) => [u.id, u.full_name || "Anonymous"]));

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
    } catch (err) {
      if (import.meta.env.DEV) console.error("Failed to load community posts:", err);
      setError("We couldn't load this. Check your connection and try again.");
      setLoading(false);
    }
  }, [user, scope, myBatchId]);

  const handleRefresh = useCallback(async () => { await loadPosts(); }, [loadPosts]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handlePost = async () => {
    if (!newPost.trim() || !user) return;
    void tapTick();
    setPosting(true);
    const { error } = await supabase.from("community_posts").insert({
      content_text: newPost.trim(),
      user_id: user.id,
      is_admin_post: profile?.role === "admin",
      cohort_batch_id: scope === "my_cohort" ? myBatchId : null,
    });
    if (error) {
      showToast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewPost("");
      loadPosts();
      void confirm(true);
      toast.success("Post shared");
    }
    setPosting(false);
  };

  const toggleLike = async (postId: string, liked: boolean) => {
    if (!user) return;
    // Optimistic update
    setPosts((prev) => prev.map((p) =>
      p.id === postId
        ? { ...p, liked_by_me: !liked, like_count: p.like_count + (liked ? -1 : 1) }
        : p
    ));
    const { error } = liked
      ? await supabase.from("community_post_likes").delete().eq("post_id", postId).eq("user_id", user.id)
      : await supabase.from("community_post_likes").insert({ post_id: postId, user_id: user.id });
    if (error) {
      // Revert optimistic update
      setPosts((prev) => prev.map((p) =>
        p.id === postId
          ? { ...p, liked_by_me: liked, like_count: p.like_count + (liked ? 1 : -1) }
          : p
      ));
      toast.error("Failed to update like");
    }
  };

  const fetchComments = async (postId: string) => {
    const { data } = await supabase
      .from("community_post_comments")
      .select("id, comment_text, user_id, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (data) {
      const uids = [...new Set(data.map((c) => c.user_id))];
      // public_user_profiles view, see comment in loadPosts above.
      const { data: users } = await supabase
        .from("public_user_profiles" as any)
        .select("id, full_name")
        .in("id", uids);
      const uMap = Object.fromEntries(((users as any[]) || []).map((u: any) => [u.id, u.full_name || "Anonymous"]));
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
      // Post-author reply notification is created server-side by the
      // community_comment_notify trigger (a client insert for another
      // user's notification is rejected by RLS for non-admins).
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

  // Prompt-chip tap: prefill the composer state and focus it via ref (replaces
  // the old textarea DOM-lookup hack).
  const fillComposerPrompt = (prompt: string) => {
    setNewPost(prompt + ": ");
    const el = composerRef.current;
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      requestAnimationFrame(() => {
        el.setSelectionRange(el.value.length, el.value.length);
      });
    }
  };

  return (
    <>
      {/* Pull-to-refresh: branded node-mark indicator (overlays the top of the
          content, never reflows it). Always mounted so the release spring plays. */}
      <PullIndicator onRefresh={handleRefresh} />
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Editorial hero matching Home + Browse + Events cinematic voice. */}
        <div className="space-y-3">
          <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
            Fellow creators
          </p>
          <h1 className="text-[36px] sm:text-5xl font-bold tracking-[-0.02em] leading-[1.05]">
            Talk to <span className="font-serif-italic text-cream">your</span> people
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-[52ch]">
            Ask questions, share your work, find a collaborator. The community knows things the masterclass can't teach you.
          </p>
        </div>

        {/* Scope toggle, only when user has an active cohort. Segmented tabs with
            a cream layoutId pill that glides between segments (Learn's pattern). */}
        {myBatchId && (
          <div
            role="tablist"
            aria-label="Community feed scope"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1 w-fit"
          >
            <LayoutGroup id="community-scope">
              {SCOPES.map((s) => {
                const active = scope === s.key;
                return (
                  <button
                    key={s.key}
                    ref={(el) => { scopeTabRefs.current[s.key] = el; }}
                    id={`community-tab-${s.key}`}
                    role="tab"
                    aria-selected={active}
                    aria-controls="community-tabpanel"
                    tabIndex={active ? 0 : -1}
                    onKeyDown={onScopeKeyDown}
                    onClick={() => changeScope(s.key)}
                    className={cn(
                      // The BUTTON is the tap target: min-h-11 (44px) hit area,
                      // independent of the compact visual pill nested inside.
                      "relative inline-flex min-h-11 items-center justify-center rounded-full text-xs font-medium",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                      active
                        ? "text-[hsl(var(--cream-text))]"
                        : "text-muted-foreground [@media(hover:hover)]:hover:text-foreground",
                    )}
                  >
                    <span className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
                      {/* Sliding active pill — cream family per accent discipline.
                          Shared layoutId glides it between segments on the glide
                          spring (instant under reduced motion). */}
                      {active && (
                        <motion.span
                          layoutId="community-scope-pill"
                          className="absolute inset-0 rounded-full bg-[hsl(var(--cream))]"
                          transition={motionSafe.springs.glide}
                        />
                      )}
                      <s.Icon className="relative z-10 h-3 w-3" />
                      <span className="relative z-10">{s.label}</span>
                    </span>
                  </button>
                );
              })}
            </LayoutGroup>
          </div>
        )}

        <div
          id="community-tabpanel"
          role={myBatchId ? "tabpanel" : undefined}
          aria-labelledby={myBatchId ? `community-tab-${scope}` : undefined}
          className="space-y-6"
        >
          {/* Peer review board (replaces post composer + feed when active) */}
          {scope === "peer_review" && myBatchId && user?.id ? (
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-start gap-3 mb-4 pb-3 border-b border-border">
                <MessageSquare className="h-5 w-5 text-cream mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Peer review board</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cohort-mates' assignments where they've opted in to peer feedback. Click any
                    card to open the critique drawer. Your review is private to them.
                  </p>
                </div>
              </div>
              <PeerReviewBoard cohortBatchId={myBatchId} currentUserId={user.id} />
            </div>
          ) : (
          <>
          {/* New post — composer lifts on focus (scale + border-hover + shadow). */}
          <motion.div
            animate={{ scale: composerFocused ? 1.01 : 1 }}
            transition={motionSafe.springs.glide}
            className={cn(
              "rounded-xl border p-4 space-y-3 transition-colors",
              composerFocused
                ? "bg-surface border-[hsl(var(--border-hover))] shadow-design-md"
                : "bg-surface border-border",
            )}
          >
            <Textarea
              ref={composerRef}
              placeholder={scope === "my_cohort" ? "Share with your cohort…" : "Share something with the community..."}
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              rows={3}
              className="bg-surface-2 border-border resize-none focus-visible:ring-cream/60 focus-visible:ring-offset-canvas"
            />
            <div className="flex justify-end">
              <Button
                onClick={handlePost}
                disabled={posting || !canPost}
                size="sm"
                variant={canPost ? "champagne" : "secondary"}
                className="min-h-[44px]"
              >
                {posting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Post
              </Button>
            </div>
          </motion.div>

          {/* Posts */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <PostSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <ErrorState onRetry={() => loadPosts()} description={error} />
          ) : posts.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-lg font-medium text-foreground mb-1">No posts yet, be the first!</p>
              <p className="text-muted-foreground text-sm mb-5">Not sure where to start? Pick a prompt:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "Share your latest work",
                  "Ask for feedback",
                  "Introduce yourself",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => fillComposerPrompt(prompt)}
                    className="px-4 py-2 rounded-full border border-border bg-surface text-sm text-foreground [@media(hover:hover)]:hover:border-cream [@media(hover:hover)]:hover:bg-surface-2 transition-colors min-h-[44px]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // First-page entrance: posts rise in with an incremental stagger.
            // Keyed elements only animate on mount, so refresh/like never re-runs it.
            <div className="space-y-4 anim-stagger">
              {posts.map((post) => (
                <SurfaceCard key={post.id} variant="static" padding="md" className="space-y-3">
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

                  {/* Actions — ≥44px press targets with the snap-press spring. */}
                  <div className="flex items-center gap-4 pt-1">
                    <MotionButton
                      aria-label="Like post"
                      onClick={() => toggleLike(post.id, post.liked_by_me)}
                      className={cn(
                        "flex items-center gap-1.5 text-xs min-h-[44px] transition-colors",
                        post.liked_by_me
                          ? "text-[hsl(var(--accent-crimson))]"
                          : "text-muted-foreground [@media(hover:hover)]:hover:text-foreground",
                      )}
                    >
                      <Heart className={cn("h-4 w-4", post.liked_by_me && "fill-current heart-bounce")} />
                      {post.like_count > 0 && post.like_count}
                    </MotionButton>
                    <MotionButton
                      aria-label="Toggle comments"
                      onClick={() => toggleComments(post.id)}
                      className="flex items-center gap-1.5 text-xs min-h-[44px] text-muted-foreground [@media(hover:hover)]:hover:text-foreground transition-colors"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {post.comment_count > 0 && post.comment_count}
                    </MotionButton>
                    {user && post.user_id === user.id && (
                      <MotionButton
                        onClick={() => toggleMute(post.id)}
                        className="flex items-center gap-1.5 text-xs min-h-[44px] text-muted-foreground [@media(hover:hover)]:hover:text-foreground transition-colors"
                        title={isThreadMuted(post.id) ? "Unmute this thread" : "Mute this thread"}
                      >
                        {isThreadMuted(post.id) ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                        {isThreadMuted(post.id) ? "Muted" : "Mute"}
                      </MotionButton>
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
                          aria-label="Send comment"
                          onClick={() => handleComment(post.id)}
                          disabled={commentLoading || !(commentDrafts[post.id] || "").trim()}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </SurfaceCard>
              ))}
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </>
  );
};

export default CommunityPage;
