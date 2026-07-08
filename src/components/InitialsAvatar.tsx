import { cn } from "@/lib/utils";

// Constrained to four brand token pairs (no red/rose). The hash picks one
// deterministically, so an avatar renders identically wherever it appears
// (header, community, admin). Each pair carries its own foreground so the
// initials stay legible: the two LIGHT warm pairs (cream→gold and amber→gold)
// take the dark `--cream-text` token (white-on-cream is ~1.2:1 and white-on-amber
// ~2.1:1, both invisible); the two saturated blue/green pairs are dark enough for
// white. Each pair is two tokens of one hue family so the disc reads as a single
// colour, and every one is well separated from the near-black canvas — the old
// surface-2→border pair (both near-black) rendered an invisible disc. Keep every
// class a literal utility string so Tailwind's JIT scanner keeps them in the build.
const GRADIENTS = [
  { bg: "from-cream to-gold", fg: "text-[hsl(var(--cream-text))]" },
  { bg: "from-accent-indigo to-accent-violet-deep", fg: "text-white" },
  { bg: "from-accent-emerald to-success", fg: "text-white" },
  { bg: "from-accent-amber to-gold", fg: "text-[hsl(var(--cream-text))]" },
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  // Strip non-letters per word (Unicode-aware) so "Rahul (Dev)" → "RD", not "R(".
  const parts = name
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}]/gu, ""))
    .filter((part) => part.length > 0);
  if (parts.length === 0) return "?";
  // Array.from keeps astral-plane letters (surrogate pairs) intact.
  const first = Array.from(parts[0] ?? "")[0] ?? "";
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1] ?? "")[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

interface InitialsAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: 24 | 28 | 32 | 36 | 40 | 48 | 64 | 80 | 96;
  className?: string;
}

const sizeClasses: Record<number, string> = {
  24: "h-6 w-6",
  28: "h-7 w-7",
  32: "h-8 w-8",
  36: "h-9 w-9",
  40: "h-10 w-10",
  48: "h-12 w-12",
  64: "h-16 w-16",
  80: "h-20 w-20",
  96: "h-24 w-24",
};

const fontSizes: Record<number, string> = {
  24: "text-[9px]",
  28: "text-[10px]",
  32: "text-xs",
  36: "text-xs",
  40: "text-sm",
  48: "text-base",
  64: "text-xl",
  80: "text-2xl",
  96: "text-2xl",
};

const InitialsAvatar = ({ name, photoUrl, size = 40, className }: InitialsAvatarProps) => {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={cn("rounded-full object-cover border border-white/[0.08]", sizeClasses[size], className)}
      />
    );
  }

  const gradient = GRADIENTS[hashName(name) % GRADIENTS.length];
  const initials = getInitials(name);

  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br flex items-center justify-center border border-white/[0.08] font-display font-semibold select-none",
        gradient.bg,
        gradient.fg,
        sizeClasses[size],
        fontSizes[size],
        className
      )}
    >
      {initials}
    </div>
  );
};

export default InitialsAvatar;
