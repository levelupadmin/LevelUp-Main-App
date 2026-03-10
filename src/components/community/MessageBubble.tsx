import { MessageCircle, Smile, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/hooks/useCommunityChat";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["👍", "❤️", "🔥", "😂", "🎬"];

interface MessageBubbleProps {
  message: ChatMessage;
  isGrouped?: boolean;
  onOpenThread?: (message: ChatMessage) => void;
  onReact?: (messageId: string, emoji: string, hasReacted: boolean) => void;
  onDelete?: (messageId: string) => void;
}

const MessageBubble = ({ message, isGrouped = false, onOpenThread, onReact, onDelete }: MessageBubbleProps) => {
  const { user } = useAuth();
  const isOwn = user?.id === message.user_id;

  return (
    <div className={cn("group relative px-4 hover:bg-accent/30 transition-colors", isGrouped ? "py-0.5" : "pt-3 pb-0.5")}>
      <div className="flex gap-3">
        {/* Avatar */}
        {!isGrouped ? (
          <div className="flex-shrink-0">
            {message.author_avatar ? (
              <img src={message.author_avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-foreground">
                {(message.author_name || "U").charAt(0)}
              </div>
            )}
          </div>
        ) : (
          <div className="w-9 flex-shrink-0" />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {!isGrouped && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-sm font-semibold text-foreground">{message.author_name}</span>
              <span className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
              </span>
            </div>
          )}
          <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{message.content}</p>
          {message.image_url && (
            <img src={message.image_url} alt="" className="mt-2 max-w-sm rounded-xl border border-border" />
          )}

          {/* Reactions */}
          {message.reactions && message.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {message.reactions.map((r) => (
                <button
                  key={r.emoji}
                  onClick={() => onReact?.(message.id, r.emoji, r.has_reacted)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border transition-colors",
                    r.has_reacted
                      ? "border-primary/30 bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30"
                  )}
                >
                  <span>{r.emoji}</span>
                  <span>{r.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Thread indicator */}
          {(message.reply_count || 0) > 0 && (
            <button
              onClick={() => onOpenThread?.(message)}
              className="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary/80 hover:text-primary hover:underline"
            >
              <MessageCircle className="h-3 w-3" />
              {message.reply_count} {message.reply_count === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute -top-3 right-4 hidden group-hover:flex items-center gap-0.5 rounded-lg border border-border bg-card shadow-md px-1 py-0.5">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              const existing = message.reactions?.find((r) => r.emoji === emoji);
              onReact?.(message.id, emoji, existing?.has_reacted || false);
            }}
            className="p-1 rounded hover:bg-accent text-sm"
          >
            {emoji}
          </button>
        ))}
        <button
          onClick={() => onOpenThread?.(message)}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </button>
        {isOwn && (
          <button
            onClick={() => onDelete?.(message.id)}
            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
