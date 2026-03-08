import AppShell from "@/components/layout/AppShell";
import { detailedCourses, workshopsList, type CourseDetailed } from "@/data/learningData";
import { cohorts } from "@/data/cohortData";
import { categories } from "@/data/mockData";
import { Star, Clock, Users, Search, Play, ArrowRight, ChevronRight, BookOpen, GraduationCap } from "lucide-react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const Learn = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const inProgressCourses = detailedCourses.filter((c) => c.progress > 0 && c.progress < 100);
  const upcomingWorkshops = workshopsList.filter((w) => !w.isPast).slice(0, 3);
  const activeCohorts = cohorts.filter((c) => c.isApplicationOpen);

  const filteredCourses = useMemo(() => {
    let result = [...detailedCourses];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.instructor.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      );
    }
    if (selectedCategory !== "all") {
      result = result.filter((c) => c.category.toLowerCase() === selectedCategory);
    }
    return result;
  }, [searchQuery, selectedCategory]);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-8 p-4 py-6 lg:p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground lg:text-3xl">Learn</h1>
          <p className="text-sm text-muted-foreground">Master your craft with India's best creators</p>
        </div>

        {/* ── Section 1: Continue Learning ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Continue Learning</h2>
            {inProgressCourses.length > 0 && (
              <button onClick={() => navigate("/learn/my-learning")} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                View all →
              </button>
            )}
          </div>
          {inProgressCourses.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
              {inProgressCourses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => navigate(course.lastLessonId ? `/learn/lesson/${course.lastLessonId}` : `/learn/course/${course.id}`)}
                  className="group min-w-[280px] max-w-[320px] shrink-0 rounded-xl border border-border bg-card overflow-hidden text-left transition-colors hover:border-muted-foreground/30"
                >
                  <div className="relative">
                    <img src={course.thumbnail} alt={course.title} className="h-36 w-full object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${course.progress}%` }} />
                    </div>
                  </div>
                  <div className="p-3.5 space-y-2">
                    <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">{course.title}</p>
                    <div className="flex items-center gap-2">
                      <img src={course.instructorImage} alt={course.instructor} className="h-5 w-5 rounded-full object-cover" />
                      <span className="text-xs text-muted-foreground">{course.instructor}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-mono">{course.progress}% complete</span>
                      <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
                        Resume <Play className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Start your first course below</p>
              <p className="text-xs text-muted-foreground mt-1">Browse our catalog and begin learning</p>
            </div>
          )}
        </section>

        {/* ── Section 2: Upcoming Workshops ── */}
        {upcomingWorkshops.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Upcoming Workshops</h2>
              <button onClick={() => navigate("/learn/workshops")} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                See all →
              </button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
              {upcomingWorkshops.map((w) => (
                <button
                  key={w.id}
                  onClick={() => navigate(`/workshops/${w.id}`)}
                  className="group min-w-[260px] max-w-[300px] shrink-0 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/30"
                >
                  <Badge variant="secondary" className="text-[10px] mb-2.5">{w.date} · {w.time}</Badge>
                  <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight mb-2">{w.title}</p>
                  <div className="flex items-center gap-2 mb-3">
                    <img src={w.instructorImage} alt={w.instructor} className="h-5 w-5 rounded-full object-cover" />
                    <span className="text-xs text-muted-foreground">{w.instructor}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground">₹{w.price}</span>
                    <span className="text-[10px] text-muted-foreground">{w.seatsRemaining}/{w.seatsTotal} seats left</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Section 3: Explore Courses ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-foreground">Explore Courses</h2>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search courses, instructors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none"
            />
          </div>

          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`flex min-w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                selectedCategory === "all"
                  ? "border-foreground/30 bg-foreground/5 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? "all" : cat.id)}
                className={`flex min-w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  selectedCategory === cat.id
                    ? "border-foreground/30 bg-foreground/5 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Course list */}
          <div className="space-y-3">
            {filteredCourses.map((course) => (
              <CourseCard key={course.id} course={course} onClick={() => navigate(`/learn/course/${course.id}`)} />
            ))}
            {filteredCourses.length === 0 && (
              <div className="text-center py-12">
                <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">No courses found</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different search or category</p>
              </div>
            )}
          </div>
        </section>

        {/* ── Section 4: Cohort Programs ── */}
        {activeCohorts.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Cohort Programs</h2>
              <button onClick={() => navigate("/learn")} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                Learn more →
              </button>
            </div>
            {activeCohorts.slice(0, 1).map((cohort) => (
              <button
                key={cohort.id}
                onClick={() => navigate(`/learn/cohort/${cohort.id}`)}
                className="group relative w-full overflow-hidden rounded-2xl text-left transition-transform hover:scale-[1.005]"
              >
                <div className="relative h-48 sm:h-56">
                  <img src={cohort.thumbnail} alt={cohort.title} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
                  <div className="absolute top-3 left-3">
                    <Badge className="bg-primary text-primary-foreground text-[10px] font-bold">
                      <GraduationCap className="h-3 w-3 mr-1" />
                      Cohort Program
                    </Badge>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                    <p className="text-xs text-white/60 mb-1">{cohort.category} · {cohort.duration}</p>
                    <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">{cohort.title}</h3>
                    <p className="text-sm text-white/70 mt-1 line-clamp-1">{cohort.subtitle}</p>
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex items-center gap-1.5 text-white/70 text-xs">
                        <Users className="h-3.5 w-3.5" />
                        {cohort.seatsTotal - cohort.seatsFilled}/{cohort.seatsTotal} seats
                      </div>
                      <span className="text-xs font-semibold text-white flex items-center gap-1">
                        Learn more <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
};

// ── Course Card Component ──
function CourseCard({ course, onClick }: { course: CourseDetailed; onClick: () => void }) {
  const isEnrolled = course.purchased || course.progress > 0;

  return (
    <button
      onClick={onClick}
      className="group flex w-full gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-muted-foreground/30 sm:gap-4"
    >
      {/* Thumbnail */}
      <div className="relative h-24 w-36 shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-44">
        <img src={course.thumbnail} alt={course.title} className="h-full w-full object-cover" />
        {isEnrolled && course.progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
            <div className="h-full bg-primary" style={{ width: `${course.progress}%` }} />
          </div>
        )}
        {!isEnrolled && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
            <Play className="h-8 w-8 text-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">{course.title}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <img src={course.instructorImage} alt={course.instructor} className="h-4 w-4 rounded-full object-cover" />
            <span className="text-xs text-muted-foreground truncate">{course.instructor}</span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3 text-[hsl(var(--highlight))] fill-[hsl(var(--highlight))]" />
            <span className="font-semibold text-foreground">{course.rating}</span>
            <span>({course.ratingsCount})</span>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {course.duration}
          </span>
          {isEnrolled ? (
            <Badge variant="secondary" className="text-[9px]">
              {course.progress === 100 ? "Completed" : `${course.progress}%`}
            </Badge>
          ) : course.isSubscription ? (
            <Badge variant="secondary" className="text-[9px]">Included in subscription</Badge>
          ) : (
            <span className="text-xs font-bold text-foreground">₹{course.price.toLocaleString()}</span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0 hidden sm:block" />
    </button>
  );
}

import courseCinematography from "@/assets/course-cinematography.jpg";

export default Learn;
