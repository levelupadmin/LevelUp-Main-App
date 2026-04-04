import AppShell from "@/components/layout/AppShell";
import HeroCarousel from "@/components/home/HeroCarousel";
import CredibilityBar from "@/components/home/CredibilityBar";
import StreakCard from "@/components/home/StreakCard";
import ContinueLearning from "@/components/home/ContinueLearning";
import MasterclassGrid from "@/components/home/MasterclassGrid";
import LiveCohortShowcase from "@/components/home/LiveCohortShowcase";
import ForgeCrossSection from "@/components/home/ForgeCrossSection";
import CommunityHighlights from "@/components/home/CommunityHighlights";
import { ExternalLink, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const SectionHeader = ({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle: string;
  action?: string;
  onAction?: () => void;
}) => (
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
      {/* Full-bleed hero — no container padding */}
      <HeroCarousel />

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 lg:px-8">

        {/* 2. Credibility Bar */}
        <CredibilityBar />

        {/* 3. Streak (logged-in) */}
        <StreakCard />

        {/* 4. Continue Learning (logged-in) */}
        <ContinueLearning />

        {/* 5. Masterclass Grid */}
        <MasterclassGrid />

        {/* 6. Live Cohort Showcase */}
        <LiveCohortShowcase />

        {/* 7. Forge Cross-Sell */}
        <ForgeCrossSection />

        {/* 8. Community Highlights */}
        <CommunityHighlights />

        {/* 9. Featured Creators */}
        {creatorsLoading ? (
          <section className="space-y-5">
            <Skeleton className="h-8 w-56" />
            <div className="flex gap-4 overflow-hidden">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-xl" />
              ))}
            </div>
          </section>
        ) : (
          featuredCreators.length > 0 && (
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
                      <div className="mb-3 flex items-center gap-3">
                        <img
                          src={creator.avatar}
                          alt={creator.name}
                          className="h-12 w-12 rounded-full border-2 border-card object-cover"
                        />
                        <div>
                          <h3 className="text-sm font-bold text-foreground">
                            {creator.name}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {creator.roles?.[0] || "Creator"}{" "}
                            {creator.experience
                              ? `· ${creator.experience}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-secondary-foreground">
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
          )
        )}
      </div>
    </AppShell>
  );
};

export default Index;
