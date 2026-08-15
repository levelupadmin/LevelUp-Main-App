/**
 * THE PEN — the admin surface for the real program.
 *
 * The founder's test for this screen, in his words: "whatever I see in the
 * front end should be able to be tweaked, changed, added and deleted in the
 * back end." So this is deliberately NOT a bespoke editor per week. It is one
 * list of weeks, one list of cards, and per card THE FORM ITS TYPE DEFINES —
 * the same four forms, forever. An admin never designs a screen; they pick a
 * type and fill it in, and the student page redraws itself.
 *
 * Every field here writes `cardEdits[cardId]`, which `resolve()` on the
 * student side layers over the template. That is the cohort-override level of
 * the three-level precedence in the architecture doc, played at prototype
 * scale: template → cohort override → per-student override.
 */
import { useState } from "react";
import { ArrowLeft, Video, Users, ClipboardCheck, Flag, Plus, Copy, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { PlayAction, PlayState } from "./previewStore";
import {
  KIND_LABEL, dateOf, fmtDate, dayName, orderedCards,
  type CardKind, type ProgramTemplate, type TemplateCard,
} from "./previewProgram";
import { resolve } from "./PreviewProgramScreens";

const ICON: Record<CardKind, typeof Video> = {
  live_session: Video, community_call: Users, micro: ClipboardCheck, block: Flag,
};

const makeDOf = (t: ProgramTemplate) => (w: number, d: number) => dateOf(t, w, d);

/** Sun..Sat plus the two edges the real curriculum needs. */
const DAYS: Array<{ off: number; label: string }> = [
  { off: -1, label: "Sat before" }, { off: 0, label: "Sun" }, { off: 1, label: "Mon" },
  { off: 2, label: "Tue" }, { off: 3, label: "Wed" }, { off: 4, label: "Thu" },
  { off: 5, label: "Fri" }, { off: 6, label: "Sat" }, { off: 7, label: "Sun after" },
];

/** Which fields each type owns. This table IS the payload schema. */
const FIELDS: Record<CardKind, Array<{ key: keyof TemplateCard; label: string; help: string; area?: boolean }>> = {
  live_session: [
    { key: "title", label: "Title", help: "What the student sees on the trail." },
    { key: "mentor", label: "Mentor", help: "Who is taking this session." },
    { key: "time", label: "Start time", help: "IST. The date comes from the week, never typed here." },
    { key: "blurb", label: "One-line framing", help: "Shown under the title.", area: true },
    { key: "zoomUrl", label: "Zoom link", help: "Leave empty and the student sees 'not up yet' instead of a dead button." },
    { key: "recordingUrl", label: "Recording link", help: "Empty until you upload. It replaces the Zoom door once the session has passed." },
  ],
  community_call: [
    { key: "title", label: "Title", help: "What the student sees." },
    { key: "mentor", label: "Host", help: "Who is holding the room." },
    { key: "time", label: "Start time", help: "IST." },
    { key: "blurb", label: "What this is", help: "No work attached. Say so plainly.", area: true },
    { key: "zoomUrl", label: "Zoom link", help: "Empty is fine — it shows as not up yet." },
  ],
  micro: [
    { key: "title", label: "Title", help: "The day's drill." },
    { key: "blurb", label: "The brief", help: "What to do and why. This is the whole instruction.", area: true },
  ],
  block: [
    { key: "title", label: "Title", help: "The week's one deliverable." },
    { key: "time", label: "Due time", help: "IST, on the day the template sets." },
    { key: "blurb", label: "The brief", help: "What to submit, in the student's words.", area: true },
  ],
};

export function ProgramAdminScreen({ s, d, go }: { s: PlayState; d: React.Dispatch<PlayAction>; go: (k: string) => void }) {
  const t = s.program;
  const dOf = makeDOf(t);
  const [start, setStart] = useState(t.anchorISO);

  const phases: string[] = [];
  for (const w of t.weeks) if (!phases.includes(w.phase)) phases.push(w.phase);

  return (
    <div className="mx-auto max-w-[760px]">
      <button type="button" onClick={() => go("admin")} className="mb-4 flex items-center gap-1.5 text-[12px] text-[hsl(var(--muted-foreground))]">
        <ArrowLeft className="h-3.5 w-3.5" /> Admin
      </button>
      <h2 className="text-[21px] font-extrabold tracking-[-0.02em]">{t.name} — content</h2>
      <p className="mt-1 text-[13px] text-[hsl(var(--muted-foreground))]">
        The template holds the shape. The start date turns it into a dated batch. Change either and the student Path redraws.
      </p>

      {/* THE BATCH LAYER, as one field. This is the whole of "launch a cohort". */}
      <div className="mt-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <label className="block text-[12px]" htmlFor="batch-start">
          Batch starts on
          <span className="mt-0.5 block text-[11px] text-[hsl(var(--muted-foreground))]">
            The Sunday of week 0. Every card in every week is dated from here — nothing else needs typing.
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="batch-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--cream)/0.5)]"
            />
            <button
              type="button"
              onClick={() => d({ type: "batch_start", startISO: start })}
              className="rounded-lg bg-[hsl(var(--cream))] px-4 py-2 text-[13px] font-semibold text-[hsl(var(--cream-text))]"
            >
              Re-date the batch
            </button>
          </div>
        </label>
        <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">
          Currently week 0 opens {fmtDate(dOf(0, -1))} and week {t.weeks.length - 1} lands {fmtDate(dOf(t.weeks.length - 1, 6))}.
        </p>
      </div>

      <div className="mt-6 mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
          {t.weeks.length} weeks · {phases.length} phases
        </span>
        <button
          type="button"
          onClick={() => d({ type: "week_add", at: t.weeks.length, phase: phases[phases.length - 1] ?? "New phase" })}
          className="flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-[12px]"
        >
          <Plus className="h-3.5 w-3.5" /> Add a week
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {t.weeks.map((w, i) => {
          const cards = orderedCards(w);
          const unauthored = cards.filter((c) => c.needsAuthoring).length;
          const phaseStart = i === 0 || t.weeks[i - 1].phase !== w.phase;
          return (
            <div key={`${w.phase}-${i}`}>
              {phaseStart && (
                <div className="mb-1.5 mt-3 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--gold))]">{w.phase}</span>
                  <button
                    type="button"
                    aria-label={`Rename phase ${w.phase}`}
                    onClick={() => {
                      const next = window.prompt("Phase name", w.phase);
                      if (next && next !== w.phase) d({ type: "phase_rename", from: w.phase, to: next });
                    }}
                    className="text-[10px] text-[hsl(var(--muted-foreground))] underline underline-offset-2"
                  >
                    rename
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5">
                <button type="button" onClick={() => go(`admin/week/${i}`)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13.5px] font-medium">Week {w.no} · {w.title}</span>
                  <span className="mt-0.5 block text-[11px] text-[hsl(var(--muted-foreground))]">
                    {fmtDate(dOf(w.no, 0))} · {cards.length} cards{unauthored ? ` · ${unauthored} to write` : ""}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <IconBtn label={`Move week ${w.no} up`} disabled={i === 0} onClick={() => d({ type: "week_move", from: i, to: i - 1 })}><ChevronUp className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label={`Move week ${w.no} down`} disabled={i === t.weeks.length - 1} onClick={() => d({ type: "week_move", from: i, to: i + 1 })}><ChevronDown className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label={`Duplicate week ${w.no}`} onClick={() => d({ type: "week_duplicate", index: i })}><Copy className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label={`Delete week ${w.no}`} onClick={() => d({ type: "week_delete", index: i })}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))] disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function ProgramWeekEditorScreen({
  s, d, go, weekNo,
}: { s: PlayState; d: React.Dispatch<PlayAction>; go: (k: string) => void; weekNo: number }) {
  const t = s.program;
  const dOf = makeDOf(t);
  const week = t.weeks.find((w) => w.no === weekNo);
  const weekIndex = t.weeks.findIndex((w) => w.no === weekNo);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<CardKind>("micro");
  const [newDay, setNewDay] = useState(1);
  if (!week) return null;
  const cards = orderedCards(week);

  return (
    <div className="mx-auto max-w-[760px]">
      <button
        type="button"
        onClick={() => go("admin/week")}
        className="mb-4 flex items-center gap-1.5 text-[12px] text-[hsl(var(--muted-foreground))]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All weeks
      </button>
      <label className="block" htmlFor="wk-title">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Week {week.no} title</span>
        <input
          id="wk-title"
          value={week.title}
          onChange={(e) => d({ type: "week_edit", index: weekIndex, patch: { title: e.target.value } })}
          className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-[19px] font-extrabold tracking-[-0.02em] outline-none focus:border-[hsl(var(--cream)/0.5)]"
        />
      </label>
      <p className="mt-1 text-[13px] text-[hsl(var(--muted-foreground))]">
        Class on {fmtDate(dOf(week.no, 0))}. Dates are computed from the cohort start date — the template holds day offsets, never dates.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        {cards.map((raw) => {
          const card = resolve(s, raw);
          const Icon = ICON[card.kind];
          const when = dOf(week.no, card.dayOffset);
          const open = openCard === card.id;
          return (
            <div key={card.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <button
                type="button"
                onClick={() => setOpenCard(open ? null : card.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{card.title}</span>
                  <span className="mt-0.5 block text-[11px] text-[hsl(var(--muted-foreground))]">
                    {dayName(when)} {fmtDate(when).replace(/^\w+,?\s*/, "")} · {KIND_LABEL[card.kind]}
                    {card.kind === "live_session" && !card.zoomUrl ? " · no Zoom link yet" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">{open ? "close" : "edit"}</span>
              </button>
              <div className="flex items-center gap-1 border-t border-[hsl(var(--border))] px-3 py-2">
                <select
                  aria-label={`Day for ${card.title}`}
                  value={card.dayOffset}
                  onChange={(e) => d({ type: "admin_save_card", cardId: card.id, patch: { dayOffset: Number(e.target.value) } })}
                  className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-[11px]"
                >
                  {DAYS.map((x) => (
                    <option key={x.off} value={x.off}>{x.label}</option>
                  ))}
                </select>
                <span className="flex-1" />
                <IconBtn label={`Duplicate ${card.title}`} onClick={() => d({ type: "card_duplicate", weekIndex, cardId: card.id })}><Copy className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn label={`Delete ${card.title}`} onClick={() => d({ type: "card_delete", weekIndex, cardId: card.id })}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
              </div>

              {open && (
                <div className="border-t border-[hsl(var(--border))] px-4 py-4">
                  <CardForm s={s} d={d} card={card} />
                  <button
                    type="button"
                    onClick={() => go(`card/${card.id}`)}
                    className="mt-3 w-full rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-[12px]"
                  >
                    View this as a student
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Add a card</div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Card type"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as CardKind)}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-2 text-[12px]"
            >
              {(Object.keys(KIND_LABEL) as CardKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
            <select
              aria-label="Day"
              value={newDay}
              onChange={(e) => setNewDay(Number(e.target.value))}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-2 text-[12px]"
            >
              {DAYS.map((x) => (
                <option key={x.off} value={x.off}>{x.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => d({ type: "card_add", weekIndex, kind: newKind, dayOffset: newDay })}
              className="flex items-center gap-1 rounded-lg bg-[hsl(var(--cream))] px-3 py-2 text-[12px] font-semibold text-[hsl(var(--cream-text))]"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">
            Any type, any day, as many as you like. A week can be four sessions and no assignment, or a challenge every single day.
          </p>
        </div>
      </div>
    </div>
  );
}

function CardForm({ s, d, card }: { s: PlayState; d: React.Dispatch<PlayAction>; card: TemplateCard }) {
  const fields = FIELDS[card.kind];
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of fields) o[f.key as string] = (card[f.key] as string) ?? "";
    return o;
  });
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {fields.map((f) => {
        const id = `f-${card.id}-${String(f.key)}`;
        return (
          <label key={String(f.key)} className="block text-[12px]" htmlFor={id}>
            {f.label}
            <span className="mt-0.5 block text-[11px] text-[hsl(var(--muted-foreground))]">{f.help}</span>
            {f.area ? (
              <textarea
                id={id}
                rows={2}
                value={draft[f.key as string]}
                onChange={(e) => { setDraft({ ...draft, [f.key as string]: e.target.value }); setSaved(false); }}
                className="mt-1.5 w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--cream)/0.5)]"
              />
            ) : (
              <input
                id={id}
                value={draft[f.key as string]}
                onChange={(e) => { setDraft({ ...draft, [f.key as string]: e.target.value }); setSaved(false); }}
                className="mt-1.5 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--cream)/0.5)]"
              />
            )}
          </label>
        );
      })}

      {card.kind === "block" && card.submit && (
        <div className="rounded-lg bg-[hsl(var(--secondary))] p-3 text-[11px] text-[hsl(var(--muted-foreground))]">
          Submission box: link, notes and file are on. Each carries its own helper line telling the student what belongs there.
        </div>
      )}
      {card.kind === "live_session" && (
        <div className="rounded-lg bg-[hsl(var(--secondary))] p-3 text-[11px] text-[hsl(var(--muted-foreground))]">
          Recording is gated on the feedback form: two ratings and a note before it opens.
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          const patch: Partial<TemplateCard> = {};
          for (const f of fields) (patch as Record<string, string>)[f.key as string] = draft[f.key as string];
          d({ type: "admin_save_card", cardId: card.id, patch });
          setSaved(true);
        }}
        className="rounded-lg bg-[hsl(var(--cream))] px-4 py-2 text-[13px] font-semibold text-[hsl(var(--cream-text))]"
      >
        Save
      </button>
      {saved && <p className="text-[11px] text-[hsl(var(--success))]">Saved. The student page shows this now.</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   MENTOR DESK — the real submissions
   ───────────────────────────────────────────────────────────────────────── */

/**
 * What the mentor login opens. Every row here came out of a student's
 * submission box on the Path, so the mentor reads exactly what was typed —
 * no export, no spreadsheet, no chasing a Drive link in WhatsApp.
 */
export function ProgramMentorScreen({
  s, d, go,
}: { s: PlayState; d: React.Dispatch<PlayAction>; go: (k: string) => void }) {
  return (
    <div className="mx-auto max-w-[760px]">
      <button
        type="button"
        onClick={() => go("mentor")}
        className="mb-4 flex items-center gap-1.5 text-[12px] text-[hsl(var(--muted-foreground))]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Mentor desk
      </button>
      <h2 className="text-[21px] font-extrabold tracking-[-0.02em]">Cohort 02 — submissions</h2>
      <p className="mt-1 text-[13px] text-[hsl(var(--muted-foreground))]">
        Straight from the Path. Give one verdict and the reason behind it.
      </p>

      {s.submissions.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-[hsl(var(--border))] px-4 py-6 text-center text-[13px] text-[hsl(var(--muted-foreground))]">
          Nothing submitted yet. Submit a week from the Path and it lands here.
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {s.submissions.map((sub) => (
            <SubmissionRow key={sub.cardId} s={s} d={d} cardId={sub.cardId} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubmissionRow({ s, d, cardId }: { s: PlayState; d: React.Dispatch<PlayAction>; cardId: string }) {
  const sub = s.submissions.find((x) => x.cardId === cardId);
  const [note, setNote] = useState("");
  if (!sub) return null;

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[14px] font-bold">{sub.cardTitle}</div>
        <div className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">week {sub.weekNo} · {sub.when}</div>
      </div>

      {sub.link && (
        <p className="mt-2 truncate text-[12px] text-[hsl(var(--cream))]">{sub.link}</p>
      )}
      {sub.text && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-[13px] leading-relaxed">{sub.text}</p>
      )}
      {sub.fileName && <p className="mt-2 text-[12px] text-[hsl(var(--muted-foreground))]">Attached: {sub.fileName}</p>}

      {sub.verdict ? (
        <p className="mt-3 text-[12px]">
          <span className="font-bold uppercase text-[hsl(var(--success))]">{sub.verdict}</span>
          {sub.mentorNote ? ` — ${sub.mentorNote}` : ""}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <input
            aria-label={`Feedback for ${sub.cardTitle}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="One line. The direction, not a grade."
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--cream)/0.5)]"
          />
          <div className="flex gap-2">
            {(["ship", "fix", "hold"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => d({ type: "mentor_verdict", cardId: sub.cardId, verdict: v, note })}
                className="flex-1 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-[12px] font-semibold uppercase tracking-wide"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
