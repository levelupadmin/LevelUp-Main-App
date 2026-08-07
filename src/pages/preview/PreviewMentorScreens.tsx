/**
 * MENTOR DESK v2 — the mentor's actual working shape, per founder round 4:
 *
 *   pick a cohort → see every week (with submission counts, yours highlighted)
 *   → open a week → TWO tabs:
 *       Students     who's in, who submitted, who's missing — at a glance
 *       Submissions  the work itself — open, review, accept → Creator OS
 *   → Export CSV, straight from the week.
 *
 * Accepting a piece tells the mentor exactly what it unlocked for the student
 * ("can now place this in their Creator OS") — the artifact graph, felt.
 */
import { useMemo, useState } from "react";
import {
  Check, ClipboardList, ChevronRight, Users, Download, Lock, Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, SurfaceCard, StatCard, EmptyState } from "@/components/patterns";
import { ENGINE, SESSION_DATES, PEOPLE, MENTOR_SEED, CURRENT_WEEK, OPENS_ON } from "./previewData";
import { toneForPhase } from "./previewTheme";
import { LinkCard, BackRow, type ScreenProps } from "./PreviewScreens";

const STUDENTS = PEOPLE.filter((p) => !p.isMentor);

type ReviewState = "open" | "ship" | "fix";

/** Week-4 seeded review state, keyed by student id. */
const W4_SEED: Record<string, { itemId: string; state: ReviewState }> = {
  ananya: { itemId: "m1", state: "open" },
  karthik: { itemId: "m2", state: "open" },
  divya: { itemId: "m4", state: "ship" },
  rohan: { itemId: "m5", state: "fix" },
};

/* ── 1 · Cohort picker ──────────────────────────────────────────────────── */

export function MentorScreen({ s, go }: Pick<ScreenProps, "s" | "go">) {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mentor"
        title="Mentor desk"
        subtitle="Pick a cohort. You'll see every week — jump to the one you're mentoring."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <SurfaceCard variant="interactive" padding="lg" onClick={() => go("mentor/ca01")}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold">Creator Academy · Cohort 01</div>
              <div className="mt-0.5 text-[11.5px] text-[hsl(var(--muted-foreground))]">
                {STUDENTS.length} students · Week {CURRENT_WEEK} of 13 · 2 reviews open
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[hsl(var(--success)/0.4)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--success))]">
              Live <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </SurfaceCard>
        {s.cohort && (
          <SurfaceCard variant="static" padding="lg" className="opacity-80">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">{s.cohort.name}</div>
                <div className="mt-0.5 text-[11.5px] text-[hsl(var(--muted-foreground))]">Announced · starts {s.cohort.start} · no submissions yet</div>
              </div>
              <span className="shrink-0 rounded-full border border-[hsl(var(--gold)/0.4)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--gold))]">Upcoming</span>
            </div>
          </SurfaceCard>
        )}
      </div>
    </div>
  );
}

/* ── 2 · The weeks grid ─────────────────────────────────────────────────── */

export function MentorWeeksScreen({ s, go }: Pick<ScreenProps, "s" | "go">) {
  const ownIn = s.blockStatus !== "none" ? 1 : 0;
  return (
    <div className="space-y-6">
      <BackRow label="Cohorts" onClick={() => go("mentor")} />
      <PageHeader
        eyebrow="Mentor · Creator Academy · Cohort 01"
        title="All weeks"
        subtitle="You have access to every week. This week's reviews are waiting in Week 4."
      />
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {ENGINE.map((e) => {
          const t = toneForPhase(e.phase);
          const isCurrent = e.n === CURRENT_WEEK;
          const past = e.n < CURRENT_WEEK;
          const sub = isCurrent ? `${4 + ownIn} of ${STUDENTS.length + ownIn} in · 2 open` : past ? `${STUDENTS.length}/${STUDENTS.length} reviewed` : `opens ${OPENS_ON[e.n] ?? SESSION_DATES[e.n]}`;
          return (
            <SurfaceCard
              key={e.n}
              variant="interactive"
              padding="lg"
              className={isCurrent ? "border-[hsl(var(--gold)/0.4)]" : ""}
              onClick={() => go(`mentor/ca01/${e.n}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: t.c }}>
                    Week {e.n} · {SESSION_DATES[e.n]}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-semibold">{e.title}</div>
                  <div className={`mt-1 text-[11px] ${isCurrent ? "font-semibold text-[hsl(var(--gold))]" : "text-[hsl(var(--muted-foreground))]"}`}>{sub}</div>
                </div>
                {isCurrent ? (
                  <span className="shrink-0 rounded-full bg-[hsl(var(--gold)/0.14)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[hsl(var(--gold))]">You're here</span>
                ) : past ? (
                  <Check className="h-4 w-4 shrink-0 text-[hsl(var(--success))]" />
                ) : (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
                )}
              </div>
            </SurfaceCard>
          );
        })}
      </div>
    </div>
  );
}

/* ── 3 · One week, two tabs ─────────────────────────────────────────────── */

export function MentorWeekScreen({ s, d, go, week }: ScreenProps & { week: number }) {
  const e = ENGINE[week] ?? ENGINE[CURRENT_WEEK];
  const n = e.n;
  const isCurrent = n === CURRENT_WEEK;
  const past = n < CURRENT_WEEK;
  const [tab, setTab] = useState<"students" | "submissions">("students");
  const [seedState, setSeedState] = useState<Record<string, ReviewState>>({});
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [exported, setExported] = useState(false);

  const stateFor = (studentId: string): ReviewState | "missing" => {
    if (past) return studentId === "sana" ? "fix" : "ship";
    if (!isCurrent) return "missing";
    const seed = W4_SEED[studentId];
    if (!seed) return "missing";
    return seedState[seed.itemId] ?? seed.state;
  };

  const roster = useMemo(() => STUDENTS.map((p) => ({ ...p, review: stateFor(p.id) })), [seedState, past, isCurrent]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitted = roster.filter((r) => r.review !== "missing").length + (isCurrent && s.blockStatus !== "none" ? 1 : 0);
  const total = STUDENTS.length + (isCurrent && s.blockStatus !== "none" ? 1 : 0);
  const openCount = roster.filter((r) => r.review === "open").length + (isCurrent && s.blockStatus === "submitted" ? 1 : 0);

  const exportCsv = () => {
    const rows = [
      ["student", "niche", "city", "status"],
      ...(isCurrent && s.blockStatus !== "none" ? [["You", "—", "—", s.blockStatus === "accepted" ? "reviewed_ship" : "submitted"]] : []),
      ...roster.map((r) => [r.name, r.niche, r.city, r.review === "missing" ? "not_submitted" : r.review === "open" ? "submitted" : `reviewed_${r.review}`]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `cohort01_week${n}_submissions.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* jsdom / blocked download — the button still confirms */ }
    setExported(true);
    window.setTimeout(() => setExported(false), 2000);
  };

  const chip = (state: ReviewState | "missing") =>
    state === "missing" ? <span className="rounded-full border border-[hsl(var(--border-hover))] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">Not yet</span>
    : state === "open" ? <span className="rounded-full border border-[hsl(var(--gold)/0.4)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--gold))]">Submitted</span>
    : state === "ship" ? <span className="rounded-full border border-[hsl(var(--success)/0.4)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--success))]">Ship</span>
    : <span className="rounded-full border border-[hsl(var(--accent-amber)/0.45)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--accent-amber))]">Fix</span>;

  return (
    <div className="space-y-6">
      <BackRow label="All weeks" onClick={() => go("mentor/ca01")} />
      <PageHeader
        eyebrow={`Mentor · Cohort 01 · Week ${n} · ${SESSION_DATES[n]}`}
        title={e.title}
        subtitle={`The block: ${e.block}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              {exported ? <><Check /> Exported</> : <><Download /> Export CSV</>}
            </Button>
            <div className="flex rounded-lg border border-[hsl(var(--border))] p-0.5">
              {([["students", "Students"], ["submissions", "Submissions"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    tab === k ? "bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))]" : "text-[hsl(var(--muted-foreground))]"
                  }`}
                >
                  {k === "students" ? <Users className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />} {label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {n > CURRENT_WEEK ? (
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title={`Week ${n} hasn't opened yet`}
          description={`Doors open ${OPENS_ON[n] ?? SESSION_DATES[n]}. The session page is already visible to students — submissions land here once the week runs.`}
        />
      ) : tab === "students" ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Submitted" value={`${submitted}/${total}`} accent="amber" icon={<ClipboardList className="h-4 w-4" />} />
            <StatCard label="Reviews open" value={openCount} accent="cream" icon={<Flame className="h-4 w-4" />} />
            <StatCard label="Reviewed" value={submitted - openCount} accent="emerald" icon={<Check className="h-4 w-4" />} />
          </div>
          <Section title="Every student" description="Tap a submitted student to open their work.">
            <div className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-xl border border-[hsl(var(--border))]">
              {isCurrent && s.blockStatus !== "none" && (
                <button type="button" onClick={() => setTab("submissions")} className="flex w-full items-center gap-3 bg-[hsl(var(--card))] px-4 py-3 text-left transition-colors hover:bg-[hsl(var(--secondary))]">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[hsl(var(--cream)/0.14)] text-[11px] font-bold text-[hsl(var(--cream))]">YO</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">You</span>
                    <span className="block text-[11px] text-[hsl(var(--muted-foreground))]">your own Week 4 block, in the queue</span>
                  </span>
                  {chip(s.blockStatus === "accepted" ? "ship" : "open")}
                </button>
              )}
              {roster.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={r.review === "missing"}
                  onClick={() => setTab("submissions")}
                  className="flex w-full items-center gap-3 bg-[hsl(var(--card))] px-4 py-3 text-left transition-colors enabled:hover:bg-[hsl(var(--secondary))] disabled:cursor-default"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">{r.initials}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{r.name}</span>
                    <span className="block truncate text-[11px] text-[hsl(var(--muted-foreground))]">{r.niche} · {r.city}</span>
                  </span>
                  {chip(r.review)}
                </button>
              ))}
            </div>
          </Section>
        </>
      ) : (
        <Section title="The work" description={past ? "Closed on the Saturday call." : "One tap for a call review, typing optional."}>
          <div className="space-y-3">
            {isCurrent && s.blockStatus !== "none" && (
              <SurfaceCard variant="static" padding="lg" className="border-[hsl(var(--cream)/0.28)]">
                <QueueHeader name="You" initials="YO" when="just now" chip={chip(s.blockStatus === "accepted" ? "ship" : "open")} />
                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[hsl(var(--secondary))] p-3 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">{s.blockText}</p>
                {s.blockStatus === "submitted" && (
                  <div className="mt-4">
                    <Button variant="champagne" size="sm" onClick={() => d({ type: "mentor_accept" })}>
                      <Check /> Accept — reviewed on the call
                    </Button>
                  </div>
                )}
                {s.blockStatus === "accepted" && (
                  <p className="mt-3 text-[12px] font-medium text-[hsl(var(--success))]">
                    Shipped. The student can now place this piece in their Creator OS — it carries your review with it.
                  </p>
                )}
              </SurfaceCard>
            )}

            {isCurrent && MENTOR_SEED.filter((m) => m.week === n).map((m) => {
              const state = seedState[m.id] ?? (m.status === "closed" ? (m.closedNote?.startsWith("Fix") ? "fix" : "ship") : "open");
              return (
                <SurfaceCard key={m.id} variant="static" padding="lg">
                  <QueueHeader name={m.student} initials={m.initials} when={m.when} chip={chip(state)} />
                  <p className="mt-3 rounded-xl bg-[hsl(var(--secondary))] p-3 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">{m.body}</p>
                  {m.url && <div className="mt-3"><LinkCard url={m.url} compact /></div>}
                  {state === "open" ? (
                    <div className="mt-4">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="champagne" size="sm" onClick={() => setSeedState((st) => ({ ...st, [m.id]: "ship" }))}>
                          <Check /> Ship — reviewed on the call
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setSeedState((st) => ({ ...st, [m.id]: "fix" }))}>
                          Fix — needs a pass
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setFeedbackFor(feedbackFor === m.id ? null : m.id); setNote(""); }}>
                          Type feedback
                        </Button>
                      </div>
                      {feedbackFor === m.id && (
                        <div className="mt-3 flex gap-2">
                          <input
                            value={note}
                            onChange={(ev) => setNote(ev.target.value)}
                            placeholder={`Feedback for ${m.student.split(" ")[0]}…`}
                            aria-label={`Feedback for ${m.student}`}
                            className="w-full rounded-xl border border-[hsl(var(--input))] bg-black/40 px-3 py-2 text-[12.5px] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
                          />
                          <Button variant="outline" size="sm" disabled={!note.trim()} onClick={() => { setSeedState((st) => ({ ...st, [m.id]: "ship" })); setFeedbackFor(null); }}>
                            Send
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-[12px] font-medium" style={{ color: state === "ship" ? "hsl(var(--success))" : "hsl(var(--accent-amber))" }}>
                      {state === "ship"
                        ? `Shipped. ${m.student.split(" ")[0]} can now place this piece in their Creator OS — it carries your review with it.`
                        : `Marked Fix. ${m.student.split(" ")[0]} sees your verdict on the piece and resubmits — nothing re-locks.`}
                    </p>
                  )}
                </SurfaceCard>
              );
            })}

            {past && roster.map((r) => (
              <SurfaceCard key={r.id} variant="static" padding="md">
                <QueueHeader name={r.name} initials={r.initials} when="reviewed on the Sat call" chip={chip(r.review)} />
              </SurfaceCard>
            ))}

            {isCurrent && s.blockStatus === "none" && MENTOR_SEED.filter((m) => m.week === n).length === 0 && (
              <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="Nothing here yet" description="Submissions land as blocks come in." />
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function QueueHeader({ name, initials, when, chip }: { name: string; initials: string; when: string; chip: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold">{name}</div>
          <div className="text-[11px] text-[hsl(var(--muted-foreground))]">{when}</div>
        </div>
      </div>
      <span className="shrink-0">{chip}</span>
    </div>
  );
}
