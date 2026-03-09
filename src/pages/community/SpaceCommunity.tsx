import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, Users, Heart, MessageCircle, Send, Plus } from "lucide-react";
import { useSpace, usePosts, useCreatePost, useToggleLike } from "@/hooks/useCommunity";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

interface SpaceCommunityProps {
  type: "city" | "skill";
}

const SpaceCommunity = ({ type }: SpaceCommunityProps) => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [composerOpen, setComposerOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");

  const { data: space, isLoading: spaceLoading } = useSpace(slug || "");
  const { data: posts = [], isLoading: postsLoading } = usePosts(space?.id);
  const createPost = useCreatePost();
  const toggleLike = useToggleLike();

  const handleCreatePost = () => {
    if (!postTitle.trim() || !space) return;
    createPost.mutate(
      { spaceId: space.id, title: postTitle.trim(), body: postBody.trim() || undefined },
      {
        onSuccess: () => {
          setPostTitle("");
          setPostBody("");
          setComposerOpen(false);
        },
      }
    );
  };

  if (spaceLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!space) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Community not found</p>
            <button onClick={() => navigate("/community")} className="mt-3 text-sm font-semibold text-foreground hover:underline">← Back</button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        {/* Header */}
        <div>
          <button onClick={() => navigate("/community")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Community
          </button>
          <div className="flex items-center gap-3">
            {space.icon && <span className="text-2xl">{space.icon}</span>}
            <div>
              <h1 className="text-lg font-bold text-foreground">{space.name}</h1>
              {space.description && <p className="text-xs text-muted-foreground">{space.description}</p>}
            </div>
          </div>
        </div>

        {/* Composer */}
        {!composerOpen ? (
          <button
            onClick={() => setComposerOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:border-muted-foreground/30 transition-colors"
          >
            <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center text-sm font-bold text-foreground">
              {(user?.name || "U").charAt(0)}
            </div>
            <span className="flex-1 text-sm text-muted-foreground">Share something with the community...</span>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </button>
        ) : (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Input
              value={postTitle}
              onChange={(e) => setPostTitle(e.target.value)}
              placeholder="Post title"
              className="text-sm font-medium"
            />
            <Textarea
              value={postBody}
              onChange={(e) => setPostBody(e.target.value)}
              placeholder="Write your post (optional)..."
              className="min-h-[80px] resize-none text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setComposerOpen(false); setPostTitle(""); setPostBody(""); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!postTitle.trim() || createPost.isPending}
                onClick={handleCreatePost}
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                {createPost.isPending ? "Posting…" : "Post"}
              </Button>
            </div>
          </div>
        )}

        {/* Posts */}
        {postsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No posts yet</p>
            <p className="text-xs text-muted-foreground mt-1">Be the first to share something!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <div key={post.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  onClick={() => navigate(`/community/post/${post.id}`)}
                  className="w-full p-4 text-left hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    {post.author_avatar ? (
                      <img src={post.author_avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-foreground">
                        {(post.author_name || "U").charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-foreground">{post.author_name}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</p>
                    </div>
                  </div>
                  <h3 className="text-sm font-bold text-foreground">{post.title}</h3>
                  {post.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{post.body}</p>}
                </button>
                {post.image_url && <img src={post.image_url} alt="" className="w-full max-h-64 object-cover" />}
                <div className="flex items-center gap-1 border-t border-border px-4 py-2">
                  <button
                    onClick={() => toggleLike.mutate({ postId: post.id, hasLiked: post.has_liked || false })}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${post.has_liked ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Heart className={`h-3.5 w-3.5 ${post.has_liked ? "fill-current" : ""}`} /> {post.like_count || 0}
                  </button>
                  <button
                    onClick={() => navigate(`/community/post/${post.id}`)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> {post.comment_count || 0}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default SpaceCommunity;
