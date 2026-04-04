import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useUtmParams } from "@/hooks/useUtmParams";
import { useCourse, useEnrollment, useEnrollInCourse } from "@/hooks/useCourseData";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, BookOpen, Play, Clock, User, ArrowRight } from "lucide-react";
import logo from "@/assets/logo.png";

const Checkout = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { data: course, isLoading } = useCourse(slug || "");
  const { data: enrollment, isLoading: enrollLoading } = useEnrollment(course?.id);
  const enrollMutation = useEnrollInCourse();
  const [enrollFailed, setEnrollFailed] = useState(false);
  const utmParams = useUtmParams();

  // Already enrolled — redirect to success page
  useEffect(() => {
    if (enrollment && course) {
      navigate(`/enrollment-success/${course.slug}`, { replace: true });
    }
  }, [enrollment, course]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-md space-y-4 p-6">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <BookOpen className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground font-medium">Course not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/explore")}>
          Browse Courses
        </Button>
      </div>
    );
  }

  if (autoEnrolling || enrollMutation.isPending) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="animate-spin h-8 w-8 border-2 border-highlight border-t-transparent rounded-full" />
        <p className="text-sm text-muted-foreground">Setting up your access…</p>
      </div>
    );
  }

  const handleGetAccess = () => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=/checkout/${slug}`);
      return;
    }
    if (!course || enrollMutation.isPending) return;
    enrollMutation.mutate(
      { courseId: course.id, courseTitle: course.title, utmParams },
      {
        onSuccess: () => {
          navigate(`/enrollment-success/${course.slug}`, { replace: true });
        },
        onError: () => {
          setEnrollFailed(true);
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={logo} alt="Level Up" className="mx-auto h-12 w-12 mb-3" />
        </div>

        {/* Course Card */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {course.thumbnail_url && (
            <div className="relative aspect-video">
              <img
                src={course.thumbnail_url}
                alt={course.title}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
            </div>
          )}

          <div className="p-6 space-y-4">
            <div>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-widest font-semibold mb-2">
                {course.course_type}
              </Badge>
              <h1 className="text-xl font-bold text-foreground">{course.title}</h1>
              {course.short_description && (
                <p className="text-sm text-muted-foreground mt-1">{course.short_description}</p>
              )}
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> {course.instructor_name}
              </span>
              {course.estimated_duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {course.estimated_duration}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Play className="h-3.5 w-3.5" /> {course.student_count} students
              </span>
            </div>

            {/* Price */}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              {course.is_free || course.price === 0 ? (
                <span className="text-lg font-bold text-highlight">Free Access</span>
              ) : (
                <span className="text-lg font-bold text-foreground">₹{course.price.toLocaleString()}</span>
              )}
            </div>

            {/* CTA */}
            <Button
              onClick={handleGetAccess}
              className="w-full gap-2 font-bold py-6 text-base"
              size="lg"
            >
              {isAuthenticated ? (
                <>
                  <CheckCircle2 className="h-5 w-5" /> Get Access Now
                </>
              ) : (
                <>
                  Sign Up to Get Access <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>

            {!isAuthenticated && (
              <p className="text-center text-xs text-muted-foreground">
                Already have an account?{" "}
                <button
                  onClick={() => navigate(`/login?redirect=/checkout/${slug}`)}
                  className="text-highlight font-semibold hover:underline"
                >
                  Log in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
