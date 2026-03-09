import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Search, ClipboardList, Download, Eye, CheckCircle, TrendingUp, BarChart3, RefreshCw, AlertTriangle } from "lucide-react";

interface Props {
  courseId: string;
  lessons: { id: string; title: string; module_id: string; type: string }[];
}

const useAssignments = (courseId: string) =>
  useQuery({
    queryKey: ["admin-assignments", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .eq("course_id", courseId);
      if (error) throw error;
      return data;
    },
  });

const useSubmissions = (assignmentIds: string[]) =>
  useQuery({
    queryKey: ["admin-submissions", assignmentIds],
    enabled: assignmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("*")
        .in("assignment_id", assignmentIds)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

const useSubmissionProfiles = (userIds: string[]) =>
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

const useEnrollmentCount = (courseId: string) =>
  useQuery({
    queryKey: ["admin-enrollment-count", courseId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("enrollments")
        .select("*", { count: "exact", head: true })
        .eq("course_id", courseId)
        .eq("status", "active");
      if (error) throw error;
      return count || 0;
    },
  });

export default function AdminAssignmentResponsesTab({ courseId, lessons }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [gradingSubmission, setGradingSubmission] = useState<any>(null);
  const [gradeScore, setGradeScore] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");

  const { data: assignments = [] } = useAssignments(courseId);
  const assignmentIds = assignments.map((a: any) => a.id);
  const { data: submissions = [], isLoading } = useSubmissions(assignmentIds);
  const { data: enrollmentCount = 0 } = useEnrollmentCount(courseId);

  const userIds = [...new Set(submissions.map((s: any) => s.user_id))];
  const { data: profiles = [] } = useSubmissionProfiles(userIds);
  const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));

  const assignmentMap = Object.fromEntries(assignments.map((a: any) => [a.id, a]));
  const lessonMap = Object.fromEntries(lessons.map((l) => [l.id, l]));

  // Metrics
  const totalStudents = enrollmentCount;
  const uniqueSubmitters = new Set(submissions.map((s: any) => s.user_id)).size;
  const submissionRate = totalStudents > 0 ? Math.round((uniqueSubmitters / totalStudents) * 100) : 0;
  const gradedSubmissions = submissions.filter((s: any) => s.status === "graded");
  const avgScore = gradedSubmissions.length > 0
    ? Math.round(gradedSubmissions.reduce((sum: number, s: any) => sum + (s.score || 0), 0) / gradedSubmissions.length)
    : 0;
  const passingSubmissions = gradedSubmissions.filter((s: any) => {
    const assignment = assignmentMap[s.assignment_id];
    return assignment && s.score >= assignment.passing_score;
  });
  const passingPct = gradedSubmissions.length > 0 ? Math.round((passingSubmissions.length / gradedSubmissions.length) * 100) : 0;

  // Count retakes (multiple submissions by same user for same assignment)
  const submissionsByUserAssignment: Record<string, number> = {};
  submissions.forEach((s: any) => {
    const key = `${s.user_id}-${s.assignment_id}`;
    submissionsByUserAssignment[key] = (submissionsByUserAssignment[key] || 0) + 1;
  });
  const retakeCount = Object.values(submissionsByUserAssignment).filter((c) => c > 1).length;
  const retakePct = Object.keys(submissionsByUserAssignment).length > 0
    ? Math.round((retakeCount / Object.keys(submissionsByUserAssignment).length) * 100) : 0;

  const gradeSubmission = useMutation({
    mutationFn: async ({ id, score, feedback }: { id: string; score: number; feedback: string }) => {
      const { error } = await supabase
        .from("assignment_submissions")
        .update({ score, feedback, status: "graded" as any, graded_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-submissions"] });
      setGradingSubmission(null);
      setGradeScore("");
      setGradeFeedback("");
      toast({ title: "Submission graded" });
    },
  });

  const filteredSubmissions = submissions.filter((s: any) => {
    if (assignmentFilter !== "all" && s.assignment_id !== assignmentFilter) return false;
    if (search) {
      const profile = profileMap[s.user_id];
      const assignment = assignmentMap[s.assignment_id];
      const lesson = assignment ? lessonMap[assignment.lesson_id] : null;
      return (
        (profile?.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (lesson?.title || "").toLowerCase().includes(search.toLowerCase())
      );
    }
    return true;
  });

  const exportCSV = () => {
    const rows = [["Student", "Assignment", "Score", "Max Score", "Status", "Submitted At", "Feedback"]];
    filteredSubmissions.forEach((s: any) => {
      const profile = profileMap[s.user_id];
      const assignment = assignmentMap[s.assignment_id];
      const lesson = assignment ? lessonMap[assignment.lesson_id] : null;
      rows.push([
        profile?.name || "User",
        lesson?.title || "Unknown",
        s.score?.toString() || "—",
        assignment?.max_score?.toString() || "100",
        s.status,
        new Date(s.submitted_at).toLocaleDateString(),
        s.feedback || "",
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assignment-responses-${courseId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported" });
  };

  const statusBadge: Record<string, string> = {
    submitted: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    graded: "bg-green-500/10 text-green-400 border-green-500/20",
    returned: "bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20",
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <ClipboardList className="h-4 w-4" /> Assignment Responses
        </h3>
        <Button size="sm" variant="outline" onClick={exportCSV} disabled={filteredSubmissions.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
        </Button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Submission Rate", value: `${submissionRate}%`, icon: TrendingUp },
          { label: "Avg Score", value: avgScore, icon: BarChart3 },
          { label: "Passing %", value: `${passingPct}%`, icon: CheckCircle },
          { label: "Retake %", value: `${retakePct}%`, icon: RefreshCw },
          { label: "Pending Review", value: submissions.filter((s: any) => s.status === "submitted").length, icon: AlertTriangle },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{m.label}</span>
            </div>
            <span className="text-xl font-bold text-foreground">{m.value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search by student or assignment..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
        <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
          <SelectTrigger className="w-48 h-8 text-sm"><SelectValue placeholder="All Assignments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assignments</SelectItem>
            {assignments.map((a: any) => {
              const lesson = lessonMap[a.lesson_id];
              return <SelectItem key={a.id} value={a.id}>{lesson?.title || "Assignment"}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Submissions table */}
      <div className="rounded-lg border border-border overflow-hidden">
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading submissions...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Student</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assignment</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Score</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Submitted</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map((s: any) => {
                  const profile = profileMap[s.user_id];
                  const assignment = assignmentMap[s.assignment_id];
                  const lesson = assignment ? lessonMap[assignment.lesson_id] : null;
                  return (
                    <tr key={s.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{profile?.name || "User"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[180px]">{lesson?.title || "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`text-[10px] ${statusBadge[s.status] || ""}`}>{s.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {s.score !== null ? `${s.score}/${assignment?.max_score || 100}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                        {new Date(s.submitted_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {s.file_url && (
                            <a href={s.file_url} target="_blank" rel="noreferrer" className="rounded-md p-1 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                              <Eye className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => {
                              setGradingSubmission(s);
                              setGradeScore(s.score?.toString() || "");
                              setGradeFeedback(s.feedback || "");
                            }}
                          >
                            Grade
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredSubmissions.length === 0 && (
              <div className="py-8 text-center text-muted-foreground text-sm">No submissions found.</div>
            )}
          </div>
        )}
      </div>

      {/* Grade dialog */}
      <Dialog open={!!gradingSubmission} onOpenChange={() => setGradingSubmission(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grade Submission</DialogTitle>
            <DialogDescription>
              {gradingSubmission && profileMap[gradingSubmission.user_id]?.name}
            </DialogDescription>
          </DialogHeader>
          {gradingSubmission && (
            <div className="space-y-4">
              {gradingSubmission.content && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Student's Response</label>
                  <div className="rounded-md bg-secondary/30 p-3 text-sm text-foreground max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {gradingSubmission.content}
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Score (max: {assignmentMap[gradingSubmission.assignment_id]?.max_score || 100})
                </label>
                <Input type="number" value={gradeScore} onChange={(e) => setGradeScore(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Feedback</label>
                <Textarea value={gradeFeedback} onChange={(e) => setGradeFeedback(e.target.value)} className="min-h-[80px]" placeholder="Write feedback for the student..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGradingSubmission(null)}>Cancel</Button>
            <Button
              disabled={!gradeScore || gradeSubmission.isPending}
              onClick={() => {
                if (gradingSubmission) {
                  gradeSubmission.mutate({
                    id: gradingSubmission.id,
                    score: parseInt(gradeScore) || 0,
                    feedback: gradeFeedback,
                  });
                }
              }}
            >
              {gradeSubmission.isPending ? "Saving..." : "Save Grade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
