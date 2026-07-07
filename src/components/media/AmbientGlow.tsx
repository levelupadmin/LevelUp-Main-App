import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AmbientGlowProps {
  /**
   * Source image whose blurred, desaturated copy forms the glow.
   *
   * ⚠️ CALLER CONTRACT — pass a THUMBNAIL-sized source, never a full-res
   * original. The glow box is scaled up ~10x over a `filter` (blur), which on
   * Blink/Android (System WebView + Chrome) can rasterise the filtered element
   * at its DISPLAYED size and decode the *full-resolution* source bitmap into
   * that buffer — a large image blows the GPU compositing/memory budget even
   * though only a blurred smudge is visible. Feed the same small thumbnail you
   * already have (e.g. a card poster / `thumbnail_url`), or a dedicated
   * downscaled variant via {@link AmbientGlowProps.srcSmall}. Target ≲ 320px on
   * the long edge.
   */
  src?: string | null;
  /**
   * Optional dedicated small (thumbnail-sized) source for the glow, preferred
   * over `src` when supplied. Use this when `src` is (or might be) a full-res
   * original — pass a downscaled variant here so the scaled+blurred box never
   * decodes a large bitmap. See the caller contract on {@link
   * AmbientGlowProps.src}.
   */
  srcSmall?: string | null;
  /**
   * Optional intrinsic width hint (px) forwarded to the glow `<img>` so the
   * browser can pick/allot a small decode buffer. Keep it small (≲ 320) — it
   * documents and reinforces the thumbnail-source contract.
   */
  width?: number;
  /** Foreground content rendered above the glow. */
  children?: ReactNode;
  /** className applied to the positioned wrapper. */
  className?: string;
  /** Opacity of the glow layer (default 0.25). */
  intensity?: number;
  /**
   * Saturation of the blurred glow copy (CSS `saturate()` amount, default 0.6 —
   * a muted, cinematic wash). Raise it toward 1 (or beyond) when the halo sits
   * over a very dark poster on a near-black surface, where a heavily desaturated
   * bloom collapses into the black and stops reading. Only the desaturation is
   * tuned here — blur stays capped at `blur-md` on the single small copy, so the
   * Android WebView compositing budget is unchanged.
   */
  saturate?: number;
}

/**
 * Renders a blurred, scaled, desaturated copy of an image behind its children
 * for a soft "spotlight" halo. The glow is a real `<img>` (not
 * `backdrop-filter`, which is expensive on Android WebView compositing).
 *
 * Performance: the blur is applied to a SMALL scaled-down copy rather than the
 * full-resolution image. A 10%-size box (`w-[10%] h-[10%]`) holds the img,
 * which is then scaled back up ~10x with `transform: scale`. The browser only
 * rasterises and blurs the tiny 10% buffer before the composited scale-up, so
 * the GPU blur cost stays low on Android WebView. A modest `blur-md` on the
 * tiny copy reads like a heavy blur once scaled, without the full-res 40px
 * filter pass. `aria-hidden` + `pointer-events-none` keep it purely
 * decorative. Renders nothing extra when neither source is present.
 *
 * Compositing: the scaled box carries `transform-gpu` (→ `translateZ(0)`) so
 * Blink promotes it to its own composited layer and rasterises the blur at the
 * small pre-scale size instead of the displayed (scaled-up) size — the
 * Blink/Android failure mode where a large scaled filtered element decodes the
 * full-res bitmap. `transform-gpu` alone is the cheap, always-on promotion here;
 * `will-change-transform` is deliberately NOT used — it keeps a permanent
 * composited layer alive on a purely decorative element, adding to the Android
 * WebView layer/memory budget for no benefit on a static (non-animating) glow.
 * `contain-[layout_paint]` walls the decorative layer off from the rest of the
 * subtree.
 *
 * ⚠️ CALLERS MUST pass a thumbnail-sized `src` (or `srcSmall`), NOT a full-res
 * original — see {@link AmbientGlowProps.src}. Compositing hints reduce, but do
 * not eliminate, the cost of a large source bitmap.
 */
export const AmbientGlow = ({
  src,
  srcSmall,
  width,
  children,
  className,
  intensity = 0.25,
  saturate = 0.6,
}: AmbientGlowProps) => {
  const glowSrc = srcSmall ?? src;
  return (
    <div className={cn("relative isolate", className)}>
      {glowSrc && (
        // 10% box, centred, scaled back up so the blur only touches a small
        // rasterised copy. `transform-gpu` forces a composited layer so
        // Blink/Android rasterises the blur at the small pre-scale size, not the
        // displayed scaled-up size; `contain` walls the decorative layer off from
        // the rest of the subtree. No `will-change` — the glow never animates, so a
        // permanent composited layer would only cost Android WebView memory.
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[10%] w-[10%] origin-center -translate-x-1/2 -translate-y-1/2 scale-[10.5] transform-gpu"
          style={{ contain: "layout paint" }}
          aria-hidden="true"
        >
          <img
            src={glowSrc}
            alt=""
            aria-hidden="true"
            role="presentation"
            width={width}
            // Saturation is driven off the `saturate` prop via Tailwind's own
            // `--tw-saturate` custom property so the `blur-md` filter chain still
            // composes it (identical to a static `saturate-[…]` class, but
            // tunable per caller). Blur stays capped at `blur-md`.
            className="pointer-events-none h-full w-full object-cover blur-md"
            style={
              {
                opacity: intensity,
                "--tw-saturate": `saturate(${saturate})`,
              } as CSSProperties
            }
            loading="lazy"
            decoding="async"
          />
        </div>
      )}
      {children}
    </div>
  );
};

export default AmbientGlow;
