import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import InitialsAvatar from "@/components/InitialsAvatar";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Globe, MapPin, Loader2, Clock } from "lucide-react";
import { eventDateTimeLabel, eventDurationLabel } from "@/lib/event-format";
import { useToast } from "@/hooks/use-toast";
import { isNative } from "@/lib/platform";

// ── Upcoming Events (from events table) ──
const UpcomingEvents = () => {
  const { user, session, profile } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<any[]>([]);
  const [myRegs, setMyRegs] = useState<Set<string>>(new Set());
  const [registering, setRegistering] = useState<string | null>(null);
  const [speakerMap, setSpeakerMap] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from("events_safe")
          .select("*")
          .eq("is_active", true)
          .in("status", ["upcoming", "live"])
          .gte("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: true })
          .limit(4);
        setEvents(data ?? []);

        // Load speakers
        const eventIds = (data ?? []).map((e: any) => e.id);
        if (eventIds.length) {
          const { data: allSpeakers } = await supabase
            .from("event_speakers")
            .select("event_id, name, title, avatar_url")
            .in("event_id", eventIds)
            .order("sort_order");
          const map: Record<string, any[]> = {};
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
      } catch (err) {
        if (import.meta.env.DEV) console.error("Failed to load events:", err);
      }
    };
    load();
  }, [user]);

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

  // Load Razorpay script
  useEffect(() => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) return;
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

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
      } else if (data.razorpay_order_id) {
        const options = {
          key: data.key_id,
          amount: data.amount,
          currency: "INR",
          name: "LevelUp Learning",
          description: "Event Registration",
          order_id: data.razorpay_order_id,
          handler: async (response: any) => {
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

  if (!events.length) {
    return (
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Upcoming Events</h2>
          <Link to="/events" className="text-sm text-cream flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
        </div>
        <p className="text-sm text-muted-foreground">No events on the horizon yet.</p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold">Upcoming events</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Get facetime with some of the brightest minds in film, design, and creative tech.</p>
        </div>
        <Link to="/events" className="text-sm text-cream flex items-center gap-1 flex-shrink-0">View all events <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <div className="flex gap-4 overflow-x-auto snap-x hide-scrollbar pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {events.map((ev) => {
          const isRegistered = myRegs.has(ev.id);
          const isSoldOut = ev.status === "sold_out";
          const speaker = getSpeaker(ev);
          return (
            <Link
              key={ev.id}
              to={`/events/${ev.id}`}
              className="min-w-[75vw] sm:min-w-[300px] max-w-[340px] lg:max-w-none bg-surface border border-border rounded-2xl overflow-hidden card-hover flex-shrink-0 snap-start flex flex-col"
            >
              {/* Banner with overlay title */}
              <div className="relative aspect-[4/3]">
                {ev.image_url && <img src={ev.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                {isSoldOut && (
                  <div className="absolute top-3 right-3 bg-destructive/90 text-destructive-foreground text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded font-mono">
                    Sold Out
                  </div>
                )}
                <div className="absolute bottom-4 left-4 right-4">
                  <h3 className="text-base font-semibold text-white line-clamp-2 leading-snug">{ev.title}</h3>
                </div>
              </div>
              {/* Host + meta row */}
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
                    {speaker.title && <p className="text-[11px] text-muted-foreground truncate">{speaker.title}</p>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-3">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {eventDateTimeLabel(ev.starts_at)}
                  </span>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    {ev.event_type === "online" || ev.venue_type !== "in_person" ? (
                      <><Globe className="h-3 w-3" /> Online</>
                    ) : (
                      <><MapPin className="h-3 w-3" /> {ev.city || "In-Person"}</>
                    )}
                  </span>
                  {eventDurationLabel(ev.duration_minutes) && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {eventDurationLabel(ev.duration_minutes)}
                    </span>
                  )}
                </div>
              </div>
              {/* CTA row */}
              {!isSoldOut && (
                <div className="px-4 pb-4 pt-0">
                  <div className="pt-3 border-t border-border">
                    {isRegistered ? (
                      <span className="text-sm text-muted-foreground font-medium">Registered ✓</span>
                    ) : ev.pricing_type === "free" ? (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRegisterFree(ev.id); }}
                        disabled={registering === ev.id}
                        className="text-sm font-medium text-cream hover:underline flex items-center gap-1 min-h-[44px]"
                      >
                        {registering === ev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        Register Free
                      </button>
                    ) : isNative() ? (
                      // Path B / Reader Rule: no in-app price or pay
                      // affordances. Card is still tappable into the
                      // event detail (which itself swaps to a
                      // Continue-on-web CTA on Android).
                      <span className="text-sm text-muted-foreground font-medium">View details</span>
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
    </section>
  );
};

export default UpcomingEvents;
