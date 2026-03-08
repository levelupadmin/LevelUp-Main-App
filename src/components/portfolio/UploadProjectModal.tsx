import { useState, useRef } from "react";
import { X, Upload, Plus, Image, Video, FileText, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateProject, uploadPortfolioThumbnail } from "@/hooks/usePortfolio";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

const categories = [
  { value: "film", label: "Film", icon: "🎬" },
  { value: "edit", label: "Edit", icon: "✂️" },
  { value: "reel", label: "Reel", icon: "📱" },
  { value: "photography", label: "Photo", icon: "📸" },
  { value: "other", label: "Other", icon: "🎨" },
];

interface UploadProjectModalProps {
  onClose: () => void;
}

const UploadProjectModal = ({ onClose }: UploadProjectModalProps) => {
  const { user } = useAuth();
  const createProject = useCreateProject();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
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
      toast({ title: "Project added to your portfolio ✓" });
      onClose();
    } catch {
      toast({ title: "Failed to add project", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = step === 1 ? !!thumbnailPreview || !!videoUrl.trim() : !!title.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with steps */}
        <div className="border-b border-border p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Add Project</h2>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-secondary transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          {/* Step indicator */}
          <div className="mt-3 flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                  step > s ? "bg-highlight text-highlight-foreground" :
                  step === s ? "bg-highlight/20 text-highlight border border-highlight/40" :
                  "bg-secondary text-muted-foreground"
                }`}>
                  {step > s ? <Check className="h-3 w-3" /> : s}
                </div>
                <span className={`text-[11px] font-medium ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
                  {s === 1 ? "Media" : s === 2 ? "Details" : "Extras"}
                </span>
                {s < 3 && <div className={`h-px flex-1 ${step > s ? "bg-highlight/40" : "bg-border"}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-5">
          {/* Step 1: Media */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Upload a thumbnail or add a video link for your project.</p>

              {/* Thumbnail upload */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Image className="h-3.5 w-3.5" /> Thumbnail
                </label>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                {thumbnailPreview ? (
                  <div className="relative aspect-video rounded-xl overflow-hidden border border-border">
                    <img src={thumbnailPreview} alt="Preview" className="h-full w-full object-cover" />
                    <button
                      onClick={() => { setThumbnailFile(null); setThumbnailPreview(null); }}
                      className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="group flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border py-10 text-muted-foreground hover:border-highlight/30 hover:text-foreground transition-all"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary group-hover:bg-highlight/10 transition-colors">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Drop your image here or click to browse</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">JPG, PNG, WebP — max 20MB</p>
                    </div>
                  </button>
                )}
              </div>

              {/* Video URL */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Video className="h-3.5 w-3.5" /> Video Link (optional)
                </label>
                <input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or Vimeo link"
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-highlight/50 focus:outline-none transition-colors"
                />
              </div>
            </div>
          )}

          {/* Step 2: Details */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Tell us about your project.</p>

              {/* Title */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Project Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Golden Hour – Short Film"
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-highlight/50 focus:outline-none transition-colors"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="A brief about your project, inspiration, or process..."
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-highlight/50 focus:outline-none resize-none transition-colors"
                />
              </div>

              {/* Category */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Category</label>
                <div className="grid grid-cols-5 gap-2">
                  {categories.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setCategory(c.value)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all ${
                        category === c.value
                          ? "border-highlight/50 bg-highlight/10 shadow-[0_0_12px_hsl(var(--highlight)/0.1)]"
                          : "border-border bg-secondary hover:border-highlight/20"
                      }`}
                    >
                      <span className="text-lg">{c.icon}</span>
                      <span className={`text-[10px] font-medium ${category === c.value ? "text-highlight" : "text-muted-foreground"}`}>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Extras */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Optional details to make your project shine.</p>

              {/* Duration */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Duration</label>
                <input
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g. 2:34"
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-highlight/50 focus:outline-none transition-colors"
                />
              </div>

              {/* Tools */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" /> Tools Used
                </label>
                <div className="flex gap-2">
                  <input
                    value={toolInput}
                    onChange={(e) => setToolInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTool())}
                    placeholder="DaVinci Resolve, Premiere Pro..."
                    className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-highlight/50 focus:outline-none transition-colors"
                  />
                  <button onClick={addTool} className="rounded-lg border border-border bg-secondary px-3 py-2.5 text-muted-foreground hover:text-foreground hover:border-highlight/30 transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {tools.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tools.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-lg border border-highlight/20 bg-highlight/5 px-2.5 py-1 text-xs font-medium text-foreground">
                        {t}
                        <button onClick={() => setTools(tools.filter((x) => x !== t))} className="text-muted-foreground hover:text-foreground ml-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview card */}
              {(thumbnailPreview || title) && (
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Preview</p>
                  <div className="flex gap-3">
                    {thumbnailPreview && (
                      <img src={thumbnailPreview} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{title || "Untitled"}</p>
                      <p className="text-xs text-muted-foreground capitalize">{category}</p>
                      {tools.length > 0 && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground truncate">{tools.join(" · ")}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border p-5">
          {step > 1 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)} className="gap-1 text-muted-foreground">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose} className="text-muted-foreground">Cancel</Button>
          )}

          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 2 && !title.trim()}
              className="gap-1 bg-highlight text-highlight-foreground hover:bg-highlight/90"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !title.trim()}
              className="gap-1 bg-highlight text-highlight-foreground hover:bg-highlight/90"
            >
              {submitting ? "Publishing..." : "Publish Project"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadProjectModal;
