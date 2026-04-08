import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import StudentLayout from "@/components/layout/StudentLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import usePageTitle from "@/hooks/usePageTitle";
import InitialsAvatar from "@/components/InitialsAvatar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ArrowLeft, Calendar, Clock, Globe, MapPin, Loader2, Users } from "lucide-react";

interface Speaker {
  id: string;
  name: string;
  title: string | null;
  avatar_url: string | null;
  sort_order: number;
}

const EventDetail = () => {
  const { eventId } = useParams();
  const { user, session, profile } = useAuth();
  const { toast } = useToast();
  const [event, setEvent] = useState<any>(null);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);
  const [regCount, setRegCount] = useState(0);
  const [registering, setRegistering] = useState(false);

  usePageTitle(event?.title ?? "Event");

  // Load Razorpay script
  useEffect(() => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) return;
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!eventId) return;
    const load = async () => {
      const [{ data: ev }, { data: spks }, { count }] = await Promise.all([
        supabase.from("events_safe").select("*").eq("id", eventId).single(),
        supabase.from("event_speakers").select("*").eq("event_id", eventId).order("sort_order"),
        supabase.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "registered"),
      ]);

      setEvent(ev);
      setSpeakers(spks ?? []);
      setRegCount(count ?? 0);

      if (user) {
        const { data: myReg } = await supabase
          .from("event_registrations")
          .select("id")
          .eq("event_id", eventId)
          .eq("user_id", user.id)
          .maybeSingle();
        setIsRegistered(!!myReg);
      }
      setLoading(false);
    };
    load();
  }, [eventId, user]);

  const handleRegisterFree = async () => {
    if (!user || !eventId) return;
    setRegistering(true);
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
      setIsRegistered(true);
      setRegCount((c) => c + 1);
    }
    setRegistering(false);
  };

  const handleRegisterPaid = async () => {
    if (!session?.access_token || !event) return;
    setRegistering(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-for-event`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ event_id: event.id }),
        }
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const data = await res.json();

      if (data.registered) {
        toast({ title: "Registered! ✓", description: "You're in — see you there." });
        setIsRegistered(true);
        setRegCount((c) => c + 1);
        return;
      }

      if (data.razorpay_order_id) {
        const options = {
          key: data.key_id,
          amount: data.amount,
          currency: "INR",
          name: "LevelUp Learning",
          description: `Event: ${event.title}`,
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
                    event_id: event.id,
                  }),
                }
              );
              if (!verifyRes.ok) {
                throw new Error("Payment verification failed");
              }
              const verifyData = await verifyRes.json();
              if (verifyData.registered) {
                toast({ title: "Payment successful!", description: "You're registered for the event." });
                setIsRegistered(true);
                setRegCount((c) => c + 1);
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
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong.", variant: "destructive" });
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <StudentLayout title="Event">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </StudentLayout>
    );
  }

  if (!event) {
    return (
      <StudentLayout title="Event">
        <div className="text-center py-20">
          <p className="text-muted-foreground">Event not found</p>
          <Link to="/events" className="text-sm text-cream mt-2 inline-block">← Back to events</Link>
        </div>
      </StudentLayout>
    );
  }

  const isSoldOut = event.status === "sold_out";
  const isCancelled = event.status === "cancelled";
  const isPast = new Date(event.starts_at) < new Date() && ["completed", "cancelled"].includes(event.status);
  const spotsLeft = event.max_capacity ? event.max_capacity - regCount : null;

  // Use speakers or fall back to flat host fields
  const displaySpeakers = speakers.length > 0
    ? speakers
    : event.host_name
      ? [{ id: "host", name: event.host_name, title: event.host_title, avatar_url: event.host_avatar_url, sort_order: 0 }]
      : [];

  const priceDisplay = event.pricing_type === "free"
    ? "Free"
    : event.price_inr
      ? `₹${(event.price_inr / 100).toLocaleString()}`
      : "Free";

  return (
    <StudentLayout title="">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link to="/events" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" /> Events
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">
        {/* Left Column — sticky */}
        <div className="lg:sticky lg:top-6 lg:self-start space-y-6">
          {/* Banner */}
          {event.image_url && (
            <div className="aspect-[4/3] rounded-xl overflow-hidden bg-surface-2">
              <img src={event.image_url} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Speakers */}
          {displaySpeakers.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
                Hosted by
              </p>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {displaySpeakers.slice(0, 3).map((s) =>
                    s.avatar_url ? (
                      <img
                        key={s.id}
                        src={s.avatar_url}
                        alt={s.name}
                        className="w-9 h-9 rounded-full object-cover border-2 border-background"
                      />
                    ) : (
                      <div key={s.id} className="border-2 border-background rounded-full">
                        <InitialsAvatar name={s.name} size={32} />
                      </div>
                    )
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {displaySpeakers[0].name}
                    {displaySpeakers.length > 1 && (
                      <span className="text-muted-foreground"> & {displaySpeakers.length - 1} other{displaySpeakers.length > 2 ? "s" : ""}</span>
                    )}
                  </p>
                  {displaySpeakers[0].title && (
                    <p className="text-xs text-muted-foreground truncate">{displaySpeakers[0].title}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Price + CTA */}
          <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Price</p>
              <p className="text-2xl font-semibold">{priceDisplay}</p>
            </div>

            {spotsLeft !== null && spotsLeft > 0 && !isRegistered && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left
              </p>
            )}

            {isRegistered ? (
              <div className="w-full py-3 rounded-lg bg-green-500/20 text-green-400 text-center font-mono text-sm uppercase tracking-widest font-bold">
                Registered ✓
              </div>
            ) : isSoldOut ? (
              <div className="w-full py-3 rounded-lg bg-destructive/20 text-destructive text-center font-mono text-sm uppercase tracking-widest font-bold">
                Sold Out
              </div>
            ) : isCancelled ? (
              <div className="w-full py-3 rounded-lg bg-muted text-muted-foreground text-center font-mono text-sm uppercase tracking-widest font-bold">
                Cancelled
              </div>
            ) : isPast ? (
              <div className="w-full py-3 rounded-lg bg-muted text-muted-foreground text-center font-mono text-sm uppercase tracking-widest font-bold">
                Event Ended
              </div>
            ) : (
              <button
                onClick={event.pricing_type === "free" ? handleRegisterFree : handleRegisterPaid}
                disabled={registering}
                className="w-full py-3 rounded-lg bg-cream text-cream-text font-mono text-sm uppercase tracking-widest font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]"
              >
                {registering && <Loader2 className="h-4 w-4 animate-spin" />}
                Register →
              </button>
            )}
          </div>
        </div>

        {/* Right Column — scrollable */}
        <div className="space-y-8">
          {/* Title */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold leading-tight">{event.title}</h1>

            {/* Meta badges */}
            <div className="flex flex-wrap gap-2 mt-4">
              <div className="bg-surface border border-border rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {format(new Date(event.starts_at), "EEE, MMM d, yyyy")}
              </div>
              <div className="bg-surface border border-border rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-sm">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {format(new Date(event.starts_at), "h:mm a")}
              </div>
              <div className="bg-surface border border-border rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-sm">
                {event.event_type === "online" || event.venue_type !== "in_person" ? (
                  <><Globe className="h-3.5 w-3.5 text-muted-foreground" /> {event.venue_label || "Online"}</>
                ) : (
                  <><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> {event.city || event.venue_label || "In-Person"}</>
                )}
              </div>
              {event.duration_minutes && (
                <div className="bg-surface border border-border rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-sm">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {event.duration_minutes} min
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {event.description && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
                About this event
              </p>
              <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {event.description}
              </div>
            </div>
          )}

          {/* Speakers Grid */}
          {displaySpeakers.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
                Meet your host{displaySpeakers.length > 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {displaySpeakers.map((s) => (
                  <div
                    key={s.id}
                    className="bg-surface border border-border rounded-xl p-4 flex flex-col items-center text-center"
                  >
                    {s.avatar_url ? (
                      <img src={s.avatar_url} alt={s.name} className="w-14 h-14 rounded-full object-cover border border-border mb-3" />
                    ) : (
                      <div className="mb-3">
                        <InitialsAvatar name={s.name} size={48} />
                      </div>
                    )}
                    <p className="text-sm font-medium">{s.name}</p>
                    {s.title && <p className="text-xs text-muted-foreground mt-0.5">{s.title}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Capacity info */}
          {event.max_capacity && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-sm text-muted-foreground">
                <Users className="h-4 w-4 inline mr-1.5" />
                {regCount} / {event.max_capacity} registered
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile sticky bottom CTA */}
      {!isRegistered && !isSoldOut && !isCancelled && !isPast && (
        <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-background/95 backdrop-blur border-t border-border px-4 py-3 flex items-center justify-between z-50">
          <div>
            <p className="text-lg font-semibold">{priceDisplay}</p>
            {spotsLeft !== null && spotsLeft > 0 && (
              <p className="text-xs text-muted-foreground">{spotsLeft} spots left</p>
            )}
          </div>
          <button
            onClick={event.pricing_type === "free" ? handleRegisterFree : handleRegisterPaid}
            disabled={registering}
            className="px-6 py-2.5 rounded-lg bg-cream text-cream-text font-mono text-sm uppercase tracking-widest font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 min-h-[44px]"
          >
            {registering && <Loader2 className="h-4 w-4 animate-spin" />}
            Register →
          </button>
        </div>
      )}
    </StudentLayout>
  );
};

export default EventDetail;
