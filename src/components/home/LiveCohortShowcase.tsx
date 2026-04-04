import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ArrowRight, Check } from "lucide-react";

import liveBfp from "@/assets/live-bfp.jpg";
import liveVe from "@/assets/live-ve.png";
import liveAcp from "@/assets/live-acp.png";
import liveUiux from "@/assets/live-uiux.png";
import liveSw from "@/assets/live-sw.png";

const fallbackPrograms = [
  {
    id: "bfp",
    tag: "FILMMAKING",
    title: "Breakthrough Filmmakers' Program",
    headline: "Become a Filmmaker in 12 Weeks",
    oneLiner:
      "From script to screen — live weekend classes with the creators behind your favourite Indian films.",
    stats: ["12 Weeks", "Weekends Only", "LIVE Online", "Application-Only"],
    bullets: [
      "Full pipeline — screenwriting, directing, cinematography, editing, distribution",
      "Sony Future Filmmaker Award showcase for your short film",
      "Exclusive industry-grade equipment discounts",
    ],
    ctaLink: "https://www.leveluplearning.in/bfp-2",
    ctaLabel: "Request Invite",
    thumbnail: liveBfp,
  },
  {
    id: "ve",
    tag: "VIDEO EDITING",
    title: "Video Editing Academy",
    headline: "Become the Editor Everyone Wants to Hire",
    oneLiner:
      "Learn from the editors behind Ali Abdaal, Ankur Warikoo & Sharan Hegde — in 12 weeks.",
    stats: ["12 Weeks", "Weekends Only", "LIVE Online", "Application-Only"],
    bullets: [
      "Taught by viral social media editors + National Award-winning filmmaker",
      "Storytelling through editing, color grading, sound design & client-ready workflows",
      "Industry tool discounts included",
    ],
    ctaLink: "https://www.leveluplearning.in/ve",
    ctaLabel: "Request Invite",
    thumbnail: liveVe,
  },
  {
    id: "creator-academy",
    tag: "CONTENT CREATION",
    title: "Creator Academy",
    headline: "Become the Creator You Keep Planning to Be",
    oneLiner:
      "Not a course. A 12-week execution cohort — publish 21 posts or stay out.",
    stats: ["12 Weeks", "21 Posts", "Pods of 5", "80%+ Completion"],
    bullets: [
      'Publish by 10 PM IST or your streak resets',
      "Mentor reviews every draft before you post",
      "Alumni grown to 440K+, 340K+, 230K+ followers",
    ],
    ctaLink: "https://www.leveluplearning.in/creator-academy",
    ctaLabel: "Begin Today",
    thumbnail: liveAcp,
  },
  {
    id: "uiux",
    tag: "PRODUCT DESIGN",
    title: "UI/UX Design Academy",
    headline: "India's First AI-First Product Design Accelerator",
    oneLiner:
      "Brief to interview-ready portfolio in 12 weeks with AI workflows built in.",
    stats: ["12 Weeks", "Weekends Only", "LIVE Online", "Top 5% Accepted"],
    bullets: [
      "AI-first curriculum woven into research, synthesis, UX copy & prototyping",
      "Mentors from Zepto, Spinny, Mondee, Royal Enfield",
      "You leave with a shipped case study, not a Figma file nobody saw",
    ],
    ctaLink: "https://www.leveluplearning.in/uiux-academy",
    ctaLabel: "Request Invite",
    thumbnail: liveUiux,
  },
  {
    id: "sw",
    tag: "WRITING",
    title: "Screenwriting & Storytelling",
    headline: "Storytellers Are Built Here",
    oneLiner:
      "The 8-week experience that transforms your writing forever.",
    stats: ["8 Weeks", "128 Concepts", "15 Assignments", "4 Mentors"],
    bullets: [
      "Psychology of storytelling, visual storytelling, and pitching & selling",
      "Sunday masterclass + Saturday 1:1 feedback + weekday execution",
      "Covers OTT writing, short-form hooks, screenplay structures",
    ],
    ctaLink: "https://www.leveluplearning.in/sw",
    ctaLabel: "Request Invite",
    thumbnail: liveSw,
  },
];

const rotatingLabels = ["Creator", "Editor", "Filmmaker", "Designer", "Writer"];
const AUTOPLAY_MS = 5000;

const LiveCohortShowcase = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [labelIdx, setLabelIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const { data: dbCohorts = [] } = useQuery({
    queryKey: ["cohorts-home"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select(
          "id, slug, title, short_description, description, tags, thumbnail_url, payment_page_url, student_count, estimated_duration"
        )
        .eq("course_type", "cohort")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  const programs =
    dbCohorts.length > 0
      ? dbCohorts.map((c) => ({
          id: c.id,
          tag: (c.tags?.[0] || "COHORT").toUpperCase(),
          title: c.title,
          headline: c.title,
          oneLiner: c.short_description || "",
          stats: c.tags?.slice(0, 4) || [],
          bullets:
            c.description
              ?.split("\n")
              .filter(Boolean)
              .slice(0, 3) || [],
          ctaLink: c.payment_page_url || `/learn/course/${c.slug}`,
          ctaLabel: "Request Invite",
          thumbnail: c.thumbnail_url || "",
          slug: c.slug,
        }))
      : fallbackPrograms;

  const navigateTo = useCallback(
    (newIndex: number) => {
      setDirection(newIndex > current ? 1 : -1);
      setCurrent(newIndex);
    },
    [current]
  );

  const next = useCallback(() => {
    setDirection(1);
    setCurrent((c) => (c + 1) % programs.length);
  }, [programs.length]);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent((c) => (c - 1 + programs.length) % programs.length);
  }, [programs.length]);

  useEffect(() => {
    if (isPaused) return;
    const t = setInterval(next, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [isPaused, next]);

  useEffect(() => {
    const t = setInterval(
      () => setLabelIdx((i) => (i + 1) % rotatingLabels.length),
      2500
    );
    return () => clearInterval(t);
  }, []);

  const p = programs[current];
  const isExternal = p.ctaLink.startsWith("http");

  const cardVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  };

  return (
    <section
      className="space-y-6"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Header */}
      <div className="space-y-2">
        <span className="inline-block rounded-full border border-border/50 bg-secondary px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Live Mentorship Cohorts
        </span>
        <h2 className="text-2xl font-semibold text-foreground sm:text-3xl tracking-tight">
          From Learner to{" "}
          <span className="relative inline-block h-[1.15em] overflow-hidden align-bottom">
            <AnimatePresence mode="wait">
              <motion.span
                key={rotatingLabels[labelIdx]}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -30, opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="inline-block text-primary"
              >
                {rotatingLabels[labelIdx]}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="text-muted-foreground font-light">.</span>
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          LIVE mentorship cohorts designed for one thing: taking you from "I know
          about it" to "I can actually do it."
        </p>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {programs.map((prog, i) => (
          <button
            key={prog.id}
            onClick={() => navigateTo(i)}
            className={`rounded-full border px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all ${
              i === current
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/40 bg-secondary/60 text-muted-foreground hover:border-border"
            }`}
          >
            {prog.tag}
          </button>
        ))}
      </div>

      {/* Card */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={p.id}
            custom={direction}
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col lg:flex-row"
          >
            {/* Image side */}
            {p.thumbnail && (
              <div className="relative h-56 w-full shrink-0 overflow-hidden lg:h-auto lg:w-[380px] lg:order-2">
                <img
                  src={p.thumbnail}
                  alt={p.title}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card hidden lg:block" />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent lg:hidden" />
              </div>
            )}

            {/* Content side */}
            <div className="flex flex-1 flex-col justify-center p-6 sm:p-8 lg:p-10 lg:order-1">
              <span className="mb-2 inline-flex w-fit rounded-full bg-primary/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                {p.tag}
              </span>
              <h3 className="text-xl font-semibold text-foreground sm:text-2xl lg:text-3xl tracking-tight">
                {p.headline}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {p.oneLiner}
              </p>

              {/* Stats pills */}
              {p.stats.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {p.stats.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-border/30 bg-secondary/60 px-3 py-1 text-[10px] font-medium text-muted-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {/* Bullets */}
              {p.bullets.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {p.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 text-sm text-foreground/80"
                    >
                      <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{b}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* CTA */}
              <div className="mt-6">
                {isExternal ? (
                  <a
                    href={p.ctaLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-[12px] bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 shadow-design-sm"
                  >
                    {p.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                ) : (
                  <button
                    onClick={() => navigate(p.ctaLink)}
                    className="inline-flex items-center gap-2 rounded-[12px] bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 shadow-design-sm"
                  >
                    {p.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <button
          onClick={prev}
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border/30 bg-background/50 p-2 text-foreground backdrop-blur-sm transition-all hover:bg-background/80"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={next}
          className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border/30 bg-background/50 p-2 text-foreground backdrop-blur-sm transition-all hover:bg-background/80"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2">
        {programs.map((_, i) => (
          <button
            key={i}
            onClick={() => navigateTo(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === current
                ? "w-6 bg-primary"
                : "w-1.5 bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    </section>
  );
};

export default LiveCohortShowcase;
