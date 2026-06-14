import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface StudioTool {
  id: string;
  name: string;
  tagline: string;
  /** The little onboarding — what this tool does, in plain language. */
  whatItDoes: string[];
  route: string;
  status: "live" | "soon";
  icon: LucideIcon;
}

// A tool inside the Studio hub. The card carries its own short onboarding so a
// student understands what it's for before they open it.
export default function StudioToolCard({ tool }: { tool: StudioTool }) {
  const soon = tool.status === "soon";
  const Icon = tool.icon;
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 flex flex-col">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-xl grid place-items-center bg-[hsl(var(--accent-amber)/0.12)] text-[hsl(var(--accent-amber))]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{tool.name}</h3>
            {soon && (
              <span className="text-[10px] uppercase tracking-wide rounded-full border border-[hsl(var(--border))] px-2 py-0.5 text-[hsl(var(--muted-foreground))]">
                Soon
              </span>
            )}
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{tool.tagline}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 flex-1">
        {tool.whatItDoes.map((line, i) => (
          <li key={i} className="flex gap-2 text-sm text-[hsl(var(--muted-foreground))]">
            <Check className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--accent-amber))]" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        {soon ? (
          <Button variant="outline" disabled className="w-full">Coming soon</Button>
        ) : (
          <Link to={tool.route} className="block">
            <Button className="w-full">Open {tool.name} <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </Link>
        )}
      </div>
    </div>
  );
}
