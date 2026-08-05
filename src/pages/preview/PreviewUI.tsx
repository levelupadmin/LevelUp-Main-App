/**
 * Presentational atoms for the Creator Studio prototype.
 *
 * These deliberately use the app's own semantic tokens (`--cream`, `--gold`,
 * `--accent-*`, `--border`) rather than literal hex, so the prototype reads as
 * THIS app rather than as a mockup pasted into it. If a token changes, the
 * prototype changes with it — which is the point: we're testing the real look.
 */
import type { ReactNode } from "react";
import { FileText, Instagram, Youtube, HardDrive, Link2, Play } from "lucide-react";

/* ── primitives ─────────────────────────────────────────────────────────── */

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[hsl(var(--muted-foreground))]">
      {children}
    </div>
  );
}

type ChipTone = "neutral" | "cream" | "gold" | "success" | "violet" | "danger";

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "border-[hsl(var(--border-hover))] text-[hsl(var(--muted-foreground))]",
  cream: "border-[hsl(var(--cream)/0.34)] text-[hsl(var(--cream))]",
  gold: "border-[hsl(var(--gold)/0.4)] text-[hsl(var(--gold))]",
  success: "border-[hsl(var(--success)/0.4)] text-[hsl(var(--success))]",
  violet: "border-[hsl(var(--accent-violet)/0.45)] text-[hsl(var(--accent-violet))]",
  danger: "border-[hsl(var(--destructive)/0.45)] text-[hsl(var(--destructive-text))]",
};

export function Chip({
  children,
  tone = "neutral",
  solid = false,
}: {
  children: ReactNode;
  tone?: ChipTone;
  solid?: boolean;
}) {
  if (solid) {
    return (
      <span className="inline-flex items-center rounded-full bg-[hsl(var(--cream))] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--cream-text))]">
        {children}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  tone = "plain",
  className = "",
}: {
  children: ReactNode;
  tone?: "plain" | "lit" | "success" | "locked";
  className?: string;
}) {
  const tones = {
    plain: "border-[hsl(var(--border))] bg-[hsl(var(--card))]",
    lit: "border-[hsl(var(--cream)/0.3)] bg-[hsl(var(--card))] bg-gradient-to-b from-[hsl(var(--cream)/0.06)] to-transparent",
    success:
      "border-[hsl(var(--success)/0.32)] bg-[hsl(var(--card))] bg-gradient-to-b from-[hsl(var(--success)/0.07)] to-transparent",
    locked: "border-[hsl(var(--border))] bg-black/40",
  } as const;
  return <div className={`rounded-xl border p-3.5 ${tones[tone]} ${className}`}>{children}</div>;
}

export function Btn({
  children,
  variant = "primary",
  onClick,
  disabled,
}: {
  children: ReactNode;
  variant?: "primary" | "outline" | "quiet";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const styles = {
    primary:
      "bg-gradient-to-b from-[hsl(var(--champagne-from))] to-[hsl(var(--champagne-to))] text-[hsl(var(--cream-text))]",
    outline: "border border-[hsl(var(--border-hover))] text-[hsl(var(--foreground))]",
    quiet: "border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-[var(--radius)] px-3 py-2.5 text-[13px] font-semibold tracking-[-0.01em] transition-transform active:scale-[0.985] disabled:opacity-45 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function Avatar({ initials }: { initials: string }) {
  return (
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
      {initials}
    </div>
  );
}

/* ── the link card ───────────────────────────────────────────────────────── */

const LINK_LOOKS = {
  youtube: { Icon: Youtube, tint: "hsl(var(--accent-crimson))", art: "from-[#2a1414] to-[#0b0b0d]" },
  instagram: { Icon: Instagram, tint: "hsl(var(--accent-violet))", art: "from-[#241a2e] to-[#0b0b0d]" },
  drive: { Icon: HardDrive, tint: "hsl(var(--accent-emerald))", art: "from-[#12241d] to-[#0b0b0d]" },
  generic: { Icon: Link2, tint: "hsl(var(--muted-foreground))", art: "from-[#17171c] to-[#0b0b0d]" },
} as const;

/**
 * A pasted link, rendered as the thing it points at.
 *
 * The raw URL is intentionally NOT displayed. A feed of naked URLs reads as
 * spam; a feed of thumbnails reads as a body of work — and the whole reason
 * students post links instead of files is that we don't want to host their
 * video. This card is what makes the cheap path also the nice path.
 */
export function LinkPreviewCard({
  kind,
  title,
  site,
  duration,
}: {
  kind: keyof typeof LINK_LOOKS;
  title: string;
  site: string;
  duration?: string;
}) {
  const { Icon, tint, art } = LINK_LOOKS[kind];
  const isVideo = kind === "youtube" || kind === "instagram";
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--border))]">
      <div className={`relative grid h-36 place-items-center bg-gradient-to-br ${art}`}>
        {isVideo && (
          <div className="grid h-11 w-11 place-items-center rounded-full bg-black/55 backdrop-blur-sm">
            <Play className="h-4 w-4 fill-white text-white" />
          </div>
        )}
        {!isVideo && <Icon className="h-7 w-7" style={{ color: tint }} />}
        {duration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {duration}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 bg-[hsl(var(--secondary))] px-3 py-2.5">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: tint }} />
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-medium leading-tight">{title}</div>
          <div className="mt-0.5 text-[10.5px] text-[hsl(var(--muted-foreground))]">{site}</div>
        </div>
      </div>
    </div>
  );
}

export function PdfCard({ name, pages, size }: { name: string; pages: number; size: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[hsl(var(--destructive)/0.14)]">
        <FileText className="h-4 w-4 text-[hsl(var(--destructive-text))]" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium">{name}</div>
        <div className="text-[10.5px] text-[hsl(var(--muted-foreground))]">
          {pages} pages · {size}
        </div>
      </div>
    </div>
  );
}
