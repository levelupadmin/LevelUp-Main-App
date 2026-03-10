import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, Hash, ChevronDown } from "lucide-react";
import { useSpace } from "@/hooks/useCommunity";
import {
  useChannels,
  useChannelMessages,
  useSendMessage,
  useToggleReaction,
  useDeleteMessage,
  type Channel,
  type ChatMessage,
} from "@/hooks/useCommunityChat";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import ChannelSidebar from "@/components/community/ChannelSidebar";
import ChatMessageList from "@/components/community/ChatMessageList";
import ChatInput from "@/components/community/ChatInput";
import ThreadPanel from "@/components/community/ThreadPanel";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

interface SpaceCommunityProps {
  type: "city" | "skill";
}

const SpaceCommunity = ({ type }: SpaceCommunityProps) => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const { data: space, isLoading: spaceLoading } = useSpace(slug || "");
  const { data: channels = [], isLoading: channelsLoading } = useChannels(space?.id);

  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [threadMessage, setThreadMessage] = useState<ChatMessage | null>(null);
  const [mobileChannelOpen, setMobileChannelOpen] = useState(false);

  // Auto-select default channel
  const currentChannel = activeChannel || channels.find((c) => c.is_default) || channels[0] || null;

  const { data: messages = [], isLoading: messagesLoading } = useChannelMessages(currentChannel?.id);
  const sendMessage = useSendMessage();
  const toggleReaction = useToggleReaction();
  const deleteMessage = useDeleteMessage();

  const handleSelectChannel = (ch: Channel) => {
    setActiveChannel(ch);
    setThreadMessage(null);
    setMobileChannelOpen(false);
  };

  const handleSend = (content: string) => {
    if (!currentChannel) return;
    sendMessage.mutate({ channelId: currentChannel.id, content });
  };

  if (spaceLoading || channelsLoading) {
    return (
      <AppShell>
        <div className="flex h-[calc(100vh-4rem)]">
          <div className="w-56 border-r border-border p-4 space-y-2 hidden md:block">
            <Skeleton className="h-6 w-3/4" />
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-full" />)}
          </div>
          <div className="flex-1 p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!space) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Community not found</p>
            <button onClick={() => navigate("/community")} className="mt-3 text-sm font-semibold text-foreground hover:underline">
              ← Back
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Desktop: Channel Sidebar */}
        {!isMobile && (
          <div className="w-56 flex-shrink-0">
            <ChannelSidebar
              channels={channels}
              activeChannelId={currentChannel?.id}
              onSelectChannel={handleSelectChannel}
              spaceName={space.name}
              spaceIcon={space.icon}
            />
          </div>
        )}

        {/* Main chat area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Channel header */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 bg-card">
            {isMobile && (
              <Sheet open={mobileChannelOpen} onOpenChange={setMobileChannelOpen}>
                <SheetTrigger asChild>
                  <button className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                  <SheetTitle className="sr-only">Channels</SheetTitle>
                  <ChannelSidebar
                    channels={channels}
                    activeChannelId={currentChannel?.id}
                    onSelectChannel={handleSelectChannel}
                    spaceName={space.name}
                    spaceIcon={space.icon}
                  />
                </SheetContent>
              </Sheet>
            )}
            <button
              onClick={() => navigate("/community")}
              className="text-muted-foreground hover:text-foreground md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base">{currentChannel?.icon || "💬"}</span>
              <h1 className="text-sm font-bold text-foreground truncate">
                {currentChannel?.name?.toLowerCase() || "general"}
              </h1>
            </div>
            {currentChannel?.description && (
              <span className="hidden md:block text-xs text-muted-foreground truncate ml-2 border-l border-border pl-3">
                {currentChannel.description}
              </span>
            )}
          </div>

          {/* Messages */}
          <ChatMessageList
            messages={messages}
            isLoading={messagesLoading}
            onOpenThread={(msg) => setThreadMessage(msg)}
            onReact={(mid, emoji, has) => toggleReaction.mutate({ messageId: mid, emoji, hasReacted: has })}
            onDelete={(mid) => deleteMessage.mutate(mid)}
          />

          {/* Input */}
          <ChatInput
            onSend={handleSend}
            placeholder={`Message #${currentChannel?.name?.toLowerCase() || "general"}`}
            disabled={sendMessage.isPending}
          />
        </div>

        {/* Thread panel */}
        {threadMessage && currentChannel && !isMobile && (
          <ThreadPanel
            parentMessage={threadMessage}
            channelId={currentChannel.id}
            onClose={() => setThreadMessage(null)}
          />
        )}

        {/* Mobile thread as sheet */}
        {threadMessage && currentChannel && isMobile && (
          <Sheet open={!!threadMessage} onOpenChange={() => setThreadMessage(null)}>
            <SheetContent side="bottom" className="h-[80vh] p-0 rounded-t-2xl">
              <SheetTitle className="sr-only">Thread</SheetTitle>
              <ThreadPanel
                parentMessage={threadMessage}
                channelId={currentChannel.id}
                onClose={() => setThreadMessage(null)}
              />
            </SheetContent>
          </Sheet>
        )}
      </div>
    </AppShell>
  );
};

export default SpaceCommunity;
