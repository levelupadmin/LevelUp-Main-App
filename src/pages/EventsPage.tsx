import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StudentLayout from "@/components/layout/StudentLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import usePageTitle from "@/hooks/usePageTitle";
import InitialsAvatar from "@/components/InitialsAvatar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Globe, MapPin, Loader2, Calendar } from "lucide-react";

interface Speaker {
  event_id: string;
  name: string;
  title: string | null;
  avatar_url: string | null;
}

const EventsPage = () => {
  usePageTitle("Events");
  const { user, profile, session } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past" | "my">("upcoming");
  const [myRegs, setMyRegs] = useState<Set<string>>(new Set());
  const [registering, setRegistering] = useState<string | null>(null);
  const [speakerMap, setSpeakerMap] = useState<Record<string, Speaker[]>>({});

  // Load Razorpay script
  useEffect(() => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) return;
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const fetchEvents = async () => {
    const { data } = await supabase
      .from("events_safe")
      .select("*")
      .eq("is_active", true)
      .order("starts_at", { ascending: true });
    setEvents(data ?? []);
    setLoading(false);

    // Load speakers
    const eventIds = (data ?? []).map((e: any) => e.id);
    if (eventIds.length) {
      const { data: allSpeakers } = await supabase
        .from("event_speakers")
        .select("event_id, name, title, avatar_url")
        .in("event_id", eventIds)
        .order("sort_order");
      const map: Record<string, Speaker[]> = {};
      (allSpeakers ?? []).forEach((s: any) => {
        if (!map[s.event_id]) map[s.event_id] = [];
        map[s.event_id].push(s);
      });
      setSpeakerMap(map);
    }

    if (user) {
      const { data: regs } = await supabase
        .from("event_registrations")
        .select("event_id")
        .eq("user_id", user.id);
      setMyRegs(new Set((regs ?? []).map((r: any) => r.event_id)));
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [user]);

  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.starts_at) >= now && ["upcoming", "live"].includes(e.status));
  const past = events.filter((e) => new Date(e.starts_at) < now || ["completed", "cancelled"].includes(e.status));
  const myEvents = events.filter((e) => myRegs.has(e.id));
  const displayed = tab === "upcoming" ? upcoming : tab === "past" ? past : myEvents;

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

  const handleRegisterPaid = async (eventId: string) => {
    if (!session?.access_token) return;
    setRegistering(eventId);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-for-event`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ event_id: eventId }),
        }
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const data = await res.json();

      if (data.registered) {
        toast({ title: "Registered! ✓", description: "You're in — see you there." });
        setMyRegs((prev) => new Set(prev).add(eventId));
        fetchEvents();
      } else if (data.razorpay_order_id) {
        const options = {
          key: data.key_id,
          amount: data.amount,
          currency: "INR",
          name: "LevelUp Learning",
          description: "Event Registration",
          order_id: data.razorpay_order_id,
          handler: async (response: any) => {
            // Verify payment
            try {
              const verifyRes = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-event-payment`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    event_id: eventId,
                  }),
                }
              );
              if (!verifyRes.ok) {
                throw new Error("Payment verification failed");
              }
              const verifyData = await verifyRes.json();
              if (verifyData.registered) {
                toast({ title: "Payment successful!", description: "You're registered for the event." });
                setMyRegs((prev) => new Set(prev).add(eventId));
                fetchEvents();
              } else {
                toast({ title: "Verification failed", description: verifyData.error || "Contact support.", variant: "destructive" });
              }
            } catch {
              toast({ title: "Verification failed", description: "Contact support if you were charged.", variant: "destructive" });
            }
          },
          prefill: {
            email: profile?.email || "",
            name: profile?.full_name || "",
          },
          theme: { color: "#F5F1E8" },
        };
        if (!(window as any).Razorpay) {
          toast({ title: "Payment unavailable", description: "Payment system is loading. Please try again in a moment.", variant: "destructive" });
          return;
        }
        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", () => {
          toast({ title: "Payment failed", description: "Please try again.", variant: "destructive" });
        });
        rzp.open();
      } else if (data.error) {
        toast({ title: "Registration failed", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setRegistering(null);
    }
  };

  const getSpeaker = (ev: any) => {
    const spks = speakerMap[ev.id];
    if (spks && spks.length > 0) return { ...spks[0], count: spks.length };
    return { name: ev.host_name, title: ev.host_title, avatar_url: ev.host_avatar_url, count: 1 };
  };

  return (
    <StudentLayout title="Events">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground mt-1">Workshops, webinars, and live sessions</p>
        </div>

        <div className="flex gap-2">
          {(["upcoming", "past", "my"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium capitalize border min-h-[44px] sm:min-h-0",
                tab === t ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground"
              )}
            >
              {t === "my" ? "My Events" : t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-[300px] bg-surface border border-border rounded-xl animate-pulse" />)}
          </div>
        ) : displayed.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">
            {tab === "my" ? "You haven't registered for any events yet" : `No ${tab} events`}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayed.map((ev) => {
              const isRegistered = myRegs.has(ev.id);
              const isSoldOut = ev.status === "sold_out";
              const isCancelled = ev.status === "cancelled";
              const isPast = tab === "past";
              const speaker = getSpeaker(ev);
              return (
                <Link
                  key={ev.id}
                  to={`/events/${ev.id}`}
                  className={cn("bg-surface border border-border rounded-xl overflow-hidden card-hover flex flex-col", isPast && "opacity-60")}
                >
                  <div className="relative aspect-[4/3]">
                    {ev.image_url && <img src={ev.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                    {isSoldOut && (
                      <div className="absolute top-3 right-3 bg-destructive/90 text-destructive-foreground text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded font-mono">
                        Sold Out
                      </div>
                    )}
                    {isCancelled && (
                      <div className="absolute top-3 right-3 bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded font-mono">
                        Cancelled
                      </div>
                    )}
                    {isRegistered && tab === "my" && (
                      <div className="absolute top-3 left-3 bg-green-500/20 text-green-400 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded font-mono">
                        Registered ✓
                      </div>
                    )}
                    <div className="absolute bottom-4 left-4 right-4">
                      <h3 className="text-base font-semibold text-white line-clamp-2 leading-snug">{ev.title}</h3>
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {speaker.avatar_url ? (
                        <img src={speaker.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-border" />
                      ) : (
                        <InitialsAvatar name={speaker.name} size={32} />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {speaker.name}
                          {speaker.count > 1 && <span className="text-muted-foreground"> +{speaker.count - 1}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-3">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {format(new Date(ev.starts_at), "EEE, MMM d")}
                      </span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        {ev.event_type === "online" || ev.venue_type !== "in_person" ? (
                          <><Globe className="h-3 w-3" /> Online</>
                        ) : (
                          <><MapPin className="h-3 w-3" /> {ev.city || "In-Person"}</>
                        )}
                      </span>
                    </div>
                  </div>
                  {!isPast && !isCancelled && (
                    <div className="px-4 pb-4 pt-0">
                      <div className="pt-3 border-t border-border">
                        {isRegistered ? (
                          <span className="text-sm text-muted-foreground font-medium">Registered ✓</span>
                        ) : isSoldOut ? (
                          <span className="text-sm text-muted-foreground">No spots available</span>
                        ) : ev.pricing_type === "free" ? (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRegisterFree(ev.id); }}
                            disabled={registering === ev.id}
                            className="text-sm font-medium text-cream hover:underline flex items-center gap-1 min-h-[44px]"
                          >
                            {registering === ev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            Register Free
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRegisterPaid(ev.id); }}
                            disabled={registering === ev.id}
                            className="text-sm font-medium text-cream hover:underline flex items-center gap-1 min-h-[44px]"
                          >
                            {registering === ev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            Register · ₹{ev.price_inr ? (ev.price_inr / 100).toLocaleString() : ""}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default EventsPage;
