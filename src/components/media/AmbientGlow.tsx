import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AmbientGlowProps {
  /** Source image whose blurred, desaturated copy forms the glow. */
  src?: string | null;
  /** Foreground content rendered above the glow. */
  children?: ReactNode;
  /** className applied to the positioned wrapper. */
  className?: string;
  /** Opacity of the glow layer (default 0.25). */
  intensity?: number;
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
 * decorative. Renders nothing extra when `src` is absent.
 */
export const AmbientGlow = ({
  src,
  children,
  className,
  intensity = 0.25,
}: AmbientGlowProps) => (
  <div className={cn("relative isolate", className)}>
    {src && (
      // 10% box, centred, scaled back up so the blur only touches a small
      // rasterised copy (cheap Android WebView compositing).
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[10%] w-[10%] origin-center -translate-x-1/2 -translate-y-1/2 scale-[10.5]"
        aria-hidden="true"
      >
        <img
          src={src}
          alt=""
          aria-hidden="true"
          role="presentation"
          className="pointer-events-none h-full w-full object-cover blur-md saturate-[0.6]"
          style={{ opacity: intensity }}
          loading="lazy"
          decoding="async"
        />
      </div>
    )}
    {children}
  </div>
);

export default AmbientGlow;
