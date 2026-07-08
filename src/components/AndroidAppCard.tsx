import { Play, Star } from "lucide-react";
import { isNative } from "@/lib/platform";

// LevelUp's live Android app (the TagMango-published shell, ~2k installs).
// Tweak these as the real Play Store numbers grow. RATING stays null until we
// want to surface a confirmed score, we never render a fabricated star rating
// on a public page.
const PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.tagmango.leveluplearning";
const INSTALL_LABEL = "2,000+";
const RATING: number | null = null; // e.g. 4.7 once confirmed in Play Console

/**
 * Compact "Also on Android" card for the public offering page. Links to the
 * Play Store listing as social proof / a second install path. Hidden inside the
 * Android app itself (no point advertising the app you're already in), which
 * also keeps it clear of the Reader-Rule purchase surfaces.
 */
export default function AndroidAppCard({ className = "" }: { className?: string }) {
  if (isNative()) return null;

  return (
    <a
      href={PLAY_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Get the LevelUp app on Google Play (opens in a new tab)"
      className={`group flex items-center gap-4 rounded-2xl border border-border bg-[hsl(var(--surface))] px-4 py-3.5 transition-colors hover:border-[hsl(var(--cream))]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--canvas))] ${className}`}
    >
      <span className="shrink-0 grid place-items-center h-11 w-11 rounded-xl bg-black ring-1 ring-white/10">
        <Play className="h-5 w-5 translate-x-[1px] fill-white text-white" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Also on Android</p>
        <p className="text-[12px] text-muted-foreground">
          Join {INSTALL_LABEL} learners on the LevelUp app
          {RATING != null && (
            <>
              {" "}&middot;{" "}
              <span className="inline-flex items-center gap-0.5 align-middle">
                <Star className="h-3 w-3 fill-[hsl(var(--gold))] text-[hsl(var(--gold))]" />
                {RATING.toFixed(1)}
              </span>
            </>
          )}
        </p>
      </div>

      <span className="shrink-0 text-[11px] font-mono uppercase tracking-wider text-cream group-hover:underline">
        Get it on Google&nbsp;Play&nbsp;↗
      </span>
    </a>
  );
}
