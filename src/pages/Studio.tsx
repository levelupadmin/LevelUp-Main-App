import { Brain, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudioEnabled } from "@/hooks/useStudio";
import StudioLocked from "@/components/studio/StudioLocked";
import StudioToolCard, { type StudioTool } from "@/components/studio/StudioToolCard";

// Studio is a hub. Add new tools here — each card shows its own onboarding.
const STUDIO_TOOLS: StudioTool[] = [
  {
    id: "second-brain",
    name: "Second Brain",
    tagline: "Every reel you admire — transcribed, filed, and readable by your AI.",
    whatItDoes: [
      "Share or paste an Instagram reel or YouTube video; it's transcribed in seconds.",
      "File it into Learn / Adapt / Saved or your own folders, with a note on why.",
      "Connect your ChatGPT or Claude so it can pull ideas from everything you've saved.",
    ],
    route: "/studio/second-brain",
    status: "live",
    icon: Brain,
  },
];

export default function Studio() {
  const enabled = useStudioEnabled();
  if (enabled.isLoading) return <Skeleton className="h-48 w-full rounded-2xl max-w-5xl mx-auto" />;
  if (!enabled.data) return <StudioLocked />;

  return (
    <div className="max-w-5xl mx-auto">
      <header className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-xl grid place-items-center bg-[hsl(var(--accent-amber)/0.12)] text-[hsl(var(--accent-amber))]">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="heading-1">Studio</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] -mt-0.5">
            Your creative workspace — tools to get better every day
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {STUDIO_TOOLS.map((t) => (
          <StudioToolCard key={t.id} tool={t} />
        ))}
      </div>
    </div>
  );
}
