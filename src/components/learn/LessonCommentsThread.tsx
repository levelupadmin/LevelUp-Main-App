import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, Reply, Trash2, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface Props {
  lessonId: string;
  courseId: string;
}

const LessonCommentsThread = ({ lessonId, courseId }: Props) => {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["lesson-comments", lessonId],
    enabled: !!lessonId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_comments")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["comment-profiles", lessonId],
    enabled: comments.length > 0,
    queryFn: async () => {
      const userIds = [...new Set(comments.map((c) => c.user_id))];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", userIds);
      if (error) throw error;
      return data;
    },
  });

  const addComment = useMutation({
    mutationFn: async ({ content, parentId }: { content: string; parentId?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("lesson_comments").insert({
        lesson_id: lessonId,
        course_id: courseId,
        user_id: user.id,
        content,
        parent_id: parentId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lesson-comments", lessonId] });
      setNewComment("");
      setReplyTo(null);
      setReplyText("");
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from("lesson_comments").delete().eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lesson-comments", lessonId] });
      toast({ title: "Comment deleted" });
    },
  });

  const getProfile = (userId: string) => profiles.find((p) => p.id === userId);
  const topLevel = comments.filter((c) => !c.parent_id);
  const getReplies = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  return (
    <div className="space-y-4">
      {/* New comment input */}
      <div className="flex gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={profile?.avatar_url || ""} />
          <AvatarFallback className="text-xs bg-secondary text-secondary-foreground">
            {profile?.name?.charAt(0) || "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[60px] resize-none bg-background text-sm"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!newComment.trim() || addComment.isPending}
              onClick={() => addComment.mutate({ content: newComment })}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Post
            </Button>
          </div>
        </div>
      </div>

      {/* Comments list */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Loading comments…</p>
      ) : topLevel.length === 0 ? (
        <div className="text-center py-8">
          <MessageCircle className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No comments yet. Be the first!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {topLevel.map((comment) => {
            const p = getProfile(comment.user_id);
            const replies = getReplies(comment.id);
            return (
              <div key={comment.id} className="space-y-3">
                <div className="flex gap-3">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={p?.avatar_url || ""} />
                    <AvatarFallback className="text-[10px] bg-secondary text-secondary-foreground">
                      {p?.name?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{p?.name || "User"}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{comment.content}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <button
                        onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        <Reply className="h-3 w-3" /> Reply
                      </button>
                      {comment.user_id === user?.id && (
                        <button
                          onClick={() => deleteComment.mutate(comment.id)}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {replies.length > 0 && (
                  <div className="ml-10 space-y-3 border-l-2 border-border pl-4">
                    {replies.map((reply) => {
                      const rp = getProfile(reply.user_id);
                      return (
                        <div key={reply.id} className="flex gap-3">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarImage src={rp?.avatar_url || ""} />
                            <AvatarFallback className="text-[10px] bg-secondary text-secondary-foreground">
                              {rp?.name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-foreground">{rp?.name || "User"}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{reply.content}</p>
                            {reply.user_id === user?.id && (
                              <button
                                onClick={() => deleteComment.mutate(reply.id)}
                                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive mt-1"
                              >
                                <Trash2 className="h-3 w-3" /> Delete
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reply input */}
                {replyTo === comment.id && (
                  <div className="ml-10 flex gap-2">
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Write a reply..."
                      className="min-h-[40px] resize-none bg-background text-xs flex-1"
                    />
                    <Button
                      size="sm"
                      disabled={!replyText.trim() || addComment.isPending}
                      onClick={() => addComment.mutate({ content: replyText, parentId: comment.id })}
                    >
                      Reply
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LessonCommentsThread;
