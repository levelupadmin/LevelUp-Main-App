import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import usePageTitle from "@/hooks/usePageTitle";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import Footer from "@/components/Footer";
import { isAndroid } from "@/lib/platform";
import {
  Check,
  Tag,
  AlertCircle,
  BookOpen,
  ArrowRight,
} from "lucide-react";

/* ────────────────────────────────────────────────── */
/*  Types                                             */
/* ────────────────────────────────────────────────── */
interface ChapterRow {
  id: string;
  title: string;
  description: string | null;
  duration_seconds: number | null;
  make_free: boolean | null;
  sort_order: number;
  thumbnail_url: string | null;
  vdocipher_thumbnail_url: string | null;
}
interface SectionRow {
  id: string;
  title: string;
  sort_order: number;
  chapters: ChapterRow[];
}

interface OfferingCourse {
  course_id: string;
  courses: {
    id?: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    instructor_display_name: string | null;
    instructor_bio: string | null;
    instructor_avatar_url: string | null;
    instructor_credentials: string[] | null;
    portfolio_pieces: Array<{ title?: string; image_url?: string; description?: string }> | null;
    outcomes: string[] | null;
    faqs: Array<{ question: string; answer: string }> | null;
    duration_minutes: number | null;
    total_lessons: number | null;
    sections?: SectionRow[];
  };
}

interface Offering {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  slug: string;
  price_inr: number;
  mrp_inr: number | null;
  gst_mode: string;
  gst_rate: number | null;
  status: string;
  is_public: boolean;
  banner_url: string | null;
  thumbnail_url: string | null;
  instructor_name: string | null;
  instructor_title: string | null;
  instructor_avatar_url: string | null;
  highlights: string[] | null;
  checkout_testimonials: Array<{ name?: string; quote?: string; role?: string }> | null;
  meta_pixel_id: string | null;
  google_ads_conversion: string | null;
  custom_tracking_script: string | null;
  thankyou_thumbnail_url: string | null;
  thankyou_headline: string | null;
  thankyou_body: string | null;
  thankyou_cta_label: string | null;
  thankyou_cta_url: string | null;
  thankyou_auto_redirect: boolean | null;
  thankyou_redirect_seconds: number | null;
  payment_mode: string | null;
  tally_form_url: string | null;
  app_fee_inr: number | null;
  confirmation_amount_inr: number | null;
  show_coupon_on_page: boolean | null;
  page_coupon_code: string | null;
  offering_courses: OfferingCourse[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/* ────────────────────────────────────────────────── */
/*  Subcomponents                                     */
/* ────────────────────────────────────────────────── */

/**
 * Cinematic hero: image fills the full container at a portrait aspect on
 * mobile (so the instructor's face dominates the fold) and a wider 21:9
 * on desktop. Title + subtitle sit overlaid at the bottom with a heavy
 * bottom-fade gradient for legibility. Matches the visual weight of
 * Masterclass / Reforge / Maven course pages.
 */
function HeroBanner({ offering }: { offering: Offering }) {
  const img = offering.banner_url || offering.thumbnail_url;
  return (
    <div className="relative w-full aspect-[4/5] sm:aspect-[16/10] lg:aspect-[21/9] rounded-2xl overflow-hidden bg-[hsl(var(--surface))] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]">
      {img ? (
        <img
          src={img}
          alt={offering.title}
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <BookOpen className="h-16 w-16 opacity-30" />
        </div>
      )}
      {/* Title-legibility gradient: dense at the bottom where the type sits, fades out by midpoint */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none" />
      {/* Subtle left vignette so a busy background never compromises the cream title */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent pointer-events-none" />

      {/* Overlaid title block */}
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-12">
        <p className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em] text-[hsl(var(--cream))]/80 mb-3">
          Masterclass
        </p>
        <h1 className="text-[36px] leading-[1.02] sm:text-5xl lg:text-[64px] lg:leading-[1.02] font-bold text-foreground tracking-[-0.02em] max-w-[18ch]">
          {offering.title}
        </h1>
        {offering.subtitle && (
          <p className="mt-3 sm:mt-4 text-base sm:text-xl lg:text-2xl text-foreground/85 font-['Instrument_Serif'] italic max-w-[42ch]">
            {offering.subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * HeroActions — the conversion CTA that sits right under the hero on
 * the marketing/landing page. Carries the price (with strike-through
 * MRP) and the primary Enrol-Now button that ships the buyer to the
 * dedicated /checkout/&lt;offeringId&gt; review screen. PublicOffering is
 * the marketing surface; CheckoutPage is the buy surface. Keeping them
 * separate means Meta-ads landing pages can deep-link buyers straight
 * to /checkout without going through the marketing copy.
 *
 * For staged-payment offerings (applications) the same CTA carries the
 * application-fee copy and the link still goes to /checkout, where
 * CheckoutPage's existing paymentType logic routes them through the
 * staged-application flow.
 */
function HeroActions({ offering }: { offering: Offering }) {
  const navigate = useNavigate();
  const isStaged = (offering as any)?.payment_mode === "staged";
  const price = offering.price_inr ?? 0;
  const mrp = (offering as any).mrp_inr ?? null;
  const showStrike = mrp && Number(mrp) > Number(price);
  const ctaLabel = isStaged ? "Apply now" : price > 0 ? "Enrol now" : "Start for free";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6 py-2">
      <div className="flex items-baseline gap-3">
        <span className="text-3xl sm:text-4xl font-bold text-foreground tracking-[-0.01em]">
          {price > 0 ? `₹${Number(price).toLocaleString("en-IN")}` : "Free"}
        </span>
        {showStrike && (
          <span className="text-base sm:text-lg text-muted-foreground line-through font-mono">
            ₹{Number(mrp).toLocaleString("en-IN")}
          </span>
        )}
      </div>
      <Button
        onClick={() => navigate(`/checkout/${offering.id}`)}
        size="lg"
        className="h-12 px-7 text-base font-semibold bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-[0_10px_30px_-10px_hsl(var(--cream)/0.5)]"
      >
        {ctaLabel}
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}

/**
 * Outcome tile grid — kept in source for now but no longer rendered.
 * Removed from the marketing page on 2026-05-24 per design call:
 * Masterclass's actual class detail pages don't use it; only their
 * Sessions pages do. Leaving the component in place in case we want
 * to revisit for Sessions-style offerings.
 */
function StatStrip({ offering }: { offering: Offering }) {
  const course = offering.offering_courses?.[0]?.courses;
  const lessons = course?.total_lessons ?? course?.sections?.reduce(
    (sum, s) => sum + (s.chapters?.length ?? 0),
    0,
  );
  const minutes = course?.duration_minutes ?? 0;
  const hours = minutes > 0 ? Math.round(minutes / 60) : null;

  const tiles: { label: string; value: string }[] = [];
  if (lessons && lessons > 0) {
    tiles.push({ label: "Lessons", value: String(lessons) });
  }
  if (hours && hours > 0) {
    tiles.push({ label: "Runtime", value: `${hours}+ hrs` });
  }
  tiles.push({ label: "Format", value: "4K video" });
  tiles.push({ label: "Captions", value: "Subtitles" });
  tiles.push({ label: "Access", value: "Lifetime" });

  if (tiles.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className={`grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-3 ${tiles.length >= 5 ? "lg:grid-cols-5" : tiles.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {tiles.map((t, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-[hsl(var(--surface))] px-3 sm:px-4 py-3 sm:py-4 flex flex-col gap-1"
          >
            <p className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              {t.label}
            </p>
            <p className="text-sm sm:text-base font-semibold text-foreground tracking-[-0.01em]">
              {t.value}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground/70">
        Available on the web today &middot; Android coming soon
      </p>
    </div>
  );
}

/**
 * Small uppercase eyebrow used above major sections. Pairs with the big
 * h2 to give every block a clear "label + headline" rhythm instead of
 * a wall of same-size subheads.
 */
function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
      {children}
    </p>
  );
}

function InstructorCard({ offering }: { offering: Offering }) {
  if (!offering.instructor_name) return null;
  return (
    <div className="flex items-center gap-4 sm:gap-5 py-4 sm:py-5 border-y border-border">
      {offering.instructor_avatar_url ? (
        <img
          src={offering.instructor_avatar_url}
          alt={offering.instructor_name}
          loading="lazy"
          decoding="async"
          className="h-14 w-14 sm:h-16 sm:w-16 rounded-full object-cover ring-2 ring-[hsl(var(--cream))] ring-offset-2 ring-offset-background"
        />
      ) : (
        <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center text-2xl font-bold text-[hsl(var(--cream))]">
          {offering.instructor_name.charAt(0)}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Taught by</p>
        <p className="text-lg sm:text-xl font-semibold text-foreground truncate">{offering.instructor_name}</p>
        {offering.instructor_title && (
          <p className="text-sm text-muted-foreground truncate">{offering.instructor_title}</p>
        )}
      </div>
    </div>
  );
}

function Highlights({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map((h, i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-[hsl(var(--surface))]">
          <Check className="h-5 w-5 mt-0.5 text-[hsl(var(--accent-emerald))] flex-shrink-0" />
          <span className="text-sm text-foreground">{h}</span>
        </div>
      ))}
    </div>
  );
}

function IncludedCourses({ courses }: { courses: OfferingCourse[] }) {
  if (!courses.length) return null;
  return (
    <div className="space-y-4">
      <SectionEyebrow>Bundle</SectionEyebrow>
      <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
        {courses.length === 1 ? "What's included" : `${courses.length} courses included`}
      </h2>
      <div className="space-y-3">
        {courses.map((oc) => (
          <div key={oc.course_id} className="flex gap-4 p-4 rounded-xl border border-border bg-[hsl(var(--surface))]">
            {oc.courses.thumbnail_url ? (
              <img
                src={oc.courses.thumbnail_url}
                alt={oc.courses.title}
                loading="lazy"
                decoding="async"
                className="h-16 w-24 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="h-16 w-24 rounded-lg bg-[hsl(var(--surface-2))] flex items-center justify-center flex-shrink-0">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{oc.courses.title}</p>
              {oc.courses.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{oc.courses.description}</p>
              )}
              {oc.courses.instructor_display_name && (
                <p className="text-xs text-muted-foreground mt-1">by {oc.courses.instructor_display_name}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────── */
/*  WhatYoullLearn — marketing preview rail above the */
/*  full curriculum accordion. Shows the first handful */
/*  of lessons as thumbnail cards so a prospect can    */
/*  see the actual content rather than just titles in  */
/*  an accordion. Non-interactive: cards don't link    */
/*  anywhere because most viewers here are unauthed.   */
/* ────────────────────────────────────────────────── */
function WhatYoullLearn({ sections }: { sections?: SectionRow[] }) {
  if (!sections?.length) return null;
  // Flatten sections in their declared order, then pick the first 6
  // lessons. That tends to be the most enticing preview - early
  // lessons set the tone and let buyers gauge fit.
  const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const flat = sorted.flatMap((s) =>
    [...(s.chapters || [])].sort((a, b) => a.sort_order - b.sort_order),
  );
  if (!flat.length) return null;
  const visible = flat.slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <SectionEyebrow>A look inside</SectionEyebrow>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
          What you'll learn
        </h2>
      </div>
      <div className="relative">
        <div className="flex gap-3 sm:gap-4 overflow-x-auto snap-x hide-scrollbar pb-2 -mx-1 px-1">
          {visible.map((ch, idx) => {
            const thumb = ch.thumbnail_url || ch.vdocipher_thumbnail_url || null;
            const mins = ch.duration_seconds
              ? Math.max(1, Math.round(ch.duration_seconds / 60))
              : null;
            return (
              <div
                key={ch.id}
                className="min-w-[70vw] sm:min-w-[260px] lg:min-w-[280px] max-w-[300px] bg-surface rounded-xl overflow-hidden flex-shrink-0 snap-start ring-1 ring-white/5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)]"
              >
                <div className="relative aspect-video bg-surface-2 overflow-hidden">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center font-mono text-2xl font-semibold text-muted-foreground/30">
                      {String(idx + 1).padStart(2, "0")}
                    </div>
                  )}
                  {/* Lesson number chip, always visible so the buyer
                      sees the sequencing at a glance. */}
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white tracking-wider">
                    LESSON {String(idx + 1).padStart(2, "0")}
                  </span>
                  {ch.make_free && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[hsl(var(--accent-emerald))]/90 text-[10px] font-mono text-white uppercase tracking-wider">
                      Free preview
                    </span>
                  )}
                </div>
                <div className="p-3 sm:p-4 space-y-1">
                  <p className="text-sm font-semibold leading-snug line-clamp-2">
                    {ch.title}
                  </p>
                  {mins && (
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {mins} min
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Right-edge fade hint - matches the Continue Learning pattern
            on Home, gives a visual cue that more content scrolls. */}
        {flat.length > visible.length && (
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent" />
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────── */
/*  Curriculum — sections + chapters accordion        */
/* ────────────────────────────────────────────────── */
function Curriculum({
  sections,
  durationMinutes,
  totalLessons,
}: {
  sections?: SectionRow[];
  durationMinutes?: number | null;
  totalLessons?: number | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (!sections?.length) return null;
  const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const allChapters = sorted.flatMap((s) => s.chapters || []);
  if (!allChapters.length) return null;

  return (
    <div className="space-y-4">
      <SectionEyebrow>Curriculum</SectionEyebrow>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
          Every lesson, mapped out
        </h2>
        <div className="text-xs text-muted-foreground font-mono">
          {totalLessons || allChapters.length} lessons
          {durationMinutes ? ` · ${Math.round(durationMinutes / 60)}h` : ""}
        </div>
      </div>
      <div className="space-y-2">
        {sorted.map((sec) => {
          const chapters = [...(sec.chapters || [])].sort((a, b) => a.sort_order - b.sort_order);
          const isOpen = expanded.has(sec.id) || sorted.length === 1;
          return (
            <div key={sec.id} className="rounded-xl border border-border bg-[hsl(var(--surface))] overflow-hidden">
              {sorted.length > 1 && (
                <button
                  type="button"
                  onClick={() => toggle(sec.id)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-[hsl(var(--surface-2))] transition-colors min-h-[48px]"
                  aria-expanded={isOpen}
                >
                  <span className="font-medium text-foreground">{sec.title}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {chapters.length} lesson{chapters.length === 1 ? "" : "s"}
                  </span>
                </button>
              )}
              {isOpen && (
                <ol className="divide-y divide-border">
                  {chapters.map((ch, i) => (
                    <li key={ch.id} className="flex items-start gap-3 p-4">
                      <span className="font-mono text-xs text-muted-foreground tabular-nums w-6 mt-0.5">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{ch.title}</p>
                        {ch.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ch.description}</p>
                        )}
                      </div>
                      {ch.make_free && (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[hsl(var(--accent-emerald))] border border-[hsl(var(--accent-emerald)/0.4)] rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">
                          Free
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────── */
/*  InstructorBio — full bio + credentials + portfolio */
/* ────────────────────────────────────────────────── */
function InstructorBio({
  course,
}: {
  course?: OfferingCourse["courses"];
}) {
  if (!course) return null;
  const name = course.instructor_display_name;
  const bio = course.instructor_bio;
  const avatar = course.instructor_avatar_url;
  const credentials = course.instructor_credentials || [];
  const portfolio = course.portfolio_pieces || [];

  if (!name || (!bio && !credentials.length && !portfolio.length)) return null;

  return (
    <div className="space-y-4">
      <SectionEyebrow>Your instructor</SectionEyebrow>
      <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
        Learn from someone who's done it
      </h2>
      <div className="rounded-xl border border-border bg-[hsl(var(--surface))] p-5 sm:p-6 space-y-5">
        <div className="flex items-start gap-4">
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              loading="lazy"
              decoding="async"
              className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center text-xl font-bold text-[hsl(var(--cream))] flex-shrink-0">
              {name.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-lg font-semibold text-foreground">{name}</p>
            {credentials[0] && (
              <p className="text-sm text-muted-foreground mt-0.5">{credentials[0]}</p>
            )}
          </div>
        </div>
        {bio && (
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{bio}</p>
        )}
        {credentials.length > 1 && (
          <div className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Career milestones</p>
            <ul className="space-y-2">
              {credentials.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 mt-0.5 text-[hsl(var(--accent-emerald))] flex-shrink-0" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {portfolio.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Selected work</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {portfolio.map((p, i) => (
                <div
                  key={i}
                  className="aspect-[4/3] rounded-lg bg-[hsl(var(--surface-2))] border border-border flex items-center justify-center text-center p-2"
                >
                  <span className="text-xs text-foreground font-medium">{p.title || "Untitled"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────── */
/*  FAQs — accordion                                  */
/* ────────────────────────────────────────────────── */
function FAQs({ items }: { items?: Array<{ question: string; answer: string }> | null }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  if (!items?.length) return null;
  return (
    <div className="space-y-3">
      <SectionEyebrow>Questions</SectionEyebrow>
      <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
        Frequently asked
      </h2>
      <div className="space-y-2">
        {items.map((f, i) => {
          const isOpen = openIdx === i;
          return (
            <div
              key={i}
              className="rounded-xl border border-border bg-[hsl(var(--surface))] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-[hsl(var(--surface-2))] transition-colors min-h-[48px]"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-medium text-foreground">{f.question}</span>
                <span
                  className={`text-muted-foreground text-xl leading-none flex-shrink-0 transition-transform ${
                    isOpen ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </button>
              {isOpen && f.answer && (
                <p className="text-sm text-muted-foreground leading-relaxed px-4 pb-4 -mt-1 whitespace-pre-line">
                  {f.answer}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────── */
/*  Testimonials — quote cards                        */
/* ────────────────────────────────────────────────── */
function Testimonials({
  items,
}: {
  items?: Array<{ name?: string; quote?: string; role?: string }> | null;
}) {
  const valid = (items || []).filter((t) => t.quote);
  if (!valid.length) return null;
  return (
    <div className="space-y-3">
      <SectionEyebrow>Students</SectionEyebrow>
      <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
        What others said
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {valid.map((t, i) => (
          <figure
            key={i}
            className="rounded-xl border border-border bg-[hsl(var(--surface))] p-5 space-y-3"
          >
            <blockquote className="text-sm text-foreground leading-relaxed">"{t.quote}"</blockquote>
            {(t.name || t.role) && (
              <figcaption className="text-xs text-muted-foreground">
                {t.name && <span className="font-medium text-foreground">{t.name}</span>}
                {t.role && <span> · {t.role}</span>}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}


/* ────────────────────────────────────────────────── */
/*  Main Page                                         */
/* ────────────────────────────────────────────────── */

export default function PublicOffering() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [offering, setOffering] = useState<Offering | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [couponInfo, setCouponInfo] = useState<{code: string; discount_type: string; discount_value: number} | null>(null);

  usePageTitle(offering?.title || "LevelUp Learning");

  // Razorpay script loading moved to CheckoutPage along with the actual
  // payment surface, so this marketing page no longer pays the
  // ~470 KB LCP-blocking script cost.

  /* ── Fetch offering ── */
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("offerings")
          .select(`
            *,
            offering_courses(
              course_id,
              courses(
                id, title, description, thumbnail_url,
                instructor_display_name, instructor_bio, instructor_avatar_url,
                instructor_credentials, portfolio_pieces, outcomes, faqs,
                duration_minutes, total_lessons,
                sections!sections_course_id_fkey(
                  id, title, sort_order,
                  chapters(id, title, description, duration_seconds, make_free, sort_order, thumbnail_url, vdocipher_thumbnail_url)
                )
              )
            )
          `)
          .eq("slug", slug)
          .eq("status", "active")
          .single();

        if (error || !data) {
          setNotFound(true);
        } else {
          setOffering(data as any);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  useEffect(() => {
    if (!offering?.show_coupon_on_page || !offering?.page_coupon_code) return;
    (async () => {
      const { data } = await supabase.functions.invoke("validate-coupon", {
        body: { coupon_code: offering.page_coupon_code, offering_id: offering.id },
      });
      if (data?.valid) setCouponInfo({ code: data.code, discount_type: data.discount_type, discount_value: Number(data.discount_value) });
    })();
  }, [offering?.id]);

  /* ── Per-offering SEO meta (title + description + OG/Twitter share preview) ── */
  useEffect(() => {
    if (!offering) return;
    const title = `${offering.title} — LevelUp Learning`;
    const desc = offering.subtitle || offering.description?.slice(0, 160) || "Learn from the people behind some of India's most loved films and creative work.";
    const img = offering.banner_url || offering.thumbnail_url || "";

    document.title = title;

    const setMeta = (selector: string, attr: string, value: string) => {
      if (!value) return;
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement("meta");
        // Re-derive the attribute from the selector. Selectors look like
        // `meta[name="description"]` or `meta[property="og:title"]`.
        const m = selector.match(/\[(name|property)="([^"]+)"\]/);
        if (m) el.setAttribute(m[1], m[2]);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', "content", desc);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", desc);
    if (img) setMeta('meta[property="og:image"]', "content", img);
    setMeta('meta[property="og:url"]', "content", window.location.href);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", desc);
    if (img) setMeta('meta[name="twitter:image"]', "content", img);

    // Schema.org Course structured data so Google can render a rich
    // result card with the instructor, price, and provider. Replaces
    // any previous offering-specific block (keyed by id).
    const SCHEMA_ID = "offering-jsonld";
    let script = document.getElementById(SCHEMA_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCHEMA_ID;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    const linkedCourse = offering.offering_courses?.[0]?.courses;
    const payload: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Course",
      name: offering.title,
      description: desc,
      url: window.location.href,
      provider: {
        "@type": "Organization",
        name: "LevelUp Learning",
        sameAs: "https://leveluplearning.in",
      },
      offers: {
        "@type": "Offer",
        price: Number(offering.price_inr || 0),
        priceCurrency: offering.currency || "INR",
        url: window.location.href,
        availability: "https://schema.org/InStock",
      },
    };
    if (offering.instructor_name) {
      payload.instructor = { "@type": "Person", name: offering.instructor_name };
    }
    if (img) payload.image = img;
    if (linkedCourse?.total_lessons) {
      payload.hasCourseInstance = {
        "@type": "CourseInstance",
        courseMode: "Online",
        numberOfLessons: linkedCourse.total_lessons,
      };
    }
    script.textContent = JSON.stringify(payload);

    // Preload the hero image so the browser fetches it ASAP — Lighthouse
    // flagged LCP because the hero <img> tag was discovered late by the
    // pre-load scanner. A preload link in head pulls it forward.
    const PRELOAD_ID = "offering-hero-preload";
    let preload = document.getElementById(PRELOAD_ID) as HTMLLinkElement | null;
    if (img) {
      if (!preload) {
        preload = document.createElement("link");
        preload.id = PRELOAD_ID;
        preload.rel = "preload";
        preload.as = "image";
        preload.setAttribute("fetchpriority", "high");
        document.head.appendChild(preload);
      }
      preload.href = img;
    } else if (preload) {
      preload.remove();
    }
  }, [offering]);

  const isStaged = (offering as any)?.payment_mode === "staged";

  /* ── Loading / 404 ── */
  if (loading) {
    // Structured skeleton matches the eventual page layout so users see
    // shape immediately and don't experience a jarring layout shift when
    // the data lands.
    return (
      <div className="min-h-screen bg-background animate-pulse">
        <header className="border-b border-border bg-[hsl(var(--surface))]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="h-6 w-24 rounded bg-[hsl(var(--surface-2))]" />
            <div className="h-6 w-16 rounded bg-[hsl(var(--surface-2))]" />
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:flex lg:gap-8">
          <div className="lg:w-[60%] space-y-6">
            <div className="aspect-[16/9] md:aspect-[21/9] rounded-2xl bg-[hsl(var(--surface))]" />
            <div className="space-y-3">
              <div className="h-8 w-3/4 rounded bg-[hsl(var(--surface-2))]" />
              <div className="h-5 w-1/2 rounded bg-[hsl(var(--surface-2))]" />
            </div>
            <div className="h-20 rounded-xl bg-[hsl(var(--surface))]" />
            <div className="space-y-2">
              <div className="h-5 w-40 rounded bg-[hsl(var(--surface-2))]" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="h-14 rounded-lg bg-[hsl(var(--surface))]" />
                <div className="h-14 rounded-lg bg-[hsl(var(--surface))]" />
                <div className="h-14 rounded-lg bg-[hsl(var(--surface))]" />
                <div className="h-14 rounded-lg bg-[hsl(var(--surface))]" />
              </div>
            </div>
          </div>
          <div className="hidden lg:block lg:w-[40%]">
            <div className="rounded-2xl bg-[hsl(var(--surface))] p-6 space-y-4">
              <div className="h-8 w-32 rounded bg-[hsl(var(--surface-2))]" />
              <div className="h-12 rounded bg-[hsl(var(--surface-2))]" />
              <div className="h-12 rounded bg-[hsl(var(--surface-2))]" />
              <div className="h-12 rounded bg-[hsl(var(--surface-2))]" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (notFound || !offering) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold text-foreground">Offering not found</h1>
        <p className="text-muted-foreground text-sm">This page doesn't exist or is no longer available.</p>
        <Link to="/" className="inline-flex items-center gap-2 mt-4 text-sm text-cream hover:underline">
          ← Browse programs
        </Link>
      </div>
    );
  }

  const highlights: string[] = Array.isArray(offering.highlights) ? offering.highlights : [];
  const isFree = Number(offering.price_inr) === 0;

  return (
    <div className="min-h-screen bg-background">

      {/* Top bar */}
      <header className="border-b border-border bg-[hsl(var(--surface))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-bold text-[hsl(var(--cream))] font-['Instrument_Serif'] italic">
            LevelUp
          </span>
          {!session && (
            <a
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center min-h-[44px] px-3 -mx-3 rounded-md"
            >
              Sign in
            </a>
          )}
        </div>
      </header>

      <main className="max-w-5xl xl:max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 py-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
        {/* Single-column marketing flow. Checkout lives on its own
            route now (/checkout/&lt;offeringId&gt;) so this page can stay
            purely about helping the buyer decide. The Enrol CTA in
            HeroActions ships them to checkout when they're ready. */}
        <div className="space-y-10 sm:space-y-14">
          <div className="space-y-5 sm:space-y-6">
            <HeroBanner offering={offering} />
            {couponInfo && (
              <div className="rounded-xl border border-[hsl(var(--accent-emerald)/0.3)] bg-[hsl(var(--accent-emerald)/0.08)] p-3 sm:p-4 flex items-center gap-3">
                <Tag className="h-5 w-5 text-[hsl(var(--accent-emerald))] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {couponInfo.discount_type === "percent"
                      ? `${couponInfo.discount_value}% off`
                      : `₹${Number(couponInfo.discount_value).toLocaleString("en-IN")} off`}
                    {" "}with code{" "}
                    <button
                      onClick={() => { navigator.clipboard.writeText(couponInfo.code); toast.success("Copied!"); }}
                      className="font-mono font-bold text-[hsl(var(--accent-emerald))] hover:underline"
                    >
                      {couponInfo.code}
                    </button>
                  </p>
                  <p className="text-xs text-muted-foreground">Auto-applied at checkout.</p>
                </div>
              </div>
            )}
            <HeroActions offering={offering} />
          </div>

          <InstructorCard offering={offering} />

            {highlights.length > 0 && (
              <div className="space-y-4">
                <SectionEyebrow>What you'll get</SectionEyebrow>
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
                  Program Highlights
                </h2>
                <Highlights items={highlights} />
              </div>
            )}

            {offering.description && (
              <div className="space-y-4">
                <SectionEyebrow>About this program</SectionEyebrow>
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
                  {offering.instructor_name
                    ? `Inside ${offering.instructor_name.split(" ")[0]}'s masterclass`
                    : "Inside this masterclass"}
                </h2>
                <p className="text-base sm:text-lg text-muted-foreground whitespace-pre-line leading-relaxed max-w-[68ch]">
                  {offering.description}
                </p>
              </div>
            )}

            <IncludedCourses courses={offering.offering_courses || []} />

            {/* Below-the-fold rich content sourced from the linked course.
                Each section bails to null if data isn't populated. */}
            <WhatYoullLearn
              sections={offering.offering_courses?.[0]?.courses?.sections}
            />

            <Curriculum
              sections={offering.offering_courses?.[0]?.courses?.sections}
              durationMinutes={offering.offering_courses?.[0]?.courses?.duration_minutes}
              totalLessons={offering.offering_courses?.[0]?.courses?.total_lessons}
            />

            <InstructorBio course={offering.offering_courses?.[0]?.courses} />

            <Testimonials items={offering.checkout_testimonials} />

            <FAQs items={offering.offering_courses?.[0]?.courses?.faqs} />

            {/* Final-CTA reminder. By the time the buyer's scrolled this
                far they've consumed the page — give them an obvious way
                back to checkout without scrolling up. Mirrors the hero
                actions but framed as a reminder. */}
            <div className="rounded-2xl border border-border bg-[hsl(var(--surface))] p-6 sm:p-8 text-center space-y-4">
              <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
                Ready when you are
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
                Start {offering.instructor_name ? offering.instructor_name.split(" ")[0] + "'s" : "this"} masterclass today
              </h2>
              <div className="pt-2">
                <HeroActions offering={offering} />
              </div>
            </div>
        </div>
      </main>

      {/* Mobile sticky CTA — hidden on Android (Path B compliance).
          Price + Enrol Now persistent across the page so the buyer
          never has to scroll back to act. The Masterclass iOS pattern.
          Navigates to the dedicated checkout route. */}
      {!isAndroid() && (
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-[hsl(var(--surface))]/95 backdrop-blur p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {isFree ? (
              <span className="text-2xl font-bold text-[hsl(var(--accent-emerald))]">Free</span>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground tracking-[-0.01em]">
                  ₹{Number(offering.price_inr).toLocaleString("en-IN")}
                </span>
                {offering.mrp_inr && Number(offering.mrp_inr) > Number(offering.price_inr) && (
                  <span className="text-sm text-muted-foreground line-through font-mono">
                    ₹{Number(offering.mrp_inr).toLocaleString("en-IN")}
                  </span>
                )}
              </div>
            )}
          </div>
          <Button
            onClick={() => navigate(`/checkout/${offering.id}`)}
            className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90 font-semibold h-12 px-5 text-base shrink-0 shadow-[0_10px_30px_-10px_hsl(var(--cream)/0.5)]"
          >
            {isStaged ? "Apply now" : isFree ? "Start watching" : "Enrol now"}
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      </div>
      )}

      <Footer />
    </div>
  );
}
