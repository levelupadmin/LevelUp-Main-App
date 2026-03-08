import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import { getCourseById } from "@/data/learningData";
import { Star, Clock, Users, Play, Lock, CheckCircle2, Download, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import PurchaseModal from "@/components/learn/PurchaseModal";
import { useToast } from "@/hooks/use-toast";

const CourseDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const course = getCourseById(slug || "");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchased, setPurchased] = useState(course?.purchased || false);

  if (!course) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-32">
          <p className="text-muted-foreground">Course not found</p>
        </div>
      </AppShell>
    );
  }

  const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);
  const completedLessons = course.modules.reduce(
    (acc, m) => acc + m.lessons.filter((l) => l.state === "completed").length,
    0
  );

  const handlePurchase = (type: "one-time" | "subscription") => {
    setPurchased(true);
    setPurchaseOpen(false);
    toast({
      title: type === "one-time" ? "Course purchased!" : "Subscription activated!",
      description: type === "one-time"
        ? `You now have lifetime access to ${course.title}`
        : "You now have access to all masterclasses",
    });
  };

  const handleContinue = () => {
    if (course.lastLessonId) {
      navigate(`/learn/lesson/${course.lastLessonId}`);
    } else {
      const firstLesson = course.modules[0]?.lessons[0];
      if (firstLesson) navigate(`/learn/lesson/${firstLesson.id}`);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        {/* Hero — 16:9 with play button overlay */}
        <div className="relative aspect-video bg-black overflow-hidden">
          <img src={course.thumbnail} alt={course.title} className="h-full w-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={handleContinue}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/10 backdrop-blur-md border border-foreground/20 transition-all hover:bg-foreground/20 hover:scale-105"
            >
              <Play className="h-7 w-7 text-white ml-1" />
            </button>
          </div>
          {/* Progress overlay for enrolled */}
          {purchased && course.progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-muted/30">
              <div className="h-full bg-primary" style={{ width: `${course.progress}%` }} />
            </div>
          )}
        </div>

        {/* Course info */}
        <div className="px-4 pt-5 pb-4 lg:px-6 space-y-4">
          {/* Title + instructor */}
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge variant="secondary" className="text-[10px]">{course.category}</Badge>
              <Badge variant="secondary" className="text-[10px]">{course.difficulty}</Badge>
            </div>
            <h1 className="text-2xl font-bold text-foreground lg:text-3xl leading-tight">{course.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{course.subtitle}</p>
          </div>

          {/* Instructor row */}
          <div className="flex items-center gap-3">
            <img src={course.instructorImage} alt={course.instructor} className="h-9 w-9 rounded-full object-cover border border-border" />
            <div>
              <p className="text-sm text-muted-foreground">by <span className="font-semibold text-foreground">{course.instructor}</span></p>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 text-[hsl(var(--highlight))] fill-[hsl(var(--highlight))]" />
              <span className="font-semibold text-foreground">{course.rating}</span>
              ({course.ratingsCount.toLocaleString()})
            </span>
            <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {course.students.toLocaleString()} students</span>
            <span className="flex items-center gap-1"><Play className="h-4 w-4" /> {totalLessons} lessons</span>
            <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {course.duration}</span>
          </div>

          {/* Progress bar for enrolled */}
          {purchased && course.progress > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <Progress value={course.progress} className="h-2 flex-1" />
              <span className="text-sm font-mono text-muted-foreground">{course.progress}%</span>
              <span className="text-xs text-muted-foreground">{completedLessons}/{totalLessons}</span>
            </div>
          )}

          {/* CTAs */}
          <div className="flex flex-wrap gap-3">
            {purchased ? (
              <Button onClick={handleContinue} className="gap-2">
                <Play className="h-4 w-4" />
                {course.progress > 0 ? "Continue Learning" : "Start Course"}
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => setPurchaseOpen(true)}
                  className="gap-2 bg-[hsl(var(--highlight))] text-background hover:bg-[hsl(var(--highlight))]/90"
                >
                  Buy ₹{course.price.toLocaleString()}
                </Button>
                <Button variant="outline" onClick={() => setPurchaseOpen(true)} className="gap-2">
                  Subscribe ₹{course.subscriptionPrice}/mo
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tabbed content */}
        <div className="px-4 pb-8 lg:px-6">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="bg-muted border border-border w-full justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
              <TabsTrigger value="projects">Projects</TabsTrigger>
            </TabsList>

            {/* Tab 1 — Overview */}
            <TabsContent value="overview" className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-foreground mb-2">About this course</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{course.description}</p>
              </div>

              <div>
                <h3 className="text-base font-bold text-foreground mb-2">What you'll learn</h3>
                <ul className="space-y-2">
                  {course.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-[hsl(var(--success))] shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>

              {course.skills && course.skills.length > 0 && (
                <div>
                  <h3 className="text-base font-bold text-foreground mb-2">Skills covered</h3>
                  <div className="flex flex-wrap gap-2">
                    {course.skills.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Tab 2 — Curriculum */}
            <TabsContent value="curriculum" className="space-y-2">
              <Accordion type="multiple" defaultValue={[course.modules[0]?.title || ""]} className="space-y-2">
                {course.modules.map((mod, mi) => {
                  const modCompleted = mod.lessons.filter((l) => l.state === "completed").length;
                  return (
                    <AccordionItem key={mod.title} value={mod.title} className="rounded-lg border border-border bg-card overflow-hidden">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex items-center gap-3 text-left">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs font-bold text-secondary-foreground">
                            {mi + 1}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{mod.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {mod.lessons.length} lessons · {modCompleted}/{mod.lessons.length} completed
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-0 pb-0">
                        <div className="divide-y divide-border border-t border-border">
                          {mod.lessons.map((lesson) => {
                            const isLocked = !purchased && !lesson.isFree;
                            return (
                              <button
                                key={lesson.id}
                                onClick={() => !isLocked && navigate(`/learn/lesson/${lesson.id}`)}
                                disabled={isLocked}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {lesson.state === "completed" ? (
                                  <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
                                ) : lesson.state === "in_progress" ? (
                                  <Play className="h-4 w-4 text-foreground shrink-0" />
                                ) : isLocked ? (
                                  <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                                ) : (
                                  <Play className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-foreground truncate">{lesson.title}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {lesson.isFree && <Badge variant="secondary" className="text-[9px]">FREE</Badge>}
                                  <span className="text-xs text-muted-foreground font-mono">{lesson.duration}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </TabsContent>

            {/* Tab 3 — Reviews */}
            <TabsContent value="reviews" className="space-y-3">
              {course.reviews.length > 0 ? (
                <>
                  {course.reviews.slice(0, 3).map((review) => (
                    <div key={review.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <img src={review.avatar} alt={review.author} className="h-8 w-8 rounded-full object-cover" />
                        <div>
                          <p className="text-sm font-semibold text-foreground">{review.author}</p>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-3 w-3 ${i < review.rating ? "text-[hsl(var(--highlight))] fill-[hsl(var(--highlight))]" : "text-muted-foreground"}`}
                              />
                            ))}
                            <span className="ml-1 text-xs text-muted-foreground">{review.date}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{review.text}</p>
                    </div>
                  ))}
                  {course.reviews.length > 3 && (
                    <button className="w-full py-3 text-sm font-semibold text-foreground hover:underline">
                      See all {course.reviews.length} reviews
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No reviews yet</p>
                </div>
              )}
            </TabsContent>

            {/* Tab 4 — Projects */}
            <TabsContent value="projects">
              {course.sampleProjects.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {course.sampleProjects.map((p) => (
                    <div key={p.title} className="overflow-hidden rounded-lg border border-border">
                      <img src={p.image} alt={p.title} className="aspect-video w-full object-cover" />
                      <div className="p-3">
                        <p className="text-xs font-semibold text-foreground truncate">{p.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No student projects yet</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <PurchaseModal
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
        course={course}
        onPurchase={handlePurchase}
      />
    </AppShell>
  );
};

export default CourseDetail;
