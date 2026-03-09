import AppShell from "@/components/layout/AppShell";
import { workshopsList } from "@/data/learningData";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Clock, Play } from "lucide-react";

type FilterTab = "upcoming" | "past";

const Workshops = () => {
  const [filter, setFilter] = useState<FilterTab>("upcoming");
  const navigate = useNavigate();

  const upcoming = workshopsList.filter((w) => !w.isPast);
  const past = workshopsList.filter((w) => w.isPast);
  const workshops = filter === "upcoming" ? upcoming : past;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-4 py-6 lg:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workshops</h1>
          <p className="text-sm text-muted-foreground">Live and recorded sessions by India's top creators</p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit">
          {(["upcoming", "past"] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
                filter === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab} ({tab === "upcoming" ? upcoming.length : past.length})
            </button>
          ))}
        </div>

        {/* Workshop cards */}
        <div className="space-y-4">
          {workshops.map((w) => (
            <button
              key={w.id}
              onClick={() => navigate(`/workshops/${w.id}`)}
              className="flex w-full flex-col sm:flex-row gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/30"
            >
              {/* Thumbnail */}
              <div className="relative h-36 w-full sm:h-28 sm:w-44 shrink-0 overflow-hidden rounded-lg">
                <img src={w.thumbnail} alt={w.title} className="h-full w-full object-cover" />
                {w.isPast && w.hasReplay && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Play className="h-8 w-8 text-white" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <Badge variant="secondary" className="text-[10px] mb-2">{w.date} · {w.time}</Badge>
                  <h3 className="text-base font-bold text-foreground line-clamp-2 leading-tight">{w.title}</h3>
                  <div className="mt-1.5 flex items-center gap-2">
                    <img src={w.instructorImage} alt={w.instructor} className="h-5 w-5 rounded-full object-cover" />
                    <span className="text-xs text-muted-foreground">{w.instructor}</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-foreground">₹{w.price}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> {w.duration}
                    </span>
                    {!w.isPast && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" /> {w.seatsRemaining}/{w.seatsTotal} seats left
                      </span>
                    )}
                  </div>
                  {w.isPast && w.hasReplay ? (
                    <Badge className="bg-accent text-accent-foreground text-[10px]">Watch Replay</Badge>
                  ) : w.seatsRemaining <= 0 && !w.isPast ? (
                    <Badge variant="destructive" className="text-[10px]">Sold Out</Badge>
                  ) : (
                    <Badge className="bg-[hsl(var(--highlight))] text-background text-[10px] font-bold">Register</Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {workshops.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">No {filter} workshops right now</p>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default Workshops;
