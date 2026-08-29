import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

/**
 * The document reader for chapter PDFs.
 *
 * WHY THIS REPLACED THE <iframe>: handing a .pdf URL to an iframe delegates
 * rendering to whatever the platform bundles. On iOS that is WKWebView's native
 * PDF plugin, which IGNORES the `#view=FitH&toolbar=0` open parameters
 * entirely — it paints the page at intrinsic size inside a fixed-height box, so
 * a student saw one zoomed-in fragment of slide 1 and could not scroll or zoom
 * out of it. The deck was effectively unreadable on a phone, which is where
 * most of them read it.
 *
 * Rendering to canvas ourselves makes the layout OURS on every platform: each
 * page is rasterised at the container's width and stacked vertically, so the
 * document scrolls in the normal page flow like any other reading surface —
 * no nested scroller to fight on touch, no native chrome to suppress.
 *
 * It is also what makes the file hard to lift: the browser is never handed a
 * PDF URL to display, so there is no native viewer, no download or print
 * button, and a right-click lands on a canvas. That is friction, not DRM —
 * anyone determined can still screenshot, and the signed URL is fetchable
 * within its TTL. It removes the casual path, which is what it is for.
 *
 * TRADE-OFF, stated plainly: canvas has no text layer, so a student cannot
 * select or search the text of a deck. For slide decks — what these actually
 * are — that is an acceptable loss and the protection is the point. If a
 * text-heavy handout ever needs selection, that is the reason to revisit.
 */

// Served verbatim from public/ by scripts/sync-pdf-worker.mjs. NOT imported:
// a `?url` import of a file inside node_modules makes Vite serve a ~300-byte
// ES module wrapper instead of the 1.1MB worker, the Worker fails to start,
// and pdf.js silently rasterises on the MAIN THREAD instead — which freezes
// the tab for seconds a page. Verified by transferSize on the request.
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

/** How long the first page may take before we hand the document back to the
 *  platform viewer. See the fallback note on ProtectedPdfViewer's props. */
const FIRST_PAGE_TIMEOUT_MS = 12000;

/** Retina without absurd canvases: iOS caps total canvas area, and a deck can
 *  be 40 pages. 2x is the visible ceiling for slide text anyway. */
const MAX_DPR = 2;

interface PageState {
  /** height / width, so a placeholder can hold the right space before render. */
  aspect: number;
}

function PdfPage({
  doc,
  pageNumber,
  width,
  aspect,
  onAspect,
  onPainted,
}: {
  doc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  width: number;
  aspect: number;
  onAspect: (n: number, a: number) => void;
  onPainted?: () => void;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber === 1);
  const [rendered, setRendered] = useState(false);

  // Render a page only once it is near the viewport. A 40-page deck otherwise
  // rasterises every page on open, which locks up a mid-range phone.
  useEffect(() => {
    if (visible) return;
    const el = holderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !width) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let task: any = null;

    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        onAspect(pageNumber, base.height / base.width);

        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const viewport = page.getViewport({ scale: (width / base.width) * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = "100%";
        canvas.style.height = "auto";

        task = page.render({ canvasContext: ctx, viewport });
        await task.promise;
        if (!cancelled) {
          setRendered(true);
          onPainted?.();
        }
      } catch (e) {
        // A cancelled render throws; that is not a failure worth surfacing.
        if (!cancelled && (e as { name?: string })?.name !== "RenderingCancelledException") {
          console.warn("pdf page render failed", pageNumber, e);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        task?.cancel();
      } catch {
        /* already settled */
      }
    };
  }, [doc, pageNumber, width, visible, onAspect, onPainted]);

  return (
    <div
      ref={holderRef}
      className="relative w-full overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5"
      style={{ aspectRatio: `1 / ${aspect}` }}
    >
      <canvas ref={canvasRef} className="block w-full" aria-label={`Page ${pageNumber}`} />
      {!rendered && <div className="absolute inset-0 animate-pulse bg-muted/40" aria-hidden="true" />}
    </div>
  );
}

export default function ProtectedPdfViewer({
  url,
  title,
  onUnavailable,
}: {
  url: string;
  title: string;
  /**
   * Called when the first page has not rasterised within
   * FIRST_PAGE_TIMEOUT_MS. Canvas rendering needs a working Web Worker and a
   * few APIs the worker↔page bridge relies on; where any of that is missing
   * or blocked, pdf.js neither resolves nor rejects — it just never paints,
   * and a student would sit in front of a skeleton forever. The caller uses
   * this to fall back to the platform's own PDF view, which is worse but is
   * exactly what shipped before this component, so the floor never drops.
   */
  onUnavailable?: () => void;
}) {
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Track the render width so pages re-rasterise crisply on rotate/resize.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const set = () => setWidth(el.clientWidth);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    setDoc(null);
    setPages([]);
    const task = pdfjsLib.getDocument({ url, isEvalSupported: false });
    task.promise
      .then((d) => {
        if (cancelled) {
          d.destroy();
          return;
        }
        setDoc(d);
        // A4 portrait until each page reports its own shape.
        setPages(Array.from({ length: d.numPages }, () => ({ aspect: 1.414 })));
      })
      .catch(() => {
        if (cancelled) return;
        if (onUnavailable) onUnavailable();
        else setErr("This document couldn't be opened. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [url, onUnavailable]);

  // Watchdog: pdf.js can hang without erroring, so absence of a paint is the
  // only signal available. Cleared by the first page reporting in.
  const firstPaintRef = useRef(false);
  useEffect(() => {
    if (!doc || !onUnavailable) return;
    const t = setTimeout(() => {
      if (!firstPaintRef.current) {
        console.warn("ProtectedPdfViewer: first page did not render; falling back to the platform viewer");
        onUnavailable();
      }
    }, FIRST_PAGE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [doc, onUnavailable]);

  const notePainted = useCallback(() => {
    firstPaintRef.current = true;
  }, []);

  const handleAspect = useCallback((n: number, a: number) => {
    setPages((prev) => {
      if (!prev[n - 1] || Math.abs(prev[n - 1].aspect - a) < 0.001) return prev;
      const next = [...prev];
      next[n - 1] = { aspect: a };
      return next;
    });
  }, []);

  if (err) {
    return (
      <div className="w-full rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {err}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="w-full select-none"
      // Removes the obvious "Save image as…" path on the rasterised pages.
      onContextMenu={(e) => e.preventDefault()}
    >
      {doc && pages.length > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {pages.length} {pages.length === 1 ? "page" : "pages"} · scroll to read
        </p>
      )}
      <div className="flex flex-col gap-3">
        {!doc && (
          <div className="w-full rounded-xl bg-muted/40 animate-pulse" style={{ aspectRatio: "1 / 1.414" }} />
        )}
        {doc &&
          pages.map((p, i) => (
            <PdfPage
              key={i}
              doc={doc}
              pageNumber={i + 1}
              width={width}
              aspect={p.aspect}
              onAspect={handleAspect}
              onPainted={notePainted}
            />
          ))}
      </div>
      <span className="sr-only">{title}</span>
    </div>
  );
}
