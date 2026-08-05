/**
 * The section rail's contents. Lives apart from `PreviewShell` so that file
 * exports components only — react-refresh degrades to a full reload otherwise,
 * which is exactly the wrong trade in a file you iterate on visually.
 */
import { Map, Brain, LayoutGrid, MessageSquare, ClipboardCheck, Settings2 } from "lucide-react";

export interface ShellTab {
  key: string;
  label: string;
  sub: string;
  icon: typeof Map;
}

export const SHELL_TABS: ShellTab[] = [
  { key: "home", label: "Home", sub: "Where you left off", icon: LayoutGrid },
  { key: "path", label: "The Path", sub: "13 blocks, one engine", icon: Map },
  { key: "brain", label: "Second Brain", sub: "Spy, save, remix", icon: Brain },
  { key: "album", label: "Creator OS", sub: "46 pieces", icon: ClipboardCheck },
  { key: "feed", label: "Feed", sub: "The room's work", icon: MessageSquare },
  { key: "mentor", label: "Mentor desk", sub: "Review queue", icon: Settings2 },
  { key: "admin", label: "Admin", sub: "Sessions & unlocks", icon: Settings2 },
];

