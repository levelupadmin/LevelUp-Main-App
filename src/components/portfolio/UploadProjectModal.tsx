import { useState, useRef } from "react";
import { X, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateProject, uploadPortfolioThumbnail } from "@/hooks/usePortfolio";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

const categories = ["film", "edit", "reel", "photography", "other"];

interface UploadProjectModalProps {
  onClose: () => void;
}

const UploadProjectModal = ({ onClose }: UploadProjectModalProps) => {
  const { user } = useAuth();
  const createProject = useCreateProject();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("film");
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [toolInput, setToolInput] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setThumbnailFile(file);
      setThumbnailPreview(URL.createObjectURL(file));
    }
  };

  const addTool = () => {
    const t = toolInput.trim();
    if (t && !tools.includes(t)) {
      setTools([...tools, t]);
      setToolInput("");
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      let thumbnail_url: string | undefined;
      if (thumbnailFile && user) {
        thumbnail_url = await uploadPortfolioThumbnail(user.id, thumbnailFile);
      }
      await createProject.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        thumbnail_url,
        video_url: videoUrl.trim() || undefined,
        duration: duration.trim() || undefined,
        tools_used: tools,
      });
      toast({ title: "Project added ✓" });
      onClose();
    } catch {
      toast({ title: "Failed to add project", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-lg font-bold text-foreground">Add Project</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-secondary transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Thumbnail upload */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Thumbnail</label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            {thumbnailPreview ? (
              <div className="relative aspect-video rounded-xl overflow-hidden border border-border">
                <img src={thumbnailPreview} alt="Preview" className="h-full w-full object-cover" />
                <button
                  onClick={() => { setThumbnailFile(null); setThumbnailPreview(null); }}
                  className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-sm text-muted-foreground hover:border-highlight/30 hover:text-foreground transition-colors"
              >
                <Upload className="h-5 w-5" /> Upload thumbnail
              </button>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Short Film"
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-highlight/50 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief about your project..."
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-highlight/50 focus:outline-none resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Category</label>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    category === c
                      ? "border-highlight/50 bg-highlight/15 text-highlight"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Video URL + Duration */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Video URL</label>
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/..."
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-highlight/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Duration</label>
              <input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="2:34"
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-highlight/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Tools */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Tools Used</label>
            <div className="flex gap-2">
              <input
                value={toolInput}
                onChange={(e) => setToolInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTool())}
                placeholder="DaVinci Resolve"
                className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-highlight/50 focus:outline-none"
              />
              <button onClick={addTool} className="rounded-lg border border-border bg-secondary px-3 py-2 text-muted-foreground hover:text-foreground transition-colors">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {tools.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tools.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-foreground">
                    {t}
                    <button onClick={() => setTools(tools.filter((x) => x !== t))} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-border p-5">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="flex-1 bg-highlight text-highlight-foreground hover:bg-highlight/90">
            {submitting ? "Adding..." : "Add Project"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UploadProjectModal;
