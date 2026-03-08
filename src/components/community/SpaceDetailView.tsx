import React, { useState } from "react";
import { ArrowLeft, Menu, Users } from "lucide-react";
import { type Channel } from "@/data/communityData";
import SpaceChannelView from "./SpaceChannelView";

interface Props {
  spaceName: string;
  spaceImage: string;
  memberCount: number;
  channels: Channel[];
  onToggleSidebar: () => void;
  onBack: () => void;
}

const SpaceDetailView = ({
  spaceName,
  spaceImage,
  memberCount,
  channels,
  onToggleSidebar,
  onBack,
}: Props) => {
  const [selectedChannelId, setSelectedChannelId] = useState(channels[0]?.id ?? "");
  const selectedChannel = channels.find((ch) => ch.id === selectedChannelId) ?? channels[0];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Space header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <button onClick={onToggleSidebar} className="md:hidden text-muted-foreground">
          <Menu size={20} />
        </button>
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <img
          src={spaceImage}
          alt={spaceName}
          className="w-7 h-7 rounded-md object-cover"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{spaceName}</p>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users size={11} />
            <span className="text-[11px]">{memberCount.toLocaleString()} members</span>
          </div>
        </div>
      </div>

      {/* Channel tabs */}
      <div className="border-b overflow-x-auto hide-scrollbar" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="flex gap-1 px-3 py-2">
          {channels.map((ch) => {
            const isActive = ch.id === selectedChannelId;
            return (
              <button
                key={ch.id}
                onClick={() => setSelectedChannelId(ch.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors"
                style={{
                  background: isActive ? "hsl(var(--highlight) / 0.15)" : "transparent",
                  color: isActive ? "hsl(var(--highlight))" : "hsl(var(--muted-foreground))",
                }}
              >
                <span>{ch.icon}</span>
                <span>{ch.label}</span>
                {(ch.unread ?? 0) > 0 && !isActive && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "hsl(var(--info))" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Channel content */}
      <div className="flex-1 min-h-0">
        {selectedChannel && (
          <SpaceChannelView
            key={selectedChannelId}
            spaceName={spaceName}
            channel={selectedChannel}
            onToggleSidebar={onToggleSidebar}
            hideHeader
          />
        )}
      </div>
    </div>
  );
};

export default SpaceDetailView;
