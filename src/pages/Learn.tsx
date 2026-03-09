import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import CourseCard from "@/components/learn/CourseCard";
import { mockCourses, mockWorkshops, courseCategories } from "@/data/learnMockData";
import { ChevronRight, Calendar, User, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const Learn = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("All");

  const enrolledCourses = mockCourses.filter((c) => c.isPurchased);
  const upcomingWorkshops = mockWorkshops.filter((w) => w.isUpcoming).slice(0, 3);
  const filteredCourses =
    activeCategory === "All"
      ? mockCourses
      : mockCourses.filter((c) => c.category === activeCategory);

  return (
    <AppShell>
      <div className="px-4 py-6 lg:px-8 space-y-8 max-w-6xl mx-auto">
        {/* Continue Learning */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">Continue Learning</h2>
          </div>
          {enrolledCourses.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <p className="text-muted-foreground text-sm">Start your first course below.</p>
            </div>
          ) : (
            <ScrollArea className="w-full">
              <div className="flex gap-4 pb-4">
                {enrolledCourses.map((c) => (
                  <div key={c.id} className="w-[260px] flex-shrink-0">
                    <CourseCard course={c} showProgress />
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </section>

        {/* Upcoming Workshops */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">Upcoming Workshops</h2>
            <button
              onClick={() => navigate("/learn/workshops")}
              className="flex items-center gap-1 text-xs font-medium text-[hsl(var(--highlight))] hover:underline"
            >
              See all <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <ScrollArea className="w-full">
            <div className="flex gap-4 pb-4">
              {upcomingWorkshops.map((w) => (
                <button
                  key={w.id}
                  onClick={() => navigate(`/workshops/${w.slug}`)}
                  className="w-[280px] flex-shrink-0 rounded-xl border border-border bg-card p-4 text-left hover:border-[hsl(var(--highlight))/30] transition-all"
                >
                  <Badge variant="outline" className="mb-2 bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20 text-xs">
                    <Calendar className="h-3 w-3 mr-1" />
                    {new Date(w.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {w.time}
                  </Badge>
                  <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">{w.title}</h3>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="h-4 w-4 rounded-full bg-accent flex items-center justify-center">
                      <User className="h-2.5 w-2.5 text-muted-foreground" />
                    </div>
                    <span className="text-xs text-muted-foreground">{w.instructor.name}</span>
                  </div>
                  <span className="text-sm font-bold text-foreground">₹{w.price}</span>
                </button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </section>

        {/* Explore Courses */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-4">Explore Courses</h2>
          <ScrollArea className="w-full mb-5">
            <div className="flex gap-2 pb-2">
              {courseCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-colors border ${
                    activeCategory === cat
                      ? "bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] border-[hsl(var(--highlight))]"
                      : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCourses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
          {filteredCourses.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">No courses in this category yet.</p>
          )}
        </section>

        {/* Cohort Programs Banner */}
        <section>
          <button
            onClick={() => navigate("/learn/cohort/complete-filmmaking-cohort")}
            className="w-full rounded-xl border border-border bg-gradient-to-r from-card to-secondary p-6 text-left hover:border-[hsl(var(--highlight))/30] transition-all"
          >
            <Badge variant="outline" className="mb-2 bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20">
              Cohort Program
            </Badge>
            <h3 className="text-lg font-bold text-foreground mb-1">Complete Filmmaking Cohort</h3>
            <p className="text-sm text-muted-foreground mb-3">
              A 12-week intensive program to master filmmaking from script to screen. Limited seats.
            </p>
            <span className="text-xs font-medium text-[hsl(var(--highlight))] flex items-center gap-1">
              Learn more <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </button>
        </section>
      </div>
    </AppShell>
  );
};

export default Learn;
