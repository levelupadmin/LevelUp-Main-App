import { Heart, Eye, Play, Pin } from "lucide-react";
import type { PortfolioProject } from "@/hooks/usePortfolio";

interface PortfolioCardProps {
  project: PortfolioProject;
  onClick: () => void;
  isOwner?: boolean;
}

const PortfolioCard = ({ project, onClick, isOwner }: PortfolioCardProps) => {
  const hasVideo = !!project.video_url;

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:scale-[1.02] hover:border-highlight/30 hover:shadow-[0_0_20px_hsl(var(--highlight)/0.12)] break-inside-avoid mb-3"
    >
      {/* Pinned badge */}
      {project.is_pinned && (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-highlight/90 px-2 py-0.5 text-[10px] font-bold text-highlight-foreground">
          <Pin className="h-3 w-3" /> Featured
        </div>
      )}

      <div className="relative">
        {project.thumbnail_url ? (
          <img
            src={project.thumbnail_url}
            alt={project.title}
            className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
            style={{ aspectRatio: project.is_pinned ? "16/9" : "4/3" }}
          />
        ) : (
          <div
            className="flex w-full items-center justify-center bg-secondary"
            style={{ aspectRatio: project.is_pinned ? "16/9" : "4/3" }}
          >
            <Play className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Play overlay for video */}
        {hasVideo && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <Play className="h-5 w-5 fill-white text-white" />
            </div>
          </div>
        )}

        {/* Duration badge */}
        {project.duration && (
          <span className="absolute bottom-8 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-mono font-medium text-white/90 backdrop-blur-sm">
            {project.duration}
          </span>
        )}

        {/* Counters */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-white line-clamp-1 flex-1 mr-2">{project.title}</p>
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-white/80">
              <Heart className="h-3 w-3" /> {project.appreciations}
            </span>
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-white/80">
              <Eye className="h-3 w-3" /> {project.views}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioCard;
