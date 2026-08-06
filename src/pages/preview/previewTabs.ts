/**
 * The section rail's contents. Lives apart from `PreviewShell` so that file
 * exports components only — react-refresh degrades to a full reload otherwise,
 * which is exactly the wrong trade in a file you iterate on visually.
 *
 * Second Brain is deliberately ABSENT: founder call, 2026-08-06 — "I don't
 * even want to see the second brain [yet]." The capture pipeline stays live in
 * production; the tab returns when its studio surface is designed.
 */
import { Map, LayoutGrid, MessageSquare, ClipboardCheck, Settings2 } from "lucide-react";

export interface ShellTab {
  key: string;
  label: string;
  sub: string;
  icon: typeof Map;
}

export const SHELL_TABS: ShellTab[] = [
  { key: "home", label: "Home", sub: "What's next for you", icon: LayoutGrid },
  { key: "path", label: "The Path", sub: "All 13 blocks", icon: Map },
  { key: "album", label: "Creator OS", sub: "Your public album", icon: ClipboardCheck },
  { key: "feed", label: "Feed", sub: "The room + people", icon: MessageSquare },
  { key: "mentor", label: "Mentor desk", sub: "Review queue", icon: Settings2 },
  { key: "admin", label: "Admin", sub: "Sessions & unlocks", icon: Settings2 },
];
