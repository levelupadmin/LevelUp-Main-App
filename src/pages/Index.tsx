import AppShell from "@/components/layout/AppShell";
import HeroCarousel from "@/components/home/HeroCarousel";
import UpcomingEvents from "@/components/home/UpcomingEvents";
import StreakCard from "@/components/home/StreakCard";
import ContinueLearning from "@/components/home/ContinueLearning";
import CommunityHighlights from "@/components/home/CommunityHighlights";
import {
  ArrowRight,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const SectionHeader = ({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) => (
  <div className="flex items-center justify-between">
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-highlight" />
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
    {action && onAction && (
      <button
        onClick={onAction}
        className="hidden items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
      >
        {action}
        <ChevronRight className="h-4 w-4" />
      </button>
    )}
  </div>
);

const Index = () => {
  const navigate = useNavigate();

  // Featured creators from profiles (random selection of users with bio/skills)
  const { data: featuredCreators = [], isLoading: creatorsLoading } = useQuery({
    queryKey: ["featured-creators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, bio, city, skills, roles, experience")
        .not("bio", "eq", "")
        .not("name", "eq", "")
        .limit(6);
      if (error) throw error;
      return data.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar_url || "/placeholder.svg",
        bio: p.bio || "",
        city: p.city || "",
        skills: p.skills || [],
        roles: p.roles || [],
        experience: p.experience || "",
      }));
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-14 p-6 lg:p-10">
        {/* 1. Featured Banner — Carousel Hero */}
        <HeroCarousel />

        {/* Streak widget */}
        <StreakCard />

        {/* 2. Continue Learning — from real enrollments */}
        <ContinueLearning />

        {/* 2b. Upcoming Events */}
        <UpcomingEvents />

        {/* 3. Popular in Community — from real posts */}
        <CommunityHighlights />

        {/* 4. Featured Creators — from real profiles */}
        {creatorsLoading ? (
          <section className="space-y-5">
            <Skeleton className="h-8 w-56" />
            <div className="flex gap-4 overflow-hidden">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-xl" />)}
            </div>
          </section>
        ) : featuredCreators.length > 0 && (
          <section className="space-y-5">
            <SectionHeader
              title="Featured creators"
              subtitle="Talented members doing remarkable work"
              action="View directory"
              onAction={() => navigate("/community/directory")}
            />
            <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
              {featuredCreators.map((creator) => (
                <div
                  key={creator.id}
                  className="w-72 shrink-0 overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-muted-foreground/20 hover:shadow-[0_0_0_1px_hsl(var(--highlight)/0.08)]"
                >
                  <div className="px-4 py-5">
                    <div className="flex items-center gap-3 mb-3">
                      <img
                        src={creator.avatar}
                        alt={creator.name}
                        className="h-12 w-12 rounded-full border-2 border-card object-cover"
                      />
                      <div>
                        <h3 className="text-sm font-bold text-foreground">{creator.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {creator.roles?.[0] || "Creator"} {creator.experience ? `· ${creator.experience}` : ""}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-secondary-foreground line-clamp-2">
                      {creator.bio}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {creator.skills.slice(0, 3).map((skill) => (
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
                      View Profile
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 6. Explore More Courses */}
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
