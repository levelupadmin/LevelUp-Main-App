import AppShell from "@/components/layout/AppShell";
import { detailedCourses } from "@/data/learningData";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, CheckCircle2, ArrowRight, BookOpen, Download, Trophy } from "lucide-react";
import { useState } from "react";

type SubTab = "in-progress" | "completed" | "downloads";

const MyLearning = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SubTab>("in-progress");

  const inProgressCourses = detailedCourses.filter((c) => c.progress > 0 && c.progress < 100);
  const completedCourses = detailedCourses.filter((c) => c.progress === 100);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground lg:text-3xl">My Learning</h1>
          <p className="text-sm text-muted-foreground">Track your progress and continue where you left off</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "In Progress", value: inProgressCourses.length, icon: Play },
            { label: "Completed", value: completedCourses.length, icon: Trophy },
            { label: "Total Lessons", value: detailedCourses.reduce((a, c) => a + c.lessonsCount, 0), icon: BookOpen },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-4 text-center">
              <stat.icon className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Sub tabs */}
        <div className="flex items-center gap-6 border-b border-border">
          {([
            { key: "in-progress" as SubTab, label: "In Progress" },
            { key: "completed" as SubTab, label: "Completed" },
            { key: "downloads" as SubTab, label: "Downloads" },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "in-progress" && (
          <div className="space-y-3">
            {inProgressCourses.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-foreground font-medium">No courses in progress</p>
                <Button size="sm" className="mt-4" onClick={() => navigate("/learn")}>Browse courses</Button>
              </div>
            ) : (
              inProgressCourses.map((course) => {
                const totalLessons = course.modules.reduce((a, m) => a + m.lessons.length, 0);
                const completed = course.modules.reduce(
                  (a, m) => a + m.lessons.filter((l) => l.state === "completed").length, 0
                );
                return (
                  <div
                    key={course.id}
                    onClick={() => navigate(`/learn/course/${course.id}`)}
                    className="group cursor-pointer rounded-lg border border-border bg-card overflow-hidden transition-colors hover:border-foreground/20"
                  >
                    <div className="flex gap-4 p-4">
                      <img src={course.thumbnail} alt={course.title} className="h-24 w-36 rounded-md object-cover shrink-0" />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <Badge variant="secondary" className="text-[10px]">{course.category}</Badge>
                        <h3 className="text-sm font-bold text-foreground">{course.title}</h3>
                        <p className="text-xs text-muted-foreground">{course.instructor}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Progress value={course.progress} className="h-1.5 flex-1" />
                          <span className="text-xs font-mono text-muted-foreground">{course.progress}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{completed}/{totalLessons} lessons completed</p>
                      </div>
                    </div>
                    {course.lastLessonId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/learn/lesson/${course.lastLessonId}`);
                        }}
                        className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 bg-secondary/20 transition-colors hover:bg-secondary/30"
                      >
                        <Play className="h-3 w-3 text-foreground" />
                        <span className="text-xs text-muted-foreground">Continue where you left off</span>
                        <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === "completed" && (
          <div className="space-y-3">
            {completedCourses.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <Trophy className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-foreground font-medium">No completed courses yet</p>
                <p className="text-xs text-muted-foreground mt-1">Keep learning to see them here</p>
              </div>
            ) : (
              completedCourses.map((course) => (
                <div
                  key={course.id}
                  onClick={() => navigate(`/learn/course/${course.id}`)}
                  className="group cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20"
                >
                  <div className="flex gap-4">
                    <img src={course.thumbnail} alt={course.title} className="h-20 w-28 rounded-md object-cover" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-foreground">{course.title}</h3>
                      <p className="text-xs text-muted-foreground">{course.instructor}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                        <span>Completed</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "downloads" && (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
            <Download className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Offline downloads coming soon</p>
            <p className="text-xs text-muted-foreground mt-1">Download lessons in 720p, 1080p, or audio-only for offline viewing</p>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default MyLearning;
