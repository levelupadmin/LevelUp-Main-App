/**
 * THE REAL PATH — LevelUp Creator Academy, rendered from the template.
 *
 * 🔴 WHAT CHANGED, AND WHY IT MATTERS (founder call 2026-08-15). The previous
 * Path was a beautiful shell over invented content: thirteen dummy weeks, and
 * clicking Tuesday landed you on the same page as clicking Sunday. This one
 * draws itself from `previewProgram.LUCA` — the actual Cohort 02 curriculum —
 * and every day is its own card with its own type, its own form, its own gate.
 * Nothing on these screens is hard-coded prose: if you cannot point at the
 * admin field that produced a pixel, the pixel is a bug.
 *
 * The four card types the founder named, and nothing else:
 *   live_session    mentor · what you'll learn · Zoom door → recording door
 *   community_call  host · time · Zoom. No work, no gate.
 *   micro           the day's drill: brief · resources · mark done
 *   block           the week's deliverable + the submission box
 *
 * Recording and review are NOT types. A recording is the second face of a live
 * session; a review is a live session that reads a week's blocks. Making them
 * types would double every node on the trail and buy nothing.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Lock, Video, Users, ClipboardCheck, Flag, ExternalLink, Star } from "lucide-react";
import type { PlayAction, PlayState } from "./previewStore";
import {
  LUCA, KIND_LABEL, dateOf, fmtDate, dayName, findCard, orderedCards,
  type CardKind, type TemplateCard, type TemplateWeek,
} from "./previewProgram";
import { cardState, recordingVerdict, blocksDone, weekOpen, type UnlockInput } from "./previewUnlock";

/** The prototype's "today". Cohort 02 week 0 is live, week 1 is next. */
export const TODAY_ISO = "2026-08-18";

const ICON: Record<CardKind, typeof Video> = {
  live_session: Video, community_call: Users, micro: ClipboardCheck, block: Flag,
};

/** One tint per card type. Colour carries the type, nothing else. */
const TINT: Record<CardKind, { bg: string; fg: string; ring: string }> = {
  live_session:   { bg: "hsl(var(--accent-violet)/0.12)", fg: "hsl(var(--accent-violet))", ring: "hsl(var(--accent-violet)/0.45)" },
  community_call: { bg: "hsl(var(--success)/0.12)",       fg: "hsl(var(--success))",       ring: "hsl(var(--success)/0.45)" },
  micro:          { bg: "hsl(var(--secondary))",          fg: "hsl(var(--muted-foreground))", ring: "hsl(var(--border))" },
  block:          { bg: "hsl(var(--gold)/0.14)",          fg: "hsl(var(--gold))",          ring: "hsl(var(--gold)/0.5)" },
};

export function useUnlock(s: PlayState): UnlockInput {
  return useMemo(
    () => ({
      progress: s.progress,
      submittedCardIds: s.submissions.map((x) => x.cardId),
      todayISO: TODAY_ISO,
    }),
    [s.progress, s.submissions],
  );
}

/** Admin edits win over the template — the whole point of the admin screen. */
export function resolve(s: PlayState, card: TemplateCard): TemplateCard {
  const patch = s.cardEdits[card.id];
  return patch ? { ...card, ...patch } : card;
}

const dOf = (w: number, d: number) => dateOf(LUCA, w, d);

/* ─────────────────────────────────────────────────────────────────────────
   THE PATH — every week, every day, one node per card
   ───────────────────────────────────────────────────────────────────────── */

export function ProgramPathScreen({ s, go }: { s: PlayState; go: (k: string) => void }) {
  const u = useUnlock(s);
  const blocks = blocksDone(LUCA, u.submittedCardIds);
  let phase = "";

  return (
    <div className="mx-auto max-w-[760px]">
      <header className="mb-6">
        <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">{LUCA.name}</h2>
        <p className="mt-1 text-[13px] text-[hsl(var(--muted-foreground))]">
          Cohort 02 · starts Sat 15 Aug · Demo Day Sat 14 Nov · {blocks.done} of {blocks.total} blocks in
        </p>
      </header>

      {LUCA.weeks.map((week) => {
        const wv = weekOpen(LUCA, week.no, u, dOf);
        const newPhase = week.phase !== phase;
        phase = week.phase;
        const cards = orderedCards(week);
        const unauthored = cards.every((c) => c.needsAuthoring);

        return (
          <section key={week.no} className="mb-8">
            {newPhase && (
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--gold))]">
                {week.phase}
              </div>
            )}
            <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-[hsl(var(--border))] pb-2">
              <div className="min-w-0">
                <div className="text-[15px] font-bold">
                  Week {week.no} · {week.title}
                </div>
                {week.blurb && (
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">{week.blurb}</p>
                )}
              </div>
              <div className="shrink-0 text-right text-[11px] text-[hsl(var(--muted-foreground))]">
                {fmtDate(dOf(week.no, 0))}
                {unauthored && (
                  <div className="mt-1 rounded-md bg-[hsl(var(--secondary))] px-2 py-0.5 text-[10px]">Not authored yet</div>
                )}
              </div>
            </div>

            {wv.state === "locked" && (
              <p className="mb-3 flex items-center gap-2 text-[12px] text-[hsl(var(--muted-foreground))]">
                <Lock className="h-3.5 w-3.5" /> {wv.why}
              </p>
            )}

            <ul className="flex flex-col gap-2">
              {cards.map((raw) => {
                const c = resolve(s, raw);
                const v = cardState(LUCA, week, c, u, dOf);
                const Icon = ICON[c.kind];
                const tint = TINT[c.kind];
                const when = dOf(week.no, c.dayOffset);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => go(`card/${c.id}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-3 text-left transition-colors hover:border-[hsl(var(--cream)/0.4)]"
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                        style={{ background: tint.bg, color: tint.fg, boxShadow: `inset 0 0 0 1px ${tint.ring}` }}
                      >
                        {v.state === "done" ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-medium">{c.title}</span>
                          {c.needsAuthoring && (
                            <span className="shrink-0 rounded bg-[hsl(var(--secondary))] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                              fill me
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-[hsl(var(--muted-foreground))]">
                          {dayName(when)} {fmtDate(when).replace(/^\w+,?\s*/, "")}
                          {c.time ? ` · ${c.time}` : ""} · {KIND_LABEL[c.kind]}
                          {v.state === "locked" && v.why ? ` · ${v.why}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">
                        {v.state === "done" ? "done" : v.state === "locked" ? <Lock className="h-3.5 w-3.5" /> : `+${c.xp}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ONE CARD — four renderers behind one route
   ───────────────────────────────────────────────────────────────────────── */

function Shell({ children, go, week, card }: { children: React.ReactNode; go: (k: string) => void; week: TemplateWeek; card: TemplateCard }) {
  const when = dOf(week.no, card.dayOffset);
  const tint = TINT[card.kind];
  return (
    <div className="mx-auto max-w-[680px]">
      <button
        type="button"
        onClick={() => go("path")}
        className="mb-4 flex items-center gap-1.5 text-[12px] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> The Path
      </button>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ background: tint.bg, color: tint.fg }}>
          {KIND_LABEL[card.kind]}
        </span>
        <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
          Week {week.no} · {dayName(when)} {fmtDate(when).replace(/^\w+,?\s*/, "")}
          {card.time ? ` · ${card.time}` : ""}
          {card.durationMin ? ` · ${card.durationMin} min` : ""}
        </span>
      </div>
      <h2 className="text-[21px] font-extrabold leading-tight tracking-[-0.02em]">{card.title}</h2>
      {card.mentor && <p className="mt-1 text-[13px] text-[hsl(var(--gold))]">with {card.mentor}</p>}
      {card.blurb && <p className="mt-3 text-[14px] leading-relaxed text-[hsl(var(--muted-foreground))]">{card.blurb}</p>}
      {children}
    </div>
  );
}

function Learn({ items, label }: { items?: string[]; label: string }) {
  if (!items?.length) return null;
  return (
    <div className="mt-5">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{label}</div>
      <ul className="flex flex-col gap-1.5">
        {items.map((l) => (
          <li key={l} className="flex gap-2 text-[13.5px] leading-relaxed">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--gold))]" />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Resources({ card }: { card: TemplateCard }) {
  if (!card.resources?.length) return null;
  return (
    <div className="mt-5">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Resources</div>
      <div className="flex flex-col gap-2">
        {card.resources.map((r) => (
          <a
            key={r.id}
            href={r.url}
            onClick={(e) => e.preventDefault()}
            className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px]">{r.label}</span>
              {r.releaseNote && <span className="block text-[11px] text-[hsl(var(--muted-foreground))]">{r.releaseNote}</span>}
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
          </a>
        ))}
      </div>
    </div>
  );
}

/** The feedback form — two ratings and a box. Deliberately this small. */
function FeedbackForm({ cardId, d }: { cardId: string; d: React.Dispatch<PlayAction> }) {
  const [mentor, setMentor] = useState(0);
  const [content, setContent] = useState(0);
  const [note, setNote] = useState("");

  const stars = (value: number, set: (n: number) => void, label: string) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px]">{label}</span>
      <span className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${n} of 5`}
            onClick={() => set(n)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-[hsl(var(--border))] transition-colors"
            style={n <= value ? { background: "hsl(var(--gold)/0.16)", color: "hsl(var(--gold))" } : undefined}
          >
            <Star className="h-3.5 w-3.5" />
          </button>
        ))}
      </span>
    </div>
  );

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      {stars(mentor, setMentor, "The mentor")}
      {stars(content, setContent, "What you learned")}
      <label className="text-[13px]" htmlFor="fb-note">
        Anything you want to tell us
        <textarea
          id="fb-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional. Say it plainly, we read all of these."
          className="mt-1.5 w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--cream)/0.5)]"
        />
      </label>
      <button
        type="button"
        disabled={!mentor || !content}
        onClick={() => d({ type: "submit_feedback", cardId, mentor, content, note })}
        className="rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-[13px] font-semibold text-[hsl(var(--cream-text))] disabled:opacity-40"
      >
        Submit and open the recording
      </button>
      {(!mentor || !content) && (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Both ratings are needed. The note is optional.</p>
      )}
    </div>
  );
}

function LiveSessionCard({ s, d, card, week }: { s: PlayState; d: React.Dispatch<PlayAction>; card: TemplateCard; week: TemplateWeek }) {
  const when = dOf(week.no, card.dayOffset);
  const past = new Date(`${TODAY_ISO}T00:00:00`) > when;
  const fb = s.feedback[card.id];
  const rec = recordingVerdict(card, !!fb);
  const done = s.progress[card.id]?.done;

  return (
    <>
      {card.reviewsWeek !== undefined && (
        <p className="mt-3 rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-[12px]">
          This session reads week {card.reviewsWeek}'s block.
        </p>
      )}
      <Learn items={card.learn} label="What you'll learn" />
      <Resources card={card} />

      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        {!past ? (
          card.zoomUrl ? (
            <>
              <a
                href={card.zoomUrl}
                onClick={(e) => e.preventDefault()}
                className="rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-center text-[13px] font-semibold text-[hsl(var(--cream-text))]"
              >
                Join on Zoom
              </a>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                Everyone can join, always. Falling behind never closes the room.
              </p>
            </>
          ) : (
            <>
              <span className="rounded-lg border border-dashed border-[hsl(var(--border))] px-4 py-2.5 text-center text-[13px] text-[hsl(var(--muted-foreground))]">
                The Zoom link is not up yet
              </span>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                It appears here the moment an admin adds it. You will not need to go looking anywhere else.
              </p>
            </>
          )
        ) : rec.state === "open" ? (
          <>
            <a
              href={card.recordingUrl}
              onClick={(e) => e.preventDefault()}
              className="rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-center text-[13px] font-semibold text-[hsl(var(--cream-text))]"
            >
              Watch the recording
            </a>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Thanks for the feedback. It goes straight to the mentor.</p>
          </>
        ) : rec.state === "locked" ? (
          <>
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <Lock className="h-3.5 w-3.5" /> {rec.why}
            </div>
            <FeedbackForm cardId={card.id} d={d} />
          </>
        ) : (
          <>
            <span className="rounded-lg border border-dashed border-[hsl(var(--border))] px-4 py-2.5 text-center text-[13px] text-[hsl(var(--muted-foreground))]">
              The recording is not up yet
            </span>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{rec.why}</p>
            {card.gateRecordingOnFeedback && !fb && (
              <>
                <p className="mt-1 text-[12px]">You can leave your feedback now, so the recording opens the moment it lands.</p>
                <FeedbackForm cardId={card.id} d={d} />
              </>
            )}
          </>
        )}
      </div>

      {!done && (
        <button
          type="button"
          onClick={() => d({ type: "card_done", cardId: card.id })}
          className="mt-3 w-full rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-[13px]"
        >
          I attended this session
        </button>
      )}
      {done && <p className="mt-3 text-[12px] text-[hsl(var(--success))]">Attendance recorded. +{card.xp} XP</p>}
    </>
  );
}

function CommunityCallCard({ s, d, card }: { s: PlayState; d: React.Dispatch<PlayAction>; card: TemplateCard }) {
  const done = s.progress[card.id]?.done;
  return (
    <>
      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        {card.zoomUrl ? (
          <a
            href={card.zoomUrl}
            onClick={(e) => e.preventDefault()}
            className="rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-center text-[13px] font-semibold text-[hsl(var(--cream-text))]"
          >
            Join the call
          </a>
        ) : (
          <span className="rounded-lg border border-dashed border-[hsl(var(--border))] px-4 py-2.5 text-center text-[13px] text-[hsl(var(--muted-foreground))]">
            The Zoom link is not up yet
          </span>
        )}
        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
          No work attached, nothing to submit, nothing recorded. Come if it helps.
        </p>
      </div>
      {!done && (
        <button
          type="button"
          onClick={() => d({ type: "card_done", cardId: card.id })}
          className="mt-3 w-full rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-[13px]"
        >
          I came to this
        </button>
      )}
      {done && <p className="mt-3 text-[12px] text-[hsl(var(--success))]">Noted. +{card.xp} XP</p>}
    </>
  );
}

function MicroCard({ s, d, card, locked }: { s: PlayState; d: React.Dispatch<PlayAction>; card: TemplateCard; locked?: string }) {
  const done = s.progress[card.id]?.done;
  return (
    <>
      <Learn items={card.learn} label="What to do" />
      <Resources card={card} />
      <div className="mt-6">
        {done ? (
          <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--success))]">
            <Check className="h-4 w-4" /> Done. +{card.xp} XP
          </p>
        ) : locked ? (
          <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--muted-foreground))]">
            <Lock className="h-3.5 w-3.5" /> {locked}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => d({ type: "card_done", cardId: card.id })}
            className="w-full rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-[13px] font-semibold text-[hsl(var(--cream-text))]"
          >
            Mark this done
          </button>
        )}
      </div>
    </>
  );
}

/** The submission box — configured per card, not hard-coded. */
function BlockCard({ s, d, card, locked }: { s: PlayState; d: React.Dispatch<PlayAction>; card: TemplateCard; locked?: string }) {
  const existing = s.submissions.find((x) => x.cardId === card.id);
  const [link, setLink] = useState(existing?.link ?? "");
  const [text, setText] = useState(existing?.text ?? "");
  const [fileName, setFileName] = useState(existing?.fileName ?? "");
  const box = card.submit;
  const empty = !link.trim() && !text.trim() && !fileName.trim();

  return (
    <>
      <Learn items={card.learn} label="What good looks like" />
      <Resources card={card} />

      {locked ? (
        <p className="mt-6 flex items-center gap-2 text-[13px] text-[hsl(var(--muted-foreground))]">
          <Lock className="h-3.5 w-3.5" /> {locked}
        </p>
      ) : !box ? null : (
        <div className="mt-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <div className="mb-3 text-[14px] font-bold">{box.prompt}</div>

          {box.link.on && (
            <label className="mb-3 block text-[13px]" htmlFor="sub-link">
              Link
              <span className="mt-0.5 block text-[11px] text-[hsl(var(--muted-foreground))]">{box.link.helper}</span>
              <input
                id="sub-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://docs.google.com/…"
                className="mt-1.5 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--cream)/0.5)]"
              />
            </label>
          )}

          {box.text.on && (
            <label className="mb-3 block text-[13px]" htmlFor="sub-text">
              Notes
              <span className="mt-0.5 block text-[11px] text-[hsl(var(--muted-foreground))]">{box.text.helper}</span>
              <textarea
                id="sub-text"
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="mt-1.5 w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--cream)/0.5)]"
              />
            </label>
          )}

          {box.file.on && (
            <label className="mb-3 block text-[13px]" htmlFor="sub-file">
              File
              <span className="mt-0.5 block text-[11px] text-[hsl(var(--muted-foreground))]">{box.file.helper}</span>
              <input
                id="sub-file"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="voice-note-01.m4a"
                className="mt-1.5 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--cream)/0.5)]"
              />
            </label>
          )}

          <button
            type="button"
            disabled={empty}
            onClick={() => d({ type: "submit_work", cardId: card.id, link, text, fileName })}
            className="w-full rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-[13px] font-semibold text-[hsl(var(--cream-text))] disabled:opacity-40"
          >
            {existing ? "Update my submission" : "Submit my week"}
          </button>
          {empty && (
            <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">
              Fill at least one box. An empty submission would reach your mentor as an empty page.
            </p>
          )}

          {existing && (
            <div className="mt-4 border-t border-[hsl(var(--border))] pt-3 text-[12px]">
              <p className="text-[hsl(var(--success))]">Submitted {existing.when}. Your mentor sees this in their desk.</p>
              {existing.verdict && (
                <p className="mt-1.5">
                  Verdict: <span className="font-bold uppercase">{existing.verdict}</span>
                  {existing.mentorNote ? ` — ${existing.mentorNote}` : ""}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function ProgramCardScreen({ s, d, go, cardId }: { s: PlayState; d: React.Dispatch<PlayAction>; go: (k: string) => void; cardId: string }) {
  const u = useUnlock(s);
  const found = findCard(LUCA, cardId);
  if (!found) {
    return (
      <div className="mx-auto max-w-[680px]">
        <button type="button" onClick={() => go("path")} className="text-[13px] underline">
          Back to the Path
        </button>
      </div>
    );
  }
  const card = resolve(s, found.card);
  const v = cardState(LUCA, found.week, card, u, dOf);
  const locked = v.state === "locked" ? v.why : undefined;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Shell go={go} week={found.week} card={card}>
        {card.needsAuthoring && (
          <p className="mt-3 rounded-lg border border-dashed border-[hsl(var(--border))] px-3 py-2 text-[12px] text-[hsl(var(--muted-foreground))]">
            This week is on the calendar but not authored yet. Weeks 0 and 1 are the finished examples.
          </p>
        )}
        {card.kind === "live_session" && <LiveSessionCard s={s} d={d} card={card} week={found.week} />}
        {card.kind === "community_call" && <CommunityCallCard s={s} d={d} card={card} />}
        {card.kind === "micro" && <MicroCard s={s} d={d} card={card} locked={locked} />}
        {card.kind === "block" && <BlockCard s={s} d={d} card={card} locked={locked} />}
      </Shell>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   HOME — the next action, not a dashboard
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Locked decision #9: home leads with the ONE thing to do next, and every lock
 * is explained in plain words. Stats are chips in the header, not the point of
 * the screen. This version computes that next action from the real template
 * instead of a hand-written hero, so it can never drift from the Path.
 */
export function ProgramHomeScreen({ s, go }: { s: PlayState; go: (k: string) => void }) {
  const u = useUnlock(s);
  const blocks = blocksDone(LUCA, u.submittedCardIds);

  const next = useMemo(() => {
    for (const week of LUCA.weeks) {
      for (const raw of orderedCards(week)) {
        const c = resolve(s, raw);
        if (c.needsAuthoring) continue;
        if (cardState(LUCA, week, c, u, dOf).state === "open") return { week, card: c };
      }
    }
    return null;
  }, [s, u]);

  const thisWeek = LUCA.weeks[0];

  return (
    <div className="mx-auto max-w-[760px]">
      <header className="mb-6">
        <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">Your next move</h2>
        <p className="mt-1 text-[13px] text-[hsl(var(--muted-foreground))]">
          {LUCA.name} · Cohort 02 · {blocks.done} of {blocks.total} blocks in
        </p>
      </header>

      {next ? (
        <button
          type="button"
          onClick={() => go(`card/${next.card.id}`)}
          className="mb-6 w-full rounded-2xl border border-[hsl(var(--cream)/0.35)] bg-[hsl(var(--card))] p-5 text-left"
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--gold))]">
            {KIND_LABEL[next.card.kind]} · week {next.week.no}
          </div>
          <div className="mt-2 text-[18px] font-extrabold leading-snug">{next.card.title}</div>
          {next.card.blurb && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-[hsl(var(--muted-foreground))]">{next.card.blurb}</p>
          )}
          <div className="mt-3 text-[12px] text-[hsl(var(--cream))]">Open it</div>
        </button>
      ) : (
        <p className="mb-6 text-[13px] text-[hsl(var(--muted-foreground))]">Nothing open right now. The Path has everything.</p>
      )}

      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
        This week — week {thisWeek.no}
      </div>
      <ul className="flex flex-col gap-2">
        {orderedCards(thisWeek).map((raw) => {
          const c = resolve(s, raw);
          const v = cardState(LUCA, thisWeek, c, u, dOf);
          const when = dOf(thisWeek.no, c.dayOffset);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => go(`card/${c.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px]">{c.title}</span>
                  <span className="block text-[11px] text-[hsl(var(--muted-foreground))]">
                    {dayName(when)}{c.time ? ` · ${c.time}` : ""} · {KIND_LABEL[c.kind]}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">
                  {v.state === "done" ? "done" : v.state === "locked" ? "locked" : `+${c.xp}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
