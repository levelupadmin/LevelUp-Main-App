/**
 * The responsive shell — the part the first cut got wrong.
 *
 * 🔴 THE MISTAKE THIS FIXES. v1 was a single `max-w-lg` column. That is a phone
 * screen, and on a monitor it read as a phone screen stretched — the founder's
 * words were "hacked to make it work". A desktop layout is not a mobile layout
 * with more margin; it is a different information architecture.
 *
 * So there are genuinely two layouts here, sharing components but not shape:
 *
 *   MOBILE  (< lg)  one column · section rail scrolls horizontally at the top ·
 *                   stats collapse into the rail · the board is the whole screen
 *   DESKTOP (≥ lg)  a persistent 244px section rail on the left, carrying labels
 *                   AND sub-labels the way Creator OS does · a sticky content
 *                   header with the title on the left and XP / Streak / Blocks
 *                   stat chips on the right · content up to 6xl, and screens
 *                   that earn it (the Path) split into board + sticky context
 *
 * The two radial glows are lifted from Creator OS's `globals.css`, retinted from
 * teal/amber to this app's champagne and gold.
 */
import type { ReactNode } from "react";
import { ClipboardCheck, Flame, Zap } from "lucide-react";
import { SHELL_TABS } from "./previewTabs";
import { STATS } from "./previewData";

function StatChip({ icon: Icon, value, label, tint }: { icon: typeof Zap; value: string | number; label: string; tint: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5">
      <Icon className="h-3.5 w-3.5" style={{ color: tint }} />
      <div className="leading-none">
        <div className="text-[13px] font-extrabold">{value}</div>
        <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{label}</div>
      </div>
    </div>
  );
}

export default function PreviewShell({
  active, onChange, title, children,
}: {
  active: string;
  onChange: (k: string) => void;
  title: string;
  children: ReactNode;
}) {
  const stats = (
    <>
      <StatChip icon={Zap} value={STATS.xp} label="XP" tint="hsl(var(--gold))" />
      <StatChip icon={Flame} value={STATS.streak} label="Streak" tint="hsl(var(--accent-amber))" />
      <StatChip icon={ClipboardCheck} value={`${STATS.week}/12`} label="Blocks" tint="hsl(var(--success))" />
    </>
  );

  return (
    <div
      className="min-h-[100dvh] w-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
      style={{
        backgroundImage:
          "radial-gradient(1100px 560px at 82% -12%, hsl(var(--cream)/0.055), transparent 60%), radial-gradient(840px 460px at -8% 6%, hsl(var(--gold)/0.05), transparent 55%)",
      }}
    >
      <div className="lg:flex">
        {/* ── DESKTOP RAIL ─────────────────────────────────────────── */}
        <aside className="hidden lg:flex lg:w-[244px] lg:shrink-0 lg:flex-col lg:gap-6 lg:border-r lg:border-[hsl(var(--border))] lg:p-5">
          <div>
            <div className="text-[17px] font-extrabold tracking-[-0.02em]">Creator Studio</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--gold))]">
              Creator Academy · Ed 2
            </div>
          </div>
          <nav className="flex flex-col gap-1" aria-label="Creator Studio sections">
            {SHELL_TABS.map((t) => {
              const on = active === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onChange(t.key)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    on
                      ? "border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
                      : "border-transparent hover:bg-[hsl(var(--secondary))]/60"
                  }`}
                >
                  <t.icon className={`h-4 w-4 shrink-0 ${on ? "text-[hsl(var(--cream))]" : "text-[hsl(var(--muted-foreground))]"}`} />
                  <div className="min-w-0 leading-tight">
                    <div className={`truncate text-[13px] font-medium ${on ? "" : "text-[hsl(var(--foreground))]/80"}`}>{t.label}</div>
                    <div className="truncate text-[10px] text-[hsl(var(--muted-foreground))]">{t.sub}</div>
                  </div>
                </button>
              );
            })}
          </nav>
          <div className="mt-auto rounded-xl border border-[hsl(var(--accent-violet)/0.4)] bg-[hsl(var(--accent-violet)/0.09)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[hsl(var(--accent-violet))]">Prototype</div>
            <p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              Invented data, inert buttons, no database. Visible only to you.
            </p>
          </div>
        </aside>

        {/* ── CONTENT ──────────────────────────────────────────────── */}
        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 hidden border-b border-[hsl(var(--border))] bg-black/80 px-8 py-4 backdrop-blur lg:flex lg:items-center lg:justify-between">
            <h1 className="text-[19px] font-bold tracking-[-0.02em]">{title}</h1>
            <div className="flex gap-2">{stats}</div>
          </header>

          {/* Mobile: the rail scrolls, and the prototype warning rides with it. */}
          <div className="lg:hidden">
            <div className="px-4 pt-4">
              <div className="rounded-lg border border-[hsl(var(--accent-violet)/0.4)] bg-[hsl(var(--accent-violet)/0.09)] px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[hsl(var(--accent-violet))]">
                  Prototype — nothing here is live
                </span>
              </div>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {stats}
            </div>
            <nav
              aria-label="Creator Studio sections"
              className="mt-3 flex gap-1 overflow-x-auto border-b border-[hsl(var(--border))] px-4 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {SHELL_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onChange(t.key)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] transition-colors ${
                    active === t.key
                      ? "bg-[hsl(var(--cream))] font-semibold text-[hsl(var(--cream-text))]"
                      : "text-[hsl(var(--muted-foreground))]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
