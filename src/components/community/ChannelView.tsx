import { useState, useRef, useEffect, useMemo } from "react";
import {
  Menu, Pin, Users, Hash, Lock, Send, Plus, Paperclip,
  MessageSquare, ChevronDown, X, Image as ImageIcon,
  FileText, Link2, Download, Play, MoreHorizontal,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  type BatchCohort, type BatchChannel, type BatchMessage, type BatchMember, type ThreadReply,
  getMemberById, getChannelMessages,
} from "@/data/batchData";

interface Props {
  cohort: BatchCohort;
  channel: BatchChannel;
  onToggleSidebar: () => void;
}

const ChannelView = ({ cohort, channel, onToggleSidebar }: Props) => {
  const [messageText, setMessageText] = useState("");
  const [showPins, setShowPins] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<{ messageId: string; authorName: string } | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => getChannelMessages(cohort, channel.id), [cohort, channel.id]);
  const pinnedMessages = useMemo(() => messages.filter(m => m.isPinned), [messages]);
  const isLocked = channel.isLocked;
  const userRole: "student" | "mentor" = "student"; // mock

  // Auto-scroll to bottom on channel change
  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    }, 50);
  }, [channel.id]);

  const toggleThread = (msgId: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      next.has(msgId) ? next.delete(msgId) : next.add(msgId);
      return next;
    });
  };

  // Group messages by dateGroup
  const groupedMessages = useMemo(() => {
    const groups: { date: string; msgs: BatchMessage[] }[] = [];
    let currentDate = "";
    for (const msg of messages) {
      if (msg.dateGroup !== currentDate) {
        currentDate = msg.dateGroup;
        groups.push({ date: currentDate, msgs: [msg] });
      } else {
        groups[groups.length - 1].msgs.push(msg);
      }
    }
    return groups;
  }, [messages]);

  const getMember = (id: string) => getMemberById(cohort, id);

  const RoleBadge = ({ role }: { role: BatchMember["role"] }) => {
    if (role === "mentor") return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "hsl(var(--highlight) / 0.2)", color: "hsl(var(--highlight))" }}>
        Mentor
      </span>
    );
    if (role === "ta") return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "hsl(var(--info) / 0.2)", color: "hsl(var(--info))" }}>
        TA
      </span>
    );
    return null;
  };

  const MessageContent = ({ content, msg }: { content: string; msg: BatchMessage }) => {
    // Basic markdown: **bold**, *italic*, links
    const renderText = (text: string) => {
      return text.split("\n").map((line, i) => {
        let processed: React.ReactNode = line;
        // Bold
        const boldParts = line.split(/\*\*(.*?)\*\*/g);
        if (boldParts.length > 1) {
          processed = boldParts.map((part, j) =>
            j % 2 === 1 ? <strong key={j} className="font-bold">{part}</strong> : part
          );
        }
        return <span key={i}>{processed}{i < text.split("\n").length - 1 && <br />}</span>;
      });
    };

    return (
      <div className="space-y-2">
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
          {renderText(content)}
        </p>

        {msg.image && (
          <img
            src={msg.image}
            alt=""
            className="rounded-lg max-w-sm max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
          />
        )}

        {msg.attachment && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/50 max-w-sm">
            <FileText size={20} className="text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{msg.attachment.name}</p>
              <p className="text-xs text-muted-foreground">{msg.attachment.size}</p>
            </div>
            <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8">
              <Download size={14} />
            </Button>
          </div>
        )}

        {msg.link && (
          <a
            href={msg.link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: msg.link.label.includes("Join") ? "hsl(var(--info))" : "hsl(var(--secondary))",
              color: msg.link.label.includes("Join") ? "white" : "hsl(var(--foreground))",
            }}
            onClick={e => e.stopPropagation()}
          >
            {msg.link.label.includes("Join") ? <Play size={14} /> : <Link2 size={14} />}
            {msg.link.label}
          </a>
        )}
      </div>
    );
  };

  const MessageBubble = ({ msg, isThreadReply, threadAuthorId }: { msg: BatchMessage | (ThreadReply & { reactions?: never; threadReplies?: never; image?: never; attachment?: never; link?: never; isPinned?: never; dateGroup?: never; channelId?: never }); isThreadReply?: boolean; threadAuthorId?: string }) => {
    const member = getMember(msg.authorId);
    if (!member) return null;
    const avatarSize = isThreadReply ? "h-7 w-7" : "h-9 w-9";

    return (
      <div className={`flex gap-3 group ${isThreadReply ? "ml-12 relative" : ""}`}>
        {isThreadReply && (
          <div className="absolute -left-4 top-0 bottom-0 w-px" style={{ background: "hsl(var(--border))" }} />
        )}
        <Avatar className={`${avatarSize} flex-shrink-0`}>
          <AvatarImage src={member.avatar} />
          <AvatarFallback className="text-[10px]">{member.name[0]}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          {/* Name + role + timestamp */}
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-bold text-foreground">{member.name}</span>
            <RoleBadge role={member.role} />
            <span className="text-[11px] text-muted-foreground">{msg.timestamp}</span>
            {/* Hover actions */}
            {!isThreadReply && (
              <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <button className="text-muted-foreground hover:text-foreground p-1 rounded">
                  <MoreHorizontal size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          {"channelId" in msg ? (
            <MessageContent content={msg.content} msg={msg as BatchMessage} />
          ) : (
            <p className="text-sm text-foreground/90 leading-relaxed">{msg.content}</p>
          )}

          {/* Reactions */}
          {"reactions" in msg && msg.reactions && msg.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {msg.reactions.map((r, i) => (
                <button
                  key={i}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors"
                  style={{
                    borderColor: r.reacted ? "hsl(var(--highlight))" : "hsl(var(--border))",
                    background: r.reacted ? "hsl(var(--highlight) / 0.1)" : "transparent",
                  }}
                >
                  <span>{r.emoji}</span>
                  <span className="text-muted-foreground">{r.count}</span>
                </button>
              ))}
              <button
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:border-muted-foreground transition-colors"
              >
                +
              </button>
            </div>
          )}

          {/* Reply link + thread indicator */}
          {"threadReplies" in msg && (
            <div className="flex items-center gap-3 mt-1.5">
              <button
                onClick={() => {
                  if (!isThreadReply && msg.id) {
                    setReplyingTo({ messageId: msg.id, authorName: member.name });
                  }
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Reply
              </button>
              {msg.threadReplies && msg.threadReplies.length > 0 && !isThreadReply && (
                <button
                  onClick={() => toggleThread(msg.id)}
                  className="text-xs font-medium transition-colors"
                  style={{ color: "hsl(var(--info))" }}
                >
                  {expandedThreads.has(msg.id)
                    ? "[collapse]"
                    : `[${msg.threadReplies.length} ${msg.threadReplies.length === 1 ? "reply" : "replies"}]`
                  }
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Members grouped by role ──
  const mentors = cohort.members.filter(m => m.role === "mentor");
  const tas = cohort.members.filter(m => m.role === "ta");
  const students = cohort.members.filter(m => m.role === "student");

  return (
    <div className="flex flex-col h-full">
      {/* ── Channel header ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-background shrink-0">
        <button onClick={onToggleSidebar} className="md:hidden text-foreground">
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-1.5">
          {channel.isLocked ? <Lock size={14} className="text-muted-foreground" /> : <Hash size={14} className="text-muted-foreground" />}
          <h1 className="text-sm font-bold text-foreground">{channel.name}</h1>
        </div>
        <p className="hidden sm:block flex-1 text-xs text-muted-foreground truncate ml-2">
          {channel.description}
        </p>
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setShowPins(true)}
            className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Pin size={16} />
            {pinnedMessages.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold px-1 py-0 rounded-full bg-destructive text-white min-w-[14px] text-center">
                {pinnedMessages.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowMembers(true)}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Users size={16} />
          </button>
        </div>
      </div>

      {/* ── Message feed ── */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-4 space-y-1">
          {groupedMessages.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] font-semibold text-muted-foreground px-2">{group.date}</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {group.msgs.map((msg) => (
                <div key={msg.id} className="mb-4">
                  <MessageBubble msg={msg} />

                  {/* Expanded thread */}
                  {expandedThreads.has(msg.id) && msg.threadReplies.length > 0 && (
                    <div className="mt-2 space-y-3">
                      {msg.threadReplies.map((reply) => (
                        <MessageBubble
                          key={reply.id}
                          msg={reply as any}
                          isThreadReply
                        />
                      ))}
                      {/* Thread reply input */}
                      <div className="ml-12 flex gap-2">
                        <Input
                          placeholder="Reply in thread..."
                          className="text-xs h-8"
                        />
                        <Button size="icon" className="h-8 w-8 flex-shrink-0" style={{ background: "hsl(var(--highlight))", color: "hsl(0 0% 7%)" }}>
                          <Send size={12} />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* ── Message input bar ── */}
      {isLocked && userRole === "student" ? (
        <div className="px-4 py-3 border-t border-border bg-secondary/30">
          <p className="text-sm text-muted-foreground italic text-center">
            Only mentors can post in announcements
          </p>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-border bg-background shrink-0">
          {replyingTo && (
            <div className="flex items-center justify-between mb-2 px-2">
              <span className="text-xs text-muted-foreground">
                Replying to <span className="font-semibold text-foreground">{replyingTo.authorName}</span>
              </span>
              <button onClick={() => setReplyingTo(null)} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </div>
          )}
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
              placeholder={replyingTo ? "Reply in thread..." : `Message #${channel.name}`}
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
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
      )}

      {/* ── Pinned messages panel ── */}
      <Sheet open={showPins} onOpenChange={setShowPins}>
        <SheetContent side="right" className="w-[340px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Pin size={16} /> Pinned Messages ({pinnedMessages.length})
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="mt-4 h-[calc(100vh-100px)]">
            <div className="space-y-4 pr-2">
              {pinnedMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No pinned messages in this channel</p>
              ) : (
                pinnedMessages.map(msg => {
                  const member = getMember(msg.authorId);
                  return (
                    <div key={msg.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={member?.avatar} />
                          <AvatarFallback className="text-[9px]">{member?.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-semibold text-foreground">{member?.name}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{msg.timestamp}</span>
                      </div>
                      <p className="text-xs text-foreground/80 line-clamp-4 leading-relaxed">{msg.content}</p>
                      <button
                        onClick={() => setShowPins(false)}
                        className="text-[11px] font-medium"
                        style={{ color: "hsl(var(--info))" }}
                      >
                        Jump to message
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* ── Member list panel ── */}
      <Sheet open={showMembers} onOpenChange={setShowMembers}>
        <SheetContent side="right" className="w-[300px] sm:w-[340px]">
          <SheetHeader>
            <SheetTitle>{cohort.memberCount} members</SheetTitle>
          </SheetHeader>
          <ScrollArea className="mt-4 h-[calc(100vh-100px)]">
            <div className="space-y-4 pr-2">
              {/* Mentors */}
              {mentors.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "hsl(var(--highlight))" }}>
                    Mentors — {mentors.length}
                  </p>
                  <div className="space-y-1">
                    {mentors.map(m => (
                      <MemberItem key={m.id} member={m} />
                    ))}
                  </div>
                </div>
              )}
              {/* TAs */}
              {tas.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "hsl(var(--info))" }}>
                    Teaching Assistants — {tas.length}
                  </p>
                  <div className="space-y-1">
                    {tas.map(m => (
                      <MemberItem key={m.id} member={m} />
                    ))}
                  </div>
                </div>
              )}
              {/* Students */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2 text-muted-foreground">
                  Students — {students.length}
                </p>
                <div className="space-y-1">
                  {students.map(m => (
                    <MemberItem key={m.id} member={m} />
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
};

const MemberItem = ({ member }: { member: BatchMember }) => (
  <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
    <div className="relative">
      <Avatar className="h-8 w-8">
        <AvatarImage src={member.avatar} />
        <AvatarFallback className="text-[10px]">{member.name[0]}</AvatarFallback>
      </Avatar>
      {member.isOnline && (
        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background" style={{ background: "hsl(var(--success))" }} />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
    </div>
    <Badge className="h-4 px-1.5 text-[9px] font-bold rounded-full border-0" style={{ background: "hsl(var(--highlight) / 0.15)", color: "hsl(var(--highlight))" }}>
      L{member.level}
    </Badge>
  </div>
);

export default ChannelView;
