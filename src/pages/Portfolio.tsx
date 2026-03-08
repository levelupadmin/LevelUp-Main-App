import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { usePortfolioProjects, useDeleteProject, useTogglePin } from "@/hooks/usePortfolio";
import PortfolioCard from "@/components/portfolio/PortfolioCard";
import ProjectLightbox from "@/components/portfolio/ProjectLightbox";
import UploadProjectModal from "@/components/portfolio/UploadProjectModal";
import PortfolioEmpty from "@/components/portfolio/PortfolioEmpty";
import ShareProfileBanner from "@/components/profile/ShareProfileBanner";
import type { PortfolioProject } from "@/hooks/usePortfolio";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const filterTabs = ["all", "film", "edit", "reel", "photography", "other"];

const Portfolio = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = usePortfolioProjects(user?.id);
  const deleteProject = useDeleteProject();
  const togglePin = useTogglePin();

  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedProject, setSelectedProject] = useState<PortfolioProject | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const filtered = useMemo(() => {
    if (activeFilter === "all") return projects;
    return projects.filter((p) => p.category === activeFilter);
  }, [projects, activeFilter]);

  const pinnedProject = filtered.find((p) => p.is_pinned);
  const gridProjects = filtered.filter((p) => !p.is_pinned);

  const handle = user?.id || "me";

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-5 p-4 pb-8 animate-fade-in lg:p-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/profile/me" className="text-muted-foreground hover:text-foreground">
                Profile
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Portfolio</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Portfolio</h1>
            <p className="text-sm text-muted-foreground">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 rounded-xl bg-highlight px-4 py-2.5 text-sm font-semibold text-highlight-foreground hover:bg-highlight/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Project
          </button>
        </div>

        {/* Share banner */}
        <ShareProfileBanner handle={handle} name={user?.name} />

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filterTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                activeFilter === tab
                  ? "bg-highlight/15 text-highlight border border-highlight/30"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="columns-2 gap-3 lg:columns-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="mb-3 animate-pulse rounded-xl bg-secondary" style={{ aspectRatio: i % 2 === 0 ? "4/3" : "3/4", breakInside: "avoid" }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <PortfolioEmpty isOwner={true} onAddProject={() => setShowUploadModal(true)} />
        ) : (
          <>
            {/* Pinned / Spotlight */}
            {pinnedProject && (
              <div
                onClick={() => setSelectedProject(pinnedProject)}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-highlight/20 transition-all duration-300 hover:border-highlight/40 hover:shadow-[0_0_30px_hsl(var(--highlight)/0.15)]"
              >
                {pinnedProject.thumbnail_url ? (
                  <img
                    src={pinnedProject.thumbnail_url}
                    alt={pinnedProject.title}
                    className="aspect-[21/9] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="aspect-[21/9] w-full bg-secondary" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute bottom-4 left-5 right-5">
                  <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-highlight/90 px-2 py-0.5 text-[10px] font-bold text-highlight-foreground">
                    📌 Pinned
                  </span>
                  <h3 className="text-lg font-bold text-white">{pinnedProject.title}</h3>
                  {pinnedProject.description && (
                    <p className="mt-1 text-sm text-white/70 line-clamp-2">{pinnedProject.description}</p>
                  )}
                </div>
              </div>
            )}

            {/* Masonry grid */}
            <div className="columns-2 gap-3 lg:columns-3">
              {/* Add card */}
              <div
                onClick={() => setShowUploadModal(true)}
                className="mb-3 flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/50 transition-colors hover:border-highlight/30 hover:bg-card break-inside-avoid"
                style={{ aspectRatio: "4/3" }}
              >
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Plus className="h-8 w-8" />
                  <span className="text-xs font-medium">Add Project</span>
                </div>
              </div>

              {gridProjects.map((project) => (
                <PortfolioCard
                  key={project.id}
                  project={project}
                  isOwner={true}
                  onClick={() => setSelectedProject(project)}
                />
              ))}
            </div>
          </>
        )}

        {/* Lightbox */}
        {selectedProject && (
          <ProjectLightbox
            project={selectedProject}
            onClose={() => setSelectedProject(null)}
            isOwner={true}
            onTogglePin={() => {
              togglePin.mutate({ id: selectedProject.id, is_pinned: !selectedProject.is_pinned });
              setSelectedProject(null);
            }}
            onDelete={() => {
              deleteProject.mutate(selectedProject.id);
              setSelectedProject(null);
            }}
          />
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <UploadProjectModal onClose={() => setShowUploadModal(false)} />
        )}
      </div>
    </AppShell>
  );
};

export default Portfolio;
