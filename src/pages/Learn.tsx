import AppShell from "@/components/layout/AppShell";
import { categories } from "@/data/mockData";
import { Search, Play, ChevronRight, BookOpen, GraduationCap, Calendar, Users, Tag } from "lucide-react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

// Fetch all published courses + their active-on-site pricing variant
const usePublishedCoursesWithPricing = () =>
  useQuery({
    queryKey: ["published-courses-with-pricing"],
    queryFn: async () => {
      const [coursesRes, pricingRes] = await Promise.all([
        supabase
          .from("courses")
          .select("*")
          .eq("status", "published")
          .order("created_at", { ascending: false }),
        supabase
          .from("course_pricing_variants")
          .select("*")
          .eq("is_active_on_site", true)
          .order("sort_order", { ascending: true }),
      ]);
      if (coursesRes.error) throw coursesRes.error;
      if (pricingRes.error) throw pricingRes.error;

      // Build a map: course_id -> best site pricing variant
      const priceMap = new Map<string, { price: number; label: string }>();
      for (const pv of pricingRes.data) {
        if (!priceMap.has(pv.course_id)) {
          priceMap.set(pv.course_id, { price: pv.price, label: pv.label });
        }
      }

      return coursesRes.data.map((c: any) => {
        const pv = priceMap.get(c.id);
        return {
          ...c,
          displayPrice: pv?.price ?? c.price,
          displayPriceLabel: pv?.label ?? null,
        };
      });
    },
  });

// Fetch user enrollments + progress for "Continue Learning"
const useUserEnrollments = () =>
  useQuery({
    queryKey: ["user-enrollments-learn"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select("*, courses!enrollments_course_id_fkey(*)")
        .eq("user_id", user.id)
        .eq("status", "active");
      if (error) throw error;

      const courseIds = enrollments.map((e: any) => e.course_id);
      if (courseIds.length === 0) return [];

      const [lessonsRes, progressRes] = await Promise.all([
        supabase.from("lessons").select("id, course_id").in("course_id", courseIds),
        supabase.from("lesson_progress").select("lesson_id, status, course_id").eq("user_id", user.id).in("course_id", courseIds),
      ]);

      return enrollments.map((e: any) => {
        const courseLessons = (lessonsRes.data || []).filter((l: any) => l.course_id === e.course_id);
        const completed = (progressRes.data || []).filter((p: any) => p.course_id === e.course_id && p.status === "completed").length;
        const pct = courseLessons.length > 0 ? Math.round((completed / courseLessons.length) * 100) : 0;
        return { ...e, progressPct: pct, course: e.courses };
      });
    },
  });

const Learn = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const { data: allCourses = [], isLoading } = usePublishedCoursesWithPricing();
  const { data: enrollments = [] } = useUserEnrollments();

  const inProgressEnrollments = enrollments.filter((e: any) => e.progressPct > 0 && e.progressPct < 100);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const matchCategory = (cat: string) =>
      selectedCategory === "all" || cat.toLowerCase() === selectedCategory;

    const masterclasses = allCourses.filter(
      (c: any) =>
        c.course_type === "masterclass" &&
        matchCategory(c.category) &&
        (!q || c.title.toLowerCase().includes(q) || c.instructor_name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
    );

    const cohorts = allCourses.filter(
      (c: any) =>
        c.course_type === "cohort" &&
        matchCategory(c.category) &&
        (!q || c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
    );

    const workshops = allCourses.filter(
      (c: any) =>
        c.course_type === "workshop" &&
        matchCategory(c.category) &&
        (!q || c.title.toLowerCase().includes(q) || c.instructor_name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
    );

    return { masterclasses, cohorts, workshops };
  }, [searchQuery, selectedCategory, allCourses]);

  const formatPrice = (course: any) => {
    if (course.is_free) return "Free";
    const price = course.displayPrice ?? course.price;
    return `₹${price.toLocaleString("en-IN")}`;
  };

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
            {inProgressEnrollments.length > 0 && (
              <button onClick={() => navigate("/learn/my-learning")} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                View all →
              </button>
            )}
          </div>
          {inProgressEnrollments.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
              {inProgressEnrollments.map((enrollment: any) => {
                const course = enrollment.course;
                if (!course) return null;
                return (
                  <button
                    key={enrollment.id}
                    onClick={() => navigate(`/learn/course/${course.slug}/dashboard`)}
                    className="group min-w-[280px] max-w-[320px] shrink-0 rounded-xl border border-border bg-card overflow-hidden text-left transition-colors hover:border-muted-foreground/30"
                  >
                    <div className="relative">
                      <img src={course.thumbnail_url || "/placeholder.svg"} alt={course.title} className="h-36 w-full object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
                        <div className="h-full bg-primary transition-all" style={{ width: `${enrollment.progressPct}%` }} />
                      </div>
                    </div>
                    <div className="p-3.5 space-y-2">
                      <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">{course.title}</p>
                      <div className="flex items-center gap-2">
                        {course.instructor_image_url && (
                          <img src={course.instructor_image_url} alt={course.instructor_name} className="h-5 w-5 rounded-full object-cover" />
                        )}
                        <span className="text-xs text-muted-foreground">{course.instructor_name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-mono">{enrollment.progressPct}% complete</span>
                        <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
                          Resume <Play className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Start your first course below</p>
              <p className="text-xs text-muted-foreground mt-1">Browse our catalog and begin learning</p>
            </div>
          )}
        </section>

        {/* ── Section 2: Explore ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-foreground">Explore</h2>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search courses, workshops, instructors..."
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

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {[1,2,3,4].map(i => <Skeleton key={i} className="aspect-[3/4] rounded-xl" />)}
              </div>
            </div>
          ) : (
            <>
              {/* ── Masterclasses ── */}
              {filtered.masterclasses.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Play className="h-4 w-4 text-primary" /> Masterclasses
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filtered.masterclasses.map((course: any) => (
                      <button
                        key={course.id}
                        onClick={() => navigate(`/learn/course/${course.slug}`)}
                        className="group relative aspect-[3/4] overflow-hidden rounded-xl text-left transition-transform hover:scale-[1.02]"
                      >
                        <img
                          src={course.instructor_image_url || course.thumbnail_url || "/placeholder.svg"}
                          alt={course.instructor_name}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        {course.displayPriceLabel && (
                          <div className="absolute top-2 right-2">
                            <Badge variant="secondary" className="bg-primary/90 text-primary-foreground text-[10px] font-bold border-0">
                              <Tag className="h-2.5 w-2.5 mr-0.5" />
                              {course.displayPriceLabel}
                            </Badge>
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="text-xs text-white/70">{course.category}</p>
                          <p className="text-sm font-bold text-white leading-tight">{course.title}</p>
                          <p className="text-xs text-white/60 mt-0.5">{course.instructor_name}</p>
                          <p className="text-xs font-bold text-white mt-1">{formatPrice(course)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Cohorts ── */}
              {filtered.cohorts.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-primary" /> Cohort Programs
                  </h3>
                  {filtered.cohorts.map((cohort: any) => (
                    <button
                      key={cohort.id}
                      onClick={() => navigate(`/learn/course/${cohort.slug}`)}
                      className="group relative w-full overflow-hidden rounded-2xl text-left transition-transform hover:scale-[1.005]"
                    >
                      <div className="relative h-48 sm:h-56">
                        <img src={cohort.banner_url || cohort.thumbnail_url || "/placeholder.svg"} alt={cohort.title} className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
                        <div className="absolute top-3 left-3 flex gap-2">
                          <Badge className="bg-primary text-primary-foreground text-[10px] font-bold">
                            <GraduationCap className="h-3 w-3 mr-1" />
                            Cohort Program
                          </Badge>
                          {cohort.displayPriceLabel && (
                            <Badge variant="secondary" className="bg-white/20 text-white text-[10px] font-bold border-0 backdrop-blur-sm">
                              {cohort.displayPriceLabel}
                            </Badge>
                          )}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                          <p className="text-xs text-white/60 mb-1">{cohort.category} · {cohort.estimated_duration || "—"}</p>
                          <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">{cohort.title}</h3>
                          <p className="text-sm text-white/70 mt-1 line-clamp-1">{cohort.short_description}</p>
                          <div className="flex items-center gap-4 mt-3">
                            {cohort.max_students && (
                              <div className="flex items-center gap-1.5 text-white/70 text-xs">
                                <Users className="h-3.5 w-3.5" />
                                {cohort.max_students} seats
                              </div>
                            )}
                            <span className="text-sm font-bold text-white">{formatPrice(cohort)}</span>
                            <span className="text-xs font-semibold text-white flex items-center gap-1 ml-auto">
                              Learn more <ChevronRight className="h-3 w-3" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Workshops ── */}
              {filtered.workshops.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" /> Workshops
                    </h3>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
                    {filtered.workshops.map((w: any) => (
                      <button
                        key={w.id}
                        onClick={() => navigate(`/learn/course/${w.slug}`)}
                        className="group min-w-[260px] max-w-[300px] shrink-0 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/30"
                      >
                        <div className="flex items-center gap-2 mb-2.5">
                          {w.estimated_duration && <Badge variant="secondary" className="text-[10px]">{w.estimated_duration}</Badge>}
                          {w.displayPriceLabel && (
                            <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                              {w.displayPriceLabel}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight mb-2">{w.title}</p>
                        <div className="flex items-center gap-2 mb-3">
                          {w.instructor_image_url && (
                            <img src={w.instructor_image_url} alt={w.instructor_name} className="h-5 w-5 rounded-full object-cover" />
                          )}
                          <span className="text-xs text-muted-foreground">{w.instructor_name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-foreground">{formatPrice(w)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {filtered.masterclasses.length === 0 && filtered.cohorts.length === 0 && filtered.workshops.length === 0 && (
                <div className="text-center py-12">
                  <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">No results found</p>
                  <p className="text-xs text-muted-foreground mt-1">Try a different search or category</p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
};

export default Learn;
