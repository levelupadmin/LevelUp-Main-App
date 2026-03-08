import AppShell from "@/components/layout/AppShell";
import { getCohortById, mockCohortSessions, mockAssignments, mockPeerReviews, mockResources } from "@/data/cohortData";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays, BookOpen, Upload, Users, FolderOpen, MessageSquare,
  CheckCircle2, Clock, Play, Video, FileText, Link2, FileDown,
  Star, ChevronLeft, Send, ArrowRight
} from "lucide-react";

const CohortDashboard = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const cohort = getCohortById(slug || "");

  const [activeTab, setActiveTab] = useState("overview");
  const [submissionText, setSubmissionText] = useState("");

  if (!cohort) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <h1 className="text-xl font-bold text-foreground">Cohort not found</h1>
          <Button size="sm" className="mt-4" onClick={() => navigate("/learn")}>Back to Learn</Button>
        </div>
      </AppShell>
    );
  }

  const completedSessions = mockCohortSessions.filter((s) => s.completed).length;
  const totalSessions = mockCohortSessions.length;
  const completedAssignments = mockAssignments.filter((a) => a.status === "submitted" || a.status === "reviewed").length;

  const sessionTypeIcon: Record<string, React.ReactNode> = {
    live: <Video className="h-3.5 w-3.5" />,
    workshop: <Play className="h-3.5 w-3.5" />,
    review: <MessageSquare className="h-3.5 w-3.5" />,
    demo: <Star className="h-3.5 w-3.5" />,
  };

  const resourceTypeIcon: Record<string, React.ReactNode> = {
    pdf: <FileText className="h-3.5 w-3.5" />,
    video: <Video className="h-3.5 w-3.5" />,
    link: <Link2 className="h-3.5 w-3.5" />,
    template: <FileDown className="h-3.5 w-3.5" />,
  };

  const handleSubmitAssignment = (assignmentId: string) => {
    toast({ title: "Assignment submitted!", description: "Your mentor will review it soon." });
    setSubmissionText("");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-5 p-4 lg:p-6">
        {/* Header */}
        <button onClick={() => navigate(`/learn/cohort/${cohort.id}`)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-3 w-3" /> Back to cohort details
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge variant="secondary" className="text-[10px] mb-2">Enrolled</Badge>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">{cohort.title}</h1>
            <p className="text-xs text-muted-foreground mt-1">with {cohort.mentors.map((m) => m.name).join(" & ")}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">Progress</p>
            <p className="text-lg font-bold text-foreground">{Math.round((completedSessions / totalSessions) * 100)}%</p>
          </div>
        </div>

        <Progress value={(completedSessions / totalSessions) * 100} className="h-1.5" />

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Sessions", value: `${completedSessions}/${totalSessions}`, icon: <CalendarDays className="h-4 w-4 text-muted-foreground" /> },
            { label: "Assignments", value: `${completedAssignments}/${mockAssignments.length}`, icon: <BookOpen className="h-4 w-4 text-muted-foreground" /> },
            { label: "Peer Reviews", value: `${mockPeerReviews.length}`, icon: <Users className="h-4 w-4 text-muted-foreground" /> },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-3 text-center">
              <div className="flex justify-center mb-1">{stat.icon}</div>
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto hide-scrollbar">
            <TabsTrigger value="overview" className="text-xs gap-1"><CalendarDays className="h-3 w-3" /> Calendar</TabsTrigger>
            <TabsTrigger value="assignments" className="text-xs gap-1"><BookOpen className="h-3 w-3" /> Assignments</TabsTrigger>
            <TabsTrigger value="submissions" className="text-xs gap-1"><Upload className="h-3 w-3" /> Submit</TabsTrigger>
            <TabsTrigger value="reviews" className="text-xs gap-1"><MessageSquare className="h-3 w-3" /> Peer Reviews</TabsTrigger>
            <TabsTrigger value="resources" className="text-xs gap-1"><FolderOpen className="h-3 w-3" /> Resources</TabsTrigger>
          </TabsList>

          {/* Calendar */}
          <TabsContent value="overview" className="space-y-3 mt-4">
            <h2 className="text-sm font-bold text-foreground">Session Calendar</h2>
            <div className="space-y-2">
              {mockCohortSessions.map((session) => (
                <div key={session.id} className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${session.completed ? "border-border bg-card/50 opacity-70" : "border-border bg-card"}`}>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${session.completed ? "bg-secondary" : "bg-foreground/5"}`}>
                    {sessionTypeIcon[session.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{session.title}</p>
                    <p className="text-xs text-muted-foreground">{session.date} · {session.time}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px] capitalize">{session.type}</Badge>
                    {session.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Assignments */}
          <TabsContent value="assignments" className="space-y-3 mt-4">
            <h2 className="text-sm font-bold text-foreground">Assignments</h2>
            <div className="space-y-2">
              {mockAssignments.map((assignment) => {
                const statusColors: Record<string, string> = {
                  not_started: "bg-secondary text-muted-foreground",
                  in_progress: "bg-[hsl(var(--highlight))]/15 text-[hsl(var(--highlight))]",
                  submitted: "bg-foreground/10 text-foreground",
                  reviewed: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]",
                };
                return (
                  <div key={assignment.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Week {assignment.week}</p>
                        <p className="text-sm font-semibold text-foreground">{assignment.title}</p>
                      </div>
                      <Badge className={`text-[10px] ${statusColors[assignment.status]}`}>{assignment.status.replace("_", " ")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{assignment.description}</p>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Due: {assignment.dueDate}</span>
                      {assignment.grade && <span className="font-semibold text-foreground">Grade: {assignment.grade}</span>}
                    </div>
                    {assignment.feedback && (
                      <div className="rounded-md bg-secondary/30 p-2.5 mt-1">
                        <p className="text-[10px] font-semibold text-foreground mb-1">Mentor Feedback</p>
                        <p className="text-xs text-muted-foreground">{assignment.feedback}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* Submission */}
          <TabsContent value="submissions" className="space-y-4 mt-4">
            <h2 className="text-sm font-bold text-foreground">Submit Work</h2>
            {mockAssignments.filter((a) => a.status === "in_progress" || a.status === "not_started").map((assignment) => (
              <div key={assignment.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Week {assignment.week} · Due {assignment.dueDate}</p>
                  <p className="text-sm font-semibold text-foreground">{assignment.title}</p>
                </div>
                <Textarea
                  placeholder="Paste a link to your submission or describe your work..."
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1 text-xs">
                    <Upload className="h-3 w-3" /> Attach File
                  </Button>
                  <Button size="sm" className="gap-1 text-xs" onClick={() => handleSubmitAssignment(assignment.id)}>
                    <Send className="h-3 w-3" /> Submit
                  </Button>
                </div>
              </div>
            ))}
            {mockAssignments.filter((a) => a.status === "in_progress" || a.status === "not_started").length === 0 && (
              <div className="text-center py-8">
                <CheckCircle2 className="h-8 w-8 text-[hsl(var(--success))] mx-auto mb-2" />
                <p className="text-sm text-foreground font-medium">All caught up!</p>
                <p className="text-xs text-muted-foreground">No pending submissions</p>
              </div>
            )}
          </TabsContent>

          {/* Peer Reviews */}
          <TabsContent value="reviews" className="space-y-3 mt-4">
            <h2 className="text-sm font-bold text-foreground">Peer Reviews</h2>
            {mockPeerReviews.length > 0 ? (
              <div className="space-y-2">
                {mockPeerReviews.map((review) => {
                  const assignment = mockAssignments.find((a) => a.id === review.assignmentId);
                  return (
                    <div key={review.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
                      <div className="flex items-center gap-3">
                        <img src={review.reviewerAvatar} alt={review.reviewerName} className="h-8 w-8 rounded-full object-cover" />
                        <div>
                          <p className="text-sm font-semibold text-foreground">{review.reviewerName}</p>
                          <p className="text-[10px] text-muted-foreground">{review.date} · {assignment?.title}</p>
                        </div>
                        <div className="ml-auto flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`h-3 w-3 ${i < review.rating ? "text-[hsl(var(--highlight))] fill-[hsl(var(--highlight))]" : "text-secondary"}`} />
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{review.feedback}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-foreground font-medium">No peer reviews yet</p>
                <p className="text-xs text-muted-foreground">Reviews will appear after assignments are submitted</p>
              </div>
            )}
          </TabsContent>

          {/* Resources */}
          <TabsContent value="resources" className="space-y-3 mt-4">
            <h2 className="text-sm font-bold text-foreground">Resources Library</h2>
            <div className="space-y-2">
              {mockResources.map((resource) => (
                <div key={resource.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-foreground/20 transition-colors cursor-pointer">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    {resourceTypeIcon[resource.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{resource.title}</p>
                    <p className="text-[10px] text-muted-foreground">{resource.week ? `Week ${resource.week}` : "General"} · {resource.type.toUpperCase()}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Community link */}
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <MessageSquare className="h-5 w-5 text-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Cohort Community Space</p>
            <p className="text-xs text-muted-foreground">Connect with your batchmates and mentors</p>
          </div>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/community")}>
            Open <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
};

export default CohortDashboard;
