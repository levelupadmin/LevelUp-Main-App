import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import { getLessonById, getCourseById, getCourseLessons } from "@/data/learningData";
import {
  Play, Pause, CheckCircle2, ChevronLeft, ChevronRight, Share2,
  FileText, Send, Upload, BarChart3, MessageSquare, Download,
  SkipBack, SkipForward, Volume2, Maximize, Settings,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const LessonDetail = () => {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const lesson = getLessonById(lessonId || "");
  const course = lesson ? getCourseById(lesson.courseId) : null;
  const courseLessons = lesson ? getCourseLessons(lesson.courseId) : [];
  const currentIndex = courseLessons.findIndex((l) => l.id === lesson?.id);

  const [isPlaying, setIsPlaying] = useState(false);
  const [videoProgress, setVideoProgress] = useState(lesson?.videoProgress || 0);
  const [activitySubmitted, setActivitySubmitted] = useState(lesson?.microActivity.submitted || false);
  const [activityAnswer, setActivityAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  if (!lesson || !course) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-32">
          <p className="text-muted-foreground">Lesson not found</p>
        </div>
      </AppShell>
    );
  }

  const canComplete = videoProgress >= 80 && activitySubmitted;
  const isCompleted = lesson.state === "completed";
  const prevLesson = currentIndex > 0 ? courseLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < courseLessons.length - 1 ? courseLessons[currentIndex + 1] : null;

  const handlePlayToggle = () => {
    setIsPlaying(!isPlaying);
    if (!isPlaying && videoProgress < 100) {
      // Simulate progress
      setVideoProgress(Math.min(videoProgress + 25, 100));
    }
  };

  const handleSubmitActivity = () => {
    if (lesson.microActivity.type === "reflection" || lesson.microActivity.type === "upload") {
      if (!activityAnswer.trim()) return;
    } else if (!selectedOption) return;

    setActivitySubmitted(true);
    toast({ title: "Activity submitted!", description: "Great work — keep going." });
  };

  const handleShare = () => {
    toast({
      title: "Shared to community!",
      description: "Your progress has been shared with the Level Up community.",
    });
  };

  const handleMarkComplete = () => {
    toast({ title: "Lesson completed!", description: `You've completed "${lesson.title}"` });
    if (nextLesson) {
      navigate(`/learn/lesson/${nextLesson.id}`);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        {/* Back nav */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <button
            onClick={() => navigate(`/learn/course/${course.id}`)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="truncate max-w-[200px]">{course.title}</span>
          </button>
          <span className="text-xs text-muted-foreground ml-auto font-mono">
            {currentIndex + 1} / {courseLessons.length}
          </span>
        </div>

        {/* Video Player Placeholder */}
        <div className="relative bg-[hsl(0,0%,5%)] aspect-video flex items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center">
            <img src={course.thumbnail} alt="" className="h-full w-full object-cover opacity-20" />
          </div>
          <div className="relative z-10 flex flex-col items-center gap-4">
            <button
              onClick={handlePlayToggle}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/10 backdrop-blur-md border border-foreground/20 transition-all hover:bg-foreground/20 hover:scale-105"
            >
              {isPlaying ? (
                <Pause className="h-7 w-7 text-foreground" />
              ) : (
                <Play className="h-7 w-7 text-foreground ml-1" />
              )}
            </button>
            <p className="text-xs text-muted-foreground">Click to simulate video progress</p>
          </div>

          {/* Video controls bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[hsl(0,0%,5%)] to-transparent p-4">
            <div className="mb-2 h-1 w-full rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${videoProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <button onClick={handlePlayToggle} className="hover:text-foreground transition-colors">
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button className="hover:text-foreground transition-colors"><SkipBack className="h-4 w-4" /></button>
                <button className="hover:text-foreground transition-colors"><SkipForward className="h-4 w-4" /></button>
                <span className="font-mono">{Math.floor(videoProgress * 0.18)}:00 / 18:00</span>
              </div>
              <div className="flex items-center gap-3">
                <button className="hover:text-foreground transition-colors"><Volume2 className="h-4 w-4" /></button>
                <button className="hover:text-foreground transition-colors"><Settings className="h-4 w-4" /></button>
                <button className="hover:text-foreground transition-colors"><Maximize className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </div>

        {/* Lesson header */}
        <div className="px-4 py-4 border-b border-border lg:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-foreground lg:text-xl">{lesson.title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{course.instructor} · {lesson.duration}</p>
            </div>
            <div className="flex items-center gap-2">
              {isCompleted && (
                <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20 text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Share</span>
              </Button>
            </div>
          </div>

          {/* Completion requirements */}
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className={`flex items-center gap-1.5 ${videoProgress >= 80 ? "text-[hsl(var(--success))]" : ""}`}>
              {videoProgress >= 80 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              Video {videoProgress}% watched
            </span>
            <span className={`flex items-center gap-1.5 ${activitySubmitted ? "text-[hsl(var(--success))]" : ""}`}>
              {activitySubmitted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
              Activity {activitySubmitted ? "done" : "pending"}
            </span>
          </div>
        </div>

        {/* Content tabs */}
        <div className="px-4 py-4 lg:px-6">
          <Tabs defaultValue="activity" className="space-y-4">
            <TabsList className="bg-secondary/50 border border-border">
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="downloads">Downloads</TabsTrigger>
            </TabsList>

            <TabsContent value="activity" className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  {lesson.microActivity.type === "quiz" && <BarChart3 className="h-4 w-4 text-foreground" />}
                  {lesson.microActivity.type === "reflection" && <MessageSquare className="h-4 w-4 text-foreground" />}
                  {lesson.microActivity.type === "upload" && <Upload className="h-4 w-4 text-foreground" />}
                  {lesson.microActivity.type === "poll" && <BarChart3 className="h-4 w-4 text-foreground" />}
                  <Badge variant="secondary" className="text-[10px] capitalize">{lesson.microActivity.type}</Badge>
                </div>
                <p className="text-sm font-semibold text-foreground mb-4">{lesson.microActivity.prompt}</p>

                {activitySubmitted ? (
                  <div className="rounded-lg bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/20 p-4 text-center">
                    <CheckCircle2 className="h-6 w-6 text-[hsl(var(--success))] mx-auto mb-2" />
                    <p className="text-sm font-semibold text-foreground">Activity completed!</p>
                    <p className="text-xs text-muted-foreground mt-1">Great work on this lesson</p>
                    <Button variant="outline" size="sm" onClick={handleShare} className="mt-3 gap-1.5">
                      <Share2 className="h-3.5 w-3.5" />
                      Share this result to community
                    </Button>
                  </div>
                ) : (
                  <>
                    {(lesson.microActivity.type === "quiz" || lesson.microActivity.type === "poll") &&
                      lesson.microActivity.options && (
                        <div className="space-y-2 mb-4">
                          {lesson.microActivity.options.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => setSelectedOption(opt)}
                              className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                                selectedOption === opt
                                  ? "border-foreground/40 bg-foreground/5 text-foreground"
                                  : "border-border bg-secondary/20 text-muted-foreground hover:border-foreground/20"
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}

                    {(lesson.microActivity.type === "reflection" || lesson.microActivity.type === "upload") && (
                      <textarea
                        value={activityAnswer}
                        onChange={(e) => setActivityAnswer(e.target.value)}
                        placeholder={
                          lesson.microActivity.type === "reflection"
                            ? "Write your reflection..."
                            : "Describe your upload or paste a link..."
                        }
                        rows={3}
                        className="mb-4 w-full rounded-lg border border-border bg-secondary/20 p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none resize-none"
                      />
                    )}

                    <Button onClick={handleSubmitActivity} className="gap-2">
                      <Send className="h-4 w-4" />
                      Submit
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="notes">
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-2">Lesson Notes</h3>
                <pre className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed font-body">{lesson.notes}</pre>
              </div>
            </TabsContent>

            <TabsContent value="downloads">
              <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
                <Download className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Download this lesson for offline viewing</p>
                <div className="flex justify-center gap-2 mt-3">
                  {["720p", "1080p", "Audio"].map((q) => (
                    <Badge key={q} variant="secondary" className="text-[10px] cursor-pointer hover:bg-secondary/80">
                      {q}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3 italic">Coming soon</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Bottom action bar */}
        <div className="sticky bottom-0 border-t border-border bg-background/80 backdrop-blur-md px-4 py-3 lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={!prevLesson}
              onClick={() => prevLesson && navigate(`/learn/lesson/${prevLesson.id}`)}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            {canComplete && !isCompleted ? (
              <Button onClick={handleMarkComplete} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Complete & Continue
              </Button>
            ) : (
              <div className="text-center">
                {!canComplete && !isCompleted && (
                  <p className="text-xs text-muted-foreground">
                    {videoProgress < 80 ? "Watch 80%+ video" : "Complete the activity"} to unlock
                  </p>
                )}
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              disabled={!nextLesson}
              onClick={() => nextLesson && navigate(`/learn/lesson/${nextLesson.id}`)}
              className="gap-1.5"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default LessonDetail;
