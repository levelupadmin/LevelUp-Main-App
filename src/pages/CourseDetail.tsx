import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import { mockCourses, getAllLessons, getNextLesson } from "@/data/learnMockData";
import { Star, Clock, Users, Play, Lock, Check, ChevronRight, User, BookOpen, Image } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const CourseDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [purchaseSheet, setPurchaseSheet] = useState(false);

  const course = mockCourses.find((c) => c.slug === slug);

  useEffect(() => {
    if (!heroRef.current) return;
    const obs = new IntersectionObserver(([e]) => setShowStickyBar(!e.isIntersecting), { threshold: 0 });
    obs.observe(heroRef.current);
    return () => obs.disconnect();
  }, []);

  if (!course) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="text-muted-foreground">Course not found.</p>
        </div>
      </AppShell>
    );
  }

  const { isPurchased } = course;
  const allLessons = getAllLessons(course);
  const completedCount = course.completedLessons.length;
  const progressPct = Math.round((completedCount / course.totalLessons) * 100);
  const nextLesson = getNextLesson(course);

  const handleLessonClick = (lessonId: string, isFree: boolean) => {
    if (isPurchased || isFree) {
      navigate(`/learn/course/${slug}/lesson/${lessonId}`);
    } else {
      setPurchaseSheet(true);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6 lg:px-8">
        {/* Hero */}
        <div ref={heroRef} className="space-y-4 mb-6">
          <div className="relative aspect-video rounded-xl bg-secondary overflow-hidden border border-border">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="h-14 w-14 rounded-full bg-[hsl(var(--highlight))]/20 flex items-center justify-center">
                <Play className="h-6 w-6 text-[hsl(var(--highlight))] ml-0.5" />
              </div>
              <span className="text-xs text-muted-foreground">Preview</span>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">{course.title}</h1>
            <p className="text-sm italic text-muted-foreground mb-3">{course.tagline}</p>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-sm text-foreground">{course.instructor.name}</span>
            </div>
          </div>

          {isPurchased ? (
            <div className="flex items-center gap-3">
              <Button
                onClick={() => nextLesson && navigate(`/learn/course/${slug}/lesson/${nextLesson.id}`)}
                className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90"
              >
                Continue Learning
              </Button>
              <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">Restart</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90">
                Buy for ₹{course.price.toLocaleString("en-IN")}
              </Button>
              <Button variant="outline">Subscribe ₹499/mo</Button>
              <button className="text-sm text-[hsl(var(--highlight))] hover:underline">First lesson free</button>
            </div>
          )}

          {isPurchased && (
            <div className="space-y-1">
              <Progress value={progressPct} className="h-2 bg-secondary" />
              <p className="text-xs text-muted-foreground">
                {completedCount} of {course.totalLessons} lessons completed
              </p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Badge variant="outline" className="gap-1 bg-secondary">
            <Star className="h-3 w-3 fill-[hsl(var(--highlight))] text-[hsl(var(--highlight))]" /> {course.rating}
          </Badge>
          <Badge variant="outline" className="gap-1 bg-secondary">
            <Users className="h-3 w-3" /> {course.learners.toLocaleString()}+ learners
          </Badge>
          <Badge variant="outline" className="gap-1 bg-secondary">
            <BookOpen className="h-3 w-3" /> {course.totalLessons} lessons
          </Badge>
          <Badge variant="outline" className="gap-1 bg-secondary">
            <Clock className="h-3 w-3" /> {course.duration}
          </Badge>
          <Badge variant="outline" className="bg-secondary">{course.difficulty}</Badge>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-secondary w-full justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <p className="text-sm text-muted-foreground leading-relaxed">{course.description}</p>
            <div>
              <h3 className="text-base font-semibold text-foreground mb-3">What you'll learn</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {course.whatYoullLearn.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-[hsl(var(--highlight))] mt-0.5 shrink-0" />
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground mb-3">Skills you'll gain</h3>
              <div className="flex flex-wrap gap-2">
                {course.skills.map((s) => (
                  <Badge key={s} variant="outline" className="bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20">{s}</Badge>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground mb-3">Who this is for</h3>
              <ul className="space-y-2">
                {course.whoIsThisFor.map((p, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <ChevronRight className="h-4 w-4 text-[hsl(var(--highlight))] mt-0.5 shrink-0" />{p}
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="curriculum">
            <Accordion type="multiple" defaultValue={course.sections.map((s) => s.id)} className="space-y-2">
              {course.sections.map((section) => (
                <AccordionItem key={section.id} value={section.id} className="border border-border rounded-lg overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 text-sm font-semibold text-foreground hover:no-underline bg-secondary/50">
                    {section.title}
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    {section.lessons.map((lesson) => {
                      const isCompleted = course.completedLessons.includes(lesson.id);
                      const isCurrentNext = nextLesson?.id === lesson.id;
                      const canAccess = isPurchased || lesson.isFree;
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => handleLessonClick(lesson.id, lesson.isFree)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-t border-border hover:bg-secondary/30 ${
                            isCurrentNext && isPurchased ? "bg-[hsl(var(--highlight))]/5" : ""
                          }`}
                        >
                          <div className="shrink-0">
                            {isPurchased ? (
                              isCompleted ? (
                                <div className="h-6 w-6 rounded-full bg-[hsl(var(--highlight))]/20 flex items-center justify-center">
                                  <Check className="h-3.5 w-3.5 text-[hsl(var(--highlight))]" />
                                </div>
                              ) : (
                                <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${
                                  isCurrentNext ? "border-[hsl(var(--highlight))] bg-[hsl(var(--highlight))]/10" : "border-border"
                                }`}>
                                  {isCurrentNext && <Play className="h-3 w-3 text-[hsl(var(--highlight))]" />}
                                </div>
                              )
                            ) : canAccess ? (
                              <div className="h-6 w-6 rounded-full bg-[hsl(var(--highlight))]/10 flex items-center justify-center">
                                <Play className="h-3 w-3 text-[hsl(var(--highlight))]" />
                              </div>
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center">
                                <Lock className="h-3 w-3 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{lesson.number}.</span>
                              <span className="text-sm text-foreground truncate">{lesson.title}</span>
                              {lesson.isFree && !isPurchased && (
                                <Badge className="bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20 text-[10px] px-1.5 py-0">
                                  Free Preview
                                </Badge>
                              )}
                            </div>
                            {!canAccess && <span className="text-xs text-muted-foreground">Purchase to unlock</span>}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{lesson.duration}</span>
                        </button>
                      );
                    })}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </TabsContent>

          <TabsContent value="reviews" className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-3xl font-bold text-foreground">{course.rating}</div>
              <div>
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map((s) => (
                    <Star key={s} className={`h-4 w-4 ${s <= Math.round(course.rating) ? "fill-[hsl(var(--highlight))] text-[hsl(var(--highlight))]" : "text-muted-foreground"}`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{course.reviews.length} reviews</p>
              </div>
            </div>
            {course.reviews.map((r, i) => (
              <div key={i} className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.name}</p>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map((s) => (
                        <Star key={s} className={`h-3 w-3 ${s <= r.stars ? "fill-[hsl(var(--highlight))] text-[hsl(var(--highlight))]" : "text-muted-foreground"}`} />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{r.text}</p>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="projects" className="space-y-4">
            <h3 className="text-base font-semibold text-foreground">See what students created</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[1,2,3,4,5,6].map((i) => (
                <div key={i} className="aspect-video rounded-lg bg-secondary border border-border flex items-center justify-center">
                  <Image className="h-6 w-6 text-muted-foreground" />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Instructor */}
        <div className="mt-8 rounded-xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-accent flex items-center justify-center">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{course.instructor.name}</p>
              <p className="text-xs text-muted-foreground">Instructor</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{course.instructor.bio}</p>
          <div className="flex flex-wrap gap-2">
            {course.instructor.notableWorks.map((w) => (
              <Badge key={w} variant="outline" className="bg-secondary text-xs">{w}</Badge>
            ))}
          </div>
        </div>

        {/* Purchase Sheet */}
        <Sheet open={purchaseSheet} onOpenChange={setPurchaseSheet}>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Get access to {course.title}</SheetTitle>
            </SheetHeader>
            <div className="space-y-3 py-4">
              <Button className="w-full bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90">
                Buy for ₹{course.price.toLocaleString("en-IN")}
              </Button>
              <Button variant="outline" className="w-full">Subscribe ₹499/mo</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {showStickyBar && !isPurchased && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl lg:left-60">
          <div className="flex items-center justify-between px-4 py-3 max-w-4xl mx-auto">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{course.title}</p>
              <p className="text-xs text-muted-foreground">₹{course.price.toLocaleString("en-IN")}</p>
            </div>
            <Button size="sm" className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90 shrink-0">Buy</Button>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default CourseDetail;
