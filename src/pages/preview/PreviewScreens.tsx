/**
 * The eight prototype screens. Presentational only — no queries, no mutations.
 * Every button that would write something is inert on purpose (see
 * `CreatorStudioPreview.tsx` for how taps are acknowledged without lying).
 */
import { useState } from "react";
import {
  Flame, Lock, Check, Play, FileText, ClipboardList, Sparkles, Upload,
  Video, CalendarPlus, KeyRound, ChevronRight, Link2, Plus, Wand2, Target,
} from "lucide-react";
import { Eyebrow, Chip, Card, Btn, Avatar, LinkPreviewCard, PdfCard } from "./PreviewUI";
import { STATS, FEED, ALBUM, MENTOR_QUEUE, ENGINE } from "./previewData";
import { toneForPhase } from "./previewTheme";

const Serif = ({ children }: { children: React.ReactNode }) => (
  <span className="font-serif italic text-[hsl(var(--cream))]">{children}</span>
);

/* ── 1 · Home ───────────────────────────────────────────────────────────── */

/**
 * The screenshot review that forced this rewrite, so it never regresses:
 * v2's Home repeated the header stats as three stretched ovals, gave the
 * "continue" moment one thin row, and left half the viewport empty. The rules
 * now baked in: stats render ONCE (the shell header owns them); the hero is an
 * asymmetric split that owns the top of the page; every band has gradient art
 * or tinted depth so black-on-black never reads flat; and nothing floats in
 * unmeasured space.
 */

/** The 13-block progress spine — each segment tinted by its phase. */
function EngineSpine() {
  return (
    <div>
      <div className="flex gap-1">
        {ENGINE.map((e) => {
          const t = toneForPhase(e.phase);
          const done = e.n < STATS.week;
          const now = e.n === STATS.week;
          return (
            <div
              key={e.n}
              title={`W${e.n} · ${e.title}`}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{
                background: done ? t.c : now ? `${t.c}66` : "hsl(var(--secondary))",
                boxShadow: now ? `0 0 8px ${t.c}55` : undefined,
              }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
        <span>W0</span>
        <span className="text-[hsl(var(--accent-amber))]">Block {STATS.week} — you are here</span>
        <span>W12</span>
      </div>
    </div>
  );
}

export function HomeScreen({ go, tap }: { go: (k: string) => void; tap: (s: string) => void }) {
  const tone = toneForPhase("Produce");
  return (
    <div className="space-y-5">
      {/* ── HERO — the week you are inside, split 5/3 ──────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-[hsl(var(--border))]">
        <div className="grid lg:grid-cols-[5fr_3fr]">
          {/* left: the week, lit by its phase colour */}
          <div
            className="relative p-6 sm:p-8"
            style={{ background: `linear-gradient(135deg, ${tone.c}1c 0%, ${tone.c}08 42%, transparent 75%)` }}
          >
            <div
              className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl"
              style={{ background: tone.c }}
            />
            <div className="flex items-center gap-2.5">
              <span
                className="grid h-9 w-9 place-items-center rounded-lg text-[12px] font-extrabold"
                style={{ background: tone.c, color: "hsl(var(--cream-text))" }}
              >
                W4
              </span>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: tone.c }}>
                Phase 2 · Produce
              </div>
            </div>
            <h2 className="mt-4 text-[26px] font-semibold leading-tight tracking-[-0.025em] sm:text-[32px]">
              Advanced <Serif>Production</Serif>
            </h2>
            <p className="mt-2 max-w-[42ch] text-[13px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              Lighting depth, the reusable B-roll Bank, the teleprompter, Batch Day.
            </p>
            <div className="mt-4 flex items-center gap-2 text-[12.5px]">
              <Target className="h-3.5 w-3.5 shrink-0" style={{ color: tone.c }} />
              <span className="font-semibold">The block:</span>
              <span className="text-[hsl(var(--muted-foreground))]">B-roll bank + 3 reels from one sitting</span>
            </div>
            <div className="mt-6"><EngineSpine /></div>
          </div>

          {/* right: the one next action */}
          <div className="flex flex-col justify-center gap-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-7 lg:border-l lg:border-t-0">
            <Eyebrow>Pick up where you stopped</Eyebrow>
            <div className="text-[15px] font-semibold leading-snug tracking-[-0.01em]">
              Wed — Write 3 hooks for one idea
            </div>
            <p className="text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              One day left before the block is due Thursday 9 PM. Finishing it unlocks Second Brain.
            </p>
            <Btn onClick={() => go("path")}>Continue on the Path</Btn>
            <div className="grid grid-cols-3 divide-x divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))] text-center">
              {[["Sun 3 PM", "Class"], ["Thu 9 PM", "Block due"], ["Sat 6 PM", "Ship/Fix/Hold"]].map(([v, k]) => (
                <div key={k} className="px-1 py-2">
                  <div className="text-[11.5px] font-bold">{v}</div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">{k}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── second band: live session (weighted) + the gate ─────────────── */}
      <section className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="group overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="relative grid h-40 place-items-center bg-gradient-to-br from-[#221a10] via-[#120e08] to-black sm:h-44">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{ background: "radial-gradient(420px 180px at 30% 20%, hsl(var(--gold)/0.25), transparent 70%)" }}
            />
            <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-[hsl(var(--champagne-from))] to-[hsl(var(--champagne-to))] shadow-lg transition-transform group-hover:scale-105">
              <Play className="h-4 w-4 fill-[hsl(var(--cream-text))] text-[hsl(var(--cream-text))]" />
            </div>
            <div className="absolute left-4 top-4 flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--gold))]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--gold))]">
                Live · Sun 3 PM
              </span>
            </div>
          </div>
          <div className="flex items-end justify-between gap-4 p-5">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold tracking-[-0.01em]">Positioning teardown</div>
              <p className="mt-1 text-[12px] text-[hsl(var(--muted-foreground))]">
                Rahul reviews six submissions on the call.
              </p>
            </div>
            <button
              type="button"
              onClick={() => tap("Join session")}
              className="shrink-0 rounded-lg border border-[hsl(var(--border-hover))] px-4 py-2 text-[12.5px] font-semibold transition-transform active:scale-[0.97]"
            >
              Join
            </button>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-[hsl(var(--border))] bg-black/40 p-5">
          <div>
            <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <Lock className="h-3.5 w-3.5" />
              <Eyebrow>Week 5 · On-Camera Confidence</Eyebrow>
            </div>
            <div className="mt-2.5 text-[14px] font-semibold text-[hsl(var(--muted-foreground))]">
              Opens Sun 10 Aug — once Week 4's block is in
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              The recording stays locked with it. Everything you've finished stays open.
            </p>
          </div>
          <button
            type="button"
            onClick={() => go("locked")}
            className="mt-4 self-start text-[12px] font-semibold text-[hsl(var(--gold))] underline underline-offset-4"
          >
            See what's missing
          </button>
        </div>
      </section>
    </div>
  );
}

/* ── 3 · Session ────────────────────────────────────────────────────────── */

export function SessionScreen({ tap, onBack }: { tap: (s: string) => void; onBack: () => void }) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:items-start">
      <div className="space-y-3.5">
      <button type="button" onClick={onBack} className="text-[12px] text-[hsl(var(--muted-foreground))] underline underline-offset-4">
        ← Back to the path
      </button>
      <div className="flex items-center gap-2">
        <Chip tone="cream">Week 4 · Sun</Chip><Chip>+20 XP</Chip>
      </div>

      <div className="relative grid h-44 place-items-center overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-gradient-to-br from-[#1c1712] to-black">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-[hsl(var(--champagne-from))] to-[hsl(var(--champagne-to))]">
          <Play className="h-4 w-4 fill-[hsl(var(--cream-text))] text-[hsl(var(--cream-text))]" />
        </div>
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">62:14</span>
      </div>

      <div>
        <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Positioning teardown — Week 4 live</h2>
        <p className="mt-1 text-[12px] text-[hsl(var(--muted-foreground))]">Recorded Sun 3 Aug</p>
      </div>

      <Card tone="success">
        <Eyebrow>Your attendance</Eyebrow>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[22px] font-semibold text-[hsl(var(--success))]">41</span>
          <span className="text-[12.5px] text-[hsl(var(--muted-foreground))]">of 62 minutes · 66%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--secondary))]">
          <div className="h-full w-[66%] rounded-full bg-[hsl(var(--success))]" />
        </div>
        <p className="mt-2 text-[11.5px] text-[hsl(var(--muted-foreground))]">
          Over 60% — full 20 XP awarded. Watch the rest of the recording for catch-up XP.
        </p>
      </Card>

      </div>

      {/* On desktop the materials and the assignment sit beside the player
          instead of below it — a 1400px monitor should not make the reader
          scroll past a video to find the thing they came to do. */}
      <aside className="mt-3.5 space-y-3.5 lg:mt-0 lg:sticky lg:top-4">
      <Card>
        <Eyebrow>Session materials</Eyebrow>
        <div className="mt-2.5 space-y-1.5">
          {[
            { icon: FileText, label: "Transcript", meta: "VTT · searchable" },
            { icon: ClipboardList, label: "Cheat sheet", meta: "PDF · 2 pages" },
            { icon: Link2, label: "Swipe file", meta: "External link" },
          ].map((m) => (
            <button
              key={m.label}
              type="button"
              onClick={() => tap(m.label)}
              className="flex w-full items-center gap-2.5 rounded-[var(--radius)] bg-[hsl(var(--secondary))] px-3 py-2.5 text-left active:opacity-70"
            >
              <m.icon className="h-3.5 w-3.5 text-[hsl(var(--cream))]" />
              <span className="text-[12.5px] font-medium">{m.label}</span>
              <span className="ml-auto text-[10.5px] text-[hsl(var(--muted-foreground))]">{m.meta}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card tone="lit">
        <Eyebrow>This week's assignment</Eyebrow>
        <div className="mt-1.5 text-[14px] font-semibold">Post one reel using your positioning line</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip tone="gold">Due Sat 11:59 PM</Chip><Chip tone="violet">Mentor reviews this one</Chip>
        </div>
        <div className="mt-3 rounded-[var(--radius)] border border-dashed border-[hsl(var(--border-hover))] px-3 py-5 text-center">
          <Upload className="mx-auto h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <div className="mt-2 text-[12px] font-medium">Paste a link, or attach a PDF</div>
          <div className="mt-0.5 text-[10.5px] text-[hsl(var(--muted-foreground))]">
            YouTube · Instagram · Drive · PDF up to 10 MB
          </div>
        </div>
        <div className="mt-2.5 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-black/40 px-3 py-2.5 text-[12px] text-[hsl(var(--muted-foreground))]">
          A note for your mentor (optional)…
        </div>
        <div className="mt-3"><Btn onClick={() => tap("Submit assignment")}>Submit assignment</Btn></div>
      </Card>
      </aside>
    </div>
  );
}

/* ── Second Brain ───────────────────────────────────────────────────────── */

export function BrainScreen({ tap }: { tap: (s: string) => void }) {
  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
      <div className="space-y-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Spy a reel</h2>
          <span className="ml-auto"><Chip tone="success">Unlocked W4</Chip></span>
        </div>
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-black/40 px-3 py-2.5 text-[12px] text-[hsl(var(--muted-foreground))]">
          Paste an Instagram reel or YouTube link…
        </div>
        <Card tone="success">
          <div className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
            <Eyebrow>Transcribed in 11s — live in production today</Eyebrow>
          </div>
          <p className="mt-1.5 text-[12px] text-[hsl(var(--muted-foreground))]">@thefinancegirl · 47s · 812k views</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
            Apify pulls the reel, ffmpeg strips the audio, Cloudflare Whisper transcribes it. No machine of yours is involved.
          </p>
        </Card>
        <Card tone="lit">
          <Eyebrow>Breakdown — new</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip tone="cream">Hook: contradiction</Chip><Chip>problem → proof → ask</Chip>
          </div>
          <p className="mt-2.5 text-[12.5px] leading-relaxed">
            <span className="font-semibold">Why it worked. </span>
            <span className="text-[hsl(var(--muted-foreground))]">
              She names the wrong belief in the first four words, so you stay to find out whether you hold it.
            </span>
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed">
            <span className="font-semibold text-[hsl(var(--gold))]">Steal this. </span>
            <span className="text-[hsl(var(--muted-foreground))]">Open on the belief, not the topic.</span>
          </p>
        </Card>
      </div>

      <div className="mt-3.5 space-y-3.5 lg:mt-0">
        <Card tone="lit">
          <div className="flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5 text-[hsl(var(--cream))]" />
            <Eyebrow>Remix in my voice — new</Eyebrow>
          </div>
          <div className="mt-2.5 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-black/40 px-3 py-2.5 text-[12px] text-[hsl(var(--muted-foreground))]">
            Why your first SIP feels pointless
          </div>
          <div className="mt-3"><Btn onClick={() => tap("Write it in my voice")}>Write it in my voice</Btn></div>
          <p className="mt-2.5 text-[11.5px] text-[hsl(var(--muted-foreground))]">
            Uses your Voice Profile, built from five of your own reels.
          </p>
        </Card>
        <Card>
          <Eyebrow>Your library</Eyebrow>
          <div className="mt-2.5 space-y-1.5">
            {[["Learn", 12], ["Adapt", 7], ["Saved", 23]].map(([b, n]) => (
              <div key={String(b)} className="flex items-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--secondary))] px-3 py-2.5">
                <span className="text-[12.5px] font-medium">{b}</span>
                <span className="ml-auto text-[11px] text-[hsl(var(--muted-foreground))]">{n} reels</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── 4 · Locked ─────────────────────────────────────────────────────────── */

export function LockedScreen({ go, tap }: { go: (k: string) => void; tap: (s: string) => void }) {
  return (
    <div className="flex min-h-[62vh] flex-col justify-center space-y-4 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <Lock className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
      </div>
      <div>
        <h2 className="text-[19px] font-semibold tracking-[-0.025em]">
          Week 5 is <Serif>waiting on you</Serif>
        </h2>
        <p className="mx-auto mt-2 max-w-[300px] text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
          The date has passed, but Week 4's assignment isn't in yet. Submit it and Week 5 — recording included —
          opens straight away.
        </p>
      </div>
      <Card className="text-left">
        <Eyebrow>What's missing</Eyebrow>
        <div className="mt-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px]">Week 4 · Post one reel</span>
            <span className="ml-auto"><Chip tone="danger">Not submitted</Chip></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-[hsl(var(--muted-foreground))]">Week 4 · 3 hooks</span>
            <span className="ml-auto"><Chip tone="success">Accepted</Chip></span>
          </div>
        </div>
      </Card>
      <div className="space-y-2">
        <Btn onClick={() => go("session")}>Go to Week 4's assignment</Btn>
        <Btn variant="quiet" onClick={() => tap("Request unlock")}>Stuck? Ask your mentor to unlock it</Btn>
      </div>
      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
        Everything you've already finished stays open. Nothing is taken away.
      </p>
    </div>
  );
}

/* ── 5 · Feed ───────────────────────────────────────────────────────────── */

export function FeedScreen({ tap }: { tap: (s: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-3.5 xl:columns-2 xl:gap-5 xl:space-y-0 xl:[&>*]:mb-5 xl:[&>*]:break-inside-avoid">
      <div className="flex items-center gap-2">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Feed</h2>
        <span className="ml-auto"><Chip tone="cream">Week 4</Chip></span>
      </div>

      <Card tone="lit">
        <div className="flex gap-2.5">
          <Avatar initials="AV" />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Share what you made this week…"
            className="w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none placeholder:text-[hsl(var(--muted-foreground))]"
          />
        </div>
        <div className="mt-2 flex items-center gap-1.5 border-t border-[hsl(var(--border))] pt-2.5">
          <button type="button" onClick={() => tap("Paste link")} className="active:opacity-70">
            <Chip tone="cream"><Link2 className="mr-1 h-3 w-3" />Paste link</Chip>
          </button>
          <button type="button" onClick={() => tap("Attach PDF")} className="active:opacity-70">
            <Chip><FileText className="mr-1 h-3 w-3" />PDF</Chip>
          </button>
          <span className="ml-auto"><Chip solid>Post</Chip></span>
        </div>
        <p className="mt-2 text-[10.5px] text-[hsl(var(--muted-foreground))]">
          Videos go in as links — YouTube, Instagram or Drive. PDFs up to 10 MB attach directly.
        </p>
      </Card>

      {FEED.map((p) => (
        <Card key={p.id}>
          <div className="flex items-center gap-2.5">
            <Avatar initials={p.initials} />
            <div>
              <div className="text-[12.5px] font-semibold">{p.author}</div>
              <div className="text-[10.5px] text-[hsl(var(--muted-foreground))]">{p.when} ago</div>
            </div>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed">{p.body}</p>
          <div className="mt-2.5">
            {p.link && <LinkPreviewCard {...p.link} />}
            {p.pdf && <PdfCard {...p.pdf} />}
          </div>
          <button
            type="button"
            onClick={() => tap("Replies")}
            className="mt-2.5 text-[11.5px] text-[hsl(var(--muted-foreground))] active:opacity-70"
          >
            {p.replies} replies
          </button>
        </Card>
      ))}
    </div>
  );
}

/* ── 6 · Album ──────────────────────────────────────────────────────────── */

const SLOT_LOOK = {
  filled: "border-[hsl(var(--success)/0.34)] bg-[hsl(var(--success)/0.13)] text-[hsl(var(--success))]",
  review: "border-[hsl(var(--gold)/0.34)] bg-[hsl(var(--gold)/0.12)] text-[hsl(var(--gold))]",
  empty: "border-dashed border-[hsl(var(--border-hover))] bg-black/40",
  locked: "border-[hsl(var(--border))] bg-black/60 text-[hsl(var(--border-hover))]",
} as const;

export function AlbumScreen({ tap }: { tap: (s: string) => void }) {
  return (
    <div className="space-y-3.5 lg:mx-auto lg:max-w-3xl">
      <div className="flex items-center gap-3.5">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
          style={{ background: "conic-gradient(hsl(var(--cream)) 0 41%, hsl(var(--secondary)) 41%)" }}
        >
          <div className="grid h-[52px] w-[52px] place-items-center rounded-full bg-[hsl(var(--background))] text-[13px] font-bold">
            19
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">Ananya R.</div>
          <p className="mt-0.5 font-serif text-[13.5px] italic leading-snug text-[hsl(var(--cream))]">
            "I explain money to people who were never taught it."
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <Chip tone="success">19 / 46</Chip><Chip tone="gold">2 in review</Chip>
          </div>
        </div>
      </div>

      <Card tone="success">
        <div className="flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
          <Eyebrow>Just approved by Rahul</Eyebrow>
        </div>
        <div className="mt-1.5 text-[13.5px] font-semibold">3 hooks — "the client who ghosted me"</div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
          "Hook 2 is the one. It starts mid-argument and doesn't explain itself."
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Chip solid>Scripts · Hook bank</Chip><Chip>Body of Work</Chip>
        </div>
        <div className="mt-3"><Btn onClick={() => tap("Add to Album")}>Add to my Album</Btn></div>
      </Card>

      {ALBUM.map((b) => (
        <div key={b.name}>
          <div className="mb-1.5 flex items-center gap-2">
            <Eyebrow>{b.name}</Eyebrow>
            <span className="ml-auto">
              {b.unlockNote ? <Chip>{b.unlockNote}</Chip> : <Chip tone={b.filled === b.total ? "success" : "gold"}>{b.filled}/{b.total}</Chip>}
            </span>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {b.slots.map((s, i) => (
              <div key={i} className={`grid aspect-square place-items-center rounded-lg border ${SLOT_LOOK[s]}`}>
                {s === "filled" && <Check className="h-3.5 w-3.5" />}
                {s === "review" && <span className="text-[11px]">◷</span>}
                {s === "locked" && <Lock className="h-3 w-3" />}
              </div>
            ))}
          </div>
        </div>
      ))}

      <Card tone="locked">
        <p className="text-[11.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
          Later: one toggle turns this into <span className="text-[hsl(var(--gold))]">app.leveluplearning.in/@ananya</span> — a public page for her bio link.
        </p>
      </Card>
    </div>
  );
}

/* ── 7 · Mentor desk ────────────────────────────────────────────────────── */

export function MentorScreen({ tap }: { tap: (s: string) => void }) {
  return (
    <div className="space-y-3.5 lg:mx-auto lg:max-w-3xl">
      <div className="flex items-center gap-2">
        <Chip tone="violet">MENTOR</Chip>
        <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Review queue</h2>
        <span className="ml-auto"><Chip tone="cream">12 open</Chip></span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip solid>Week 4</Chip><Chip>All weeks</Chip>
        <button type="button" onClick={() => tap("Export CSV")} className="active:opacity-70"><Chip>⇩ Export CSV</Chip></button>
      </div>

      <Card>
        {MENTOR_QUEUE.map((r) => (
          <div key={r.name} className="flex items-center gap-2.5 border-b border-[hsl(var(--border))] py-2.5 last:border-0">
            <Avatar initials={r.initials} />
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium">{r.name}</div>
              <div className="text-[10.5px] text-[hsl(var(--muted-foreground))]">{r.type} · {r.when}</div>
            </div>
            <span className="ml-auto">
              {r.status === "open" ? <Chip tone="gold">Open</Chip> : <Chip tone="success">Closed</Chip>}
            </span>
          </div>
        ))}
      </Card>

      <Card tone="lit">
        <Eyebrow>Ananya R. · Week 4</Eyebrow>
        <div className="mt-1.5 text-[13.5px] font-semibold">Post one reel using your positioning line</div>
        <div className="mt-2.5"><LinkPreviewCard kind="instagram" title="Nobody teaches you what to do with your first salary" site="Instagram" duration="0:47" /></div>
        <div className="mt-3"><Eyebrow>Close it however you actually work</Eyebrow></div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => tap("Reviewed on call")} className="active:opacity-70"><Chip tone="success">✓ Reviewed on the call</Chip></button>
          <button type="button" onClick={() => tap("Attach video review")} className="active:opacity-70"><Chip tone="cream">Attach video review</Chip></button>
          <button type="button" onClick={() => tap("Type feedback")} className="active:opacity-70"><Chip>Type feedback</Chip></button>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <Eyebrow>Rating</Eyebrow>
          {[1, 2, 3, 4, 5].map((n) => (<Chip key={n} solid={n === 4}>{n}</Chip>))}
          <Chip>skip</Chip>
        </div>
        <div className="mt-3"><Btn onClick={() => tap("Accept & close")}>Accept &amp; close</Btn></div>
      </Card>
    </div>
  );
}

/* ── 8 · Admin ──────────────────────────────────────────────────────────── */

export function AdminScreen({ tap }: { tap: (s: string) => void }) {
  const actions = [
    { icon: CalendarPlus, title: "Create a live session", body: "Schedules it, creates the meeting, issues a personal join link to every enrolled student." },
    { icon: Video, title: "Upload a recording", body: "Goes to protected storage. Plays only for enrolled students, through an expiring link." },
    { icon: Plus, title: "Create a course", body: "New offering, sections and chapters — the existing admin flow, reachable from here." },
    { icon: KeyRound, title: "Unlock a week for one student", body: "Overrides the gate for one person, with a reason and an audit trail." },
  ];
  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-2">
        <Chip tone="violet">ADMIN</Chip>
        <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Creator Studio control</h2>
      </div>

      {actions.map((a) => (
        <button key={a.title} type="button" onClick={() => tap(a.title)} className="w-full text-left active:opacity-80">
          <Card>
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[hsl(var(--cream)/0.1)]">
                <a.icon className="h-4 w-4 text-[hsl(var(--cream))]" />
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">{a.title}</div>
                <p className="mt-1 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">{a.body}</p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
            </div>
          </Card>
        </button>
      ))}

      <Card tone="lit">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--cream))]" />
          <Eyebrow>Module switches — per cohort</Eyebrow>
        </div>
        <div className="mt-2.5 space-y-2">
          {[["Path", true], ["Second Brain", true], ["Album", true], ["Feed", true], ["Demo Day", false]].map(([label, on]) => (
            <div key={String(label)} className="flex items-center gap-2">
              <span className="text-[12.5px]">{label}</span>
              <span className="ml-auto">
                <div className={`h-5 w-9 rounded-full p-0.5 ${on ? "bg-[hsl(var(--cream))]" : "bg-[hsl(var(--secondary))]"}`}>
                  <div className={`h-4 w-4 rounded-full bg-black transition-transform ${on ? "translate-x-4" : ""}`} />
                </div>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
          These are the real switches the room already uses. Creator Academy gets Path, Second Brain and Album; every other cohort keeps exactly what it has today.
        </p>
      </Card>
    </div>
  );
}
