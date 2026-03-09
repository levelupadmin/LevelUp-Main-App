import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import { mockWorkshops } from "@/data/learnMockData";
import { Calendar, User, Users, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const Workshops = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const filtered = mockWorkshops.filter((w) => (tab === "upcoming" ? w.isUpcoming : !w.isUpcoming));

  return (
    <AppShell>
      <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Workshops</h1>
        <div className="flex gap-2">
          {(["upcoming", "past"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors border ${tab === t ? "bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] border-[hsl(var(--highlight))]" : "bg-secondary text-muted-foreground border-border hover:text-foreground"}`}>
              {t === "upcoming" ? "Upcoming" : "Past"}
            </button>
          ))}
        </div>
        <div className="space-y-4">
          {filtered.map((w) => (
            <button key={w.id} onClick={() => navigate(`/workshops/${w.slug}`)} className="w-full rounded-xl border border-border bg-card p-5 text-left hover:border-[hsl(var(--highlight))/30] transition-all">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="w-full sm:w-40 aspect-video rounded-lg bg-secondary shrink-0" />
                <div className="flex-1 space-y-2">
                  <Badge variant="outline" className="bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20 text-xs gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(w.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {w.time}
                  </Badge>
                  <h3 className="text-base font-semibold text-foreground">{w.title}</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-accent flex items-center justify-center"><User className="h-3 w-3 text-muted-foreground" /></div>
                    <span className="text-xs text-muted-foreground">{w.instructor.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{w.duration}</span>
                    {w.isUpcoming && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{w.registered}/{w.capacity} seats</span>}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-bold text-foreground">₹{w.price}</span>
                    {w.isUpcoming ? (
                      <Badge className={w.isRegistered ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))]"}>
                        {w.isRegistered ? "Registered" : "Register"}
                      </Badge>
                    ) : w.resourcesEnabled ? (
                      <Badge variant="outline" className="bg-secondary">View Resources</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No workshops found.</p>}
        </div>
      </div>
    </AppShell>
  );
};

export default Workshops;
