import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Flame, Users, Mail, ChevronDown, ChevronRight, Settings, ArrowLeft,
  Hash, Lock, Plus, X,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { sidebarBatches, sidebarSpaces } from "@/data/feedData";
import { batchCohorts } from "@/data/batchData";
import instructor1 from "@/assets/instructor-1.jpg";
import FeedView from "@/components/community/FeedView";
import PeopleView from "@/components/community/PeopleView";
import InboxView from "@/components/community/InboxView";

type View = "feed" | "people" | "inbox";

interface Props {
  children?: React.ReactNode;
  initialView?: View;
}

const CommunityShell = ({ children, initialView = "feed" }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeView, setActiveView] = useState<View>(initialView);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    GENERAL: true, LEARNING: true, SHOWCASE: true, SOCIAL: true,
  });

  const isPostDetail = location.pathname.startsWith("/community/post/");
  const isBatchSpace = location.pathname.startsWith("/community/batch/");

  const handleNavClick = useCallback((view: View) => {
    setActiveView(view);
    setExpandedBatch(null);
    setSidebarOpen(false);
    if (location.pathname !== "/community") navigate("/community");
  }, [navigate, location.pathname]);

  const handleBatchClick = (batchId: string) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
    } else {
      setExpandedBatch(batchId);
    }
  };

  const handleChannelClick = (batchId: string, _channelId: string) => {
    navigate(`/community/batch/${batchId}`);
    setSidebarOpen(false);
  };

  const handleSpaceClick = (slug: string) => {
    navigate(`/community/skill/${slug}`);
    setSidebarOpen(false);
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const mainNav = [
    { id: "feed" as View, label: "Feed", icon: Flame, badge: null },
    { id: "people" as View, label: "People", icon: Users, badge: null },
    { id: "inbox" as View, label: "Inbox", icon: Mail, badge: 3 },
  ];

  // ── Sidebar content ──
  const SidebarContent = () => (
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
            <p className="text-[11px] font-semibold uppercase tracking-wider px-2 py-2" style={{ color: "hsl(0 0% 40%)" }}>
              Main
            </p>
          </div>
          {mainNav.map((item) => {
            const isActive = activeView === item.id && !isPostDetail && !isBatchSpace;
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

          {/* My Batches */}
          <div className="mt-4 px-3 mb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider px-2 py-2" style={{ color: "hsl(0 0% 40%)" }}>
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
              const channelsByCategory: Record<string, typeof cohort extends undefined ? never : NonNullable<typeof cohort>["channels"]> = {};
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
                    className="w-full flex items-center gap-2 px-5 py-2 text-sm transition-colors hover:text-white"
                    style={{ color: isExpanded ? "hsl(0 0% 95%)" : "hsl(0 0% 75%)" }}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="flex-1 text-left truncate text-[13px]">{batch.name}</span>
                    {batch.unreadCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive text-white">
                        {batch.unreadCount}
                      </span>
                    )}
                  </button>

                  {isExpanded && cohort && (
                    <div className="ml-4 pb-2">
                      {Object.entries(channelsByCategory).map(([category, channels]) => (
                        <div key={category}>
                          <button
                            onClick={() => toggleCategory(category)}
                            className="flex items-center gap-1 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider w-full"
                            style={{ color: "hsl(0 0% 40%)" }}
                          >
                            {expandedCategories[category] ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                            {category}
                          </button>
                          {expandedCategories[category] && channels.map(ch => (
                            <button
                              key={ch.id}
                              onClick={() => handleChannelClick(batch.id, ch.id)}
                              className="w-full flex items-center gap-2 px-6 py-1.5 text-[13px] transition-colors hover:text-white"
                              style={{ color: ch.isUnread ? "hsl(0 0% 95%)" : "hsl(0 0% 50%)" }}
                            >
                              {ch.isLocked ? <Lock size={12} /> : <Hash size={12} />}
                              <span className={ch.isUnread ? "font-semibold" : ""}>{ch.name}</span>
                              {ch.isUnread && (
                                <div className="ml-auto w-2 h-2 rounded-full" style={{ background: "hsl(var(--info))" }} />
                              )}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* My Spaces */}
          <div className="mt-4 px-3 mb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider px-2 py-2" style={{ color: "hsl(0 0% 40%)" }}>
              My Spaces
            </p>
          </div>
          {sidebarSpaces.map((space) => (
            <button
              key={space.id}
              onClick={() => handleSpaceClick(space.slug)}
              className="w-full flex items-center gap-2.5 px-5 py-2 text-[13px] transition-colors hover:text-white"
              style={{ color: "hsl(0 0% 75%)" }}
            >
              <span>{space.emoji}</span>
              <span className="flex-1 text-left truncate">{space.name}</span>
              {space.hasUnread && (
                <div className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--info))" }} />
              )}
            </button>
          ))}
          <button
            className="w-full flex items-center gap-2 px-5 py-2 text-xs transition-colors"
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
          onClick={() => { navigate("/home"); }}
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
        <SidebarContent />
      </div>

      {/* Mobile sidebar drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-[280px] border-0" style={{ background: "hsl(240 33% 14%)" }}>
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {renderMainContent()}
      </div>
    </div>
  );
};

export default CommunityShell;
