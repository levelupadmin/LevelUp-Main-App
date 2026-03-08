import AppShell from "@/components/layout/AppShell";
import { detailedCourses, type CourseDetailed, type Difficulty } from "@/data/learningData";
import { cohorts } from "@/data/cohortData";
import { categories } from "@/data/mockData";
import { Star, Clock, Users, Search, SlidersHorizontal, BookOpen, ArrowRight, Play, CheckCircle2, Sparkles, UsersRound, CalendarDays, GraduationCap, Award } from "lucide-react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Tab = "catalog" | "my-learning";
type SortOption = "newest" | "popular" | "rated";
type DurationFilter = "all" | "short" | "medium" | "long";
type CourseFormat = "Masterclass" | "Cohort" | "Workshop";

const FORMAT_ORDER: CourseFormat[] = ["Masterclass", "Cohort", "Workshop"];

const FORMAT_META: Record<CourseFormat, { label: string; description: string; cta: string; icon: React.ReactNode }> = {
  Masterclass: {
    label: "Masterclasses",
    description: "Self-paced deep dives by India's top creators",
    cta: "Subscribe Now",
    icon: <Sparkles className="h-4 w-4" />,
  },
  Cohort: {
    label: "Cohorts",
    description: "Live, group-based learning with mentorship",
    cta: "Request Your Invite",
    icon: <UsersRound className="h-4 w-4" />,
  },
  Workshop: {
    label: "Workshops",
    description: "Hands-on, focused sessions to build real skills",
    cta: "Enroll Now",
    icon: <CalendarDays className="h-4 w-4" />,
  },
};

const Learn = () => {
  const [activeTab, setActiveTab] = useState<Tab>("catalog");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | "all">("all");
  const [selectedDuration, setSelectedDuration] = useState<DurationFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();

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

    if (selectedDifficulty !== "all") {
      result = result.filter((c) => c.difficulty === selectedDifficulty);
    }

    if (selectedDuration !== "all") {
      const getDurationMinutes = (d: string) => {
        const h = parseInt(d.match(/(\d+)h/)?.[1] || "0");
        const m = parseInt(d.match(/(\d+)m/)?.[1] || "0");
        return h * 60 + m;
      };
      result = result.filter((c) => {
        const mins = getDurationMinutes(c.duration);
        if (selectedDuration === "short") return mins < 180;
        if (selectedDuration === "medium") return mins >= 180 && mins <= 360;
        return mins > 360;
      });
    }

    if (sortBy === "popular") result.sort((a, b) => b.students - a.students);
    else if (sortBy === "rated") result.sort((a, b) => b.rating - a.rating);

    return result;
  }, [searchQuery, selectedCategory, selectedDifficulty, selectedDuration, sortBy]);

  const instructors = useMemo(
    () => [...new Set(detailedCourses.map((c) => c.instructor))],
    []
  );
  const [selectedInstructor, setSelectedInstructor] = useState<string>("all");

  const finalCourses = useMemo(() => {
    if (selectedInstructor === "all") return filteredCourses;
    return filteredCourses.filter((c) => c.instructor === selectedInstructor);
  }, [filteredCourses, selectedInstructor]);

  const groupedByFormat = useMemo(() => {
    const groups: Record<CourseFormat, CourseDetailed[]> = {
      Masterclass: [],
      Cohort: [],
      Workshop: [],
    };
    finalCourses.forEach((c) => {
      if (groups[c.format]) groups[c.format].push(c);
    });
    return groups;
  }, [finalCourses]);

  // Filter cohorts by selected category
  const filteredCohorts = useMemo(() => {
    let result = [...cohorts];
    if (selectedCategory !== "all") {
      result = result.filter((c) => c.category.toLowerCase() === selectedCategory);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || c.mentors.some((m) => m.name.toLowerCase().includes(q))
      );
    }
    return result;
  }, [selectedCategory, searchQuery]);

  const inProgressCourses = detailedCourses.filter((c) => c.progress > 0 && c.progress < 100);
  const completedCourses = detailedCourses.filter((c) => c.progress === 100);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground lg:text-3xl">Learn</h1>
            <p className="text-sm text-muted-foreground">Master your craft with India's best creators</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-border">
          {([
            { key: "catalog" as Tab, label: "All Courses" },
            { key: "my-learning" as Tab, label: "My Learning" },
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

        {activeTab === "catalog" && (
          <>
            {/* Search + Filter toggle */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search courses, instructors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none"
                />
              </div>
              <Button
                variant="outline"
                size="default"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
              </Button>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[140px] hidden sm:flex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">Most Popular</SelectItem>
                  <SelectItem value="rated">Highest Rated</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filters panel */}
            {showFilters && (
              <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-card p-4">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.icon} {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedDifficulty} onValueChange={(v) => setSelectedDifficulty(v as Difficulty | "all")}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="Beginner">Beginner</SelectItem>
                    <SelectItem value="Intermediate">Intermediate</SelectItem>
                    <SelectItem value="Advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedDuration} onValueChange={(v) => setSelectedDuration(v as DurationFilter)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Duration</SelectItem>
                    <SelectItem value="short">Under 3h</SelectItem>
                    <SelectItem value="medium">3–6h</SelectItem>
                    <SelectItem value="long">Over 6h</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedInstructor} onValueChange={setSelectedInstructor}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Instructor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Instructors</SelectItem>
                    {instructors.map((i) => (
                      <SelectItem key={i} value={i}>{i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto hide-scrollbar">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`flex min-w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  selectedCategory === "all"
                    ? "border-foreground/30 bg-foreground/5 text-foreground"
                    : "border-border bg-card text-foreground hover:border-foreground/20"
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
                      : "border-border bg-card text-foreground hover:border-foreground/20"
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Results count */}
            <p className="text-xs text-muted-foreground">{finalCourses.length} course{finalCourses.length !== 1 ? "s" : ""} found</p>

            {/* Grouped course sections */}
            <div className="space-y-8">
              {FORMAT_ORDER.map((format) => {
                const meta = FORMAT_META[format];

                // For Cohort format, render cohort cards from cohortData
                if (format === "Cohort") {
                  if (filteredCohorts.length === 0) return null;
                  return (
                    <section key={format} className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{meta.icon}</span>
                        <div>
                          <h2 className="text-lg font-bold text-foreground">{meta.label}</h2>
                          <p className="text-xs text-muted-foreground">{meta.description}</p>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredCohorts.map((cohort) => (
                          <CohortCard key={cohort.id} cohort={cohort} onClick={() => navigate(`/learn/cohort/${cohort.id}`)} />
                        ))}
                      </div>
                    </section>
                  );
                }

                // For Masterclass / Workshop, render course cards
                const courses = groupedByFormat[format];
                if (courses.length === 0) return null;
                return (
                  <section key={format} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{meta.icon}</span>
                      <div>
                        <h2 className="text-lg font-bold text-foreground">{meta.label}</h2>
                        <p className="text-xs text-muted-foreground">{meta.description}</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {courses.map((course) => (
                        <CourseCard
                          key={course.id}
                          course={course}
                          ctaLabel={meta.cta}
                          onClick={() => navigate(`/learn/course/${course.id}`)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>

            {finalCourses.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground">No courses found</p>
                <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters or search query</p>
              </div>
            )}
          </>
        )}

        {activeTab === "my-learning" && (
          <div className="space-y-8">
            {inProgressCourses.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-foreground">In Progress</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {inProgressCourses.map((course) => (
                    <div
                      key={course.id}
                      onClick={() => navigate(`/learn/course/${course.id}`)}
                      className="group cursor-pointer rounded-lg border border-border bg-card overflow-hidden transition-colors hover:border-foreground/20"
                    >
                      <div className="flex gap-4 p-4">
                        <img src={course.thumbnail} alt={course.title} className="h-20 w-28 rounded-md object-cover" />
                        <div className="flex-1 min-w-0">
                          <Badge variant="secondary" className="text-[10px] mb-1">{course.category}</Badge>
                          <h3 className="text-sm font-bold text-foreground truncate">{course.title}</h3>
                          <p className="text-xs text-muted-foreground">{course.instructor}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <Progress value={course.progress} className="h-1.5 flex-1" />
                            <span className="text-xs font-mono text-muted-foreground">{course.progress}%</span>
                          </div>
                        </div>
                      </div>
                      {course.lastLessonId && (
                        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 bg-secondary/20">
                          <Play className="h-3 w-3 text-foreground" />
                          <span className="text-xs text-muted-foreground">Continue where you left off</span>
                          <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completedCourses.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-foreground">Completed</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {completedCourses.map((course) => (
                    <div
                      key={course.id}
                      onClick={() => navigate(`/learn/course/${course.id}`)}
                      className="group cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20"
                    >
                      <div className="flex gap-4">
                        <img src={course.thumbnail} alt={course.title} className="h-16 w-24 rounded-md object-cover" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-foreground truncate">{course.title}</h3>
                          <p className="text-xs text-muted-foreground">{course.instructor}</p>
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                            <span>Completed</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inProgressCourses.length === 0 && completedCourses.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground">No courses yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Start your learning journey today</p>
                <Button size="sm" onClick={() => setActiveTab("catalog")}>Browse courses</Button>
              </div>
            )}

            <div className="space-y-3">
              <h2 className="text-lg font-bold text-foreground">Downloads</h2>
              <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
                <p className="text-sm text-muted-foreground">Offline downloads coming soon</p>
                <p className="text-xs text-muted-foreground mt-1">Download lessons for offline viewing</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
};

const CourseCard = ({ course, ctaLabel, onClick }: { course: CourseDetailed; ctaLabel: string; onClick: () => void }) => (
  <div
    onClick={onClick}
    className="group cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-foreground/20 hover:shadow-elevated"
  >
    <div className="relative">
      <img src={course.thumbnail} alt={course.title} className="h-40 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-card/60 to-transparent" />
      {course.isSubscription && (
        <Badge className="absolute right-3 top-3 bg-foreground text-background text-[10px] font-bold">PRO</Badge>
      )}
      {course.progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary">
          <div className="h-full bg-foreground transition-all" style={{ width: `${course.progress}%` }} />
        </div>
      )}
      <Badge variant="secondary" className="absolute left-3 top-3 text-[10px]">{course.difficulty}</Badge>
    </div>
    <div className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <img src={course.instructorImage} alt={course.instructor} className="h-5 w-5 rounded-full object-cover" />
        <span className="text-xs text-muted-foreground">{course.instructor}</span>
      </div>
      <h3 className="text-sm font-bold text-foreground leading-snug group-hover:text-foreground/80 transition-colors line-clamp-2">{course.title}</h3>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Star className="h-3 w-3 text-[hsl(var(--highlight))]" /> {course.rating}
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" /> {course.students.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" /> {course.duration}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="font-bold text-foreground">₹{course.price.toLocaleString()}</span>
        <Button size="sm" variant="default" className="h-7 text-xs px-3" onClick={(e) => { e.stopPropagation(); onClick(); }}>
          {ctaLabel}
        </Button>
      </div>
    </div>
  </div>
);

export default Learn;
