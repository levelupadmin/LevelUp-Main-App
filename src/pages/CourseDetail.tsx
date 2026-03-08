import AppShell from "@/components/layout/AppShell";
import { useParams } from "react-router-dom";
import { courses } from "@/data/mockData";
import heroCourseImage from "@/assets/hero-course-detail.jpg";
import { ArrowRight, Clock, Users, Award, Sparkles, Radio, Shield } from "lucide-react";

const metadata = [
  { label: "12 Weeks", icon: Clock },
  { label: "Mentor-led", icon: Users },
  { label: "Certificate", icon: Award },
  { label: "Live Feedback", icon: Radio },
  { label: "Beginner Friendly", icon: Sparkles },
  { label: "Invite Only", icon: Shield },
];

const CourseDetail = () => {
  const { slug } = useParams();
  const course = courses.find((c) => c.id === slug);

  return (
    <AppShell>
      {/* Hero Section */}
      <section className="relative -mx-6 -mt-6 lg:-mx-10 lg:-mt-10">
        <div className="relative h-[480px] w-full sm:h-[540px] lg:h-[85vh] lg:max-h-[720px]">
          {/* Background image */}
          <img
            src={heroCourseImage}
            alt="Cinematic filmmaking set"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Dark overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-transparent" />

          {/* Content */}
          <div className="relative z-10 flex h-full flex-col justify-end px-6 pb-10 lg:px-16 lg:pb-16">
            <div className="mx-auto w-full max-w-6xl">
              {/* Eyebrow */}
              <span className="mb-4 inline-flex rounded-md bg-primary/10 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-foreground backdrop-blur-sm">
                {course?.format ?? "Masterclass"}
              </span>

              {/* Headline */}
              <h1 className="max-w-3xl text-3xl font-bold leading-[1.08] text-foreground sm:text-5xl lg:text-6xl xl:text-7xl">
                Learn cinematic storytelling
                <br />
                <em className="font-light italic">that actually gets watched</em>
              </h1>

              {/* Supporting copy */}
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base lg:text-lg">
                Build taste, craft and execution through a premium creator-first learning experience.
              </p>

              {/* CTA */}
              <div className="mt-8">
                <button className="inline-flex items-center gap-2.5 rounded-full bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:text-base">
                  Explore Program
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* Metadata row */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {metadata.map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/30 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm"
                  >
                    <item.icon className="h-3 w-3" />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Rest of the page — placeholder */}
      <div className="mx-auto max-w-6xl space-y-10 p-6 lg:p-10">
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Coming soon
          </p>
          <h2 className="mt-2 text-lg font-bold text-foreground">
            Full course content, curriculum, instructor details & enrollment
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The rest of this product page will be built in the next iteration.
          </p>
        </div>
      </div>
    </AppShell>
  );
};

export default CourseDetail;
