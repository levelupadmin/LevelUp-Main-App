import { useCallback, useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Aspect presets mapped to Tailwind aspect-ratio utilities. */
const ASPECT_CLASS = {
  video: "aspect-video", // 16:9
  poster: "aspect-[2/3]", // portrait key-art
  square: "aspect-square", // 1:1
} as const;

export type ArtworkAspect = keyof typeof ASPECT_CLASS;

interface ArtworkImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onLoad" | "onError"> {
  /** Image source. When missing/empty the branded placeholder renders instead. */
  src?: string | null;
  /** Required alt text (empty string allowed for decorative usage). */
  alt: string;
  /** Aspect-ratio preset — reserves box dimensions so there is no CLS. */
  aspect?: ArtworkAspect;
  /** Render a bottom-up scrim gradient for text legibility over the image. */
  scrim?: boolean;
  /**
   * Above-the-fold treatment for the LCP image (hero / first card). When true
   * the image loads eagerly with `fetchpriority="high"` so it isn't deferred by
   * lazy-loading — avoiding a late fade-in on the largest contentful paint.
   * Defaults to false (lazy) for everything below the fold.
   */
  priority?: boolean;
  /** className applied to the outer aspect-ratio wrapper. */
  className?: string;
}

/**
 * Branded champagne-on-black placeholder shown when the source is missing or
 * fails to load. Pure inline SVG (LevelUp "L" monogram) — no asset dependency.
 *
 * When `alt` is non-empty the placeholder stands in for the image, so it exposes
 * `role="img"` + `aria-label={alt}` — a screen reader still announces the
 * artwork's meaning even though the source failed to load. With an empty `alt`
 * (decorative usage) it stays `aria-hidden` so it adds no noise.
 */
const ArtworkPlaceholder = ({
  className,
  alt,
}: {
  className?: string;
  alt?: string;
}) => {
  const hasAccessibleName = typeof alt === "string" && alt !== "";
  return (
  <div
    className={cn(
      "absolute inset-0 grid place-items-center bg-gradient-to-br from-black via-black to-cream/15",
      className,
    )}
    {...(hasAccessibleName
      ? { role: "img", "aria-label": alt }
      : { "aria-hidden": "true" as const })}
    data-testid="artwork-placeholder"
  >
    <svg
      viewBox="0 0 48 48"
      className="h-1/3 w-1/3 max-h-16 max-w-16 text-cream/40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M16 12v24h16"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
  );
};

/**
 * App-wide image treatment. Enforces `aspect-ratio` + `object-cover` (kills
 * letterboxing), applies the `.dark-img` filter, fades in on load without
 * layout shift (dimensions reserved by the wrapper), and falls back to a
 * branded placeholder on error or missing src.
 */
export const ArtworkImage = ({
  src,
  alt,
  aspect = "video",
  scrim = false,
  priority = false,
  className,
  ...imgProps
}: ArtworkImageProps) => {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Normalise the source before deciding whether to render the placeholder.
  // `!src` only catches null/undefined/"" — but a DB `thumbnail_url` can be a
  // blank/whitespace-only string (never backfilled, since the thumbnail
  // backfill only fills strictly-NULL rows, and set to " " by a failed upload).
  // A " " string is truthy, so it slipped through as a real <img src=" ">,
  // which resolves to the document URL, decodes as a non-image, and reads as a
  // black void until onError eventually swaps in the placeholder. Trimming to
  // empty here treats that missing-art case as missing immediately, so the
  // branded champagne monogram renders instead of the void. (A genuinely valid
  // URL that points at black/near-empty image CONTENT can't be detected here —
  // that's a data artifact to fix at the source, not in this component.)
  const usableSrc = typeof src === "string" ? src.trim() : src;
  const showPlaceholder = !usableSrc || errored;

  // Cached-image guard. The fade-in is gated on `loaded`, which is only ever
  // flipped by the `load` event. But when the browser already has the image in
  // its HTTP cache it can finish decoding and set `img.complete` BEFORE React
  // attaches the onLoad listener during commit — so the `load` event is missed,
  // `loaded` stays false, and the <img> is pinned at opacity-0 over the black
  // wrapper. That reads as a missing-art black void even though the artwork is
  // present and valid (repro: any card whose thumbnail is already cached, e.g.
  // the Creator Academy cohort tile on Learn's Recommended rail — it renders
  // fine on a cold load, black on a warm/revisited one). A ref callback runs on
  // mount, after the DOM node's src is set, and reconciles from `complete`:
  // a decoded image (naturalWidth > 0) is marked loaded so it fades in; a
  // cached-but-broken one (naturalWidth === 0, i.e. an errored response served
  // from cache) falls back to the branded placeholder. onLoad/onError still fire
  // for the normal cold-load path; setting the same state twice is harmless.
  const reconcileCachedImage = useCallback((node: HTMLImageElement | null) => {
    if (!node || !node.complete) return;
    if (node.naturalWidth > 0) setLoaded(true);
    else setErrored(true);
  }, []);

  // Use the lowercase DOM attribute name so it passes through as a plain HTML
  // attribute across React versions, and omit the key entirely when not a
  // priority image (avoids emitting `fetchpriority` at all below the fold).
  const priorityAttrs: Record<string, string> = priority
    ? { fetchpriority: "high" }
    : {};

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-black",
        ASPECT_CLASS[aspect],
        className,
      )}
    >
      {showPlaceholder ? (
        <ArtworkPlaceholder alt={alt} />
      ) : (
        <img
          ref={reconcileCachedImage}
          src={usableSrc as string}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          {...priorityAttrs}
          decoding="async"
          className={cn(
            "dark-img absolute inset-0 h-full w-full object-cover transition-opacity duration-slow ease-out-expo",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          {...imgProps}
        />
      )}

      {scrim && !showPlaceholder && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent"
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default ArtworkImage;
