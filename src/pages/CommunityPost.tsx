import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Heart, MessageCircle, Repeat2, Bookmark, Send,
  Camera, HelpCircle, BarChart3, Trophy, Handshake,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { feedPosts, type FeedPost, type PostType, type Comment } from "@/data/feedData";
import CommunityShell from "@/pages/community/CommunityShell";

const postTypeConfig: Record<PostType, { label: string; icon: React.ElementType; color: string } | null> = {
  thought: null,
  project: { label: "Project", icon: Camera, color: "hsl(var(--highlight))" },
  question: { label: "Question", icon: HelpCircle, color: "hsl(var(--info))" },
  poll: { label: "Poll", icon: BarChart3, color: "hsl(270 50% 60%)" },
  milestone: { label: "Milestone", icon: Trophy, color: "hsl(var(--highlight))" },
  collab: { label: "Collab", icon: Handshake, color: "hsl(var(--success))" },
};

const CommunityPost = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const post = feedPosts.find(p => p.id === id);
  const [commentText, setCommentText] = useState("");
  const [liked, setLiked] = useState(post?.liked || false);
  const [bookmarked, setBookmarked] = useState(post?.bookmarked || false);

  if (!post) {
    return (
      <CommunityShell>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Post not found</p>
        </div>
      </CommunityShell>
    );
  }

  const typeConfig = postTypeConfig[post.type];
  const totalVotes = post.pollOptions?.reduce((s, o) => s + o.votes, 0) || 0;

  const CommentItem = ({ comment, isReply }: { comment: Comment; isReply?: boolean }) => (
    <div className={`flex gap-3 ${isReply ? "ml-12" : ""}`}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarImage src={comment.authorAvatar} />
        <AvatarFallback>{comment.authorName[0]}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-foreground">{comment.authorName}</span>
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{ background: "hsl(var(--highlight))", color: "hsl(0 0% 7%)" }}
          >
            {comment.authorLevel}
          </div>
          <span className="text-xs text-muted-foreground">{comment.timeAgo}</span>
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed">{comment.content}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <button className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
            <Heart size={12} /> {comment.likes}
          </button>
          {!isReply && (
            <button className="text-xs text-muted-foreground hover:text-foreground">Reply</button>
          )}
        </div>
      </div>
    </div>
  );

  const content = (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
        <button onClick={() => navigate("/community")} className="text-foreground">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-semibold text-foreground flex-1">Post</h1>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto p-4 space-y-4 pb-24">
          {/* Post content */}
          <div className="bg-card rounded-xl p-4 shadow-card">
            {/* Author row */}
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-11 w-11">
                <AvatarImage src={post.authorAvatar} />
                <AvatarFallback>{post.authorName[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{post.authorName}</span>
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ background: "hsl(var(--highlight))", color: "hsl(0 0% 7%)" }}
                  >
                    {post.authorLevel}
                  </div>
                  {post.batchLabel && (
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 rounded-full">
                      {post.batchLabel}
                    </Badge>
                  )}
                </div>
                {typeConfig && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <typeConfig.icon size={12} style={{ color: typeConfig.color }} />
                    <span className="text-[11px] font-semibold" style={{ color: typeConfig.color }}>{typeConfig.label}</span>
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{post.timeAgo}</span>
            </div>

            {post.title && <h2 className="text-lg font-bold text-foreground mb-2">{post.title}</h2>}
            <p className="text-sm text-foreground/80 leading-relaxed mb-3 whitespace-pre-line">{post.body}</p>

            {/* Images */}
            {post.images && post.images.length > 0 && (
              <div className="mb-3 flex gap-2 overflow-x-auto hide-scrollbar">
                {post.images.map((img, i) => (
                  <img key={i} src={img} alt="" className="rounded-lg object-cover" style={{ height: 220, maxWidth: "100%" }} />
                ))}
              </div>
            )}

            {/* Poll */}
            {post.type === "poll" && post.pollOptions && (
              <div className="space-y-2 mb-3">
                {post.pollOptions.map(opt => {
                  const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                  return (
                    <div key={opt.id} className="relative rounded-lg overflow-hidden border border-border">
                      <div
                        className="absolute inset-y-0 left-0"
                        style={{ width: `${pct}%`, background: "hsl(var(--highlight) / 0.2)" }}
                      />
                      <div className="relative flex items-center justify-between px-3 py-2.5">
                        <span className="text-sm text-foreground">{opt.text}</span>
                        <span className="text-xs font-semibold text-muted-foreground">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">{totalVotes} votes · {post.pollDuration}</p>
              </div>
            )}

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {post.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-[11px] rounded-full">{tag}</Badge>
                ))}
              </div>
            )}

            {/* Collab details */}
            {post.type === "collab" && (
              <div className="flex flex-wrap gap-2 mb-3">
                {post.roleNeeded && <Badge variant="outline" className="text-[11px]">🎯 {post.roleNeeded}</Badge>}
                {post.city && <Badge variant="outline" className="text-[11px]">📍 {post.city}</Badge>}
                {post.budget && <Badge variant="outline" className="text-[11px]">💰 {post.budget}</Badge>}
                {post.timeline && <Badge variant="outline" className="text-[11px]">⏰ {post.timeline}</Badge>}
              </div>
            )}

            {/* Feedback banner */}
            {post.feedbackRequested && (
              <div
                className="rounded-lg px-3 py-2 mb-3 text-xs font-medium flex items-center gap-2"
                style={{ background: "hsl(var(--warning) / 0.15)", color: "hsl(var(--warning))" }}
              >
                💬 Feedback requested
              </div>
            )}

            {/* Action bar */}
            <div className="flex items-center gap-1 pt-3 border-t border-border">
              <button
                onClick={() => setLiked(!liked)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
                style={{ color: liked ? "hsl(0 70% 55%)" : "hsl(var(--muted-foreground))" }}
              >
                <Heart size={16} fill={liked ? "currentColor" : "none"} />
                {post.likes + (liked && !post.liked ? 1 : !liked && post.liked ? -1 : 0)}
              </button>
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground">
                <MessageCircle size={16} /> {post.comments}
              </span>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground">
                <Repeat2 size={16} /> {post.reposts}
              </button>
              <button
                onClick={() => setBookmarked(!bookmarked)}
                className="ml-auto px-2 py-1.5"
                style={{ color: bookmarked ? "hsl(var(--highlight))" : "hsl(var(--muted-foreground))" }}
              >
                <Bookmark size={16} fill={bookmarked ? "currentColor" : "none"} />
              </button>
            </div>
          </div>

          {/* Feedback form for projects */}
          {post.type === "project" && post.feedbackRequested && (
            <div className="bg-card rounded-xl p-4 shadow-card space-y-3">
              <h3 className="font-bold text-foreground">Give Feedback</h3>
              <div>
                <label className="text-xs font-medium text-muted-foreground">What works well?</label>
                <Textarea placeholder="Share what you liked..." className="mt-1 min-h-[60px] resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">What could improve?</label>
                <Textarea placeholder="Constructive suggestions..." className="mt-1 min-h-[60px] resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Technical notes</label>
                <Textarea placeholder="Any technical observations..." className="mt-1 min-h-[60px] resize-none" />
              </div>
              <Button
                className="w-full font-semibold"
                style={{ background: "hsl(var(--highlight))", color: "hsl(0 0% 7%)" }}
              >
                Submit Feedback
              </Button>
            </div>
          )}

          {/* Comments */}
          <div className="bg-card rounded-xl p-4 shadow-card">
            <h3 className="font-bold text-foreground mb-4">Comments ({post.comments})</h3>
            <div className="space-y-4">
              {post.commentList?.map(comment => (
                <div key={comment.id}>
                  <CommentItem comment={comment} />
                  {comment.replies?.map(reply => (
                    <div key={reply.id} className="mt-3">
                      <CommentItem comment={reply} isReply />
                    </div>
                  ))}
                </div>
              )) || (
                <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Be the first!</p>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Comment input */}
      <div className="p-3 border-t border-border bg-background">
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <Input
            placeholder="Add a comment..."
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            className="flex-1"
          />
          <Button
            size="icon"
            className="flex-shrink-0"
            style={{ background: "hsl(var(--highlight))", color: "hsl(0 0% 7%)" }}
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );

  return <CommunityShell>{content}</CommunityShell>;
};

export default CommunityPost;
