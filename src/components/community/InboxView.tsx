import { Menu, Mail } from "lucide-react";

interface Props {
  onToggleSidebar: () => void;
}

const InboxView = ({ onToggleSidebar }: Props) => {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
        <button onClick={onToggleSidebar} className="md:hidden text-foreground">
          <Menu size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground flex-1">Inbox</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "hsl(var(--highlight) / 0.15)" }}
        >
          <Mail size={28} style={{ color: "hsl(var(--highlight))" }} />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-1">No messages yet</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          When someone replies to your posts or mentions you, you'll see it here.
        </p>
      </div>
    </div>
  );
};

export default InboxView;
