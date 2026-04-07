import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import usePageTitle from "@/hooks/usePageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/layout/StudentLayout";
import InitialsAvatar from "@/components/InitialsAvatar";
import HeroCarousel from "@/components/HeroCarousel";
import { TierBadge } from "@/components/TierBadge";
import { ArrowRight, Calendar, MessageSquare, ArrowUp, Globe, MapPin, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";


// ── Section 1: Hero Welcome ──
const HeroWelcome = () => {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const today = format(new Date(), "EEEE, MMM d, yyyy");

  return (
    <div className="bg-cream rounded-2xl px-10 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 max-h-[180px]">
      <div>
        <h1 className="text-2xl font-semibold text-cream-text">
          Welcome back,{" "}
          <span className="font-serif-italic">{firstName}</span>
        </h1>
        <p className="text-sm text-cream-text/70 mt-1">Pick up where you left off</p>
      </div>
      <div className="font-mono text-xs text-cream-text/60 sm:text-right">
        <p>{today}</p>
        <p>Member #{profile?.member_number ?? "—"}</p>
      </div>
    </div>
  );
};

// ── Section 2: Continue Learning ──
const ContinueLearning = () => {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchEnrolled = async () => {
      try {
        const { data: enrolments } = await supabase
          .from("enrolments")
          .select("id, offering_id, created_at")
          .eq("status", "active");

        if (!enrolments?.length) return;

        const offeringIds = enrolments.map((e) => e.offering_id);
        const { data: ocs } = await supabase
          .from("offering_courses")
          .select("offering_id, course_id")
          .in("offering_id", offeringIds);

        if (!ocs?.length) return;

        const courseIds = [...new Set(ocs.map((oc) => oc.course_id))];
        const { data: coursesData } = await supabase
          .from("courses")
          .select("id, slug, title, description, instructor_display_name, thumbnail_url")
          .in("id", courseIds);

        setCourses(coursesData ?? []);

        // Calculate progress
        if (coursesData?.length) {
          const { data: allChapters } = await supabase
            .from("chapters")
            .select("id, section_id")
            .in("section_id",
              (await supabase.from("sections").select("id").in("course_id", courseIds)).data?.map((s: any) => s.id) ?? []
            );

          const { data: progressData } = await supabase
            .from("chapter_progress")
            .select("chapter_id, completed_at");

          // Map section_id → course_id
          const { data: sectionsData } = await supabase
            .from("sections")
            .select("id, course_id")
            .in("course_id", courseIds);

          const sectionCourseMap: Record<string, string> = {};
          (sectionsData ?? []).forEach((s: any) => { sectionCourseMap[s.id] = s.course_id; });

          const completedSet = new Set(
            (progressData ?? []).filter((p: any) => p.completed_at).map((p: any) => p.chapter_id)
          );

          const pMap: Record<string, number> = {};
          for (const cId of courseIds) {
            const totalForCourse = (allChapters ?? []).filter((ch: any) => sectionCourseMap[ch.section_id] === cId).length;
            const doneForCourse = (allChapters ?? []).filter((ch: any) => sectionCourseMap[ch.section_id] === cId && completedSet.has(ch.id)).length;
            pMap[cId] = totalForCourse > 0 ? Math.round((doneForCourse / totalForCourse) * 100) : 0;
          }
          setProgressMap(pMap);
        }
      } catch (err) {
        console.error("Failed to load enrolled courses:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchEnrolled();
  }, []);

  if (loading) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Continue Learning</h2>
      <div className="flex gap-4 overflow-x-auto snap-x hide-scrollbar pb-2">
        {!courses.length ? (
          <div className="min-w-[320px] max-w-[320px] h-[200px] bg-cream rounded-xl p-6 flex flex-col justify-center flex-shrink-0 snap-start">
            <p className="text-cream-text font-medium text-sm">You're not enrolled in any courses yet.</p>
            <p className="text-cream-text/70 text-xs mt-1">Browse programs below to get started.</p>
          </div>
        ) : (
          courses.map((c) => (
            <Link
              key={c.id}
              to={`/courses/${c.id}`}
              className="min-w-[300px] max-w-[320px] bg-surface border border-border rounded-xl overflow-hidden card-hover flex-shrink-0 snap-start"
            >
              <div className="aspect-video bg-surface-2 relative">
                {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="p-4">
                <h3 className="text-base font-semibold line-clamp-1">{c.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{c.instructor_display_name}</p>
                <div className="mt-3 h-1 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full bg-cream rounded-full transition-all" style={{ width: `${progressMap[c.id] || 0}%` }} />
                </div>
                <p className="text-sm text-cream mt-3 flex items-center gap-1">
                  {(progressMap[c.id] || 0) > 0 ? `${progressMap[c.id]}% complete` : "Start learning"} <ArrowRight className="h-3 w-3" />
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
};

// ── Section 3: Popular in Community ──
const PopularCommunity = () => {
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("qna_posts")
      .select("id, title, body, upvote_count, reply_count, created_at, user_id")
      .order("upvote_count", { ascending: false })
      .limit(8)
      .then(({ data, error }) => {
        if (error) console.error("Failed to load community posts:", error);
        setPosts(data ?? []);
      });
  }, []);

  if (!posts.length) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-4">Popular in Community</h2>
        <p className="text-sm text-muted-foreground">No community posts yet.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Popular in Community</h2>
      <div className="flex gap-4 overflow-x-auto snap-x hide-scrollbar pb-2">
        {posts.map((p) => (
          <div
            key={p.id}
            className="min-w-[340px] max-w-[360px] h-[200px] bg-surface border border-border rounded-xl p-5 card-hover flex-shrink-0 snap-start flex flex-col justify-between"
          >
            <div>
              <h3 className="text-sm font-semibold line-clamp-2">{p.title}</h3>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{p.body}</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
              <span className="flex items-center gap-1"><ArrowUp className="h-3 w-3" /> {p.upvote_count}</span>
              <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {p.reply_count}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

// ── Section 4: Upcoming Events (from events table) ──
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
          .from("events")
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
        console.error("Failed to load events:", err);
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
        <p className="text-sm text-muted-foreground">No upcoming events scheduled.</p>
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
              className="min-w-[300px] max-w-[340px] lg:max-w-none bg-surface border border-border rounded-xl overflow-hidden card-hover flex-shrink-0 snap-start flex flex-col"
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

// ── Section 5: Browse Programs ──
const BrowsePrograms = () => {
  const [courses, setCourses] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: coursesData } = await supabase
          .from("courses")
          .select("id, slug, title, description, thumbnail_url, product_tier, sort_order, duration_text, instructor_display_name, status")
          .in("status", ["published", "upcoming"])
          .order("sort_order", { ascending: true })
          .limit(6);

        if (!coursesData?.length) return;

        const courseIds = coursesData.map((c) => c.id);

        const { data: primaryData } = await supabase
          .from("courses")
          .select("id, primary_offering_id")
          .in("id", courseIds) as any;

        const primaryMap: Record<string, string | null> = {};
        (primaryData ?? []).forEach((p: any) => { primaryMap[p.id] = p.primary_offering_id ?? null; });

        const primaryOfferingIds = [...new Set(
          Object.values(primaryMap).filter(Boolean) as string[]
        )];

        let offeringMap: Record<string, any> = {};

        if (primaryOfferingIds.length) {
          const { data: offs } = await supabase
            .from("offerings")
            .select("id, price_inr, mrp_inr")
            .in("id", primaryOfferingIds)
            .eq("status", "active");
          (offs ?? []).forEach((o) => { offeringMap[o.id] = o; });
        }

        const coursesWithoutPrimary = coursesData.filter((c) => !primaryMap[c.id]);
        const fallbackOcMap: Record<string, string> = {};

        if (coursesWithoutPrimary.length) {
          const fallbackIds = coursesWithoutPrimary.map((c) => c.id);
          const { data: ocs } = await supabase
            .from("offering_courses")
            .select("course_id, offering_id")
            .in("course_id", fallbackIds);

          const fallbackOffIds = [...new Set((ocs ?? []).map((oc) => oc.offering_id))];
          if (fallbackOffIds.length) {
            const { data: fallbackOffs } = await supabase
              .from("offerings")
              .select("id, price_inr, mrp_inr")
              .in("id", fallbackOffIds)
              .eq("status", "active");
            (fallbackOffs ?? []).forEach((o) => { if (!offeringMap[o.id]) offeringMap[o.id] = o; });
          }

          (ocs ?? []).forEach((oc) => { if (!fallbackOcMap[oc.course_id]) fallbackOcMap[oc.course_id] = oc.offering_id; });
        }

        setCourses(coursesData.map((c) => {
          const offId = primaryMap[c.id] || fallbackOcMap[c.id] || null;
          const off = offId ? offeringMap[offId] : null;
          return { ...c, offering_id: offId, price_inr: off?.price_inr, mrp_inr: off?.mrp_inr };
        }));
      } catch (err) {
        console.error("Failed to load browse programs:", err);
      }
    };
    load();
  }, []);

  if (!courses.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Browse Programs</h2>
        <Link to="/browse" className="text-sm text-cream flex items-center gap-1">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((c) => (
          <Link
            key={c.id}
            to={c.offering_id ? `/checkout/${c.offering_id}` : `/courses/${c.id}`}
            className="bg-surface border border-border rounded-xl overflow-hidden card-hover"
          >
            <div className="aspect-video bg-surface-2 relative">
              {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-full h-full object-cover" />}
              <div className="absolute top-2 left-2">
                <TierBadge tier={c.product_tier} />
              </div>
            </div>
            <div className="p-4">
              <h3 className="text-base font-semibold mt-1 line-clamp-1">{c.title}</h3>
              {c.instructor_display_name && (
                <p className="text-xs text-muted-foreground mt-0.5">{c.instructor_display_name}</p>
              )}
              {c.duration_text && (
                <p className="text-xs font-mono text-muted-foreground mt-1">{c.duration_text}</p>
              )}
              <div className="flex items-center justify-between mt-3">
                {c.price_inr != null ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-semibold">₹{Number(c.price_inr).toLocaleString()}</span>
                    {c.mrp_inr && Number(c.mrp_inr) > Number(c.price_inr) && (
                      <span className="text-sm text-muted-foreground line-through">₹{Number(c.mrp_inr).toLocaleString()}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Price TBA</span>
                )}
                <span className="text-sm text-cream flex items-center gap-1">
                  Enroll <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};

// ── Section 6: New Members ──
const NewMembers = () => {
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("users")
      .select("id, full_name, bio, member_number, avatar_url")
      .eq("role", "student")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (error) console.error("Failed to load new members:", error);
        setMembers(data ?? []);
      });
  }, []);

  if (!members.length) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-4">New Members</h2>
        <p className="text-sm text-muted-foreground">No members yet.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">New Members</h2>
      <div className="flex gap-4 overflow-x-auto snap-x hide-scrollbar pb-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="min-w-[220px] max-w-[240px] bg-surface border border-border rounded-xl p-4 card-hover flex-shrink-0 snap-start"
          >
            <div className="flex items-center gap-3">
              <InitialsAvatar name={m.full_name ?? "U"} photoUrl={m.avatar_url} size={48} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{m.full_name}</p>
                <p className="text-xs font-mono text-muted-foreground">#{m.member_number}</p>
              </div>
            </div>
            {m.bio && (
              <p className="text-xs text-muted-foreground mt-3 line-clamp-1">{m.bio}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

// ── Main Home Page ──
const Home = () => {
  usePageTitle("Dashboard");
  return (
    <StudentLayout title="">
      <div className="space-y-8">
        <HeroCarousel />
        <HeroWelcome />
        <ContinueLearning />
        <PopularCommunity />
        <UpcomingEvents />
        <BrowsePrograms />
        <NewMembers />
      </div>
    </StudentLayout>
  );
};

export default Home;
