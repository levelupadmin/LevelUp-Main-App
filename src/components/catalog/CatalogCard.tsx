import type { PointerEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Heart, Bell, Check } from "lucide-react";
import { TierBadge } from "@/components/TierBadge";
import { ArtworkImage } from "@/components/media/ArtworkImage";
import { MotionCard } from "@/components/motion/MotionCard";
import { MotionButton } from "@/components/motion/MotionButton";
import ContinueOnWebCTA from "@/components/ContinueOnWebCTA";
import CourseRatingBadge from "@/components/reviews/CourseRatingBadge";
import { formatEnrolmentLabel, isHotCourse } from "@/hooks/useEnrolmentCounts";
import { isAndroid, isNative } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { CatalogCourse } from "./useCatalog";

const formatPrice = (amount: number) =>
  new Intl.NumberFormat("en-IN").format(amount);

/** "Nelson Dilipkumar Teaches Filmmaking" → { name, craft }. */
export const parseMasterclassTitle = (
  title: string
): { name: string; craft: string } | null => {
  const m = /^(.+?) Teaches (.+)$/.exec(title);
  return m ? { name: m[1], craft: m[2] } : null;
};

/** Drop a leading emoji (incl. ZWJ sequences / variation selectors) from
 *  marketing copy. Deliberately excludes digits so "29 episodes…" survives. */
export const stripLeadingEmoji = (s: string) =>
  s.replace(/^(?:[\p{Extended_Pictographic}\u{FE0F}\u{200D}]|\s)+/u, "");

interface CatalogCardProps {
  course: CatalogCourse;
  isEntitled: boolean;
  wishlisted: boolean;
  onToggleWishlist: (offeringId: string) => void;
  notifyRequested: boolean;
  notifyPending: boolean;
  onNotify: (courseId: string, courseTitle: string) => void;
  enrolmentCount: number | undefined;
  isPopular: boolean;
}

const CatalogCard = ({
  course: c,
  isEntitled,
  wishlisted,
  onToggleWishlist,
  notifyRequested,
  notifyPending,
  onNotify,
  enrolmentCount,
  isPopular,
}: CatalogCardProps) => {
  const tier = c.product_tier;
  // Where the card navigates:
  //  - entitled  → straight into the in-app course detail (player surface).
  //  - browsing  → public offering landing page when we have a slug.
  //  - upcoming  → no detail page yet; non-nav, only "Notify me".
  const cardHref =
    c.status === "upcoming"
      ? null
      : isEntitled
        ? `/courses/${c.id}`
        : c.offering_slug
          ? `/p/${c.offering_slug}`
          : `/courses/${c.id}`;

  const parsed = tier === "masterclass" ? parseMasterclassTitle(c.title) : null;
  const description = c.description ? stripLeadingEmoji(c.description) : null;

  // Nested controls (wishlist heart, Notify, View/Continue CTA) sit above the
  // stretched card link and drive their own press animation. framer-motion's
  // whileTap on the parent MotionCard is a POINTER gesture: it binds a NATIVE
  // pointerdown listener on the card DOM node (bubble phase) and press-scales the
  // card for ANY descendant pointerdown that bubbles up — so pressing an inner
  // control also scales the whole card, reading as a double-press.
  //
  // A React onClick/onPointerDown stopPropagation CANNOT fix this: React 18
  // delegates events at the root container (an ANCESTOR of the card), so its
  // synthetic handler only runs AFTER the native bubble-phase listener on the
  // card has already fired. Two mechanisms that DO preempt it:
  //   1. framer's own claim — `propagate={{ tap: false }}` on an inner motion
  //      element makes that element's press add the pointerdown to framer's
  //      shared claimedPointerDownEvents WeakSet; the card's press (bubbling
  //      later, child→parent) sees the claim and returns early before scaling.
  //   2. a CAPTURE-phase stop for non-motion children — React's onPointerDownCapture
  //      runs at the root in the capture phase, i.e. BEFORE the event descends to
  //      the target and BEFORE it bubbles back to the card's native listener.
  // The inner controls' own whileTap, onClick, navigation and haptics are
  // untouched — only the card's whole-surface press is suppressed.
  const stopCardPressCapture = (e: PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <MotionCard
      aria-label={c.title}
      className="group relative bg-surface rounded-2xl overflow-hidden ring-1 ring-white/5 hover:ring-[hsl(var(--cream))]/30 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)] focus-within:ring-[hsl(var(--cream))]/40 transition-shadow duration-300"
    >
      {/* Stretched-link overlay: the ENTIRE card is one tap target. Sits
          beneath the explicit controls (relative z-10) so the wishlist
          heart, Notify button, and CTA stay independently clickable. */}
      {cardHref && (
        <Link
          to={cardHref}
          aria-label={`View ${c.title}`}
          className="absolute inset-0 z-[1] rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          tabIndex={-1}
        />
      )}
      <div className="relative pointer-events-none">
        {tier === "live_cohort" && c.thumbnail_url ? (
          // Live-cohort thumbnails are square brand LOGOS, so object-cover
          // crops them. Contain on a branded backdrop instead — kept out of
          // ArtworkImage (which enforces object-cover) so logos never crop.
          <div className="aspect-video bg-surface-2 relative flex items-center justify-center bg-gradient-to-br from-[hsl(var(--surface-2))] to-[hsl(var(--canvas))] p-6">
            <img
              src={c.thumbnail_url}
              alt={c.title}
              loading="lazy"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          // Photo thumbnails: ArtworkImage enforces aspect-ratio + object-cover
          // (kills letterboxing) and a branded placeholder for missing art
          // (kills black voids), with a bottom scrim for badge/text legibility.
          <ArtworkImage
            src={c.thumbnail_url}
            alt={c.title}
            aspect="video"
            scrim
          />
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <TierBadge tier={tier} />
          {isPopular && (
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase font-mono bg-gold text-cream-text">
              Popular
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 pointer-events-auto">
          {c.status === "upcoming" && (
            <span className="bg-foreground/80 text-background text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono">
              Coming Soon
            </span>
          )}
          {c.offering_id && (
            <MotionButton
              type="button"
              aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
              propagate={{ tap: false }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleWishlist(c.offering_id!);
                if (wishlisted) {
                  toast("Removed from wishlist");
                } else {
                  toast.success("Added to wishlist");
                }
              }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"
            >
              <Heart
                className={`h-4 w-4 transition-transform ${wishlisted ? "fill-gold text-gold heart-bounce" : "text-muted-foreground"}`}
              />
            </MotionButton>
          )}
        </div>
      </div>
      {/* Content layer above the stretched link; pointer-events-none on the
          wrapper so taps on empty space fall through to the card link. */}
      <div className="relative z-10 p-4 flex flex-col gap-1.5 pointer-events-none">
        {parsed ? (
          // Masterclass hierarchy: craft as eyebrow, instructor as headline,
          // kills the "X Teaches Y" + instructor-name redundancy/truncation.
          <>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              {parsed.craft}
            </p>
            <h3 className="text-lg font-semibold line-clamp-1">{parsed.name}</h3>
          </>
        ) : (
          <>
            <h3
              className={cn(
                "font-semibold line-clamp-1",
                tier === "workshop" ? "text-base" : "text-lg"
              )}
            >
              {c.title}
            </h3>
            {c.instructor_display_name && (
              <p className="text-sm text-muted-foreground line-clamp-1">
                {c.instructor_display_name}
              </p>
            )}
          </>
        )}
        <CourseRatingBadge courseId={c.id} />
        {c.offering_id && formatEnrolmentLabel(enrolmentCount) && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {isHotCourse(enrolmentCount) && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold" />
            )}
            {formatEnrolmentLabel(enrolmentCount)}
          </p>
        )}
        {tier !== "workshop" && description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
        )}
        {c.duration_text && (
          <p className="font-mono text-xs text-muted-foreground">{c.duration_text}</p>
        )}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
          <div className="flex items-baseline gap-2">
            {c.status === "upcoming" ? (
              <span className="text-sm font-medium text-muted-foreground">Upcoming</span>
            ) : tier === "live_cohort" ? (
              <span className="text-sm font-semibold text-[hsl(var(--cream))]">
                Application-only
              </span>
            ) : isNative() ? (
              // Native (iOS App Store anti-steering 3.1.1/3.1.3 + Play Reader
              // Rule): show no price or discount incentive, purchases happen
              // on the web. Mirrors the gating on every other card surface.
              null
            ) : c.price_inr != null ? (
              <>
                <span className="text-base font-semibold">
                  ₹{formatPrice(Number(c.price_inr))}
                </span>
                {c.mrp_inr && Number(c.mrp_inr) > Number(c.price_inr) && (
                  <>
                    <span className="text-sm text-muted-foreground line-through">
                      ₹{formatPrice(Number(c.mrp_inr))}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                      Save {Math.round((1 - Number(c.price_inr) / Number(c.mrp_inr)) * 100)}%
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Price TBA</span>
            )}
          </div>
          {c.status === "upcoming" ? (
            <MotionButton
              type="button"
              propagate={{ tap: false }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onNotify(c.id, c.title);
              }}
              disabled={notifyPending || notifyRequested}
              aria-label={
                notifyRequested
                  ? `You will be notified when ${c.title} launches`
                  : `Notify me when ${c.title} launches`
              }
              className="pointer-events-auto inline-flex items-center gap-1.5 text-sm font-semibold text-cream rounded-full border border-[hsl(var(--cream))]/30 bg-[hsl(var(--cream))]/5 px-3.5 min-h-[44px] sm:min-h-[36px] hover:bg-[hsl(var(--cream))]/10 transition-colors disabled:opacity-100 disabled:cursor-default"
            >
              {notifyRequested ? (
                <>
                  <Check className="h-3.5 w-3.5" /> We'll notify you
                </>
              ) : (
                <>
                  <Bell className="h-3.5 w-3.5" /> Notify me
                </>
              )}
            </MotionButton>
          ) : isEntitled ? (
            // Already enrolled → straight into the player surface.
            <MotionButton asChild propagate={{ tap: false }}>
              <Link
                to={`/courses/${c.id}`}
                aria-label={`Continue ${c.title}`}
                className="pointer-events-auto inline-flex items-center gap-1.5 text-sm font-semibold rounded-full bg-cream text-cream-text px-4 min-h-[44px] sm:min-h-[36px] hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Continue <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </MotionButton>
          ) : isAndroid() ? (
            // Path B (Google Play Reader Rule): non-entitled Android users get
            // the explicit "Continue on web" pill, opens the public offering
            // URL in the system browser.
            <span
              className="inline-flex pointer-events-auto"
              onPointerDownCapture={stopCardPressCapture}
            >
              <ContinueOnWebCTA
                variant="inline"
                className="pointer-events-auto"
                ctaLabel="View on web"
                webPath={c.offering_slug ? `/p/${c.offering_slug}` : "/"}
              />
            </span>
          ) : (
            // Web + iOS: an explicit "View" pill to the detail page. This is
            // marketing/detail navigation, not purchase/steering, so it's
            // allowed on iOS, it just doesn't expose price or buy UI.
            <MotionButton asChild propagate={{ tap: false }}>
              <Link
                to={cardHref ?? `/courses/${c.id}`}
                aria-label={`View ${c.title}`}
                className="pointer-events-auto inline-flex items-center gap-1.5 text-sm font-semibold rounded-full bg-cream text-cream-text px-4 min-h-[44px] sm:min-h-[36px] hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                View <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </MotionButton>
          )}
        </div>
      </div>
    </MotionCard>
  );
};

export default CatalogCard;
