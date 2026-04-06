import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/layout/StudentLayout";
import InitialsAvatar from "@/components/InitialsAvatar";
import HeroCarousel from "@/components/HeroCarousel";
import { ArrowRight, Calendar, MessageSquare, ArrowUp } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

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

// ── Section 4: Upcoming Events ──
const UpcomingEvents = () => {
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("live_sessions")
      .select("id, title, description, starts_at, duration_minutes, hero_image_url, course_id")
      .eq("status", "scheduled")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(6)
      .then(({ data }) => setSessions(data ?? []));
  }, []);

  if (!sessions.length) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-4">Upcoming Events</h2>
        <p className="text-sm text-muted-foreground">No upcoming events scheduled.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Upcoming Events</h2>
      <div className="flex gap-4 overflow-x-auto snap-x hide-scrollbar pb-2">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="min-w-[300px] max-w-[320px] bg-surface border border-border rounded-xl overflow-hidden card-hover flex-shrink-0 snap-start"
          >
            <div className="aspect-video bg-surface-2 relative">
              {s.hero_image_url && <img src={s.hero_image_url} alt="" className="w-full h-full object-cover" />}
              <div className="absolute top-3 left-3 bg-canvas/80 backdrop-blur px-2 py-1 rounded font-mono text-xs">
                {format(new Date(s.starts_at), "MMM d · h:mm a")}
              </div>
            </div>
            <div className="p-4">
              <h3 className="text-base font-semibold line-clamp-1">{s.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{s.duration_minutes} min</p>
              <button className="mt-3 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                <Calendar className="h-3 w-3" /> Add to calendar
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

// ── Section 5: Masterclass Showcase ──
const MasterclassShowcase = () => {
  const [offering, setOffering] = useState<any>(null);

  useEffect(() => {
    supabase
      .from("offerings")
      .select("id, title, description, price_inr, thumbnail_url")
      .eq("status", "active")
      .order("price_inr", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => setOffering(data));
  }, []);

  if (!offering) return null;

  const mentors = ["Mr. Praveen", "Sarvesh P.", "Rahul S.", "Director K.", "Lokesh K."];

  return (
    <section>
      <div className="bg-cream rounded-2xl px-10 py-10 max-h-[280px] grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6 items-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-cream-text/60 mb-3">ALL-ACCESS PASS</p>
          <h2 className="text-2xl font-semibold text-cream-text">
            Learn from the{" "}
            <span className="font-serif-italic">best instructors</span>
          </h2>
          <p className="text-sm text-cream-text/70 mt-2 max-w-md">{offering.description}</p>
          <Link
            to={`/checkout/${offering.id}`}
            className="inline-flex items-center gap-2 mt-5 px-6 py-2.5 bg-cream-text text-cream text-sm font-semibold rounded-lg hover:-translate-y-0.5 transition-transform"
          >
            View package <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="flex -space-x-4 justify-center md:justify-end">
          {mentors.map((name) => (
            <InitialsAvatar key={name} name={name} size={64} />
          ))}
          <div className="h-16 w-16 rounded-full bg-cream-text/10 flex items-center justify-center font-mono text-xs text-cream-text">
            +5
          </div>
        </div>
      </div>
    </section>
  );
};

// ── Section 6: Browse Programs ──
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
                <span className={cn(
                  "inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase",
                  c.product_tier === "live_cohort" ? "bg-red-600 text-white" :
                  c.product_tier === "masterclass" ? "bg-amber-500 text-black" :
                  c.product_tier === "advanced_program" ? "bg-amber-400 text-black" :
                  "bg-cream text-cream-text"
                )}>
                  {c.product_tier === "live_cohort" ? "LIVE" :
                   c.product_tier === "masterclass" ? "MASTERCLASS" :
                   c.product_tier === "advanced_program" ? "PROGRAM" : "WORKSHOP"}
                </span>
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

// ── Section 7: New Members ──
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
const Home = () => (
  <StudentLayout title="">
    <div className="space-y-8">
      <HeroCarousel />
      <HeroWelcome />
      <ContinueLearning />
      <PopularCommunity />
      <UpcomingEvents />
      <MasterclassShowcase />
      <BrowsePrograms />
      <NewMembers />
    </div>
  </StudentLayout>
);

export default Home;
