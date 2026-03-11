import {
  BookOpen, Info, Droplets, BarChart3, MessageSquare,
  HelpCircle, ClipboardList, Star, Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type BuilderTab =
  | "curriculum" | "information" | "drip" | "report"
  | "comments" | "qna" | "assignments" | "reviews" | "chatbot";

const tabs: { id: BuilderTab; label: string; icon: typeof BookOpen }[] = [
  { id: "curriculum", label: "Curriculum", icon: BookOpen },
  { id: "information", label: "Information", icon: Info },
  { id: "drip", label: "Drip", icon: Droplets },
  { id: "report", label: "Report", icon: BarChart3 },
  { id: "comments", label: "Comments", icon: MessageSquare },
  { id: "qna", label: "QnA", icon: HelpCircle },
  { id: "assignments", label: "Assignments", icon: ClipboardList },
  { id: "reviews", label: "Reviews", icon: Star },
  { id: "chatbot", label: "QnA Chatbot", icon: Bot },
];

interface Props {
  active: BuilderTab;
  onChange: (tab: BuilderTab) => void;
}

const BuilderSidebar = ({ active, onChange }: Props) => (
  <aside className="w-52 shrink-0 border-r border-border bg-card/50 min-h-[calc(100vh-7rem)]">
    <nav className="flex flex-col gap-0.5 p-3">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left",
              isActive
                ? "bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))]"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  </aside>
);

export default BuilderSidebar;
