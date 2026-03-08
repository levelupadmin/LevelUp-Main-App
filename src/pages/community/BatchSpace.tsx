import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Users, Menu, X, Hash, Lock, ChevronDown, ChevronRight,
  Pin, Paperclip, Send, ThumbsUp, Heart, Flame, FileText,
  ExternalLink, MessageCircle, Image as ImageIcon, Link2
} from "lucide-react";
import {
  getBatchById, getMemberById, getChannelMessages,
  getChannelCategories, getChannelsByCategory,
  type BatchCohort, type BatchChannel, type BatchMessage, type BatchMember, type MemberRole
} from "@/data/batchData";

const BatchSpace = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const cohort = getBatchById(id || "");
  const defaultChannel = cohort?.channels.find(c => c.name === "general-chat")?.id || cohort?.channels[0]?.id || "";
  const [activeChannelId, setActiveChannelId] = useState<string>(defaultChannel);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memberListOpen, setMemberListOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);

  if (!cohort) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Batch not found</p>
          <button onClick={() => navigate("/community")} className="mt-3 text-sm font-semibold text-foreground hover:underline">← Back to Community</button>
        </div>
      </div>
    );
  }

  const activeChannel = cohort.channels.find((c) => c.id === activeChannelId)!;
  const channelMessages = getChannelMessages(cohort, activeChannelId);
  const pinnedMessages = channelMessages.filter((m) => m.isPinned);
  const currentUserRole: MemberRole = "student"; // mock

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-[hsl(240_30%_11%)] shadow-elevated overflow-y-auto">
            <SidebarContent cohort={cohort} activeChannelId={activeChannelId} onSelectChannel={(id) => { setActiveChannelId(id); setSidebarOpen(false); }} onBack={() => navigate("/community")} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-[hsl(240_30%_11%)] overflow-y-auto">
        <SidebarContent cohort={cohort} activeChannelId={activeChannelId} onSelectChannel={setActiveChannelId} onBack={() => navigate("/community")} />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <button onClick={() => navigate("/community")} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hidden lg:block">
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground truncate">{activeChannel.name}</h1>
              <p className="text-[11px] text-muted-foreground truncate hidden sm:block">{activeChannel.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {pinnedMessages.length > 0 && (
              <button onClick={() => setPinnedOpen(!pinnedOpen)} className="relative rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
                <Pin className="h-4 w-4" />
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[hsl(var(--highlight))] px-1 text-[8px] font-bold text-[hsl(var(--highlight-foreground))]">
                  {pinnedMessages.length}
                </span>
              </button>
            )}
            <button onClick={() => setMemberListOpen(!memberListOpen)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
              <Users className="h-4 w-4" />
              <span className="sr-only">Members</span>
            </button>
          </div>
        </header>

        {/* Content area with optional panels */}
        <div className="flex flex-1 overflow-hidden">
          {/* Chat area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Pinned messages panel */}
            {pinnedOpen && (
              <PinnedPanel messages={pinnedMessages} cohort={cohort} onClose={() => setPinnedOpen(false)} />
            )}

            {/* Messages feed */}
            <MessageFeed messages={channelMessages} cohort={cohort} />

            {/* Input bar */}
            <MessageInput channel={activeChannel} userRole={currentUserRole} />
          </div>

          {/* Member list panel (desktop slide-in) */}
          {memberListOpen && (
            <MemberListPanel cohort={cohort} onClose={() => setMemberListOpen(false)} navigate={navigate} />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Sidebar Content ──

function SidebarContent({ cohort, activeChannelId, onSelectChannel, onBack }: {
  cohort: BatchCohort;
  activeChannelId: string;
  onSelectChannel: (id: string) => void;
  onBack: () => void;
}) {
  const categories = getChannelCategories(cohort);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (cat: string) => setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <h2 className="text-sm font-bold text-white leading-tight">{cohort.name}</h2>
        <p className="text-[11px] text-white/40 mt-0.5">Batch {cohort.batchNumber} · {cohort.memberCount} members</p>
      </div>

      {/* Channels */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {categories.map((cat) => {
          const channels = getChannelsByCategory(cohort, cat);
          const isCollapsed = collapsed[cat] || false;
          return (
            <div key={cat}>
              <button
                onClick={() => toggle(cat)}
                className="flex w-full items-center gap-1 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 hover:text-white/60"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                {cat}
              </button>
              {!isCollapsed && (
                <div className="space-y-px mt-0.5">
                  {channels.map((ch) => {
                    const active = ch.id === activeChannelId;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => onSelectChannel(ch.id)}
                        className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors relative ${
                          active
                            ? "bg-white/10 text-white font-semibold"
                            : ch.isUnread
                            ? "text-white font-semibold hover:bg-white/5"
                            : "text-white/40 hover:text-white/70 hover:bg-white/5"
                        }`}
                      >
                        {active && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-[hsl(var(--highlight))]" />
                        )}
                        {ch.isLocked ? <Lock className="h-3.5 w-3.5 shrink-0" /> : <Hash className="h-3.5 w-3.5 shrink-0" />}
                        <span className="truncate flex-1 text-left">{ch.name}</span>
                        {ch.isUnread && !active && (
                          <span className="h-2 w-2 rounded-full bg-[hsl(var(--info))] shrink-0" />
                        )}
                        {ch.unreadCount > 0 && (
                          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white/15 px-1 text-[9px] font-bold text-white">
                            {ch.unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

// ── Message Feed ──

function MessageFeed({ messages, cohort }: { messages: BatchMessage[]; cohort: BatchCohort }) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Hash className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">Be the first to start the conversation!</p>
          </div>
        </div>
      ) : (
        messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} cohort={cohort} />
        ))
      )}
    </div>
  );
}

// ── Message Item ──

function MessageItem({ message, cohort }: { message: BatchMessage; cohort: BatchCohort }) {
  const author = getMemberById(cohort, message.authorId);
  const [showThread, setShowThread] = useState(false);

  if (!author) return null;

  return (
    <div className={`group rounded-lg p-3 transition-colors hover:bg-accent/50 ${message.isPinned ? "bg-[hsl(var(--highlight))]/5 border border-[hsl(var(--highlight))]/15" : ""}`}>
      {message.isPinned && (
        <div className="flex items-center gap-1 text-[10px] font-semibold text-[hsl(var(--highlight))] mb-1.5 pl-11">
          <Pin className="h-3 w-3" /> Pinned
        </div>
      )}
      <div className="flex gap-3">
        <img src={author.avatar} alt={author.name} className="h-9 w-9 rounded-full object-cover mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-foreground">{author.name}</span>
            <RoleBadge role={author.role} />
            <span className="text-[10px] text-muted-foreground">{message.timestamp}</span>
          </div>
          <div className="mt-1 text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap">{message.content}</div>

          {/* Image */}
          {message.image && (
            <div className="mt-2 max-w-sm">
              <img src={message.image} alt="Attachment" className="rounded-lg w-full object-cover max-h-60" />
            </div>
          )}

          {/* Attachment */}
          {message.attachment && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-accent/50 px-3 py-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs font-semibold text-foreground">{message.attachment.name}</p>
                <p className="text-[10px] text-muted-foreground">{message.attachment.size}</p>
              </div>
            </div>
          )}

          {/* Link button */}
          {message.link && (
            <div className="mt-2">
              <a
                href={message.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--highlight))] px-4 py-2 text-xs font-bold text-[hsl(var(--highlight-foreground))] hover:opacity-90 transition-opacity"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {message.link.label}
              </a>
            </div>
          )}

          {/* Reactions */}
          {message.reactions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.reactions.map((r, i) => (
                <button
                  key={i}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    r.reacted
                      ? "border-[hsl(var(--highlight))]/30 bg-[hsl(var(--highlight))]/10 text-foreground"
                      : "border-border bg-accent/30 text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="font-medium">{r.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Thread */}
          {message.threadReplies.length > 0 && (
            <button
              onClick={() => setShowThread(!showThread)}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--info))] hover:underline"
            >
              <MessageCircle className="h-3 w-3" />
              {message.threadReplies.length} {message.threadReplies.length === 1 ? "reply" : "replies"}
              <ChevronDown className={`h-3 w-3 transition-transform ${showThread ? "rotate-180" : ""}`} />
            </button>
          )}

          {showThread && (
            <div className="mt-2 ml-2 border-l-2 border-border pl-3 space-y-2">
              {message.threadReplies.map((reply) => {
                const replyAuthor = getMemberById(cohort, reply.authorId);
                if (!replyAuthor) return null;
                return (
                  <div key={reply.id} className="flex gap-2">
                    <img src={replyAuthor.avatar} alt={replyAuthor.name} className="h-6 w-6 rounded-full object-cover mt-0.5 shrink-0" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground">{replyAuthor.name}</span>
                        <RoleBadge role={replyAuthor.role} small />
                        <span className="text-[9px] text-muted-foreground">{reply.timestamp}</span>
                      </div>
                      <p className="text-xs text-secondary-foreground mt-0.5">{reply.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Role Badge ──

function RoleBadge({ role, small }: { role: MemberRole; small?: boolean }) {
  if (role === "student") return null;
  const base = small ? "text-[8px] px-1 py-px" : "text-[10px] px-1.5 py-0.5";
  if (role === "mentor") {
    return <span className={`rounded-md ${base} font-bold bg-[hsl(var(--highlight))]/20 text-[hsl(var(--highlight))]`}>Mentor</span>;
  }
  return <span className={`rounded-md ${base} font-bold bg-[hsl(var(--info))]/20 text-[hsl(var(--info))]`}>TA</span>;
}

// ── Message Input ──

function MessageInput({ channel, userRole }: { channel: BatchChannel; userRole: MemberRole }) {
  if (channel.isLocked && userRole === "student") {
    return (
      <div className="border-t border-border px-4 py-3 shrink-0">
        <div className="flex items-center justify-center gap-2 rounded-xl bg-accent/50 px-4 py-3">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Only mentors can post in #{channel.name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border px-4 py-3 shrink-0">
      <div className="flex items-center gap-2 rounded-xl bg-card border border-border px-4 py-2.5">
        <button className="rounded-lg p-1 text-muted-foreground hover:text-foreground">
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          type="text"
          placeholder={`Message #${channel.name}`}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          readOnly
        />
        <button className="rounded-lg bg-[hsl(var(--highlight))] p-1.5 text-[hsl(var(--highlight-foreground))] hover:opacity-90 transition-opacity">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Pinned Messages Panel ──

function PinnedPanel({ messages, cohort, onClose }: { messages: BatchMessage[]; cohort: BatchCohort; onClose: () => void }) {
  return (
    <div className="border-b border-border bg-card px-4 py-3 max-h-60 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Pin className="h-3 w-3 text-[hsl(var(--highlight))]" /> Pinned Messages ({messages.length})
        </h3>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        {messages.map((msg) => {
          const author = getMemberById(cohort, msg.authorId);
          return (
            <div key={msg.id} className="rounded-lg border border-[hsl(var(--highlight))]/15 bg-accent/30 p-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-foreground">{author?.name}</span>
                {author && <RoleBadge role={author.role} small />}
                <span className="text-[9px] text-muted-foreground">{msg.timestamp}</span>
              </div>
              <p className="text-xs text-secondary-foreground line-clamp-2">{msg.content}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Member List Panel ──

function MemberListPanel({ cohort, onClose, navigate }: { cohort: BatchCohort; onClose: () => void; navigate: ReturnType<typeof useNavigate> }) {
  const grouped = useMemo(() => {
    const mentors = cohort.members.filter((m) => m.role === "mentor");
    const tas = cohort.members.filter((m) => m.role === "ta");
    const students = cohort.members.filter((m) => m.role === "student");
    return { mentors, tas, students };
  }, [cohort.members]);

  return (
    <aside className="w-60 shrink-0 border-l border-border bg-card overflow-y-auto hidden sm:block">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-foreground">{cohort.memberCount} Members</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <MemberGroup label="Mentors" members={grouped.mentors} color="highlight" navigate={navigate} />
        <MemberGroup label="Teaching Assistants" members={grouped.tas} color="info" navigate={navigate} />
        <MemberGroup label="Students" members={grouped.students} navigate={navigate} />
      </div>
    </aside>
  );
}

function MemberGroup({ label, members, color, navigate }: {
  label: string;
  members: BatchMember[];
  color?: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (members.length === 0) return null;

  return (
    <div className="mb-4">
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${
        color === "highlight" ? "text-[hsl(var(--highlight))]" : color === "info" ? "text-[hsl(var(--info))]" : "text-muted-foreground"
      }`}>
        {label} — {members.length}
      </p>
      <div className="space-y-1">
        {members.map((member) => (
          <button
            key={member.id}
            onClick={() => navigate(`/profile/${member.id}`)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent transition-colors"
          >
            <div className="relative">
              <img src={member.avatar} alt={member.name} className="h-7 w-7 rounded-full object-cover" />
              {member.isOnline && (
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-[hsl(var(--success))]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{member.name}</p>
              <p className="text-[9px] text-muted-foreground">Lvl {member.level}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default BatchSpace;
