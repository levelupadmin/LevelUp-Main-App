import type { CSSProperties } from "react";

/**
 * The LevelUp wordmark, rebuilt for animation: letter paths are the official
 * wordmark; the rising line above "Up" is drawn as real strokes (rings and
 * lines) so it can draw itself. `Graph` is just the rising line.
 */
const LETTERS = [
  "M14.205 43.1576H0V24.1143H4.35524V39.5162H14.205V43.1576Z",
  "M28.7699 36.9215H18.3934C18.6424 39.7357 19.8641 40.5644 21.4999 40.5644C23.0263 40.5644 24.0528 39.7273 24.3018 38.3563H28.6033C27.7988 41.7514 25.0238 43.5461 21.4175 43.5461C17.2844 43.5461 14.0381 41.0349 14.0381 35.8451C14.0381 31.4287 17.0067 28.062 21.6951 28.062C26.4071 28.062 28.8523 31.6212 28.8523 35.5404C28.8486 36.0019 28.821 36.4629 28.7699 36.9215ZM18.5045 34.1893H24.3305C24.0814 32.1184 23.1104 31.042 21.4999 31.042C19.9466 31.042 18.8646 32.0079 18.5045 34.1893Z",
  "M38.8122 43.1577H34.0413L28.2422 28.4487H33.0703L36.4815 39.8211L39.8674 28.4504H44.5794L38.8122 43.1577Z",
  "M57.9229 36.9215H47.5514C47.8022 39.7357 49.0223 40.5644 50.6597 40.5644C52.1844 40.5644 53.2109 39.7273 53.4616 38.3563H57.7547C56.9502 41.7514 54.1752 43.5461 50.5688 43.5461C46.4357 43.5461 43.1895 41.0349 43.1895 35.8451C43.1895 31.4287 46.158 28.062 50.8465 28.062C55.5585 28.062 58.0037 31.6212 58.0037 35.5404C58.0005 36.0018 57.9735 36.4628 57.9229 36.9215ZM47.6574 34.1893H53.4836C53.2345 32.1184 52.2634 31.042 50.6546 31.042C49.1047 31.042 48.0226 32.0079 47.6574 34.1893Z",
  "M63.281 38.1349C63.281 38.7694 63.281 39.1009 63.3096 39.4877C63.3921 40.1573 63.6984 40.3699 65.0026 40.3146V43.2678C64.1361 43.3596 63.2655 43.406 62.3941 43.4067C60.3125 43.4067 59.0924 42.6066 58.9813 40.6746C58.9258 39.9564 58.9258 39.2382 58.9258 38.217V22.8735H63.281V38.1349Z",
  "M91.6325 35.6894C91.6325 36.9216 91.6325 37.69 91.516 39.0762C91.2062 43.5394 88.0729 47.4268 80.2598 47.4268C72.4459 47.4268 69.3124 43.5394 68.9641 39.0762C68.8867 37.69 68.8867 36.9216 68.8867 35.6894V20.3359H74.9198V36.5751C74.9198 37.3066 74.9197 37.8056 74.9584 38.3446C75.1906 41.2308 76.9309 42.9635 80.2575 42.9635C83.5848 42.9635 85.3251 41.2308 85.5183 38.3446C85.5873 37.7574 85.6134 37.166 85.5958 36.5751V20.3359H91.6302L91.6325 35.6894Z",
  "M115 36.9434C115 44.2828 110.505 48.1048 105.239 48.1048C103.556 48.1048 101.512 47.6846 100.475 47.035L99.1289 44.8939V55.0558H93.0938V27.1965H99.1267V30.2552L100.667 27.9985C101.82 27.1195 103.864 26.6592 105.931 26.6592C111.58 26.6609 115 30.9483 115 36.9434ZM108.813 37.3251C108.813 33.3071 106.855 30.796 104.01 30.796C101.246 30.796 99.1305 32.4784 99.1305 37.1409V38.0583C99.1305 42.4546 101.512 43.9831 103.817 43.9831C106.739 43.9764 108.813 41.7598 108.813 37.3251Z",
];
const NODES: [number, number][] = [[71.95, 15.5], [85.64, 5.12], [98.44, 13.43], [111.66, 3.3]];
const LINKS: [number, number, number, number][] = [[74.02, 14.02, 82.93, 5.94], [88.09, 5.55, 96.22, 12.45], [101.12, 13.13, 110.03, 5.06]];

const iStyle = (i: number) => ({ ["--i" as string]: i }) as CSSProperties;

function GraphG({ ripples = false }: { ripples?: boolean }) {
  return (
    <g className="lg-graph">
      {LINKS.map(([x1, y1, x2, y2], i) => (
        <line key={`l${i}`} className="lg-link" style={iStyle(i)} x1={x1} y1={y1} x2={x2} y2={y2} pathLength={1} />
      ))}
      {NODES.map(([cx, cy], i) => (
        <g key={`n${i}`}>
          {ripples && <circle className="lg-ripple" style={iStyle(i)} cx={cx} cy={cy} r={2.63} />}
          <circle className="lg-node" style={iStyle(i)} cx={cx} cy={cy} r={2.63} pathLength={1} />
        </g>
      ))}
    </g>
  );
}

export function Logo({ className, decorative }: { className?: string; decorative?: boolean }) {
  return (
    <svg className={`lu-logo${className ? ` ${className}` : ""}`} viewBox="0 0 115 56"
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "LevelUp Learning" })}>
      <g className="lg-word">
        {LETTERS.map((d, i) => <path key={i} className={`lg-ch ${i < 5 ? "lg-level" : "lg-up"}`} style={iStyle(i)} d={d} pathLength={1} />)}
      </g>
      <GraphG />
    </svg>
  );
}

export function Graph({ className, ripples }: { className?: string; ripples?: boolean }) {
  return (
    <svg className={`lu-graph${className ? ` ${className}` : ""}`} viewBox="67.5 -1.2 48.8 21.4" aria-hidden="true">
      <GraphG ripples={ripples} />
    </svg>
  );
}

export function Loader({ className }: { className?: string }) {
  return <span className={`lu-loader${className ? ` ${className}` : ""}`}><Graph /></span>;
}
