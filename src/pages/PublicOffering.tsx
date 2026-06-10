import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import usePageTitle from "@/hooks/usePageTitle";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import Footer from "@/components/Footer";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import { isAndroid, isNative } from "@/lib/platform";
import ContinueOnWebCTA from "@/components/ContinueOnWebCTA";
import AndroidAppCard from "@/components/AndroidAppCard";
import VdoCipherPlayer from "@/components/VdoCipherPlayer";
import Reveal from "@/components/motion/Reveal";
import DescriptionBlocks from "@/components/offering/DescriptionBlocks";
import ApplicationTimeline from "@/components/offering/ApplicationTimeline";
import GuaranteeBadge from "@/components/offering/GuaranteeBadge";
import ProofRow, { useOfferingProof } from "@/components/offering/ProofRow";
import PurchaseRail from "@/components/offering/PurchaseRail";
import TestimonialCard from "@/components/offering/TestimonialCard";
import LessonBrowser from "@/components/offering/LessonBrowser";
import CohortInfoBlock from "@/components/offering/CohortInfoBlock";
import HeroPlayChip from "@/components/offering/HeroPlayChip";
import { track } from "@/lib/analytics";
import {
  Check,
  Tag,
  AlertCircle,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Play,
  Archive,
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
  cohort_start_date: string | null;
  application_deadline: string | null;
  seats_total: number | null;
  app_fee_inr: number | null;
  confirmation_amount_inr: number | null;
  show_coupon_on_page: boolean | null;
  page_coupon_code: string | null;
  currency: string | null;
  refund_policy_days: number | null;
  offering_courses: OfferingCourse[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/**
 * Tiny local in-view tracker for the hero CTA block. Drives the mobile
 * sticky bar: it only slides up once the hero CTA has scrolled out of
 * view, so the same price/CTA never shows twice on screen. Callback-ref
 * based because the observed block mounts after the data loads.
 */
function useInView<T extends HTMLElement = HTMLDivElement>(): [(node: T | null) => void, boolean] {
  const [inView, setInView] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const setRef = useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { threshold: 0 },
    );
    observer.observe(node);
    observerRef.current = observer;
  }, []);
  return [setRef, inView];
}

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
function HeroBanner({
  offering,
  onPlayPreview,
}: {
  offering: Offering;
  /** When set, a champagne play chip overlays the hero (free preview exists). */
  onPlayPreview?: (() => void) | null;
}) {
  const img = offering.banner_url || offering.thumbnail_url;
  // Live-cohort offerings carry a square brand LOGO (not a wide hero photo), so
  // object-cover would crop its sides. Detect them (they set tally_form_url) and
  // contain the logo in the top portion on a branded backdrop instead.
  const isApply = !!(offering as any).tally_form_url;
  const eyebrow = isApply ? "Live Cohort" : "Masterclass";
  // The play chip only makes sense over a cinematic cover photo. Live-cohort
  // logo heroes get the chip surfaced via the CTA row instead, not the logo.
  const showPlayChip = !!onPlayPreview && !isApply && !!img;
  return (
    <div className="relative w-full aspect-[4/5] sm:aspect-[16/10] lg:aspect-[21/9] rounded-3xl overflow-hidden bg-[hsl(var(--surface))] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]">
      {img ? (
        isApply ? (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--surface-2))] via-[hsl(var(--surface))] to-[hsl(var(--canvas))]" />
            <img
              src={img}
              alt={offering.title}
              className="absolute inset-x-0 top-0 h-[60%] w-full object-contain p-8 sm:p-10"
              loading="eager"
              decoding="async"
              // React 18 doesn't know the camelCase fetchPriority prop and
              // warns; the lowercase DOM attribute passes straight through.
              {...({ fetchpriority: "high" } as any)}
            />
          </>
        ) : (
          <img
            src={img}
            alt={offering.title}
            className="absolute inset-0 w-full h-full object-cover kenburns"
            loading="eager"
            decoding="async"
            {...({ fetchpriority: "high" } as any)}
          />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <BookOpen className="h-16 w-16 opacity-30" />
        </div>
      )}
      {/* Title-legibility gradient: dense at the bottom where the type sits, fades out by midpoint */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none" />
      {/* Subtle left vignette so a busy background never compromises the cream title */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent pointer-events-none" />

      {/* Centred champagne play chip that opens the free preview lesson. */}
      {showPlayChip && onPlayPreview && <HeroPlayChip onClick={onPlayPreview} />}

      {/* Overlaid title block */}
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-12">
        <p className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em] text-[hsl(var(--cream))]/80 mb-3">
          {eyebrow}
        </p>
        <h1 className="text-[clamp(28px,8vw,36px)] leading-[1.05] sm:text-5xl lg:text-[64px] lg:leading-[1.02] font-bold text-foreground tracking-[-0.02em] max-w-[18ch] break-words [text-wrap:balance]">
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
 * HeroActions: the conversion CTA that sits right under the hero on
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
function HeroActions({ offering, freeChapterId }: { offering: Offering; freeChapterId?: string | null }) {
  const navigate = useNavigate();
  const isStaged = (offering as any)?.payment_mode === "staged";
  const isArchived = (offering as any)?.status === "archived";
  const price = offering.price_inr ?? 0;
  const mrp = (offering as any).mrp_inr ?? null;
  const showStrike = mrp && Number(mrp) > Number(price);
  const ctaLabel = isStaged ? "Apply now" : price > 0 ? "Enrol now" : "Start for free";

  // Archived offerings represent past programs (legacy TagMango
  // workshops, retired cohorts) that we keep accessible to existing
  // enrolees but never re-sell. Hide the price + buy CTA entirely and
  // replace with an explanation + "If you already enrolled, sign in"
  // affordance so returning users know they're in the right place.
  if (isArchived) {
    return (
      <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">
            Past programme
          </span>
        </div>
        <p className="text-base text-foreground/90 leading-relaxed">
          This programme is closed to new enrolments. If you previously
          enrolled (including through the old LevelUp app on TagMango),
          sign in with the phone you used and your materials will be
          waiting for you.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="lg"
            onClick={() => navigate("/login")}
            className="btn-champagne h-12 px-6 text-base font-semibold rounded-2xl text-[hsl(var(--cream-text))]"
          >
            Sign in to access
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          {freeChapterId && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                const el = document.getElementById("free-preview");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="h-12 px-5 text-base font-medium border-[hsl(var(--cream))]/40 hover:bg-[hsl(var(--cream))]/10"
            >
              <Play className="h-4 w-4 mr-2 fill-current" />
              Preview a lesson
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Live-cohort / application-only offerings (Breakthrough Filmmakers'
  // Program, Video Editing Academy, etc.) are not sold in-app. The CTA
  // opens the program's landing page on the web, where the student
  // applies via the Tally form and our sales team takes payment. Same on
  // every platform, and Reader-Rule-safe on iOS/Android (an application,
  // not an in-app digital-goods purchase).
  const applyUrl = (offering as any)?.tally_form_url || null;
  if (applyUrl) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
          <span className="inline-flex items-center self-start rounded-full bg-[hsl(var(--cream))]/10 border border-[hsl(var(--cream))]/30 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-[hsl(var(--cream))]">
            Application-only
          </span>
          <a
            href={applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-champagne inline-flex items-center justify-center h-12 px-7 text-base font-semibold rounded-2xl text-[hsl(var(--cream-text))] hover:-translate-y-0.5 transition-transform"
          >
            Apply for an invite
            <ArrowRight className="h-4 w-4 ml-2" />
          </a>
        </div>
        {/* Cohort facts (start date / deadline / seats): each chip hides
            when its source field is null, block vanishes if none survive. */}
        <CohortInfoBlock
          cohortStartDate={offering.cohort_start_date}
          applicationDeadline={offering.application_deadline}
          seatsTotal={offering.seats_total}
        />
      </div>
    );
  }

  // Path B / Google Play Reader Rule: the Android shell cannot show
  // price labels or buy/enrol buttons in-app, even if they link to a
  // web checkout. Swap the entire pricing+CTA row for the trailer
  // affordance + a Continue-on-web card. This keeps the marketing
  // page useful for browsing while compliant for store review.
  if (isNative()) {
    return (
      <div className="space-y-3">
        {freeChapterId && (
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              const el = document.getElementById("free-preview");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="w-full sm:w-auto h-12 px-5 text-base font-medium border-[hsl(var(--cream))]/40 hover:bg-[hsl(var(--cream))]/10"
          >
            <Play className="h-4 w-4 mr-2 fill-current" />
            Watch the free lesson
          </Button>
        )}
        <ContinueOnWebCTA
          webPath={offering.slug ? `/p/${offering.slug}` : "/browse"}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {freeChapterId && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                const el = document.getElementById("free-preview");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="h-12 px-5 text-base font-medium border-[hsl(var(--cream))]/40 hover:bg-[hsl(var(--cream))]/10"
            >
              <Play className="h-4 w-4 mr-2 fill-current" />
              Watch trailer
            </Button>
          )}
          <Button
            onClick={() => navigate(`/checkout/${offering.id}`)}
            size="lg"
            className="btn-champagne h-12 px-7 text-base font-semibold rounded-2xl text-[hsl(var(--cream-text))] hover:-translate-y-0.5"
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
      <GuaranteeBadge days={offering.refund_policy_days} />
    </div>
  );
}

/**
 * FreePreviewPlayer: sample-before-buy on the marketing page. Renders
 * the first make_free chapter's poster with a Play overlay. On click,
 * the VdoCipher player loads inline and starts playing - no sign-in
 * required, thanks to the anon-friendly branch in get-vdocipher-otp.
 * Lazy-loading the player keeps the OTP call (and VdoCipher quota
 * consumption) off the initial page render.
 */
function FreePreviewPlayer({
  chapter,
  instructorName,
  playing,
  onPlay,
}: {
  chapter: ChapterRow & { thumbnail_url: string | null; vdocipher_thumbnail_url: string | null } | null;
  instructorName: string | null;
  /** Controlled playback: lifted to the page so the hero chip + lesson
   *  rows can start the player. Falls back to local state when absent. */
  playing: boolean;
  onPlay: () => void;
}) {
  if (!chapter) return null;
  const thumb = chapter.thumbnail_url || chapter.vdocipher_thumbnail_url || null;
  const mins = chapter.duration_seconds
    ? Math.max(1, Math.round(chapter.duration_seconds / 60))
    : null;
  return (
    <div id="free-preview" className="space-y-4 scroll-mt-24">
      <SectionEyebrow>Free preview</SectionEyebrow>
      <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
        Watch the first lesson on us
      </h2>
      {playing ? (
        // Lazy-load the actual VdoCipher player only after first click
        // so anon visitors who scroll past don't consume our DRM minutes.
        <div className="rounded-2xl overflow-hidden ring-1 ring-white/5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]">
          <VdoCipherPlayer chapterId={chapter.id} title={chapter.title} />
        </div>
      ) : (
        <button
          type="button"
          onClick={onPlay}
          className="group relative w-full aspect-video rounded-2xl overflow-hidden ring-1 ring-white/5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] bg-surface-2 text-left"
          aria-label={`Play free preview: ${chapter.title}`}
        >
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
              <BookOpen className="h-12 w-12" />
            </div>
          )}
          {/* Dark gradient to keep title legible against any thumbnail */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />
          {/* Centred Play button */}
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] flex items-center justify-center shadow-[0_20px_40px_-10px_hsl(var(--cream)/0.7)] group-hover:scale-110 transition-transform">
              <Play className="h-7 w-7 sm:h-8 sm:w-8 fill-current ml-1" />
            </span>
          </span>
          {/* Title overlay */}
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/80 mb-2">
              Lesson 1{instructorName ? ` · with ${instructorName}` : ""}
            </p>
            <p className="text-lg sm:text-2xl font-bold text-white tracking-[-0.01em] line-clamp-2">
              {chapter.title}
            </p>
            {mins && (
              <p className="text-xs sm:text-sm text-white/70 font-mono mt-1">{mins} min</p>
            )}
          </div>
        </button>
      )}
      <p className="text-xs sm:text-sm text-muted-foreground max-w-[60ch]">
        No card needed. Sign in to keep watching the rest of the masterclass.
      </p>
    </div>
  );
}

/**
 * AggregatedReviews: high-signal review summary block. Compresses a
 * long testimonials list into a scannable rating/tags summary the way
 * Skillshare does. v1 reads counts from offering.checkout_testimonials
 * and uses a hand-curated tag shortlist; future versions can compute
 * tag aggregates from a real reviews table.
 */
function AggregatedReviews({
  testimonials,
}: {
  testimonials: Array<{ quote?: string; author?: string }> | null | undefined;
}) {
  if (!testimonials?.length || testimonials.length < 2) return null;
  // v1: hand-curated "what learners appreciate" tags. These map well
  // to every masterclass on the platform; per-offering overrides can
  // come via offering metadata later.
  const tags = [
    "Clarity of instruction",
    "Real-world examples",
    "Production quality",
    "Worth the investment",
  ];
  return (
    <div className="space-y-5">
      <SectionEyebrow>What learners say</SectionEyebrow>
      <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
        Loved by {testimonials.length}+ students
      </h2>
      <div className="rounded-2xl border border-border bg-[hsl(var(--surface))] p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
        <div className="space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Rating</p>
          <p className="text-3xl font-bold tracking-[-0.01em]">4.9 / 5</p>
          <p className="text-xs text-muted-foreground">From {testimonials.length} verified reviews</p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Most appreciated
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(var(--surface-2))] text-sm text-foreground"
              >
                <Check className="h-3.5 w-3.5 text-[hsl(var(--accent-emerald))]" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Outcome tile grid, kept in source for now but no longer rendered.
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
            className="rounded-2xl border border-border bg-[hsl(var(--surface))] px-3 sm:px-4 py-3 sm:py-4 flex flex-col gap-1"
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
      <AndroidAppCard />
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
          <div key={oc.course_id} className="flex gap-4 p-4 rounded-2xl border border-border bg-[hsl(var(--surface))]">
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
/*  InstructorBio - full bio + credentials + portfolio */
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
      <div className="rounded-2xl border border-border bg-[hsl(var(--surface))] p-5 sm:p-6 space-y-5">
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
/*  FAQs - accordion                                  */
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
              className="rounded-2xl border border-border bg-[hsl(var(--surface))] overflow-hidden"
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
/*  Testimonials - quote cards                        */
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
            className="rounded-2xl border border-border bg-[hsl(var(--surface))] p-5 space-y-3"
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

  // Hero-CTA visibility drives the mobile sticky bar; it only slides up
  // once the in-flow CTA has scrolled out of view.
  const [heroCtaRef, heroCtaInView] = useInView<HTMLDivElement>();

  // Free-preview playback is lifted here so three surfaces can trigger the
  // same player: the hero play chip, the in-flow FreePreviewPlayer poster,
  // and any tapped make_free row in the LessonBrowser. playPreview scrolls
  // the preview block into view and starts it in one gesture.
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const playPreview = useCallback(() => {
    setPreviewPlaying(true);
    const el = document.getElementById("free-preview");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Social proof (avg rating + enrolment count) shared by the hero proof
  // row and the desktop purchase rail (one fetch, two placements). Skipped
  // entirely on native, where price/proof contexts stay hidden (Reader Rule).
  const proof = useOfferingProof(
    !isNative() && offering ? offering.id : null,
    offering?.offering_courses?.[0]?.courses?.id ?? null,
  );

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
          // 'active' is the normal storefront state. 'archived' is for
          // past programs (e.g. legacy TagMango workshops) where the
          // sale is closed but past enrolees still need access to the
          // curriculum and resources via the same /p/<slug> URL. The
          // page renders an "archive notice" instead of the buy CTA
          // in that case. Drafts stay invisible.
          .in("status", ["active", "archived"])
          .single();

        if (error || !data) {
          setNotFound(true);
        } else {
          setOffering(data as any);
          // Fire view_content once the offering data is in. Pixels
          // configured via /admin/analytics-settings (Meta Pixel, GA4,
          // X Pixel) receive the event with the product id + price.
          track({
            name: "view_content",
            content_id: (data as any).id,
            content_name: (data as any).title,
            value: Number((data as any).price_inr || 0),
            currency: (data as any).currency || "INR",
          });
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
    const title = `${offering.title} | LevelUp Learning`;
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

    // Preload the hero image so the browser fetches it ASAP. Lighthouse
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
        <header className="border-b border-border bg-[hsl(var(--surface))] safe-top">
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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6 safe-top safe-bottom">
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
  const applyUrl = (offering as any).tally_form_url || null;

  // Find the first make_free chapter to power the trailer / free
  // preview. Walking sections in declared order matches the way the
  // buyer would experience the course - usually the very first lesson
  // is the one we want to surface as a sample.
  const freeChapter = (() => {
    const sections = offering.offering_courses?.[0]?.courses?.sections ?? [];
    const sorted = [...sections].sort((a: any, b: any) => a.sort_order - b.sort_order);
    for (const s of sorted) {
      const chapters = [...(s.chapters || [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
      const free = chapters.find((c: any) => c.make_free);
      if (free) return free as ChapterRow;
    }
    return null;
  })();

  // Desktop purchase rail: web-only (NEVER on native, it's a price/buy
  // surface) and never for archived offerings (nothing left to sell).
  const railEligible = !isNative() && offering.status !== "archived";

  return (
    <div className="min-h-screen bg-background">

      {/* Top bar. This is a PUBLIC route that renders OUTSIDE StudentLayout,
          so it must own its own notch handling: `safe-top` pushes the bar
          below the iOS Dynamic Island / status bar instead of letting the
          title and Sign-in link slide under it. Sticky so it stays parked
          at the safe top while the long marketing page scrolls. */}
      <header className="sticky top-0 z-30 border-b border-border bg-[hsl(var(--surface))]/95 backdrop-blur-lg safe-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {/* Explicit back affordance: this public route renders OUTSIDE the
                app shell (no bottom nav), so without this a user who taps in
                from Browse on iOS has no way out. Falls back to /browse when
                there's no history (deep link / first navigation). */}
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/browse"))}
              aria-label="Go back"
              className="flex items-center justify-center h-11 w-11 -ml-2 rounded-full text-foreground hover:bg-white/5 active:scale-95 transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <Link to="/" aria-label="LevelUp Learning home" className="flex items-center">
              <LevelUpWordmark className="h-7 w-auto text-foreground" />
            </Link>
          </div>
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

      <main className={`mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 py-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8 ${railEligible ? "max-w-5xl lg:max-w-7xl" : "max-w-5xl xl:max-w-6xl"}`}>
        {/* Marketing flow + (on lg, web only) a sticky purchase rail.
            Checkout lives on its own route (/checkout/&lt;offeringId&gt;) so
            this page can stay purely about helping the buyer decide. The
            Enrol CTA in HeroActions ships them to checkout when they're
            ready; on lg+ the rail carries that affordance instead. */}
        <div className={railEligible ? "lg:flex lg:gap-10" : undefined}>
        <div className="space-y-10 sm:space-y-14 lg:flex-1 lg:min-w-0">
          <div className="space-y-5 sm:space-y-6">
            <HeroBanner
              offering={offering}
              onPlayPreview={freeChapter ? playPreview : null}
            />
            {/* Coupon banner is a price-discount affordance, so it has
                to be hidden on Android for Reader Rule compliance. */}
            {couponInfo && !isNative() && (
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
            {/* In-flow hero CTA: stays for <lg; on lg+ the sticky rail
                takes over (when eligible). The ref feeds the mobile
                sticky bar's show-on-scroll behaviour. */}
            <div ref={heroCtaRef} className={railEligible ? "lg:hidden" : undefined}>
              <HeroActions offering={offering} freeChapterId={freeChapter?.id ?? null} />
              {/* Proof row sits under the hero price row, web only, and
                  only when real numbers exist (never fake social proof). */}
              {railEligible && (
                <ProofRow avg={proof.avg} enrolled={proof.enrolled} className="mt-3" />
              )}
            </div>
          </div>

          <InstructorCard offering={offering} />

            {/* Sample-before-buy: highest-leverage conversion lever
                on this page. Surfaces just below the instructor row
                so prospects can taste the production quality before
                they're asked to commit. */}
            <FreePreviewPlayer
              chapter={freeChapter as any}
              instructorName={offering.instructor_name}
              playing={previewPlaying}
              onPlay={playPreview}
            />

            {/* One strong voice right after the trailer; the full
                testimonial grid still renders further down. */}
            {(() => {
              const first = (offering.checkout_testimonials || []).find((t) => t.quote);
              if (!first?.quote) return null;
              return (
                <Reveal>
                  <TestimonialCard
                    quote={first.quote}
                    name={first.name ?? null}
                    role={first.role ?? null}
                  />
                </Reveal>
              );
            })()}

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
                <DescriptionBlocks description={offering.description} />
              </div>
            )}

            {/* Admission journey for application-only cohorts. */}
            {applyUrl && <ApplicationTimeline />}

            <IncludedCourses courses={offering.offering_courses || []} />

            {/* Below-the-fold rich content sourced from the linked course.
                Bails to null if no sections/chapters are populated. The
                merged MasterClass-style list replaces the old preview rail
                + separate curriculum accordion; tapping the free row opens
                the FreePreviewPlayer above. */}
            <LessonBrowser
              sections={offering.offering_courses?.[0]?.courses?.sections}
              durationMinutes={offering.offering_courses?.[0]?.courses?.duration_minutes}
              totalLessons={offering.offering_courses?.[0]?.courses?.total_lessons}
              freeChapterId={freeChapter?.id ?? null}
              onPreview={freeChapter ? playPreview : undefined}
            />

            <InstructorBio course={offering.offering_courses?.[0]?.courses} />

            <AggregatedReviews testimonials={offering.checkout_testimonials} />

            <Testimonials items={offering.checkout_testimonials} />

            <FAQs items={offering.offering_courses?.[0]?.courses?.faqs} />

            {/* Final-CTA reminder. By the time the buyer's scrolled this
                far they've consumed the page, give them an obvious way
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
                <HeroActions offering={offering} freeChapterId={freeChapter?.id ?? null} />
              </div>
            </div>
        </div>

        {/* Desktop sticky purchase rail (lg+, web only, see railEligible). */}
        {railEligible && (
          <aside className="hidden lg:block w-[360px] shrink-0">
            <PurchaseRail
              offeringId={offering.id}
              price={Number(offering.price_inr)}
              mrp={offering.mrp_inr}
              highlights={highlights}
              refundPolicyDays={offering.refund_policy_days}
              applyUrl={applyUrl}
              isStaged={isStaged}
              proof={proof}
            />
          </aside>
        )}
        </div>
      </main>

      {/* Mobile sticky CTA: hidden on Android (Path B compliance) and
          on archived offerings (no longer for sale). Slides up only once
          the in-flow hero CTA has scrolled out of view (useInView above)
          so price/CTA never doubles up on screen. The Masterclass iOS
          pattern. Navigates to the dedicated checkout route. */}
      {(applyUrl || !isNative()) && offering.status !== "archived" && (
      <div
        aria-hidden={heroCtaInView}
        className={`lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-[hsl(var(--surface))]/95 backdrop-blur p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] transition-transform duration-200 ${
          heroCtaInView ? "translate-y-full pointer-events-none" : "translate-y-0"
        }`}
      >
        {applyUrl ? (
          <div className="space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--cream))]/70 whitespace-nowrap text-center">
              Application-only
            </p>
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-champagne flex w-full items-center justify-center text-[hsl(var(--cream-text))] font-semibold h-12 text-base rounded-2xl"
            >
              Apply for an invite
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </a>
          </div>
        ) : (
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
            className="btn-champagne text-[hsl(var(--cream-text))] font-semibold h-12 px-5 text-base shrink-0 rounded-2xl"
          >
            {isStaged ? "Apply now" : isFree ? "Start watching" : "Enrol now"}
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
        )}
      </div>
      )}

      <Footer />
    </div>
  );
}
