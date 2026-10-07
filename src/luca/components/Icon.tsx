import {
  ArrowBendUpRight, ArrowCounterClockwise, ArrowDown, ArrowRight, ArrowSquareOut, ArrowUp, ArrowUpRight, ArrowsClockwise,
  Bell, BellRinging, Broadcast, CalendarBlank, CalendarPlus, CaretDown, CaretLeft, CaretRight, Certificate,
  ChatCircleDots, Check, CheckCircle, ClipboardText, Clock, ClockCountdown, CoinVertical, Copy, DownloadSimple,
  FastForward, FileDoc, Flame, FolderSimple, Gear, GoogleDriveLogo, HandWaving, House, InstagramLogo, Link,
  LinkSimple, LockSimple, Microphone, Minus, NotePencil, Palette, Pause, Pencil, Play, PlayCircle, Plus,
  Presentation, Rewind, SealCheck, ShareNetwork, Signature, SpeakerHigh, SpeakerSlash, Star, Table, Target,
  Trash, TrendUp, UserPlus, UsersThree, VideoCamera, Wallet, WarningCircle, WhatsappLogo, X, YoutubeLogo,
  type Icon as PhIcon,
} from "@phosphor-icons/react";

const MAP: Record<string, PhIcon> = {
  "arrow-bend-up-right": ArrowBendUpRight, "arrow-counter-clockwise": ArrowCounterClockwise, "arrow-down": ArrowDown,
  "arrow-right": ArrowRight, "arrow-square-out": ArrowSquareOut, "arrow-up": ArrowUp, "arrow-up-right": ArrowUpRight, "arrows-clockwise": ArrowsClockwise,
  bell: Bell, "bell-ringing": BellRinging, broadcast: Broadcast, "calendar-blank": CalendarBlank, "calendar-plus": CalendarPlus,
  "caret-down": CaretDown, "caret-left": CaretLeft, "caret-right": CaretRight, certificate: Certificate,
  "chat-circle-dots": ChatCircleDots, check: Check, "check-circle": CheckCircle, "clipboard-text": ClipboardText,
  clock: Clock, "clock-countdown": ClockCountdown, "coin-vertical": CoinVertical, copy: Copy, "download-simple": DownloadSimple,
  "fast-forward": FastForward, "file-doc": FileDoc, flame: Flame, "folder-simple": FolderSimple, gear: Gear,
  "google-drive-logo": GoogleDriveLogo, "hand-waving": HandWaving, house: House, "instagram-logo": InstagramLogo,
  link: Link, "link-simple": LinkSimple, "lock-simple": LockSimple, microphone: Microphone, minus: Minus,
  "note-pencil": NotePencil, palette: Palette, pause: Pause, pencil: Pencil, play: Play, "play-circle": PlayCircle,
  plus: Plus, presentation: Presentation, rewind: Rewind, "seal-check": SealCheck, "share-network": ShareNetwork,
  signature: Signature, "speaker-high": SpeakerHigh, "speaker-slash": SpeakerSlash, star: Star, table: Table,
  target: Target, trash: Trash, "trend-up": TrendUp, "user-plus": UserPlus, "users-three": UsersThree,
  "video-camera": VideoCamera, wallet: Wallet, "warning-circle": WarningCircle, "whatsapp-logo": WhatsappLogo, x: X,
  "youtube-logo": YoutubeLogo,
};

/** Phosphor icon by the mockup's names; a `-fill` suffix picks the filled weight. */
export function Icon({ name, className }: { name: string; className?: string }) {
  const fill = name.endsWith("-fill");
  const base = fill ? name.slice(0, -5) : name;
  const C = MAP[base] ?? Link;
  return <C className={`ic${className ? ` ${className}` : ""}`} weight={fill ? "fill" : "regular"} aria-hidden="true" />;
}
