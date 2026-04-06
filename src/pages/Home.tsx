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
import { resolveCourseThumbnail } from "@/lib/courseThumbnails";

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

  useEffect(() => {
    const fetchEnrolled = async () => {
      const { data: enrolments } = await supabase
        .from("enrolments")
        .select("id, offering_id, created_at")
        .eq("status", "active");

      if (!enrolments?.length) { setLoading(false); return; }

      const offeringIds = enrolments.map((e) => e.offering_id);
      const { data: ocs } = await supabase
        .from("offering_courses")
        .select("offering_id, course_id")
        .in("offering_id", offeringIds);

      if (!ocs?.length) { setLoading(false); return; }

      const courseIds = [...new Set(ocs.map((oc) => oc.course_id))];
      const { data: coursesData } = await supabase
        .from("courses")
        .select("id, title, description, instructor_display_name, thumbnail_url")
        .in("id", courseIds);

      setCourses(coursesData ?? []);
      setLoading(false);
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
                  <div className="h-full bg-cream rounded-full" style={{ width: "0%" }} />
                </div>
                <p className="text-sm text-cream mt-3 flex items-center gap-1">
                  Continue <ArrowRight className="h-3 w-3" />
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
      .then(({ data }) => setPosts(data ?? []));
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
  const { user } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<any[]>([]);
  const [myRegs, setMyRegs] = useState<Set<string>>(new Set());
  const [registering, setRegistering] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("is_active", true)
        .in("status", ["upcoming", "live"])
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(4);
      setEvents(data ?? []);

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
          return (
            <div key={ev.id} className="min-w-[300px] max-w-[340px] lg:max-w-none bg-surface border border-border rounded-xl overflow-hidden card-hover flex-shrink-0 snap-start flex flex-col">
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
                  {ev.host_avatar_url ? (
                    <img src={ev.host_avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-border" />
                  ) : (
                    <InitialsAvatar name={ev.host_name} size={32} />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{ev.host_name}</p>
                    {ev.host_title && <p className="text-[11px] text-muted-foreground truncate">{ev.host_title}</p>}
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
            </div>
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
      const { data: coursesData } = await supabase
        .from("courses")
        .select("id, title, description, thumbnail_url, product_tier, sort_order, duration_text, instructor_display_name, status")
        .in("status", ["published", "upcoming"])
        .order("sort_order", { ascending: true })
        .limit(6);

      if (!coursesData?.length) return;

      const courseIds = coursesData.map((c) => c.id);
      const { data: ocs } = await supabase
        .from("offering_courses")
        .select("course_id, offering_id")
        .in("course_id", courseIds);

      const offeringIds = [...new Set((ocs ?? []).map((oc) => oc.offering_id))];
      const { data: offerings } = offeringIds.length
        ? await supabase.from("offerings").select("id, price_inr, mrp_inr").in("id", offeringIds).eq("status", "active")
        : { data: [] };

      const ocMap: Record<string, string> = {};
      (ocs ?? []).forEach((oc) => { if (!ocMap[oc.course_id]) ocMap[oc.course_id] = oc.offering_id; });
      const offMap: Record<string, any> = {};
      (offerings ?? []).forEach((o) => { offMap[o.id] = o; });

      setCourses(coursesData.map((c) => {
        const offId = ocMap[c.id];
        const off = offId ? offMap[offId] : null;
        return { ...c, offering_id: offId, price_inr: off?.price_inr, mrp_inr: off?.mrp_inr };
      }));
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
      .then(({ data }) => setMembers(data ?? []));
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
