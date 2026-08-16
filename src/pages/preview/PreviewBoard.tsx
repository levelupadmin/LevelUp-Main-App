/**
 * THE LEADERBOARD AND THE RULE BOOK.
 *
 * 🔴 A SCORE NOBODY UNDERSTANDS IS NOISE. We put XP and a streak in the header
 * weeks ago and never once explained them, so they read as decoration. The
 * founder asked for a rule book, and he is right that it is not optional: the
 * moment a number can go DOWN — a streak can — a student is owed the rule
 * before it happens to them.
 *
 * The board ranks on XP, which is earned by doing the work rather than by
 * being early. It is openable from Home and from the Path, and every row opens
 * that person's submissions — the same principle as the room: a leaderboard
 * you can open is a library, one you cannot is a scoreboard.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Flame, ClipboardCheck } from "lucide-react";
import type { PlayState } from "./previewStore";
import { activeProgram } from "./previewStore";
import { CLASSMATES, ME, roomFor, type Classmate } from "./previewCohort";
import { XP } from "./previewProgram";

export interface Standing {
  student: Classmate;
  xp: number;
  streak: number;
  blocks: number;
  me: boolean;
}

/**
 * Everyone's standing, derived from the same seeded activity the rooms use —
 * so the board can never disagree with what a card shows. One source, again.
 */
export function standings(s: PlayState): Standing[] {
  const t = activeProgram(s);
  const cards = t.weeks.flatMap((w) => w.cards);

  const rows: Standing[] = CLASSMATES.map((student) => {
    let xp = 0;
    let blocks = 0;
    for (const c of cards) {
      const a = roomFor(c.id).find((x) => x.student.id === student.id);
      if (!a) continue;
      if (a.stage === "submitted") {
        xp += c.xp;
        if (c.kind === "block") blocks += 1;
      } else if (a.stage === "drafted") {
        xp += Math.round(c.xp / 3);
      }
    }
    // A streak that never moves is not a streak; derive it from the same hash
    // so it is stable across reloads like everything else in the room.
    const streak = 1 + (xp % 9);
    return { student, xp, streak, blocks, me: false };
  });

  const mine: Standing = {
    student: ME,
    xp: s.xp,
    streak: s.streak,
    blocks: s.submissions.filter((x) => cards.find((c) => c.id === x.cardId)?.kind === "block").length,
    me: true,
  };

  return [...rows, mine].sort((a, b) => b.xp - a.xp);
}

export function Podium({ s, onOpen, onFull }: { s: PlayState; onOpen: (st: Standing) => void; onFull: () => void }) {
  const top = useMemo(() => standings(s).slice(0, 3), [s]);
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium">This week's front three</span>
        <button type="button" onClick={onFull} className="text-[11px] text-[hsl(var(--muted-foreground))] underline underline-offset-4">
          Full board
        </button>
      </div>
      <div className="flex flex-col">
        {top.map((r, i) => (
          <button
            key={r.student.id}
            type="button"
            onClick={() => onOpen(r)}
            className={`flex items-center gap-3 py-2 text-left ${i ? "border-t border-[hsl(var(--border))]" : ""}`}
          >
            <span className="w-4 text-[11px] text-[hsl(var(--muted-foreground))]">{i + 1}</span>
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
              style={r.me
                ? { background: "hsl(var(--cream))", color: "hsl(var(--cream-text))" }
                : { background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}
            >
              {r.student.initials}
            </span>
            <span className={`min-w-0 flex-1 truncate text-[13px] ${r.me ? "font-semibold" : ""}`}>{r.student.name}</span>
            <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">{r.xp} xp</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function BoardSheet({ s, open, onClose, onOpen }: { s: PlayState; open: boolean; onClose: () => void; onOpen: (st: Standing) => void }) {
  const rows = useMemo(() => standings(s), [s]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose} role="dialog" aria-label="Leaderboard"
        >
          <motion.div
            className="max-h-[80vh] w-full max-w-[460px] overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
            initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[15px] font-semibold">The board</div>
              <button type="button" onClick={onClose} aria-label="Close the board"><X className="h-4 w-4 text-[hsl(var(--muted-foreground))]" /></button>
            </div>
            {rows.map((r, i) => (
              <button
                key={r.student.id}
                type="button"
                onClick={() => onOpen(r)}
                className={`flex w-full items-center gap-3 py-2 text-left ${i ? "border-t border-[hsl(var(--border))]" : ""}`}
              >
                <span className="w-5 text-[11px] text-[hsl(var(--muted-foreground))]">{i + 1}</span>
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
                  style={r.me ? { background: "hsl(var(--cream))", color: "hsl(var(--cream-text))" } : { background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}
                >
                  {r.student.initials}
                </span>
                <span className={`min-w-0 flex-1 truncate text-[13px] ${r.me ? "font-semibold" : ""}`}>{r.student.name}</span>
                <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">{r.blocks} blocks · {r.xp} xp</span>
              </button>
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** One person's work, opened from the board. */
export function StandingSheet({ s, standing, onClose }: { s: PlayState; standing: Standing | null; onClose: () => void }) {
  const t = activeProgram(s);
  const cards = t.weeks.flatMap((w) => w.cards.map((c) => ({ w, c })));
  const done = standing
    ? cards.filter(({ c }) =>
        standing.me
          ? s.submissions.some((x) => x.cardId === c.id)
          : roomFor(c.id).find((x) => x.student.id === standing.student.id)?.stage === "submitted",
      )
    : [];

  return (
    <AnimatePresence>
      {standing && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose} role="dialog" aria-label={`${standing.student.name}'s work`}
        >
          <motion.div
            className="max-h-[80vh] w-full max-w-[460px] overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
            initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-[16px] font-semibold">{standing.student.name}</div>
            <div className="mb-4 text-[12px] text-[hsl(var(--muted-foreground))]">
              {standing.xp} xp · {standing.blocks} blocks · {standing.streak} day streak
            </div>
            {done.length === 0 ? (
              <p className="text-[12px] text-[hsl(var(--muted-foreground))]">Nothing submitted yet.</p>
            ) : (
              done.map(({ w, c }) => (
                <div key={c.id} className="border-t border-[hsl(var(--border))] py-2 text-[12.5px]">
                  <span className="text-[hsl(var(--muted-foreground))]">Week {String(w.no).padStart(2, "0")} · </span>
                  {c.title}
                </div>
              ))
            )}
            <p className="mt-4 border-t border-[hsl(var(--border))] pt-3 text-[11px] text-[hsl(var(--muted-foreground))]">
              This is what puts them where they are. Open any card on the Path to read the work itself.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The rule book. Short on purpose — nobody reads a long one. */
export function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const row = (icon: React.ReactNode, title: string, body: string) => (
    <div className="flex gap-3 border-t border-[hsl(var(--border))] py-3">
      <span className="mt-0.5 shrink-0 text-[hsl(var(--muted-foreground))]">{icon}</span>
      <div>
        <div className="text-[13px] font-medium">{title}</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">{body}</p>
      </div>
    </div>
  );
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose} role="dialog" aria-label="How XP and streaks work"
        >
          <motion.div
            className="max-h-[80vh] w-full max-w-[460px] overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
            initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[15px] font-semibold">How this counts</div>
              <button type="button" onClick={onClose} aria-label="Close the rules"><X className="h-4 w-4 text-[hsl(var(--muted-foreground))]" /></button>
            </div>
            {row(<Zap className="h-4 w-4" />, "XP is for doing the work",
              `A drill is ${XP.micro}. Attending a live session is ${XP.live_session}. A community call is ${XP.community_call}. The week's block is ${XP.block}, and a Ship adds ${XP.ship}. Nothing is awarded for logging in.`)}
            {row(<Flame className="h-4 w-4" />, "The streak counts days you cleared something due",
              "It breaks on a day you owed something and did nothing. Your two pause tokens protect it — tell us before, not after, and a sanctioned pause holds the streak. Silence does not.")}
            {row(<ClipboardCheck className="h-4 w-4" />, "Blocks are the real score",
              "One per week, thirteen in all. XP moves fast and looks nice; blocks are what you actually leave with. If you only track one number, track this one.")}
            {row(<span className="text-[13px]">↺</span>, "Nothing you finish ever locks again",
              "Falling behind closes nothing you have already opened, and live sessions are never gated at all. You can always walk back in.")}
            <p className="mt-3 border-t border-[hsl(var(--border))] pt-3 text-[11px] text-[hsl(var(--muted-foreground))]">
              The board ranks on XP. It is a nudge, not a verdict — the verdict is Ship, Fix or Hold from your mentor.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
