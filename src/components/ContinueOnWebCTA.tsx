import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { isIOS } from "@/lib/platform";

/**
 * Android-only replacement for any Buy / Enrol / Pay / Register CTA.
 *
 * Google Play's "Reader Rule" (Path B) requires that the Android shell
 * contain no purchase UI whatsoever, not even price chips that look like
 * they could lead to checkout. Anywhere the web app would offer a paid
 * action, the Android build renders this card instead. It opens the
 * matching public URL in the system browser, where Razorpay handles the
 * actual transaction.
 *
 * Callers pass `webPath` (e.g. `/p/lokesh-masterclass`); this component
 * prepends `https://app.leveluplearning.in` so the browser launches the
 * canonical web origin, not a relative path that would re-open the
 * WebView.
 *
 * Two visual variants:
 *   - `card`  - full block with explanatory copy (use on offering pages,
 *               checkout pages, and other large primary surfaces).
 *   - `inline` - compact pill suitable for course-card grids.
 */

const WEB_ORIGIN = "https://app.leveluplearning.in";

interface Props {
  /** Path on the web origin, leading slash. e.g. `/p/lokesh-masterclass`. */
  webPath: string;
  /** Visual style. Default `card`. */
  variant?: "card" | "inline";
  /** Optional override for the button label. */
  ctaLabel?: string;
  /** Optional override for the explanatory body copy (card variant only). */
  body?: string;
  /** Extra classes for the outer container. */
  className?: string;
}

export default function ContinueOnWebCTA({
  webPath,
  variant = "card",
  ctaLabel = "Continue on web",
  body = "Enrolment takes about a minute on the LevelUp website, and your access syncs back to this app automatically.",
  className,
}: Props) {
  // Apple App Store anti-steering (Guidelines 3.1.1 / 3.1.3) forbids BOTH
  // in-app non-IAP purchase AND links that steer users to an external purchase
  // flow. The "Continue on web" link below is Google-compliant (Play Reader
  // Rule / Path B) but NOT permitted on iOS, so on iOS we render passive,
  // link-free, price-free copy. Already-entitled users keep full content access
  // elsewhere in the app; this surface simply stops being a purchase/steering
  // affordance. See src/lib/platform.ts (isIOS).
  if (isIOS()) {
    if (variant === "inline") return null;
    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-card/40 p-5",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">
          Everything you're enrolled in lives right here in the app: every
          lesson, ready whenever you are.
        </p>
      </div>
    );
  }

  // Always force a leading slash so we never end up with `https://app...path`.
  const normalised = webPath.startsWith("/") ? webPath : `/${webPath}`;
  const href = `${WEB_ORIGIN}${normalised}`;

  if (variant === "inline") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1 text-sm font-medium text-cream hover:underline min-h-[44px] sm:min-h-0",
          className,
        )}
      >
        {ctaLabel} <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/40 p-5 space-y-3",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{body}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-1.5 w-full h-11 rounded-md bg-cream text-cream-text font-semibold hover:opacity-90 transition-opacity"
      >
        {ctaLabel} <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}
