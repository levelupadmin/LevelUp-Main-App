import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Trash2, MessageSquare, Reply, ChevronDown, ChevronRight, User } from "lucide-react";

interface Props {
  courseId: string;
  lessons: { id: string; title: string; module_id: string }[];
  modules: { id: string; title: string }[];
}

const useComments = (courseId: string) =>
  useQuery({
    queryKey: ["admin-comments", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_comments")
        .select("*")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

const useCommentProfiles = (userIds: string[]) =>
  useQuery({
    queryKey: ["profiles", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", userIds);
      if (error) throw error;
      return data;
    },
  });

export default function AdminCommentsTab({ courseId, lessons, modules }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(new Set());

  const { data: comments = [], isLoading } = useComments(courseId);
  const userIds = [...new Set(comments.map((c: any) => c.user_id))];
  const { data: profiles = [] } = useCommentProfiles(userIds);

  const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));

  const deleteComment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lesson_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-comments", courseId] });
      toast({ title: "Comment deleted" });
    },
  });

  const addReply = useMutation({
    mutationFn: async ({ parentId, lessonId, content }: { parentId: string; lessonId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("lesson_comments").insert({
        lesson_id: lessonId,
        course_id: courseId,
        user_id: user.id,
        parent_id: parentId,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-comments", courseId] });
      setReplyingTo(null);
      setReplyText("");
      toast({ title: "Reply posted" });
    },
  });

  // Group comments by lesson
  const commentsByLesson: Record<string, any[]> = {};
  comments.forEach((c: any) => {
    if (!commentsByLesson[c.lesson_id]) commentsByLesson[c.lesson_id] = [];
    commentsByLesson[c.lesson_id].push(c);
  });

  const filteredLessonIds = Object.keys(commentsByLesson).filter((lessonId) => {
    if (!search) return true;
    const lesson = lessons.find((l) => l.id === lessonId);
    const lessonComments = commentsByLesson[lessonId];
    return (
      lesson?.title.toLowerCase().includes(search.toLowerCase()) ||
      lessonComments.some((c: any) => c.content.toLowerCase().includes(search.toLowerCase()))
    );
  });

  const toggleLesson = (id: string) => {
    setExpandedLessons((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const topLevelCount = comments.filter((c: any) => !c.parent_id).length;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Comments
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{topLevelCount} comments across {filteredLessonIds.length} lessons</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search comments..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">Loading comments...</div>
      ) : filteredLessonIds.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">No comments yet.</div>
      ) : (
        <div className="space-y-2">
          {filteredLessonIds.map((lessonId) => {
            const lesson = lessons.find((l) => l.id === lessonId);
            const module = modules.find((m) => m.id === lesson?.module_id);
            const lessonComments = commentsByLesson[lessonId];
            const topLevel = lessonComments.filter((c: any) => !c.parent_id);
            const isExpanded = expandedLessons.has(lessonId);

            return (
              <div key={lessonId} className="rounded-lg border border-border bg-card overflow-hidden">
                <button
                  onClick={() => toggleLesson(lessonId)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-medium text-foreground truncate">{lesson?.title || "Unknown lesson"}</span>
                    {module && <span className="text-xs text-muted-foreground">({module.title})</span>}
                  </div>
                  <Badge variant="secondary" className="text-xs">{topLevel.length}</Badge>
                </button>

                {isExpanded && (
                  <div className="border-t border-border divide-y divide-border">
                    {topLevel.map((comment: any) => {
                      const replies = lessonComments.filter((c: any) => c.parent_id === comment.id);
                      const profile = profileMap[comment.user_id];
                      return (
                        <div key={comment.id} className="px-4 py-3 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <User className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-medium text-foreground">{profile?.name || "User"}</span>
                                <span className="text-[10px] text-muted-foreground">{new Date(comment.created_at).toLocaleDateString()}</span>
                              </div>
                              <p className="text-sm text-foreground/80">{comment.content}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                                className="rounded-md p-1 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Reply className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => deleteComment.mutate(comment.id)}
                                className="rounded-md p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Replies */}
                          {replies.length > 0 && (
                            <div className="ml-6 space-y-2 border-l-2 border-border pl-3">
                              {replies.map((reply: any) => {
                                const rProfile = profileMap[reply.user_id];
                                return (
                                  <div key={reply.id} className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-xs font-medium text-foreground">{rProfile?.name || "Admin"}</span>
                                        <span className="text-[10px] text-muted-foreground">{new Date(reply.created_at).toLocaleDateString()}</span>
                                      </div>
                                      <p className="text-xs text-foreground/80">{reply.content}</p>
                                    </div>
                                    <button
                                      onClick={() => deleteComment.mutate(reply.id)}
                                      className="rounded-md p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Reply input */}
                          {replyingTo === comment.id && (
                            <div className="ml-6 flex gap-2">
                              <Textarea
                                placeholder="Write a reply..."
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                className="min-h-[60px] text-sm flex-1"
                              />
                              <div className="flex flex-col gap-1">
                                <Button
                                  size="sm"
                                  disabled={!replyText.trim() || addReply.isPending}
                                  onClick={() => addReply.mutate({ parentId: comment.id, lessonId, content: replyText })}
                                >
                                  Reply
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { setReplyingTo(null); setReplyText(""); }}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
