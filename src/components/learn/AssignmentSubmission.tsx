import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Upload, CheckCircle2, Clock, RotateCcw, FileText, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Props {
  lessonId: string;
  courseId: string;
}

const AssignmentSubmission = ({ lessonId, courseId }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Get assignment config
  const { data: assignment } = useQuery({
    queryKey: ["assignment-config", lessonId],
    enabled: !!lessonId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Get user's submission
  const { data: submission } = useQuery({
    queryKey: ["my-submission", lessonId],
    enabled: !!assignment?.id,
    queryFn: async () => {
      if (!user || !assignment) return null;
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("*")
        .eq("assignment_id", assignment.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const submitAssignment = useMutation({
    mutationFn: async () => {
      if (!user || !assignment) throw new Error("Missing data");
      const { error } = await supabase.from("assignment_submissions").insert({
        assignment_id: assignment.id,
        user_id: user.id,
        content: content || null,
        file_url: fileUrl || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-submission", lessonId] });
      toast({ title: "Assignment submitted! ✓" });
      setContent("");
      setFileUrl("");
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const path = `assignments/${user.id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("course-content").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("course-content").getPublicUrl(path);
      setFileUrl(urlData.publicUrl);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (!assignment) return null;

  const isGraded = submission?.status === "graded";
  const isSubmitted = !!submission;
  const canRetake = assignment.allow_retake && (isGraded || submission?.status === "returned");

  return (
    <Card className="border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Assignment</h3>
        <Badge variant="secondary" className="text-[10px]">
          Max Score: {assignment.max_score} · Pass: {assignment.passing_score}
        </Badge>
      </div>

      {assignment.instructions && (
        <div className="rounded-md bg-secondary/30 p-3">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{assignment.instructions}</p>
        </div>
      )}

      {/* Show existing submission */}
      {isSubmitted && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            {submission.status === "submitted" && (
              <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] text-[10px] gap-1">
                <Clock className="h-3 w-3" /> Pending Review
              </Badge>
            )}
            {submission.status === "graded" && (
              <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] text-[10px] gap-1">
                <CheckCircle2 className="h-3 w-3" /> Graded
              </Badge>
            )}
            {submission.status === "returned" && (
              <Badge className="bg-[hsl(var(--info))]/15 text-[hsl(var(--info))] text-[10px] gap-1">
                <RotateCcw className="h-3 w-3" /> Returned
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {formatDistanceToNow(new Date(submission.submitted_at), { addSuffix: true })}
            </span>
          </div>

          {submission.content && (
            <p className="text-xs text-muted-foreground">{submission.content}</p>
          )}

          {submission.file_url && (
            <a href={submission.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-foreground hover:underline">
              <FileText className="h-3.5 w-3.5" /> View submitted file
            </a>
          )}

          {isGraded && submission.score != null && (
            <div className="flex items-center gap-3 pt-1">
              <span className="text-sm font-bold text-foreground">
                Score: {submission.score}/{assignment.max_score}
              </span>
              {submission.score >= assignment.passing_score ? (
                <Badge variant="secondary" className="text-[10px] text-[hsl(var(--success))]">Passed</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] text-destructive">Below passing</Badge>
              )}
            </div>
          )}

          {submission.feedback && (
            <div className="rounded-md bg-secondary/30 p-2.5 mt-1">
              <p className="text-[10px] font-semibold text-foreground mb-0.5">Feedback</p>
              <p className="text-xs text-muted-foreground">{submission.feedback}</p>
            </div>
          )}
        </div>
      )}

      {/* Submit/Retake form */}
      {(!isSubmitted || canRetake) && (
        <div className="space-y-3">
          {canRetake && (
            <p className="text-xs text-muted-foreground">You can re-submit this assignment.</p>
          )}
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your answer here..."
            className="min-h-[80px] resize-none bg-background text-sm"
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : fileUrl ? "File attached ✓" : "Attach file"}
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
            <Button
              size="sm"
              className="ml-auto gap-1.5"
              disabled={(!content.trim() && !fileUrl) || submitAssignment.isPending}
              onClick={() => submitAssignment.mutate()}
            >
              <Send className="h-3.5 w-3.5" />
              {submitAssignment.isPending ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default AssignmentSubmission;
