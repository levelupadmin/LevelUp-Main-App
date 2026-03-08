import AppShell from "@/components/layout/AppShell";
import {
  courses,
  communityPosts,
  workshops,
  featuredCreators,
} from "@/data/mockData";
import HeroCarousel from "@/components/home/HeroCarousel";
import {
  ArrowRight,
  ChevronRight,
  Calendar,
  MapPin,
  MessageSquare,
  Play,
  ExternalLink,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const enrolledCourses = courses.filter((c) => c.progress > 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-14 p-6 lg:p-10">
        {/* 1. Featured Banner — Carousel Hero */}
        <HeroCarousel />

        {/* 2. Continue Learning */}
        {enrolledCourses.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-foreground">Continue learning</h2>
                <p className="text-sm text-muted-foreground">Pick up where you left off</p>
              </div>
              <button
                onClick={() => navigate("/learn/my-learning")}
                className="hidden items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              >
                View all
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {enrolledCourses.map((course) => (
                <div
                  key={course.id}
                  className="group relative overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-muted-foreground/20"
                >
                  {/* Background image fade */}
                  <div className="absolute inset-0">
                    <img
                      src={course.thumbnail}
                      alt=""
                      className="h-full w-full object-cover opacity-15"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-card via-card/80 to-card/60" />
                  </div>
                  <div className="relative flex gap-4 p-5">
                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <span className="inline-flex rounded bg-accent/80 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {course.format}
                        </span>
                        <h3 className="mt-1.5 text-sm font-bold leading-snug text-foreground">
                          {course.title}
                        </h3>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {course.format === "Cohort"
                            ? `Week ${course.currentModule} / ${course.totalModules}`
                            : `Module ${course.currentModule} / ${course.totalModules}`}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* Progress + CTA */}
                  <div className="border-t border-border px-5 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {course.progress}% complete
                      </span>
                    </div>
                    <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-accent">
                      <div
                        className="h-full rounded-full bg-foreground transition-all"
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/learn/course/${course.id}`);
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Continue Learning
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 3. Popular in Community */}
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">
                Popular in the community
              </h2>
              <p className="text-sm text-muted-foreground">Active discussions from your spaces</p>
            </div>
            <button
              onClick={() => navigate("/community")}
              className="hidden items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              View all
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {communityPosts.slice(0, 4).map((post) => (
              <div
                key={post.id}
                onClick={() => navigate(`/community/post/${post.id}`)}
                className="group cursor-pointer rounded-xl border border-border bg-card p-5 transition-colors hover:border-muted-foreground/20"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded bg-accent px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {post.tag}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{post.timeAgo}</span>
                </div>
                <h3 className="mt-2 text-sm font-bold text-foreground line-clamp-1">
                  {post.content.substring(0, 60)}…
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-secondary-foreground line-clamp-2">
                  {post.content}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={post.avatar}
                      alt={post.author}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                    <span className="text-xs font-medium text-foreground">{post.author}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {post.comments} replies
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      Open thread
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Featured Creators */}
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">Featured creators</h2>
              <p className="text-sm text-muted-foreground">
                Talented members doing remarkable work
              </p>
            </div>
            <button
              onClick={() => navigate("/community/directory")}
              className="hidden items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              View directory
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
            {featuredCreators.map((creator) => (
              <div
                key={creator.id}
                className="w-72 shrink-0 overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-muted-foreground/20"
              >
                {/* Thumbnail */}
                <div className="relative h-32 overflow-hidden">
                  <img
                    src={creator.thumbnail}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
                  {/* Avatar overlapping */}
                  <img
                    src={creator.avatar}
                    alt={creator.name}
                    className="absolute -bottom-5 left-4 h-12 w-12 rounded-full border-2 border-card object-cover"
                  />
                </div>
                {/* Info */}
                <div className="px-4 pb-4 pt-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground">{creator.name}</h3>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      #{creator.memberNo}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                    {creator.role} · {creator.experience}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-secondary-foreground line-clamp-2">
                    {creator.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {creator.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/profile/${creator.id}`);
                    }}
                    className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                  >
                    View Portfolio
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Upcoming Events */}
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">Upcoming events</h2>
              <p className="text-sm text-muted-foreground">
                Get facetime with some of the brightest minds in filmmaking
              </p>
            </div>
            <button
              onClick={() => navigate("/learn/workshops")}
              className="hidden items-center gap-1 text-sm font-semibold text-foreground transition-colors hover:text-muted-foreground sm:inline-flex"
            >
              View all events
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
            {workshops.map((workshop) => (
              <div
                key={workshop.id}
                onClick={() => navigate(`/workshops/${workshop.id}`)}
                className="w-80 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-muted-foreground/20"
              >
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={workshop.thumbnail}
                    alt={workshop.title}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                  {(workshop as any).soldOut && (
                    <span className="absolute right-3 top-3 rounded-md bg-destructive px-2.5 py-1 text-xs font-bold uppercase text-destructive-foreground">
                      Sold Out
                    </span>
                  )}
                  <h3 className="absolute bottom-3 left-4 right-4 text-lg font-bold leading-tight text-foreground">
                    {workshop.title}
                  </h3>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <img
                      src={workshop.instructorImage}
                      alt={workshop.instructor}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                    <span className="text-sm text-foreground">{workshop.instructor}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {workshop.date}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {workshop.city}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 6. Explore More Courses — placeholder */}
        <section className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Coming soon
          </p>
          <h2 className="mt-2 text-lg font-bold text-foreground">Explore more courses</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Discover programs across filmmaking, editing, sound design, and more.
          </p>
          <button
            onClick={() => navigate("/explore")}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            Browse catalog
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      </div>
    </AppShell>
  );
};

export default Index;