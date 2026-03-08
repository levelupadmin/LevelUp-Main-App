import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Menu, Heart, MessageCircle, Repeat2, Bookmark, Camera, HelpCircle,
  BarChart3, Trophy, Handshake, Pencil, Plus,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { feedPosts, type FeedPost, type PostType } from "@/data/feedData";
import CreatePostModal from "./CreatePostModal";

interface Props {
  onToggleSidebar: () => void;
}

const postTypeConfig: Record<PostType, { label: string; icon: React.ElementType; color: string; bg: string } | null> = {
  thought: null,
  project: { label: "Project", icon: Camera, color: "hsl(var(--highlight))", bg: "hsl(var(--highlight) / 0.15)" },
  question: { label: "Question", icon: HelpCircle, color: "hsl(var(--info))", bg: "hsl(var(--info) / 0.15)" },
  poll: { label: "Poll", icon: BarChart3, color: "hsl(270 50% 60%)", bg: "hsl(270 50% 60% / 0.15)" },
  milestone: { label: "Milestone", icon: Trophy, color: "hsl(var(--highlight))", bg: "hsl(var(--highlight) / 0.15)" },
  collab: { label: "Collab", icon: Handshake, color: "hsl(var(--success))", bg: "hsl(var(--success) / 0.15)" },
};

const FeedView = ({ onToggleSidebar }: Props) => {
  const navigate = useNavigate();
  const [feedTab, setFeedTab] = useState<"foryou" | "latest">("foryou");
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set(feedPosts.filter(p => p.liked).map(p => p.id)));
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set(feedPosts.filter(p => p.bookmarked).map(p => p.id)));
  const [createOpen, setCreateOpen] = useState(false);

  const toggleLike = (id: string) => {
    setLikedPosts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleBookmark = (id: string) => {
    setBookmarkedPosts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const PostCard = ({ post }: { post: FeedPost }) => {
    const typeConfig = postTypeConfig[post.type];
    const isLiked = likedPosts.has(post.id);
    const isBookmarked = bookmarkedPosts.has(post.id);
    const truncatedBody = post.body.length > 200
      ? post.body.slice(0, 200) + "..."
      : post.body;
    const totalVotes = post.pollOptions?.reduce((sum, o) => sum + o.votes, 0) || 0;

    return (
      <div
        className="bg-card rounded-xl p-4 shadow-card cursor-pointer transition-colors hover:bg-accent/30"
        onClick={() => navigate(`/community/post/${post.id}`)}
      >
        {/* Author row */}
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.authorAvatar} />
            <AvatarFallback>{post.authorName[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground">{post.authorName}</span>
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
                <span className="text-[11px] font-semibold" style={{ color: typeConfig.color }}>
                  {typeConfig.label}
                </span>
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{post.timeAgo}</span>
        </div>

        {/* Title */}
        {post.title && (
          <h3 className="font-bold text-foreground mb-1.5">{post.title}</h3>
        )}

        {/* Body */}
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">
          {truncatedBody}
          {post.body.length > 200 && (
            <span className="text-highlight font-medium ml-1">Read more</span>
          )}
        </p>

        {/* Images */}
        {post.images && post.images.length > 0 && (
          <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto hide-scrollbar" onClick={e => e.stopPropagation()}>
            {post.images.map((img, i) => (
              <img
                key={i}
                src={img}
                alt=""
                className="rounded-lg object-cover flex-shrink-0"
                style={{ height: 180, width: post.images!.length > 1 ? 260 : "100%", maxWidth: "100%" }}
              />
            ))}
          </div>
        )}

        {/* Poll */}
        {post.type === "poll" && post.pollOptions && (
          <div className="space-y-2 mb-3" onClick={e => e.stopPropagation()}>
            {post.pollOptions.map(opt => {
              const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
              return (
                <div key={opt.id} className="relative rounded-lg overflow-hidden border border-border">
                  <div
                    className="absolute inset-y-0 left-0 rounded-lg"
                    style={{
                      width: post.hasVoted ? `${pct}%` : "0%",
                      background: "hsl(var(--highlight) / 0.2)",
                      transition: "width 0.3s",
                    }}
                  />
                  <div className="relative flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm text-foreground">{opt.text}</span>
                    {post.hasVoted && (
                      <span className="text-xs font-semibold text-muted-foreground">{pct}%</span>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">{totalVotes} votes · {post.pollDuration}</p>
          </div>
        )}

        {/* Collab details */}
        {post.type === "collab" && (
          <div className="flex flex-wrap gap-2 mb-3 text-xs" onClick={e => e.stopPropagation()}>
            {post.roleNeeded && (
              <Badge variant="outline" className="text-[11px]">🎯 {post.roleNeeded}</Badge>
            )}
            {post.city && (
              <Badge variant="outline" className="text-[11px]">📍 {post.city}</Badge>
            )}
            {post.budget && (
              <Badge variant="outline" className="text-[11px]">💰 {post.budget}</Badge>
            )}
            {post.timeline && (
              <Badge variant="outline" className="text-[11px]">⏰ {post.timeline}</Badge>
            )}
          </div>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3" onClick={e => e.stopPropagation()}>
            {post.tags.slice(0, 4).map(tag => (
              <Badge key={tag} variant="secondary" className="text-[11px] rounded-full">
                {tag}
              </Badge>
            ))}
            {post.tags.length > 4 && (
              <Badge variant="secondary" className="text-[11px] rounded-full">
                +{post.tags.length - 4} more
              </Badge>
            )}
          </div>
        )}

        {/* Feedback requested banner */}
        {post.feedbackRequested && (
          <div
            className="rounded-lg px-3 py-2 mb-3 text-xs font-medium flex items-center gap-2"
            style={{ background: "hsl(var(--warning) / 0.15)", color: "hsl(var(--warning))" }}
          >
            💬 Feedback requested
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-1 pt-2 border-t border-border" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => toggleLike(post.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
            style={{ color: isLiked ? "hsl(0 70% 55%)" : "hsl(var(--muted-foreground))" }}
          >
            <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
            <span>{post.likes + (isLiked && !post.liked ? 1 : !isLiked && post.liked ? -1 : 0)}</span>
          </button>
          <button
            onClick={() => navigate(`/community/post/${post.id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <MessageCircle size={16} />
            <span>{post.comments}</span>
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground">
            <Repeat2 size={16} />
            <span>{post.reposts}</span>
          </button>
          <button
            onClick={() => toggleBookmark(post.id)}
            className="ml-auto px-2 py-1.5 rounded-md transition-colors"
            style={{ color: isBookmarked ? "hsl(var(--highlight))" : "hsl(var(--muted-foreground))" }}
          >
            <Bookmark size={16} fill={isBookmarked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
        <button onClick={onToggleSidebar} className="md:hidden text-foreground">
          <Menu size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground flex-1">Feed</h1>
        <div className="flex items-center bg-secondary rounded-full p-0.5">
          <button
            onClick={() => setFeedTab("foryou")}
            className="px-3 py-1 text-xs font-medium rounded-full transition-colors"
            style={{
              background: feedTab === "foryou" ? "hsl(var(--highlight))" : "transparent",
              color: feedTab === "foryou" ? "hsl(0 0% 7%)" : "hsl(var(--muted-foreground))",
            }}
          >
            For You
          </button>
          <button
            onClick={() => setFeedTab("latest")}
            className="px-3 py-1 text-xs font-medium rounded-full transition-colors"
            style={{
              background: feedTab === "latest" ? "hsl(var(--highlight))" : "transparent",
              color: feedTab === "latest" ? "hsl(0 0% 7%)" : "hsl(var(--muted-foreground))",
            }}
          >
            Latest
          </button>
        </div>
      </div>

      {/* Feed */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto p-4 space-y-4 pb-24">
          {feedPosts.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </ScrollArea>

      {/* FAB */}
      <button
        onClick={() => setCreateOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-elevated z-50 transition-transform hover:scale-110"
        style={{ background: "hsl(var(--highlight))", color: "hsl(0 0% 7%)" }}
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      <CreatePostModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
};

export default FeedView;
