import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, Users, Heart, MessageCircle, Pin, ChevronRight } from "lucide-react";
import { cityCommunities, skillCommunities, mockChannelMessages, type Channel, type ChannelMessage } from "@/data/communityData";

interface SpaceCommunityProps {
  type: "city" | "skill";
}

const SpaceCommunity = ({ type }: SpaceCommunityProps) => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const communities = type === "city" ? cityCommunities : skillCommunities;
  const community = communities.find((c) => c.slug === slug);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);

  if (!community) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Community not found</p>
            <button onClick={() => navigate("/community")} className="mt-3 text-sm font-semibold text-foreground hover:underline">← Back</button>
          </div>
        </div>
      </AppShell>
    );
  }

  const channel = activeChannel ? community.channels.find((c) => c.id === activeChannel) : null;
  const messages = activeChannel ? (mockChannelMessages[activeChannel] || mockChannelMessages["discussions"] || []) : [];

  // Channel detail view
  if (activeChannel && channel) {
    return (
      <AppShell>
        <div className="flex h-[calc(100vh-3.5rem)] flex-col">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <button onClick={() => setActiveChannel(null)} className="rounded-lg p-1 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="text-lg">{channel.icon}</span>
            <div>
              <p className="text-sm font-semibold text-foreground">{channel.label}</p>
              <p className="text-xs text-muted-foreground">{community.name} Community</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <MessageCard key={msg.id} message={msg} />
            ))}
            {messages.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">No messages yet</p>
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2 rounded-xl bg-accent px-4 py-3">
              <input
                type="text"
                placeholder={`Message #${channel.label.toLowerCase()}...`}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                readOnly
              />
              <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Send</button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // Channel list view
  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar lg:block overflow-y-auto">
          <div className="p-4">
            <button onClick={() => navigate("/community")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <h2 className="text-sm font-bold text-foreground mb-1">{community.name}</h2>
            <p className="text-xs text-muted-foreground mb-4">{community.memberCount} creators</p>
            <div className="space-y-0.5">
              {community.channels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannel(ch.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                    activeChannel === ch.id ? "bg-accent text-foreground font-medium" : "text-sidebar-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <span className="text-sm">{ch.icon}</span>
                  <span className="flex-1 text-left truncate">{ch.label}</span>
                  {ch.unread && ch.unread > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-bold text-background">
                      {ch.unread}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-border p-4">
            <button
              onClick={() => navigate(`/community/directory?${type}=${slug}`)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Users className="h-3.5 w-3.5" /> View Creators in {community.name}
            </button>
          </div>
        </aside>

        {/* Mobile */}
        <div className="flex-1 overflow-y-auto">
          <div className="lg:hidden px-4 pt-4">
            <button onClick={() => navigate("/community")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <h1 className="text-lg font-bold text-foreground mb-0.5">{community.name}</h1>
            <p className="text-xs text-muted-foreground mb-1">{community.description}</p>
            <p className="text-xs text-muted-foreground mb-5">{community.memberCount} creators</p>
          </div>

          <div className="px-4 pb-6 lg:hidden">
            <div className="space-y-1">
              {community.channels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannel(ch.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent"
                >
                  <span className="text-base">{ch.icon}</span>
                  <span className="flex-1 text-sm font-medium text-foreground">{ch.label}</span>
                  {ch.unread && ch.unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-bold text-background">
                      {ch.unread}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <button
                onClick={() => navigate(`/community/directory?${type}=${slug}`)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Users className="h-4 w-4" /> View Creators in {community.name}
              </button>
            </div>
          </div>

          <div className="hidden lg:flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg mb-1">{type === "city" ? "📍" : "✨"}</p>
              <p className="text-sm font-medium text-foreground">{community.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{community.description}</p>
              <p className="text-xs text-muted-foreground mt-3">Select a channel from the sidebar</p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
};

function MessageCard({ message }: { message: ChannelMessage }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${message.pinned ? "border-[hsl(var(--highlight))]/30" : ""}`}>
      {message.pinned && (
        <div className="flex items-center gap-1 text-[10px] font-semibold text-[hsl(var(--highlight))] mb-2">
          <Pin className="h-3 w-3" /> Pinned
        </div>
      )}
      <div className="flex items-start gap-3">
        <img src={message.avatar} alt={message.author} className="h-8 w-8 rounded-full object-cover mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{message.author}</span>
            {message.role && <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{message.role}</span>}
            <span className="text-[10px] text-muted-foreground">{message.timeAgo}</span>
          </div>
          <p className="mt-1 text-sm text-secondary-foreground leading-relaxed">{message.content}</p>
          <div className="mt-2 flex items-center gap-4 text-muted-foreground">
            <button className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"><Heart className="h-3 w-3" /> {message.likes}</button>
            <button className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"><MessageCircle className="h-3 w-3" /> {message.replies}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpaceCommunity;
