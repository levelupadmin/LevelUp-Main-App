import { useState, useRef, useEffect } from "react";
import {
  Menu, Send, Plus, Image as ImageIcon, FileText, Link2,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  type Channel,
  type ChannelMessage,
  mockChannelMessages,
} from "@/data/communityData";

interface Props {
  spaceName: string;
  spaceEmoji?: string;
  channel: Channel;
  onToggleSidebar: () => void;
  hideHeader?: boolean;
}

const SpaceChannelView = ({ spaceName, channel, onToggleSidebar, hideHeader }: Props) => {
  const [messageText, setMessageText] = useState("");
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages: ChannelMessage[] = mockChannelMessages[channel.id] || [];

  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    }, 50);
  }, [channel.id]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-background shrink-0">
          <button onClick={onToggleSidebar} className="md:hidden text-foreground">
            <Menu size={20} />
          </button>
          <span className="text-base">{channel.icon}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-foreground">{channel.label}</h1>
            <p className="text-[11px] text-muted-foreground truncate">{spaceName}</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-3xl mb-2">{channel.icon}</p>
              <p className="text-sm font-semibold text-foreground">Welcome to {channel.label}</p>
              <p className="text-xs text-muted-foreground mt-1">Be the first to start a conversation!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="flex gap-3 group">
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarImage src={msg.avatar} />
                  <AvatarFallback className="text-[10px]">{msg.author[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-bold text-foreground">{msg.author}</span>
                    {msg.role && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{
                          background: msg.role === "Admin"
                            ? "hsl(var(--highlight) / 0.2)"
                            : msg.role === "Mentor"
                              ? "hsl(var(--highlight) / 0.2)"
                              : "hsl(var(--info) / 0.2)",
                          color: msg.role === "Admin" || msg.role === "Mentor"
                            ? "hsl(var(--highlight))"
                            : "hsl(var(--info))",
                        }}
                      >
                        {msg.role}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">{msg.timeAgo}</span>
                    {msg.pinned && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent text-muted-foreground">
                        📌 Pinned
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{msg.content}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>❤️ {msg.likes}</span>
                    {msg.replies > 0 && <span>💬 {msg.replies} replies</span>}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-background shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Plus size={18} />
            </button>
            {showAttachMenu && (
              <div className="absolute bottom-full left-0 mb-2 bg-popover border border-border rounded-lg shadow-elevated p-1 min-w-[140px] z-50">
                <button className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                  <ImageIcon size={14} /> Image
                </button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                  <FileText size={14} /> File
                </button>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                  <Link2 size={14} /> Link
                </button>
              </div>
            )}
          </div>
          <Input
            placeholder={`Message ${channel.label}...`}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="flex-1"
            onFocus={() => setShowAttachMenu(false)}
          />
          <Button
            size="icon"
            disabled={!messageText.trim()}
            className="flex-shrink-0"
            style={{
              background: messageText.trim() ? "hsl(var(--highlight))" : "hsl(var(--secondary))",
              color: messageText.trim() ? "hsl(0 0% 7%)" : "hsl(var(--muted-foreground))",
            }}
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SpaceChannelView;
