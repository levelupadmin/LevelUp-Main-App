import { Hash } from "lucide-react";
import type { Channel } from "@/hooks/useCommunityChat";
import { cn } from "@/lib/utils";

interface ChannelSidebarProps {
  channels: Channel[];
  activeChannelId?: string;
  onSelectChannel: (channel: Channel) => void;
  spaceName?: string;
  spaceIcon?: string | null;
}

const ChannelSidebar = ({ channels, activeChannelId, onSelectChannel, spaceName, spaceIcon }: ChannelSidebarProps) => {
  return (
    <div className="flex h-full flex-col bg-sidebar-background border-r border-sidebar-border">
      {/* Space header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-sidebar-border">
        {spaceIcon && <span className="text-lg">{spaceIcon}</span>}
        <h2 className="text-sm font-bold text-sidebar-primary truncate">{spaceName}</h2>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground">
          Text Channels
        </p>
        {channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => onSelectChannel(ch)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
              activeChannelId === ch.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            <span className="text-base">{ch.icon || "💬"}</span>
            <span className="truncate">{ch.name.toLowerCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ChannelSidebar;
