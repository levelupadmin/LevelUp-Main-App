import { memo } from "react";
import { WALL, wallSrc, type WallPhoto } from "./photos";

interface PhotoWallProps {
  /** 3 on a phone, 5 on the desktop half of the window */
  cols: 3 | 5;
  className: string;
  onCaption: (caption: string) => void;
}

/**
 * The drifting wall of LevelUp's own photos. Each column renders its list
 * twice and slides by half its height, linear and infinite, so the loop has
 * no seam (firstopen.css: driftUp / driftDown). The second copy is hidden
 * from assistive tech and the tab order. Transform-only, paused while the
 * page is hidden (StageLogin toggles .is-paused).
 */
function PhotoWallImpl({ cols, className, onCaption }: PhotoWallProps) {
  const columns: WallPhoto[][] = Array.from({ length: cols }, () => []);
  WALL.forEach((p, k) => columns[k % cols].push(p));
  // Each half of the loop must be taller than the wall, or the loop's end
  // shows a hole: the five desktop columns repeat their photos once more.
  const half = (c: WallPhoto[]) => (cols > 3 ? c.concat(c) : c);

  const tile = (p: WallPhoto, key: string, dupe: boolean) => (
    <button
      key={key}
      type="button"
      className="wl-ph"
      style={{ aspectRatio: `${p.w} / ${p.h}` }}
      onClick={() => onCaption(p.cap)}
      tabIndex={dupe ? -1 : undefined}
      aria-hidden={dupe ? true : undefined}
      aria-label={dupe ? undefined : p.cap}
    >
      <img src={wallSrc(p)} alt="" decoding="async" loading={dupe ? "lazy" : "eager"} />
      <span>{p.cap}</span>
    </button>
  );

  return (
    <div className={className}>
      <div className="wl-cols">
        {columns.map((c, ci) => {
          const first = half(c);
          return (
            <div className="wl-col" key={ci}>
              <div className="wl-track">
                {first.map((p, i) => tile(p, `a${i}`, i >= c.length))}
                {first.map((p, i) => tile(p, `b${i}`, true))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const PhotoWall = memo(PhotoWallImpl);
