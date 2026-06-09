import VdoCipherPlayer from "@/components/VdoCipherPlayer";
import type { Chapter } from "@/components/chapter/types";

interface Props {
  chapter: Chapter;
  updateProgress: (currentSeconds: number, durationSeconds: number) => void;
  lastPosition: number;
}

/**
 * Renders a chapter's primary media based on content_type — VdoCipher DRM, HLS
 * (.m3u8 / WebinarKit), Vimeo / YouTube / generic iframe, PDF, image, embedded,
 * article placeholder, or a "not available" fallback. Extracted verbatim from
 * ChapterViewer; behaviour unchanged.
 */
export default function ChapterMediaPlayer({ chapter, updateProgress, lastPosition }: Props) {
  return chapter.content_type === "video" && (chapter as any).video_type === "vdocipher" && (chapter as any).vdocipher_video_id ? (
    <div className="w-full max-w-full rounded-2xl overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] ring-1 ring-white/5">
      <VdoCipherPlayer chapterId={chapter.id} onProgress={updateProgress} startPosition={lastPosition} title={chapter.title} />
    </div>
  ) : chapter.content_type === "video" && (chapter.media_url || chapter.embed_url) ? (
    <div className="aspect-video w-full max-w-full bg-card rounded-2xl overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] ring-1 ring-white/5">
      {(() => {
        // Multi-source dispatcher. Respects `media_provider` if set
        // (post-TagMango-migration chapters explicitly tag their
        // provider). Falls back to URL-pattern detection for older
        // rows where media_provider defaulted to vdocipher.
        const url = chapter.embed_url || chapter.media_url || "";
        const provider = (chapter as any).media_provider || "";

        // HLS playlists (Bunny CDN from WebinarKit, or any .m3u8)
        // render in a <video> tag — iframe wouldn't be able to play
        // m3u8 natively. Safari + iOS handle this directly; Chrome
        // gets dynamic hls.js fallback.
        const isHls = /\.m3u8(\?|$)/i.test(url) || provider === "webinarkit";
        if (isHls) {
          return (
            <video
              key={url}
              controls
              playsInline
              preload="metadata"
              className="w-full h-full bg-black"
              title={chapter.title}
              onLoadedMetadata={(e) => {
                // Safari / iOS play m3u8 natively. For Chrome/Firefox
                // dynamic-import hls.js and attach if needed.
                const v = e.currentTarget as HTMLVideoElement;
                if (v.canPlayType("application/vnd.apple.mpegurl")) return;
                if (v.src === url) return; // already attached
                import("hls.js").then(({ default: Hls }) => {
                  if (!Hls.isSupported()) { v.src = url; return; }
                  const hls = new Hls();
                  hls.loadSource(url);
                  hls.attachMedia(v);
                }).catch(() => { v.src = url; });
              }}
              src={url}
            />
          );
        }

        // Vimeo / YouTube / generic iframe.
        let src = url;
        const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
        if (vimeoMatch) src = `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=0&title=0&byline=0&portrait=0`;
        else if (provider === "vimeo" && /^\d+$/.test(url)) {
          // media_provider='vimeo' with raw numeric ID (no full URL)
          src = `https://player.vimeo.com/video/${url}?autoplay=0&title=0&byline=0&portrait=0`;
        } else {
          const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
          if (ytMatch) src = `https://www.youtube.com/embed/${ytMatch[1]}`;
          else if (provider === "youtube" && /^[a-zA-Z0-9_-]{6,15}$/.test(url)) {
            src = `https://www.youtube.com/embed/${url}`;
          }
        }

        return (
          <iframe
            src={src}
            className="w-full max-w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            frameBorder="0"
            title={chapter.title}
          />
        );
      })()}
    </div>
  ) : chapter.content_type === "pdf" && chapter.media_url ? (
    <div className="w-full rounded-2xl border border-border overflow-hidden bg-card h-[55vh] sm:h-[80vh]">
      <iframe src={chapter.media_url} className="w-full h-full" title={`${chapter.title} — PDF`} />
    </div>
  ) : chapter.content_type === "image" && chapter.media_url ? (
    <div className="w-full rounded-2xl border border-border overflow-hidden bg-card flex items-center justify-center p-4">
      <img src={chapter.media_url} alt={chapter.title} className="max-w-full max-h-[80vh] object-contain rounded-lg" />
    </div>
  ) : chapter.content_type === "embedded" && chapter.embed_url ? (
    <div className="aspect-video bg-card rounded-2xl border border-border overflow-hidden">
      <iframe src={chapter.embed_url} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen frameBorder="0" title={chapter.title} />
    </div>
  ) : chapter.content_type === "article" || chapter.content_type === "text" ? (
    <div className="bg-card rounded-2xl border border-border p-8 flex items-center gap-4">
      <div className="text-3xl">📄</div>
      <div>
        <p className="font-medium">{chapter.title}</p>
        <p className="text-muted-foreground text-sm mt-1">Scroll down to read the article content</p>
      </div>
    </div>
  ) : (
    <div className="aspect-video bg-card rounded-2xl border border-border flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-2">📚</div>
        <p className="text-muted-foreground text-sm">{chapter.title}</p>
        <p className="text-muted-foreground/60 text-xs mt-1">Content not available</p>
      </div>
    </div>
  );
}
