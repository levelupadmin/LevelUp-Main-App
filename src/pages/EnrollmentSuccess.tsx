import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useCourse } from "@/hooks/useCourseData";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import logo from "@/assets/logo.png";

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    fbq?: (...args: unknown[]) => void;
  }
}

const EnrollmentSuccess = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data: course, isLoading } = useCourse(slug || "");

  useEffect(() => {
    if (!course) return;

    // GA4 conversion event
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "purchase",
      currency: "INR",
      value: course.price ?? 0,
      items: [
        {
          item_id: course.id,
          item_name: course.title,
          item_category: course.course_type,
        },
      ],
    });

    // Meta Pixel conversion event
    if (typeof window.fbq === "function") {
      window.fbq("track", "Purchase", {
        content_name: course.title,
        content_ids: [course.id],
        content_type: "product",
        value: course.price ?? 0,
        currency: "INR",
      });
    }
  }, [course]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-md space-y-4 p-6">
          <Skeleton className="h-16 w-16 rounded-full mx-auto" />
          <Skeleton className="h-6 w-2/3 mx-auto" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg text-center animate-slide-up space-y-6">
        <img src={logo} alt="Level Up" className="mx-auto h-12 w-12" />

        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">You're in! 🎉</h1>
          <p className="text-muted-foreground">
            You've successfully enrolled in{" "}
            <span className="font-semibold text-foreground">{course?.title}</span>.
          </p>
        </div>

        {course?.thumbnail_url && (
          <div className="rounded-xl overflow-hidden border border-border mx-auto max-w-sm">
            <img
              src={course.thumbnail_url}
              alt={course.title}
              className="w-full aspect-video object-cover"
            />
          </div>
        )}

        <Button
          size="lg"
          className="gap-2 font-bold py-6 text-base w-full max-w-sm mx-auto"
          onClick={() => navigate(`/learn/course/${slug}/dashboard`, { replace: true })}
        >
          Start Learning <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default EnrollmentSuccess;
