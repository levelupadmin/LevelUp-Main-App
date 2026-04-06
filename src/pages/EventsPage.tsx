import { useEffect, useState } from "react";
import StudentLayout from "@/components/layout/StudentLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import usePageTitle from "@/hooks/usePageTitle";
import InitialsAvatar from "@/components/InitialsAvatar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Globe, MapPin, Loader2 } from "lucide-react";

const EventsPage = () => {
  usePageTitle("Events");
  const { user } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [myRegs, setMyRegs] = useState<Set<string>>(new Set());
  const [registering, setRegistering] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("is_active", true)
        .order("starts_at", { ascending: true });
      setEvents(data ?? []);
      setLoading(false);

      if (user) {
        const { data: regs } = await supabase
          .from("event_registrations")
          .select("event_id")
          .eq("user_id", user.id);
        setMyRegs(new Set((regs ?? []).map((r: any) => r.event_id)));
      }
    };
    load();
  }, [user]);

  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.starts_at) >= now && ["upcoming", "live"].includes(e.status));
  const past = events.filter((e) => new Date(e.starts_at) < now || ["completed", "cancelled"].includes(e.status));
  const displayed = tab === "upcoming" ? upcoming : past;

  const handleRegisterFree = async (eventId: string) => {
    if (!user) return;
    setRegistering(eventId);
    const { error } = await supabase.from("event_registrations").insert({
      event_id: eventId,
      user_id: user.id,
      status: "registered",
      amount_paid: 0,
    });
    if (error) {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Registered! ✓" });
      setMyRegs((prev) => new Set(prev).add(eventId));
    }
    setRegistering(null);
  };

  return (
    <StudentLayout title="Events">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground mt-1">Workshops, webinars, and live sessions</p>
        </div>

        <div className="flex gap-2">
          {(["upcoming", "past"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium capitalize border min-h-[44px] sm:min-h-0",
                tab === t ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-[300px] bg-surface border border-border rounded-xl animate-pulse" />)}
          </div>
        ) : displayed.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No {tab} events</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayed.map((ev) => {
              const isRegistered = myRegs.has(ev.id);
              const isSoldOut = ev.status === "sold_out";
              const isPast = tab === "past";
              return (
                <div key={ev.id} className={cn("bg-surface border border-border rounded-xl overflow-hidden card-hover", isPast && "opacity-60")}>
                  <div className="aspect-video bg-surface-2 relative">
                    {ev.image_url && <img src={ev.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    {isSoldOut && (
                      <div className="absolute top-2 right-2 bg-destructive text-destructive-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono">
                        Sold Out
                      </div>
                    )}
                    <div className="absolute top-2 left-2 bg-canvas/80 backdrop-blur px-2 py-1 rounded font-mono text-xs">
                      {format(new Date(ev.starts_at), "EEE, MMM d · h:mm a")}
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="text-base font-semibold line-clamp-2">{ev.title}</h3>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <InitialsAvatar name={ev.host_name} size={32} />
                        <span className="text-xs text-muted-foreground">{ev.host_name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        {ev.event_type === "online" || ev.venue_type !== "in_person" ? (
                          <><Globe className="h-3 w-3" /> Online</>
                        ) : (
                          <><MapPin className="h-3 w-3" /> {ev.city || "In-Person"}</>
                        )}
                      </span>
                    </div>
                    {!isPast && (
                      <div className="mt-3 pt-3 border-t border-border">
                        {isRegistered ? (
                          <span className="text-sm text-muted-foreground font-medium">Registered ✓</span>
                        ) : isSoldOut ? (
                          <span className="text-sm text-muted-foreground">No spots available</span>
                        ) : ev.pricing_type === "free" ? (
                          <button
                            onClick={() => handleRegisterFree(ev.id)}
                            disabled={registering === ev.id}
                            className="text-sm font-medium text-cream hover:underline flex items-center gap-1"
                          >
                            {registering === ev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            Register Free
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRegisterFree(ev.id)}
                            disabled={registering === ev.id}
                            className="text-sm font-medium text-cream hover:underline flex items-center gap-1"
                          >
                            {registering === ev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            Register {ev.price_inr ? `· ₹${(ev.price_inr / 100).toLocaleString()}` : ""}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default EventsPage;
