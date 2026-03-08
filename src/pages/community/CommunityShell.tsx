import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Flame, Users, Mail, ChevronDown, ChevronRight, Settings, ArrowLeft,
  Hash, Lock, Plus, MapPin, Sparkles,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { sidebarBatches } from "@/data/feedData";
import { batchCohorts, type BatchCohort, type BatchChannel } from "@/data/batchData";
import {
  cityCommunities, skillCommunities,
  type CityCommunity, type SkillCommunity, type Channel,
} from "@/data/communityData";
import instructor1 from "@/assets/instructor-1.jpg";
import FeedView from "@/components/community/FeedView";
import PeopleView from "@/components/community/PeopleView";
import InboxView from "@/components/community/InboxView";
import ChannelView from "@/components/community/ChannelView";
import SpaceChannelView from "@/components/community/SpaceChannelView";

type View = "feed" | "people" | "inbox";
type SpaceType = "city" | "skill";

interface Props {
  children?: React.ReactNode;
  initialView?: View;
}

const CommunityShell = ({ children, initialView = "feed" }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeView, setActiveView] = useState<View>(initialView);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Batch expansion
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    GENERAL: true, LEARNING: true, SHOWCASE: true, SOCIAL: true,
  });
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  // Space expansion
  const [expandedSpace, setExpandedSpace] = useState<{ type: SpaceType; id: string } | null>(null);
  const [selectedSpaceChannel, setSelectedSpaceChannel] = useState<{ type: SpaceType; spaceId: string; channelId: string } | null>(null);

  // Collapsed space sub-sections
  const [citiesExpanded, setCitiesExpanded] = useState(true);
  const [skillsExpanded, setSkillsExpanded] = useState(true);

  const isPostDetail = location.pathname.startsWith("/community/post/");
  const isBatchSpace = location.pathname.startsWith("/community/batch/");
  const isBatchChannelActive = selectedBatchId !== null && selectedChannelId !== null;
  const isSpaceChannelActive = selectedSpaceChannel !== null;
  const isAnyChannelActive = isBatchChannelActive || isSpaceChannelActive;

  // Clear all channel selections
  const clearChannels = () => {
    setExpandedBatch(null);
    setSelectedBatchId(null);
    setSelectedChannelId(null);
    setExpandedSpace(null);
    setSelectedSpaceChannel(null);
  };

  const handleNavClick = useCallback((view: View) => {
    setActiveView(view);
    clearChannels();
    setSidebarOpen(false);
    if (location.pathname !== "/community") navigate("/community");
  }, [navigate, location.pathname]);

  const handleBatchClick = (batchId: string) => {
    // Collapse any expanded space
    setExpandedSpace(null);
    setSelectedSpaceChannel(null);

    if (expandedBatch === batchId) {
      setExpandedBatch(null);
      setSelectedBatchId(null);
      setSelectedChannelId(null);
    } else {
      setExpandedBatch(batchId);
      const cohort = batchCohorts.find(c => c.id === batchId);
      if (cohort && cohort.channels.length > 0) {
        setSelectedBatchId(batchId);
        setSelectedChannelId(cohort.channels[0].id);
      }
    }
  };

  const handleBatchChannelClick = (batchId: string, channelId: string) => {
    setSelectedBatchId(batchId);
    setSelectedChannelId(channelId);
    setSelectedSpaceChannel(null);
    setSidebarOpen(false);
    if (location.pathname !== "/community") navigate("/community");
  };

  const handleSpaceClick = (type: SpaceType, spaceId: string) => {
    // Collapse any expanded batch
    setExpandedBatch(null);
    setSelectedBatchId(null);
    setSelectedChannelId(null);

    if (expandedSpace?.id === spaceId && expandedSpace?.type === type) {
      setExpandedSpace(null);
      setSelectedSpaceChannel(null);
    } else {
      setExpandedSpace({ type, id: spaceId });
      // Auto-select first channel
      const community = type === "city"
        ? cityCommunities.find(c => c.id === spaceId)
        : skillCommunities.find(c => c.id === spaceId);
      if (community && community.channels.length > 0) {
        setSelectedSpaceChannel({ type, spaceId, channelId: community.channels[0].id });
      }
    }
  };

  const handleSpaceChannelClick = (type: SpaceType, spaceId: string, channelId: string) => {
    setSelectedSpaceChannel({ type, spaceId, channelId });
    setSelectedBatchId(null);
    setSelectedChannelId(null);
    setSidebarOpen(false);
    if (location.pathname !== "/community") navigate("/community");
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const mainNav = [
    { id: "feed" as View, label: "Feed", icon: Flame, badge: null },
    { id: "people" as View, label: "People", icon: Users, badge: null },
    { id: "inbox" as View, label: "Inbox", icon: Mail, badge: 3 },
  ];

  // Resolved objects
  const selectedCohort = selectedBatchId ? batchCohorts.find(c => c.id === selectedBatchId) : null;
  const selectedBatchChannel = selectedCohort && selectedChannelId
    ? selectedCohort.channels.find(ch => ch.id === selectedChannelId) : null;

  const resolvedSpace = selectedSpaceChannel
    ? (selectedSpaceChannel.type === "city"
      ? cityCommunities.find(c => c.id === selectedSpaceChannel.spaceId)
      : skillCommunities.find(c => c.id === selectedSpaceChannel.spaceId))
    : null;
  const resolvedSpaceChannel = resolvedSpace
    ? resolvedSpace.channels.find(ch => ch.id === selectedSpaceChannel!.channelId)
    : null;

  // ── Sidebar ──
  const SidebarInner = () => (
    <div className="flex flex-col h-full" style={{ background: "hsl(240 33% 14%)" }}>
      {/* User context */}
      <div className="p-4 border-b" style={{ borderColor: "hsl(240 20% 20%)" }}>
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={instructor1} />
            <AvatarFallback className="text-xs">YO</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">You</p>
            <div className="flex items-center gap-2 text-xs" style={{ color: "hsl(0 0% 55%)" }}>
              <Badge className="h-4 px-1.5 text-[10px] font-bold rounded-full border-0" style={{ background: "hsl(var(--highlight))", color: "hsl(0 0% 7%)" }}>
                L4
              </Badge>
              <span>1,250 XP</span>
              <span>🔥 12</span>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {/* Main Nav */}
          <div className="px-3 mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider px-2 py-2" style={{ color: "hsl(0 0% 33%)" }}>
              Main
            </p>
          </div>
          {mainNav.map((item) => {
            const isActive = activeView === item.id && !isPostDetail && !isBatchSpace && !isAnyChannelActive;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className="w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors relative"
                style={{
                  color: isActive ? "hsl(var(--highlight))" : "hsl(0 0% 85%)",
                  background: isActive ? "hsl(240 20% 18%)" : "transparent",
                }}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r" style={{ background: "hsl(var(--highlight))" }} />
                )}
                <item.icon size={18} />
                <span className="font-medium">{item.label}</span>
                {item.badge && (
                  <span className="ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-destructive text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* ── My Batches ── */}
          <div className="mt-4 px-3 mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider px-2 py-2" style={{ color: "hsl(0 0% 33%)" }}>
              My Batches
            </p>
          </div>
          {sidebarBatches.length === 0 ? (
            <button
              onClick={() => { navigate("/learn"); setSidebarOpen(false); }}
              className="w-full text-left px-5 py-2 text-xs transition-colors"
              style={{ color: "hsl(var(--highlight))" }}
            >
              Join a cohort program →
            </button>
          ) : (
            sidebarBatches.map((batch) => {
              const isExpanded = expandedBatch === batch.id;
              const cohort = batchCohorts.find(c => c.id === batch.id);
              const channelsByCategory: Record<string, NonNullable<typeof cohort>["channels"]> = {};
              if (cohort) {
                cohort.channels.forEach(ch => {
                  if (!channelsByCategory[ch.category]) channelsByCategory[ch.category] = [];
                  channelsByCategory[ch.category].push(ch);
                });
              }

              return (
                <div key={batch.id}>
                  <button
                    onClick={() => handleBatchClick(batch.id)}
                    className="w-full flex items-center gap-2 px-5 py-2 text-sm transition-colors"
                    style={{
                      color: isExpanded ? "hsl(0 0% 95%)" : "hsl(0 0% 75%)",
                      background: isExpanded ? "hsl(240 20% 18%)" : "transparent",
                    }}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="flex-1 text-left truncate text-[13px] font-medium">{batch.name}</span>
                    {batch.unreadCount > 0 && !isExpanded && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive text-white">
                        {batch.unreadCount}
                      </span>
                    )}
                  </button>

                  {isExpanded && cohort && (
                    <div className="pb-2">
                      {Object.entries(channelsByCategory).map(([category, channels]) => (
                        <div key={category}>
                          <button
                            onClick={() => toggleCategory(category)}
                            className="flex items-center gap-1 px-6 py-1.5 text-[10px] font-bold uppercase tracking-wider w-full hover:text-white/60 transition-colors"
                            style={{ color: "hsl(0 0% 33%)" }}
                          >
                            {expandedCategories[category] ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                            {category}
                          </button>
                          {expandedCategories[category] && channels.map(ch => {
                            const isActiveChannel = selectedBatchId === batch.id && selectedChannelId === ch.id;
                            return (
                              <button
                                key={ch.id}
                                onClick={() => handleBatchChannelClick(batch.id, ch.id)}
                                className="w-full flex items-center gap-2 py-1.5 text-[13px] transition-colors relative"
                                style={{
                                  paddingLeft: "2rem",
                                  color: isActiveChannel
                                    ? "hsl(var(--highlight))"
                                    : ch.isUnread ? "hsl(0 0% 95%)" : "hsl(0 0% 50%)",
                                  background: isActiveChannel ? "hsl(240 20% 18%)" : "transparent",
                                }}
                              >
                                {isActiveChannel && (
                                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r" style={{ background: "hsl(var(--highlight))" }} />
                                )}
                                {ch.isLocked ? <Lock size={12} /> : <Hash size={12} />}
                                <span className={ch.isUnread && !isActiveChannel ? "font-semibold" : ""}>
                                  {ch.name}
                                </span>
                                {ch.isUnread && !isActiveChannel && (
                                  <div className="ml-auto mr-3 w-2 h-2 rounded-full" style={{ background: "hsl(var(--info))" }} />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* ── My Spaces ── */}
          <div className="mt-4 px-3 mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider px-2 py-2" style={{ color: "hsl(0 0% 33%)" }}>
              My Spaces
            </p>
          </div>

          {/* Cities */}
          <button
            onClick={() => setCitiesExpanded(!citiesExpanded)}
            className="w-full flex items-center gap-2 px-5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors"
            style={{ color: "hsl(0 0% 45%)" }}
          >
            {citiesExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <MapPin size={12} />
            Cities
          </button>
          {citiesExpanded && cityCommunities.slice(0, 3).map((city) => {
            const isExpanded = expandedSpace?.type === "city" && expandedSpace.id === city.id;
            return (
              <div key={city.id}>
                <button
                  onClick={() => handleSpaceClick("city", city.id)}
                  className="w-full flex items-center gap-2.5 px-5 py-2 text-[13px] transition-colors"
                  style={{
                    color: isExpanded ? "hsl(0 0% 95%)" : "hsl(0 0% 75%)",
                    background: isExpanded ? "hsl(240 20% 18%)" : "transparent",
                  }}
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>🏙️</span>
                  <span className="flex-1 text-left truncate">{city.name}</span>
                </button>
                {isExpanded && (
                  <SpaceChannelList
                    channels={city.channels}
                    type="city"
                    spaceId={city.id}
                    selectedSpaceChannel={selectedSpaceChannel}
                    onChannelClick={handleSpaceChannelClick}
                  />
                )}
              </div>
            );
          })}

          {/* Skills */}
          <button
            onClick={() => setSkillsExpanded(!skillsExpanded)}
            className="w-full flex items-center gap-2 px-5 py-1.5 text-[11px] font-bold uppercase tracking-wider mt-1 transition-colors"
            style={{ color: "hsl(0 0% 45%)" }}
          >
            {skillsExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <Sparkles size={12} />
            Skills
          </button>
          {skillsExpanded && skillCommunities.slice(0, 4).map((skill) => {
            const isExpanded = expandedSpace?.type === "skill" && expandedSpace.id === skill.id;
            return (
              <div key={skill.id}>
                <button
                  onClick={() => handleSpaceClick("skill", skill.id)}
                  className="w-full flex items-center gap-2.5 px-5 py-2 text-[13px] transition-colors"
                  style={{
                    color: isExpanded ? "hsl(0 0% 95%)" : "hsl(0 0% 75%)",
                    background: isExpanded ? "hsl(240 20% 18%)" : "transparent",
                  }}
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>✨</span>
                  <span className="flex-1 text-left truncate">{skill.name}</span>
                </button>
                {isExpanded && (
                  <SpaceChannelList
                    channels={skill.channels}
                    type="skill"
                    spaceId={skill.id}
                    selectedSpaceChannel={selectedSpaceChannel}
                    onChannelClick={handleSpaceChannelClick}
                  />
                )}
              </div>
            );
          })}

          <button
            className="w-full flex items-center gap-2 px-5 py-2 text-xs transition-colors mt-1"
            style={{ color: "hsl(var(--highlight))" }}
          >
            <Plus size={14} />
            Discover Spaces
          </button>
        </div>
      </ScrollArea>

      {/* Bottom */}
      <div className="p-3 border-t space-y-1" style={{ borderColor: "hsl(240 20% 20%)" }}>
        <button
          onClick={() => navigate("/home")}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:text-white"
          style={{ color: "hsl(0 0% 65%)" }}
        >
          <ArrowLeft size={16} />
          Back to Level Up
        </button>
        <button
          onClick={() => { navigate("/settings"); setSidebarOpen(false); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:text-white"
          style={{ color: "hsl(0 0% 65%)" }}
        >
          <Settings size={16} />
          Settings
        </button>
      </div>
    </div>
  );

  const renderMainContent = () => {
    if (children) return children;

    // Batch channel view
    if (isBatchChannelActive && selectedCohort && selectedBatchChannel) {
      return (
        <ChannelView
          key={`${selectedBatchId}-${selectedChannelId}`}
          cohort={selectedCohort}
          channel={selectedBatchChannel}
          onToggleSidebar={() => setSidebarOpen(true)}
        />
      );
    }

    // Space channel view
    if (isSpaceChannelActive && resolvedSpace && resolvedSpaceChannel) {
      return (
        <SpaceChannelView
          key={`${selectedSpaceChannel!.spaceId}-${selectedSpaceChannel!.channelId}`}
          spaceName={resolvedSpace.name}
          channel={resolvedSpaceChannel}
          onToggleSidebar={() => setSidebarOpen(true)}
        />
      );
    }

    switch (activeView) {
      case "feed":
        return <FeedView onToggleSidebar={() => setSidebarOpen(true)} />;
      case "people":
        return <PeopleView onToggleSidebar={() => setSidebarOpen(true)} />;
      case "inbox":
        return <InboxView onToggleSidebar={() => setSidebarOpen(true)} />;
      default:
        return <FeedView onToggleSidebar={() => setSidebarOpen(true)} />;
    }
  };

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-[280px] flex-shrink-0">
        <SidebarInner />
      </div>

      {/* Mobile sidebar drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-[280px] border-0" style={{ background: "hsl(240 33% 14%)" }}>
          <SidebarInner />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {renderMainContent()}
      </div>
    </div>
  );
};

// ── Reusable space channel list in sidebar ──
function SpaceChannelList({
  channels,
  type,
  spaceId,
  selectedSpaceChannel,
  onChannelClick,
}: {
  channels: Channel[];
  type: SpaceType;
  spaceId: string;
  selectedSpaceChannel: { type: SpaceType; spaceId: string; channelId: string } | null;
  onChannelClick: (type: SpaceType, spaceId: string, channelId: string) => void;
}) {
  return (
    <div className="pb-1">
      {channels.map(ch => {
        const isActive =
          selectedSpaceChannel?.type === type &&
          selectedSpaceChannel.spaceId === spaceId &&
          selectedSpaceChannel.channelId === ch.id;
        const hasUnread = (ch.unread ?? 0) > 0;

        return (
          <button
            key={ch.id}
            onClick={() => onChannelClick(type, spaceId, ch.id)}
            className="w-full flex items-center gap-2 py-1.5 text-[13px] transition-colors relative"
            style={{
              paddingLeft: "2.5rem",
              color: isActive
                ? "hsl(var(--highlight))"
                : hasUnread ? "hsl(0 0% 95%)" : "hsl(0 0% 50%)",
              background: isActive ? "hsl(240 20% 18%)" : "transparent",
            }}
          >
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r" style={{ background: "hsl(var(--highlight))" }} />
            )}
            <span className="text-xs">{ch.icon}</span>
            <span className={hasUnread && !isActive ? "font-semibold" : ""}>{ch.label}</span>
            {hasUnread && !isActive && (
              <div className="ml-auto mr-3 w-2 h-2 rounded-full" style={{ background: "hsl(var(--info))" }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default CommunityShell;
