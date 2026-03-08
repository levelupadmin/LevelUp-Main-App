import { useNavigate } from "react-router-dom";
import { ArrowRight, MessageSquare } from "lucide-react";
import { sidebarBatches } from "@/data/feedData";

const MyBatchCard = () => {
  const navigate = useNavigate();
  const activeBatches = sidebarBatches.filter(b => b.unreadCount > 0);

  if (activeBatches.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-foreground">My Batches</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {activeBatches.map((batch) => (
          <div
            key={batch.id}
            className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-muted-foreground/20 cursor-pointer"
            onClick={() => navigate("/community")}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{batch.name}</p>
              <p className="text-xs text-muted-foreground">
                {batch.unreadCount} new messages
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        ))}
      </div>
    </section>
  );
};

export default MyBatchCard;
