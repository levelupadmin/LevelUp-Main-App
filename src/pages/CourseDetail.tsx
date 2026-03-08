import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import { getCourseById } from "@/data/learningData";
import { Star, Clock, Users, Play, Lock, CheckCircle2, ChevronDown, ChevronRight, Download, ArrowRight, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  const [activeImageIndex, setActiveImageIndex] = useState(0);

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
        {/* Hero */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img src={course.thumbnail} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-background/40" />
          </div>
          <div className="relative px-4 pb-6 pt-8 lg:px-6 lg:pt-12">
            <div className="flex flex-col lg:flex-row lg:gap-8">
              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-[10px]">{course.category}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{course.difficulty}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{course.format}</Badge>
                </div>
                <h1 className="text-2xl font-bold text-foreground lg:text-4xl leading-tight">{course.title}</h1>
                <p className="text-sm text-muted-foreground max-w-xl">{course.subtitle}</p>

                <div className="flex items-center gap-3">
                  <img src={course.instructorImage} alt={course.instructor} className="h-10 w-10 rounded-full object-cover border-2 border-border" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{course.instructor}</p>
                    <p className="text-xs text-muted-foreground">{course.instructorBio}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-[hsl(var(--highlight))]" />
                    <span className="font-semibold text-foreground">{course.rating}</span>
                    <span>({course.ratingsCount.toLocaleString()} ratings)</span>
                  </span>
                  <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {course.students.toLocaleString()} students</span>
                  <span className="flex items-center gap-1"><Play className="h-4 w-4" /> {totalLessons} lessons</span>
                  <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {course.duration}</span>
                </div>

                {/* Progress for enrolled */}
                {purchased && course.progress > 0 && (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    <Progress value={course.progress} className="h-2 flex-1" />
                    <span className="text-sm font-mono text-muted-foreground">{course.progress}%</span>
                    <span className="text-xs text-muted-foreground">{completedLessons}/{totalLessons} lessons</span>
                  </div>
                )}

                {/* CTAs */}
                <div className="flex flex-wrap gap-3 pt-2">
                  {purchased ? (
                    <Button onClick={handleContinue} className="gap-2">
                      <Play className="h-4 w-4" />
                      {course.progress > 0 ? "Continue Learning" : "Start Course"}
                    </Button>
                  ) : (
                    <>
                      <Button onClick={() => setPurchaseOpen(true)} className="gap-2">
                        Buy for ₹{course.price.toLocaleString()}
                      </Button>
                      <Button variant="outline" onClick={() => setPurchaseOpen(true)} className="gap-2">
                        Subscribe ₹{course.subscriptionPrice}/mo
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Thumbnail on desktop */}
              <div className="hidden lg:block lg:w-80 shrink-0 mt-4 lg:mt-0">
                <div className="overflow-hidden rounded-lg border border-border shadow-elevated">
                  <img src={course.thumbnail} alt={course.title} className="h-48 w-full object-cover" />
                  <div className="bg-card p-4 space-y-3">
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {course.highlights.map((h) => (
                        <div key={h} className="flex items-start gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-[hsl(var(--success))] shrink-0" />
                          <span>{h}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8 px-4 py-6 lg:px-6">
          {/* About */}
          <section>
            <h2 className="text-lg font-bold text-foreground mb-3">About this course</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{course.description}</p>
            {/* Mobile highlights */}
            <div className="mt-4 space-y-2 lg:hidden">
              {course.highlights.map((h) => (
                <div key={h} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-[hsl(var(--success))] shrink-0" />
                  <span>{h}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Curriculum */}
          <section>
            <h2 className="text-lg font-bold text-foreground mb-3">Curriculum</h2>
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
                                <div className="relative h-4 w-4 shrink-0">
                                  <Play className="h-4 w-4 text-foreground" />
                                </div>
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
          </section>

          {/* Sample Projects */}
          {course.sampleProjects.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-foreground mb-3">Student Projects</h2>
              <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
                {course.sampleProjects.map((p) => (
                  <div key={p.title} className="min-w-[200px] overflow-hidden rounded-lg border border-border">
                    <img src={p.image} alt={p.title} className="h-28 w-full object-cover" />
                    <div className="p-3">
                      <p className="text-xs font-semibold text-foreground truncate">{p.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Reviews */}
          {course.reviews.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-foreground mb-3">Reviews</h2>
              <div className="space-y-3">
                {course.reviews.map((review) => (
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
              </div>
            </section>
          )}

          {/* Download section placeholder */}
          <section>
            <h2 className="text-lg font-bold text-foreground mb-3">Offline Access</h2>
            <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
              <Download className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Download lessons for offline viewing</p>
              <p className="text-xs text-muted-foreground mt-1">Choose quality: 720p · 1080p · Audio only</p>
              <p className="text-xs text-muted-foreground mt-3 italic">Coming soon</p>
            </div>
          </section>
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
