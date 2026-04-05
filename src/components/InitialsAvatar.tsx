import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-red-600 to-rose-400",
  "from-indigo-600 to-blue-400",
  "from-emerald-600 to-teal-400",
  "from-amber-500 to-orange-400",
  "from-violet-600 to-fuchsia-400",
  "from-slate-500 to-zinc-400",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

interface InitialsAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: 32 | 40 | 48 | 64 | 96;
  className?: string;
}

const sizeClasses: Record<number, string> = {
  32: "h-8 w-8",
  40: "h-10 w-10",
  48: "h-12 w-12",
  64: "h-16 w-16",
  96: "h-24 w-24",
};

const fontSizes: Record<number, string> = {
  32: "text-xs",
  40: "text-sm",
  48: "text-base",
  64: "text-xl",
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
        "rounded-full bg-gradient-to-br flex items-center justify-center border border-white/[0.08] font-display font-semibold text-white select-none",
        gradient,
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
