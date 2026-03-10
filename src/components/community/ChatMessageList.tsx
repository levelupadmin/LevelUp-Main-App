import { useRef, useEffect } from "react";
import type { ChatMessage } from "@/hooks/useCommunityChat";
import MessageBubble from "./MessageBubble";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle } from "lucide-react";

interface ChatMessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onOpenThread: (message: ChatMessage) => void;
  onReact: (messageId: string, emoji: string, hasReacted: boolean) => void;
  onDelete: (messageId: string) => void;
}

const ChatMessageList = ({ messages, isLoading, onOpenThread, onReact, onDelete }: ChatMessageListProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  useEffect(() => {
    if (messages.length > prevCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: prevCount.current === 0 ? "auto" : "smooth" });
    }
    prevCount.current = messages.length;
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <MessageCircle className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No messages yet</p>
          <p className="text-xs text-muted-foreground mt-1">Be the first to say something!</p>
        </div>
      </div>
    );
  }

  // Group consecutive messages by the same author within 5 minutes
  const isGrouped = (msg: ChatMessage, idx: number) => {
    if (idx === 0) return false;
    const prev = messages[idx - 1];
    if (prev.user_id !== msg.user_id) return false;
    const diff = new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime();
    return diff < 5 * 60 * 1000;
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="py-2">
        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isGrouped={isGrouped(msg, idx)}
            onOpenThread={onOpenThread}
            onReact={onReact}
            onDelete={onDelete}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default ChatMessageList;
