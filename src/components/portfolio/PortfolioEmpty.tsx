import { Film } from "lucide-react";

interface PortfolioEmptyProps {
  isOwner: boolean;
  onAddProject: () => void;
}

const PortfolioEmpty = ({ isOwner, onAddProject }: PortfolioEmptyProps) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-secondary">
      <Film className="h-10 w-10 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-bold text-foreground">
      {isOwner ? "Your portfolio is empty" : "No projects yet"}
    </h3>
    <p className="mt-1 max-w-xs text-sm text-muted-foreground">
      {isOwner
        ? "Upload your first project to showcase your creative work to the community."
        : "This creator hasn't uploaded any projects yet."}
    </p>
    {isOwner && (
      <button
        onClick={onAddProject}
        className="mt-5 rounded-xl bg-highlight px-5 py-2.5 text-sm font-semibold text-highlight-foreground hover:bg-highlight/90 transition-colors"
      >
        Add your first project
      </button>
    )}
  </div>
);

export default PortfolioEmpty;
