import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Clock, Users, CalendarDays, CheckCircle2, Play,
  GraduationCap, ChevronRight, Loader2
} from "lucide-react";
import WaitlistForm from "@/components/course/WaitlistForm";



const CohortDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();

  const { data: course, isLoading } = useQuery({
    queryKey: ["cohort-detail", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("slug", slug!)
        .eq("course_type", "cohort")
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const { data: modules = [] } = useQuery({
    queryKey: ["cohort-modules", course?.id],
    enabled: !!course?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_modules")
        .select("*")
        .eq("course_id", course!.id)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!course) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <GraduationCap className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h1 className="text-xl font-bold text-foreground">Cohort not found</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-4">This cohort may have been removed or isn't published yet</p>
          <Button size="sm" onClick={() => navigate("/learn")}>Back to Learn</Button>
        </div>
      </AppShell>
    );
  }

  const seatsLeft = course.max_students ? course.max_students - course.student_count : null;
  const seatsFraction = course.max_students ? (course.student_count / course.max_students) * 100 : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-8 p-4 lg:p-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-xl border border-border">
          <div className="relative h-56 sm:h-72">
            <img src={course.banner_url || course.thumbnail_url || "/placeholder.svg"} alt={course.title} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
          </div>
          <div className="relative -mt-20 space-y-4 p-5 sm:p-8">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{course.category}</Badge>
              <Badge variant="secondary">{course.difficulty}</Badge>
              {course.status === "published" && (
                <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30">Open</Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{course.title}</h1>
            {course.short_description && (
              <p className="text-sm text-muted-foreground max-w-2xl">{course.short_description}</p>
            )}

            {/* Instructor */}
            <div className="flex items-center gap-3">
              {course.instructor_image_url && (
                <img src={course.instructor_image_url} alt={course.instructor_name} className="h-8 w-8 rounded-full object-cover border-2 border-card" />
              )}
              <span className="text-xs text-muted-foreground">with {course.instructor_name}</span>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {course.estimated_duration && (
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {course.estimated_duration}</span>
              )}
              {seatsLeft !== null && (
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {seatsLeft > 0 ? `${seatsLeft} seats left` : "Fully booked"}</span>
              )}
              <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" /> {course.student_count} enrolled</span>
            </div>

            {/* Seats bar */}
            {course.max_students && (
              <div className="max-w-xs space-y-1">
                <Progress value={seatsFraction} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground">{course.student_count}/{course.max_students} seats filled</p>
              </div>
            )}
          </div>
        </div>

        {/* Trailer */}
        {course.trailer_url && (
          <div className="relative aspect-video rounded-xl border border-border bg-card overflow-hidden">
            <iframe
              src={course.trailer_url}
              title="Cohort Overview"
              className="h-full w-full"
              allowFullScreen
            />
          </div>
        )}

        {/* Description */}
        {course.description && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">About this Cohort</h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{course.description}</p>
          </div>
        )}

        {/* Modules / Syllabus */}
        {modules.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">Curriculum</h2>
            <div className="space-y-2">
              {modules.map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{m.title}</p>
                    {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pricing + CTA */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <h2 className="text-lg font-bold text-foreground">Investment</h2>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[180px] rounded-lg border border-border bg-secondary/20 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {course.is_free ? "Free" : "Price"}
              </p>
              <p className="text-2xl font-bold text-foreground">
                {course.is_free ? "Free" : `₹${course.price.toLocaleString()}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {course.payment_page_url ? (
              <Button asChild className="gap-2">
                <a href={course.payment_page_url} target="_blank" rel="noopener noreferrer">
                  Enroll Now <ChevronRight className="h-4 w-4" />
                </a>
              </Button>
            ) : (
              <Button onClick={() => navigate(`/learn/course/${course.slug}`)} className="gap-2">
                View Course <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Waitlist */}
        {course.presale_description && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">Join the Waitlist</h2>
            <p className="text-sm text-muted-foreground">{course.presale_description}</p>
            <WaitlistForm courseId={course.id} />
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default CohortDetail;
