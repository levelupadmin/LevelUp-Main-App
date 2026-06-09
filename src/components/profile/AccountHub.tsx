import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Award,
  FileText,
  Pencil,
  Bell,
  Scale,
  Trash2,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import InitialsAvatar from "@/components/InitialsAvatar";
import { Reveal } from "@/components/motion/Reveal";
import { hapticSelection } from "@/lib/haptics";

/**
 * AccountHub (item 35) — a Revolut-style account hub.
 *
 * Layout, top to bottom:
 *   1. Identity header (avatar, name, email, member #)
 *   2. Two quick-action tiles — My Certificates, Invoices
 *   3. Grouped rounded menu cards — Edit profile, Notifications, Legal, Delete account
 *
 * The hub is purely presentational + navigational: the parent (ProfilePage)
 * owns the actual flows (edit form, notification prefs, account deletion) and
 * passes them in as handlers. Tiles/menu items scroll-or-open the matching
 * section, keeping a single source of truth for that logic.
 */

export interface AccountHubProps {
  name: string;
  email: string;
  memberNumber: string | number | null | undefined;
  avatarUrl?: string | null;
  /** Certificate count for the quick-tile subtitle (0 hides the count). */
  certificateCount?: number;
  /** Invoice count for the quick-tile subtitle (0 hides the count). */
  invoiceCount?: number;
  onMyCertificates: () => void;
  onInvoices: () => void;
  onEditProfile: () => void;
  onNotifications: () => void;
  onDeleteAccount: () => void;
}

const QuickTile = ({
  icon: Icon,
  label,
  sub,
  onClick,
  delayMs,
}: {
  icon: LucideIcon;
  label: string;
  sub: string;
  onClick: () => void;
  delayMs: number;
}) => (
  <Reveal delayMs={delayMs}>
    <button
      type="button"
      onClick={() => {
        void hapticSelection();
        onClick();
      }}
      className="pressable flex h-full w-full flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-hover"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--cream))]/10 text-[hsl(var(--cream))]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </button>
  </Reveal>
);

interface MenuItem {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  trailing?: ReactNode;
}

const MenuGroup = ({ items }: { items: MenuItem[] }) => (
  <div className="overflow-hidden rounded-2xl border border-border bg-surface">
    {items.map((item, i) => (
      <button
        key={item.label}
        type="button"
        onClick={() => {
          void hapticSelection();
          item.onClick();
        }}
        className={`pressable flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 ${
          i > 0 ? "border-t border-border" : ""
        }`}
      >
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            item.danger
              ? "bg-destructive/10 text-destructive"
              : "bg-surface-2 text-muted-foreground"
          }`}
        >
          <item.icon className="h-4 w-4" />
        </div>
        <span
          className={`flex-1 text-sm font-medium ${
            item.danger ? "text-destructive" : "text-foreground"
          }`}
        >
          {item.label}
        </span>
        {item.trailing ?? (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
    ))}
  </div>
);

const AccountHub = ({
  name,
  email,
  memberNumber,
  avatarUrl,
  certificateCount = 0,
  invoiceCount = 0,
  onMyCertificates,
  onInvoices,
  onEditProfile,
  onNotifications,
  onDeleteAccount,
}: AccountHubProps) => {
  const navigate = useNavigate();

  const accountItems: MenuItem[] = [
    { icon: Pencil, label: "Edit profile", onClick: onEditProfile },
    { icon: Bell, label: "Notifications", onClick: onNotifications },
    { icon: Scale, label: "Legal", onClick: () => navigate("/terms") },
  ];

  const dangerItems: MenuItem[] = [
    { icon: Trash2, label: "Delete account", onClick: onDeleteAccount, danger: true },
  ];

  return (
    <div className="space-y-6">
      {/* Identity header */}
      <Reveal>
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
          <InitialsAvatar name={name || "U"} photoUrl={avatarUrl} size={64} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold leading-tight text-foreground">
              {name || "—"}
            </h2>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              Member #{memberNumber ?? "—"}
            </p>
          </div>
        </div>
      </Reveal>

      {/* Quick-action tiles */}
      <div className="grid grid-cols-2 gap-3">
        <QuickTile
          icon={Award}
          label="My Certificates"
          sub={certificateCount > 0 ? `${certificateCount} earned` : "View & download"}
          onClick={onMyCertificates}
          delayMs={60}
        />
        <QuickTile
          icon={FileText}
          label="Invoices"
          sub={invoiceCount > 0 ? `${invoiceCount} on file` : "Receipts & GST"}
          onClick={onInvoices}
          delayMs={120}
        />
      </div>

      {/* Grouped menu cards */}
      <Reveal delayMs={160}>
        <MenuGroup items={accountItems} />
      </Reveal>
      <Reveal delayMs={200}>
        <MenuGroup items={dangerItems} />
      </Reveal>
    </div>
  );
};

export default AccountHub;
