import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import { mockCourses, getAllLessons, getLessonById } from "@/data/learnMockData";
import { Play, ChevronLeft, ChevronRight, Check, Upload, MessageSquare, FileText, Award, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const LessonDetail = () => {
  const { slug, lessonId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const course = mockCourses.find((c) => c.slug === slug);
  const allLessons = course ? getAllLessons(course) : [];
  const lesson = course && lessonId ? getLessonById(course, lessonId) : undefined;
  const lessonIndex = lesson ? allLessons.findIndex((l) => l.id === lesson.id) : -1;

  const [speed, setSpeed] = useState("1x");
  const [watched80, setWatched80] = useState(false);
  const [isCompleted, setIsCompleted] = useState(
    lesson ? course?.completedLessons.includes(lesson.id) ?? false : false
  );
  const [activityText, setActivityText] = useState("");
  const [shareToComm, setShareToComm] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);

  // Simulate 80% watch after 3s
  useState(() => {
    const t = setTimeout(() => setWatched80(true), 3000);
    return () => clearTimeout(t);
  });

  if (!course || !lesson) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="text-muted-foreground">Lesson not found.</p>
        </div>
      </AppShell>
    );
  }

  const prevLesson = lessonIndex > 0 ? allLessons[lessonIndex - 1] : null;
  const nextLessonItem = lessonIndex < allLessons.length - 1 ? allLessons[lessonIndex + 1] : null;
  const isLastLesson = lessonIndex === allLessons.length - 1;

  const handleMarkComplete = () => {
    setIsCompleted(true);
    toast({
      title: "Lesson completed! +10 XP",
      description: isLastLesson ? "🎉 You've completed the entire course!" : "Moving to next lesson...",
    });
    if (isLastLesson) {
      setShowCompletion(true);
    } else if (nextLessonItem) {
      setTimeout(() => navigate(`/learn/course/${slug}/lesson/${nextLessonItem.id}`), 3000);
    }
  };

  const speeds = ["0.5x", "1x", "1.25x", "1.5x", "2x"];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6 lg:px-8">
        <button
          onClick={() => navigate(`/learn/course/${slug}`)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Course
        </button>

        {/* Video Player */}
        <div className="relative aspect-video rounded-xl bg-secondary border border-border overflow-hidden mb-4">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="h-16 w-16 rounded-full bg-[hsl(var(--highlight))]/20 flex items-center justify-center">
              <Play className="h-7 w-7 text-[hsl(var(--highlight))] ml-0.5" />
            </div>
            <span className="text-xs text-muted-foreground">VdoCipher integration pending</span>
          </div>
        </div>

        <div className="mb-2">
          <h1 className="text-xl font-bold text-foreground">{lesson.title}</h1>
          <p className="text-xs text-muted-foreground">Lesson {lesson.number} of {allLessons.length}</p>
        </div>

        {/* Speed controls */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs text-muted-foreground mr-1">Speed:</span>
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                speed === s
                  ? "bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))]"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="notes" className="space-y-4">
          <TabsList className="bg-secondary w-full justify-start">
            <TabsTrigger value="notes" className="gap-1"><FileText className="h-3.5 w-3.5" /> Notes</TabsTrigger>
            {lesson.activityType !== "none" && (
              <TabsTrigger value="activity" className="gap-1"><Upload className="h-3.5 w-3.5" /> Activity</TabsTrigger>
            )}
            <TabsTrigger value="discussion" className="gap-1"><MessageSquare className="h-3.5 w-3.5" /> Discussion</TabsTrigger>
          </TabsList>

          <TabsContent value="notes">
            <div className="rounded-lg border border-border p-4 bg-card">
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans">{lesson.notes}</pre>
            </div>
          </TabsContent>

          {lesson.activityType !== "none" && (
            <TabsContent value="activity" className="space-y-4">
              <div className="rounded-lg border border-border p-4 bg-card space-y-3">
                <p className="text-sm text-foreground font-medium">{lesson.activityPrompt}</p>
                <Textarea placeholder="Write your response..." value={activityText} onChange={(e) => setActivityText(e.target.value)} rows={4} />
                {(lesson.activityType === "image" || lesson.activityType === "video") && (
                  <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
                    <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">Upload {lesson.activityType}</p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch checked={shareToComm} onCheckedChange={setShareToComm} />
                    <span className="text-xs text-muted-foreground">Share to community?</span>
                  </div>
                  <Badge variant="outline" className="bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20 gap-1">
                    <Zap className="h-3 w-3" /> +50 XP
                  </Badge>
                </div>
                <Button onClick={() => toast({ title: "Activity submitted! +50 XP" })} className="w-full bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))]">
                  Submit Activity
                </Button>
              </div>
            </TabsContent>
          )}

          <TabsContent value="discussion" className="space-y-3">
            <div className="rounded-lg border border-border p-4 bg-card space-y-3">
              {[{ name: "Aditya K.", text: "Great explanation of the concept!" }, { name: "Meera J.", text: "Can someone share their notes on this?" }].map((c, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-accent shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Textarea placeholder="Add a comment..." rows={1} className="flex-1" />
              <Button size="sm" variant="outline">Post</Button>
            </div>
          </TabsContent>
        </Tabs>

        {watched80 && !isCompleted && (
          <Button onClick={handleMarkComplete} className="w-full mt-6 bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90 gap-2">
            <Check className="h-4 w-4" /> Mark as Complete
          </Button>
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <Button variant="outline" size="sm" disabled={!prevLesson} onClick={() => prevLesson && navigate(`/learn/course/${slug}/lesson/${prevLesson.id}`)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <Button variant="outline" size="sm" disabled={!nextLessonItem} onClick={() => nextLessonItem && navigate(`/learn/course/${slug}/lesson/${nextLessonItem.id}`)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {showCompletion && (
          <div className="fixed inset-0 z-50 bg-background/95 flex flex-col items-center justify-center text-center px-6">
            <Award className="h-16 w-16 text-[hsl(var(--highlight))] mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Course Completed! 🎉</h2>
            <p className="text-muted-foreground mb-1">You've finished {course.title}</p>
            <p className="text-sm text-[hsl(var(--highlight))] mb-6">Total XP earned: {course.totalLessons * 10 + 50}</p>
            <Badge className="mb-6 bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20 px-4 py-2 text-sm">🏆 Eager Learner Badge</Badge>
            <div className="space-y-3 w-full max-w-xs">
              <Button className="w-full bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))]">Download Certificate</Button>
              <Button variant="outline" className="w-full">Share to Community</Button>
              <button onClick={() => setShowCompletion(false)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Close</button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default LessonDetail;
