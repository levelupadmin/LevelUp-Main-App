import { X, Heart, Eye, Pin, Calendar, Wrench, ExternalLink, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PortfolioProject } from "@/hooks/usePortfolio";

interface ProjectLightboxProps {
  project: PortfolioProject;
  onClose: () => void;
  isOwner?: boolean;
  onTogglePin?: () => void;
  onDelete?: () => void;
}

const ProjectLightbox = ({ project, onClose, isOwner, onTogglePin, onDelete }: ProjectLightboxProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Content */}
      <div
        className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Media */}
        {project.video_url ? (
          <div className="aspect-video w-full bg-black">
            <iframe
              src={project.video_url}
              className="h-full w-full"
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          </div>
        ) : project.thumbnail_url ? (
          <img
            src={project.thumbnail_url}
            alt={project.title}
            className="w-full object-cover"
            style={{ maxHeight: "60vh" }}
          />
        ) : (
          <div className="aspect-video w-full bg-secondary" />
        )}

        {/* Details */}
        <div className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-foreground">{project.title}</h2>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Heart className="h-3 w-3" /> {project.appreciations} appreciations
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" /> {project.views} views
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {new Date(project.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {isOwner && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={onTogglePin}
                  className={`rounded-lg border p-2 text-xs transition-colors ${
                    project.is_pinned
                      ? "border-highlight/30 bg-highlight/10 text-highlight"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Pin className="h-4 w-4" />
                </button>
                <button
                  onClick={onDelete}
                  className="rounded-lg border border-border bg-secondary p-2 text-muted-foreground hover:border-destructive/30 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {project.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{project.description}</p>
          )}

          {/* Category badge */}
          <Badge className="bg-highlight/15 text-highlight border-highlight/30 text-xs capitalize">
            {project.category}
          </Badge>

          {/* Tools used */}
          {project.tools_used && project.tools_used.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Wrench className="h-3 w-3" /> Tools Used
              </p>
              <div className="flex flex-wrap gap-1.5">
                {project.tools_used.map((tool) => (
                  <span key={tool} className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-foreground">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {project.video_url && (
            <a
              href={project.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-highlight hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Open original
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectLightbox;
