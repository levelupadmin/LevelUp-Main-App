import { X, MessageCircle } from "lucide-react";
import type { ChatMessage } from "@/hooks/useCommunityChat";
import { useThreadMessages, useSendMessage, useToggleReaction, useDeleteMessage } from "@/hooks/useCommunityChat";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import { Skeleton } from "@/components/ui/skeleton";
import { useRef, useEffect } from "react";

interface ThreadPanelProps {
  parentMessage: ChatMessage;
  channelId: string;
  onClose: () => void;
}

const ThreadPanel = ({ parentMessage, channelId, onClose }: ThreadPanelProps) => {
  const { data: replies = [], isLoading } = useThreadMessages(parentMessage.id);
  const sendMessage = useSendMessage();
  const toggleReaction = useToggleReaction();
  const deleteMessage = useDeleteMessage();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length]);

  const handleSend = (content: string) => {
    sendMessage.mutate({ channelId, content, parentId: parentMessage.id });
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-card lg:w-96">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">Thread</h3>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-accent text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Parent message */}
      <div className="border-b border-border">
        <MessageBubble
          message={parentMessage}
          onReact={(mid, emoji, has) => toggleReaction.mutate({ messageId: mid, emoji, hasReacted: has })}
          onDelete={(mid) => deleteMessage.mutate(mid)}
        />
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-10 flex-1" />
              </div>
            ))}
          </div>
        ) : replies.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-muted-foreground">No replies yet</p>
          </div>
        ) : (
          <div className="py-2">
            {replies.map((r) => (
              <MessageBubble
                key={r.id}
                message={r}
                onReact={(mid, emoji, has) => toggleReaction.mutate({ messageId: mid, emoji, hasReacted: has })}
                onDelete={(mid) => deleteMessage.mutate(mid)}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        placeholder="Reply in thread..."
        disabled={sendMessage.isPending}
      />
    </div>
  );
};

export default ThreadPanel;
