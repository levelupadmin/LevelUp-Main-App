import AppShell from "@/components/layout/AppShell";
import { courses, communityPosts, workshops, newMembers, userProfile } from "@/data/mockData";
import { ArrowRight, ChevronRight, ExternalLink, Calendar, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const enrolledCourses = courses.filter((c) => c.progress > 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-12 p-6 lg:p-10">
        {/* Onboarding Banner */}
        <section className="rounded-2xl border border-border bg-card p-6 lg:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-md space-y-4">
              <h1 className="text-3xl font-bold leading-tight text-foreground lg:text-4xl">
                Your onboarding<br />is incomplete.
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Setup your profile, introduce yourself to the community &amp; complete the onboarding to unlock full access.
              </p>
              <button
                onClick={() => navigate("/onboarding")}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Complete onboarding
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-3 overflow-hidden">
              {[courses[0], courses[1], courses[2]].map((c, i) => (
                <div
                  key={i}
                  className="h-44 w-36 shrink-0 overflow-hidden rounded-xl lg:h-52 lg:w-44"
                >
                  <img
                    src={c.thumbnail}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Continue Learning */}
        {enrolledCourses.length > 0 && (
          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">Continue learning</h2>
              <p className="text-sm text-muted-foreground">
                Explore the learning programs you have enrolled in.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {enrolledCourses.map((course) => (
                <div
                  key={course.id}
                  onClick={() => navigate(`/learn/course/${course.id}`)}
                  className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-muted-foreground/20"
                >
                  <div className="flex gap-4 p-4">
                    <div className="h-28 w-24 shrink-0 overflow-hidden rounded-lg">
                      <img src={course.thumbnail} alt={course.title} className="h-full w-full object-cover" />
                    </div>
                    <div className="flex flex-col justify-between py-1">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Course</p>
                        <h3 className="mt-1 text-base font-bold leading-tight text-foreground">{course.title}</h3>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{course.description}</p>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-border px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-success">{course.progress}%</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary">
                        Overview
                      </button>
                      <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                        Continue Learning
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Popular in Community */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-foreground">
            Popular in the <em className="not-italic font-light italic">community</em>
          </h2>
          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
            {communityPosts.map((post) => (
              <div
                key={post.id}
                onClick={() => navigate(`/community/post/${post.id}`)}
                className="w-80 shrink-0 cursor-pointer rounded-xl border border-border bg-card p-5 transition-colors hover:border-muted-foreground/20"
              >
                <div className="mb-4 flex items-center gap-3">
                  <img src={post.avatar} alt={post.author} className="h-10 w-10 rounded-full object-cover" />
                  <div>
                    <p className="text-sm font-bold text-foreground">{post.author}</p>
                    <p className="text-xs text-muted-foreground">{post.timeAgo}</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-secondary-foreground line-clamp-4">
                  {post.content}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* New Members */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground">New members</h2>
            <p className="text-sm text-muted-foreground">
              Say hello to curated folks who joined the fam
            </p>
          </div>
          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
            {newMembers.map((member) => (
              <div
                key={member.id}
                className="flex w-80 shrink-0 flex-col justify-between rounded-xl border border-border bg-card p-5"
              >
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">
                      MEMBER NO. {member.memberNo}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {member.joinDate}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-secondary-foreground line-clamp-5">
                    {member.bio}
                  </p>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                  <div className="flex items-center gap-3">
                    <img src={member.avatar} alt={member.name} className="h-10 w-10 rounded-full object-cover" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                  </div>
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
                    View
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Upcoming Events */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">Upcoming events</h2>
              <p className="text-sm text-muted-foreground">
                Get facetime with some of the brightest minds in product, marketing, strategy
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
                  <img src={workshop.thumbnail} alt={workshop.title} className="h-full w-full object-cover" />
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
                    <img src={workshop.instructorImage} alt={workshop.instructor} className="h-8 w-8 rounded-full object-cover" />
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
      </div>
    </AppShell>
  );
};

export default Index;
