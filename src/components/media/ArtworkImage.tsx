import { useState, type ImgHTMLAttributes } from "react";
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
 */
const ArtworkPlaceholder = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "absolute inset-0 grid place-items-center bg-gradient-to-br from-black via-black to-cream/15",
      className,
    )}
    aria-hidden="true"
    data-testid="artwork-placeholder"
  >
    <svg
      viewBox="0 0 48 48"
      className="h-1/3 w-1/3 max-h-16 max-w-16 text-cream/40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
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

  const showPlaceholder = !src || errored;

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
        <ArtworkPlaceholder />
      ) : (
        <img
          src={src}
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
