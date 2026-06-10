import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Compass, RotateCcw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type SystemStateKind = "404" | "error" | "offline";

type SystemStateAction =
  | { label: string; to: string }
  | { label: string; onClick: () => void };

interface SystemStateProps {
  kind: SystemStateKind;
  /** Override the default eyebrow (e.g. a status code). */
  eyebrow?: string;
  /** Override the default headline. */
  title?: string;
  /** Override the default body copy. */
  description?: ReactNode;
  /** Primary action. Defaults per-kind (404 → Home, offline → Retry is caller's). */
  action?: SystemStateAction;
  /**
   * Optional dimmed key-art behind the copy. When omitted, a tasteful
   * champagne gradient fades to the canvas instead, safer than pinning one
   * instructor's face to every error screen.
   */
  keyArt?: string;
  className?: string;
}

const DEFAULTS: Record<
  SystemStateKind,
  { eyebrow: string; title: string; description: string; icon: typeof Compass }
> = {
  "404": {
    eyebrow: "404",
    title: "We lost the reel",
    description:
      "This page doesn't exist or has moved. Let's get you back to something worth watching.",
    icon: Compass,
  },
  error: {
    eyebrow: "Something broke",
    title: "That didn't go to plan",
    description:
      "A scene glitched on our end. Give it another take, most of the time it just works.",
    icon: RotateCcw,
  },
  offline: {
    eyebrow: "Offline",
    title: "You're offline",
    description:
      "We can't reach the studio right now. Check your connection and we'll pick up where you left off.",
    icon: WifiOff,
  },
};

const actionClasses =
  "focus-ring pressable inline-flex items-center justify-center h-11 px-6 rounded-full bg-cream text-cream-text font-semibold text-sm hover:bg-cream/90 transition-colors";

/**
 * SystemState - one cinematic full-bleed state for 404 / error / offline.
 *
 * Dimmed masterclass key-art (or a tasteful champagne gradient) feathering
 * down into the near-black canvas, a serif-italic headline, plain-spoken
 * copy, and a single cream action. Shares its voice with EmptyState so every
 * dead-end on LevelUp feels like the same room.
 */
export const SystemState = ({
  kind,
  eyebrow,
  title,
  description,
  action,
  keyArt,
  className,
}: SystemStateProps) => {
  const d = DEFAULTS[kind];
  const Icon = d.icon;

  // 404 gets a sensible default action; error/offline are usually driven by
  // a caller-supplied retry, so we don't invent one.
  const resolvedAction: SystemStateAction | undefined =
    action ?? (kind === "404" ? { label: "Back to Home", to: "/home" } : undefined);

  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "relative isolate flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-canvas px-6 text-center",
        className
      )}
    >
      {/* Backdrop: dimmed key-art or champagne gradient, both feathering to canvas */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {keyArt ? (
          <img
            src={keyArt}
            alt=""
            className="kenburns h-full w-full object-cover opacity-[0.18]"
          />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(120%_90%_at_50%_0%,hsl(var(--cream)/0.12),transparent_60%)]" />
        )}
        {/* Feather to near-black at the bottom so copy always reads */}
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/70 to-canvas" />
        <div className="grain absolute inset-0" />
      </div>

      <div className="anim-rise relative z-10 flex max-w-md flex-col items-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-cream/20 bg-surface/60 backdrop-blur-sm text-cream">
          <Icon size={24} strokeWidth={1.5} />
        </div>
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {eyebrow ?? d.eyebrow}
        </p>
        <h1 className="font-serif-italic text-3xl text-cream sm:text-4xl">
          {title ?? d.title}
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description ?? d.description}
        </p>
        {resolvedAction && (
          <div className="mt-8">
            {"to" in resolvedAction ? (
              <Link to={resolvedAction.to} className={actionClasses}>
                {resolvedAction.label}
              </Link>
            ) : (
              <button type="button" onClick={resolvedAction.onClick} className={actionClasses}>
                {resolvedAction.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemState;
