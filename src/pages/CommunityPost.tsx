import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePostComments, useCreateComment, useToggleLike, usePosts } from "@/hooks/useCommunity";
import { ArrowLeft, Heart, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const CommunityPost = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [commentText, setCommentText] = useState("");

  // Get all posts to find this one (or could make a single-post hook)
  const { data: posts = [], isLoading: postsLoading } = usePosts();
  const post = posts.find((p) => p.id === id);

  const { data: comments = [], isLoading: commentsLoading } = usePostComments(id || "");
  const createComment = useCreateComment();
  const toggleLike = useToggleLike();

  const handleComment = () => {
    if (!commentText.trim() || !id) return;
    createComment.mutate(
      { postId: id, content: commentText.trim() },
      { onSuccess: () => setCommentText("") }
    );
  };

  if (postsLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!post) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <p className="text-muted-foreground">Post not found</p>
          <Button variant="ghost" size="sm" onClick={() => navigate("/community")}>← Back to community</Button>
        </div>
      </AppShell>
    );
  }

  const topLevelComments = comments.filter((c) => !c.parent_id);
  const replies = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        {/* Back */}
        <button onClick={() => navigate("/community")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* Post */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-5">
            <div className="flex items-center gap-3 mb-3">
              {post.author_avatar ? (
                <img src={post.author_avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center text-sm font-bold text-foreground">
                  {(post.author_name || "U").charAt(0)}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">{post.author_name}</p>
                <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</p>
              </div>
            </div>
            <h1 className="text-lg font-bold text-foreground mb-2">{post.title}</h1>
            {post.body && <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{post.body}</p>}
          </div>
          {post.image_url && <img src={post.image_url} alt="" className="w-full max-h-96 object-cover" />}
          <div className="flex items-center gap-1 border-t border-border px-4 py-2">
            <button
              onClick={() => toggleLike.mutate({ postId: post.id, hasLiked: post.has_liked || false })}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${post.has_liked ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Heart className={`h-3.5 w-3.5 ${post.has_liked ? "fill-current" : ""}`} /> {post.like_count || 0}
            </button>
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5" /> {post.comment_count || 0}
            </span>
          </div>
        </div>

        {/* Comment composer */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Write a comment..."
            className="min-h-[60px] resize-none bg-background text-sm"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!commentText.trim() || createComment.isPending}
              onClick={handleComment}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {createComment.isPending ? "Posting…" : "Comment"}
            </Button>
          </div>
        </div>

        {/* Comments */}
        {commentsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {topLevelComments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} replies={replies(comment.id)} postId={post.id} />
            ))}
            {topLevelComments.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">No comments yet. Be the first!</p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
};

function CommentItem({ comment, replies, postId }: { comment: any; replies: any[]; postId: string }) {
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);
  const createComment = useCreateComment();

  const handleReply = () => {
    if (!replyText.trim()) return;
    createComment.mutate(
      { postId, content: replyText.trim(), parentId: comment.id },
      { onSuccess: () => { setReplyText(""); setShowReply(false); } }
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex gap-2.5">
        {comment.author_avatar ? (
          <img src={comment.author_avatar} alt="" className="h-7 w-7 rounded-full object-cover mt-0.5" />
        ) : (
          <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-foreground mt-0.5">
            {(comment.author_name || "U").charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs">
            <span className="font-semibold text-foreground">{comment.author_name}</span>
            <span className="text-muted-foreground ml-2">{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
          </p>
          <p className="text-xs text-foreground/80 mt-0.5">{comment.content}</p>
          <button onClick={() => setShowReply(!showReply)} className="mt-1 text-[10px] text-muted-foreground hover:text-foreground">
            Reply
          </button>
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-8 space-y-2 border-l-2 border-border pl-3">
          {replies.map((r) => (
            <div key={r.id} className="flex gap-2">
              <div className="h-6 w-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-foreground shrink-0">
                {(r.author_name || "U").charAt(0)}
              </div>
              <div>
                <p className="text-[10px]">
                  <span className="font-semibold text-foreground">{r.author_name}</span>
                  <span className="text-muted-foreground ml-1">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                </p>
                <p className="text-xs text-foreground/80">{r.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply form */}
      {showReply && (
        <div className="ml-8 flex gap-2">
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply..."
            className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleReply()}
          />
          <Button size="sm" variant="secondary" disabled={!replyText.trim()} onClick={handleReply} className="text-xs h-7">
            Reply
          </Button>
        </div>
      )}
    </div>
  );
}

export default CommunityPost;
