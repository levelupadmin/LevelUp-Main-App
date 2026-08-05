/**
 * Creator Studio prototype screens — built from the app's OWN design system.
 *
 * 🔴 THE RULE THIS FILE NOW LIVES BY. Earlier versions hand-rolled a parallel
 * component set (custom cards, chips, buttons) next to the app, and the result
 * read as foreign — "I hate the design" was the review, and it was earned.
 * Every surface here is now the app's canonical primitive: `SurfaceCard`
 * (spring press + haptic), `PageHeader`, `Section`, `StatCard`, and the
 * champagne `Button`. If a screen needs something these can't express, extend
 * the pattern library — do NOT hand-roll a lookalike here.
 *
 * Screens are PLAYABLE via `previewStore` (still zero database): complete the
 * day, submit the block, watch Week 5 unlock, approve it at the mentor desk,
 * place it in the Album, post to the feed.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame, Lock, Check, Play, FileText, ClipboardList, Upload, Video,
  CalendarPlus, KeyRound, ChevronRight, Link2, Wand2, Target, RotateCcw, Instagram, Youtube, HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, SurfaceCard, StatCard, EmptyState } from "@/components/patterns";
import { ENGINE, STATS as SEED } from "./previewData";
import { toneForPhase } from "./previewTheme";
import { linkKind, type PlayState, type PlayAction } from "./previewStore";

type Dispatch = React.Dispatch<PlayAction>;
interface ScreenProps { s: PlayState; d: Dispatch; go: (k: string) => void }

const Serif = ({ children }: { children: React.ReactNode }) => (
  <span className="font-serif italic text-[hsl(var(--cream))]">{children}</span>
);

/* ── link preview card (feed + mentor) ──────────────────────────────────── */

const LINK_LOOKS = {
  youtube: { Icon: Youtube, tint: "hsl(var(--accent-crimson))", art: "from-[#2a1414] to-[#0d0b0b]" },
  instagram: { Icon: Instagram, tint: "hsl(var(--accent-violet))", art: "from-[#241a2e] to-[#0d0b10]" },
  drive: { Icon: HardDrive, tint: "hsl(var(--accent-emerald))", art: "from-[#12241d] to-[#0b100e]" },
  generic: { Icon: Link2, tint: "hsl(var(--muted-foreground))", art: "from-[#17171c] to-[#0b0b0d]" },
} as const;

export function LinkCard({ url, title }: { url: string; title?: string }) {
  const kind = linkKind(url);
  const { Icon, tint, art } = LINK_LOOKS[kind];
  const isVideo = kind === "youtube" || kind === "instagram";
  return (
    <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
      <div className={`relative grid h-32 place-items-center bg-gradient-to-br ${art}`}>
        {isVideo ? (
          <div className="grid h-10 w-10 place-items-center rounded-full bg-black/55 backdrop-blur-sm">
            <Play className="h-3.5 w-3.5 fill-white text-white" />
          </div>
        ) : (
          <Icon className="h-6 w-6" style={{ color: tint }} />
        )}
      </div>
      <div className="flex items-center gap-2 bg-[hsl(var(--surface-2,0_0%_8%))] bg-[hsl(var(--secondary))] px-3 py-2">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: tint }} />
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-medium">{title ?? url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}</div>
          <div className="text-[10.5px] capitalize text-[hsl(var(--muted-foreground))]">{kind}</div>
        </div>
      </div>
    </div>
  );
}

/* ── 1 · Home ───────────────────────────────────────────────────────────── */

export function HomeScreen({ s, d, go }: ScreenProps) {
  const tone = toneForPhase("Produce");
  const currentDay = s.days.find((x) => x.state === "current");
  const doneCount = s.days.filter((x) => x.state === "done").length;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Creator Academy · Edition 2"
        title={<>Creator <Serif>Studio</Serif></>}
        subtitle="One project. Your Distribution Engine — built block by block."
        actions={
          <Button variant="outline" size="sm" onClick={() => d({ type: "reset" })}>
            <RotateCcw /> Reset demo
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="XP" value={s.xp} accent="amber" icon={<Flame className="h-4 w-4" />} />
        <StatCard label="Streak" value={`${s.streak} days`} accent="emerald" icon={<Flame className="h-4 w-4" />} />
        <StatCard label="This week" value={`${doneCount}/${s.days.length}`} sublabel="days done" accent="cream" icon={<Check className="h-4 w-4" />} />
      </div>

      <Section title="This week" description="Week 4 · Advanced Production — the block: B-roll bank + 3 reels from one sitting">
        <SurfaceCard variant="static" padding="lg" className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full opacity-20 blur-3xl"
            style={{ background: tone.c }}
          />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: tone.c }}>
                {currentDay ? "Up next" : s.blockStatus === "none" ? "The block is open" : "Week 4 wrapped"}
              </div>
              <div className="mt-1 text-[16px] font-semibold tracking-[-0.01em]">
                {currentDay ? `${currentDay.label} — ${currentDay.title}` : s.blockStatus === "none" ? "Submit the block: 3 reels from one sitting" : "Week 5 is open. On-Camera Confidence."}
              </div>
              <p className="mt-1 text-[12.5px] text-[hsl(var(--muted-foreground))]">
                {currentDay ? "Finishing it unlocks Second Brain." : s.blockStatus === "none" ? "Due Thu 9 PM. Submitting it opens Week 5 and its recording." : "Go meet the take-1 vs take-10 drill."}
              </p>
            </div>
            <Button variant="champagne" onClick={() => go("path")}>Continue</Button>
          </div>
        </SurfaceCard>
      </Section>

      <Section title="Live session" description="Sun 3 PM — Positioning teardown">
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <SurfaceCard variant="static" padding="none" className="overflow-hidden">
            <div className="relative grid h-40 place-items-center bg-gradient-to-br from-[#221a10] via-[#120e08] to-[#0a0a0a]">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-[hsl(var(--champagne-from))] to-[hsl(var(--champagne-to))]">
                <Play className="h-4 w-4 fill-[hsl(var(--cream-text))] text-[hsl(var(--cream-text))]" />
              </div>
              <div className="absolute left-4 top-4 flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--gold))]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--gold))]">Live · Sun 3 PM</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="text-[14px] font-semibold">Positioning teardown</div>
                <div className="text-[12px] text-[hsl(var(--muted-foreground))]">Rahul reviews six submissions on the call.</div>
              </div>
              <Button variant="outline" size="sm">Join</Button>
            </div>
          </SurfaceCard>

          <SurfaceCard variant="static" padding="lg" className={s.week5Unlocked ? "" : "bg-black/40"}>
            <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              {s.week5Unlocked ? <Check className="h-4 w-4 text-[hsl(var(--success))]" /> : <Lock className="h-4 w-4" />}
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Week 5 · On-Camera Confidence</span>
            </div>
            <div className={`mt-2 text-[14px] font-semibold ${s.week5Unlocked ? "" : "text-[hsl(var(--muted-foreground))]"}`}>
              {s.week5Unlocked ? "Open — recording included" : "Opens once Week 4's block is in"}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              {s.week5Unlocked
                ? "Unlocked the moment you submitted. That's the gate rule working."
                : "The recording stays locked with it. Everything you've finished stays open."}
            </p>
            {!s.week5Unlocked && (
              <button type="button" onClick={() => go("path")} className="mt-3 text-[12px] font-semibold text-[hsl(var(--gold))] underline underline-offset-4">
                Go submit the block
              </button>
            )}
          </SurfaceCard>
        </div>
      </Section>
    </div>
  );
}

/* ── 2 · Path (playable) ────────────────────────────────────────────────── */

export function PathScreen({ s, d, go }: ScreenProps) {
  const tone = toneForPhase("Produce");
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="The Path"
        title={<>Your Distribution <Serif>Engine</Serif></>}
        subtitle="A week opens on its date and once the previous block is in. Days open in order — tap the starred one."
      />

      <Section title="Week 4 · Advanced Production" description="The block: B-roll bank + 3 reels from one sitting">
        <div className="flex flex-col items-center gap-5 py-2">
          {s.days.map((day, i) => {
            const done = day.state === "done";
            const current = day.state === "current";
            const locked = day.state === "locked";
            const off = [0, 44, 66, 44, 0][i % 5];
            const openable = current && !day.isBlock;
            return (
              <div key={day.id} className="relative flex flex-col items-center" style={{ transform: `translateX(${off}px)` }}>
                {current && (
                  <div className="absolute -top-8 z-10 animate-bounce" style={{ animationDuration: "1.6s" }}>
                    <div className="rounded-lg bg-[hsl(var(--cream))] px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide text-[hsl(var(--cream-text))] shadow-lg">
                      {day.isBlock ? "SUBMIT" : "START"}
                    </div>
                  </div>
                )}
                <motion.button
                  type="button"
                  disabled={locked}
                  onClick={() => (day.isBlock && current ? go("session") : openable ? d({ type: "complete_day", id: day.id }) : undefined)}
                  aria-label={`${day.label} — ${day.title}`}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileTap={locked ? undefined : { scale: 0.92, y: 3 }}
                  transition={{ type: "spring", stiffness: 320, damping: 20, delay: i * 0.05 }}
                  className="grid h-14 w-14 place-items-center rounded-full text-[17px] font-extrabold disabled:opacity-70"
                  style={{
                    background: done ? "hsl(var(--success))" : current ? tone.c : "hsl(var(--secondary))",
                    color: done || current ? "hsl(var(--cream-text))" : "hsl(var(--muted-foreground))",
                    boxShadow: locked ? "none" : `0 5px 0 ${done ? "hsl(156 77% 22%)" : current ? tone.d : "hsl(0 0% 5%)"}`,
                  }}
                >
                  {done ? <Check className="h-5 w-5" strokeWidth={3} /> : locked ? <Lock className="h-4 w-4" /> : i + 1}
                </motion.button>
                <div className="mt-2 text-center">
                  <div className="text-[10px] font-extrabold tracking-wide" style={{ color: done ? "hsl(var(--success))" : current ? tone.c : "hsl(var(--muted-foreground))" }}>
                    {day.label.toUpperCase()}
                  </div>
                  <div className="max-w-[150px] text-[10.5px] leading-tight text-[hsl(var(--muted-foreground))]">{day.title}</div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[11.5px] text-[hsl(var(--muted-foreground))]">
          Tap the starred day to complete it — XP and streak move for real. The Thu node opens the block submission.
        </p>
      </Section>

      <Section title="The engine · all 13 blocks">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ENGINE.map((e) => {
            const t = toneForPhase(e.phase);
            const done = e.n < SEED.week || (e.n === 4 && s.blockStatus !== "none");
            const now = e.n === (s.week5Unlocked ? 5 : 4);
            return (
              <div key={e.n} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 ${now ? "border-[hsl(var(--cream)/0.3)] bg-[hsl(var(--cream)/0.05)]" : "border-transparent"}`}>
                <span className="mt-px w-7 shrink-0 text-[10.5px] font-bold" style={{ color: done ? "hsl(var(--success))" : now ? t.c : "hsl(var(--muted-foreground))" }}>
                  W{e.n}
                </span>
                <div className="min-w-0">
                  <div className={`truncate text-[12px] font-medium ${!done && !now ? "text-[hsl(var(--muted-foreground))]" : ""}`}>{e.title}</div>
                  <div className="truncate text-[10.5px] text-[hsl(var(--muted-foreground))]">{e.block}</div>
                </div>
                {done && <Check className="ml-auto mt-0.5 h-3 w-3 shrink-0 text-[hsl(var(--success))]" />}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

/* ── 3 · Session / block submission (playable) ──────────────────────────── */

export function SessionScreen({ s, d, go }: ScreenProps) {
  const [text, setText] = useState(s.blockText);
  return (
    <div className="space-y-8">
      <PageHeader
        back={{ to: "#", label: "The Path" }}
        eyebrow="Week 4 · Thu 9 PM"
        title="The block — 3 reels from one sitting"
        subtitle="Recorded class below; transcript and cheat sheet beside it. Submit and watch Week 5 open."
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="space-y-4">
          <SurfaceCard variant="static" padding="none" className="overflow-hidden">
            <div className="relative grid h-52 place-items-center bg-gradient-to-br from-[#1c1712] to-[#0a0a0a]">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-[hsl(var(--champagne-from))] to-[hsl(var(--champagne-to))]">
                <Play className="h-4 w-4 fill-[hsl(var(--cream-text))] text-[hsl(var(--cream-text))]" />
              </div>
              <span className="absolute bottom-2.5 right-2.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">62:14</span>
            </div>
            <div className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">Advanced Production — Week 4 live</div>
                <div className="text-[11.5px] text-[hsl(var(--muted-foreground))]">You attended 41 of 62 min · 66% · full XP</div>
              </div>
              <div className="flex gap-2">
                {[FileText, ClipboardList].map((I, i) => (
                  <span key={i} className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(var(--secondary))]">
                    <I className="h-3.5 w-3.5 text-[hsl(var(--cream))]" />
                  </span>
                ))}
              </div>
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard variant="static" padding="lg" className="lg:sticky lg:top-24">
          {s.blockStatus === "none" ? (
            <>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--gold))]">Submit the block</div>
              <label htmlFor="block-input" className="mt-2 block text-[13px] font-semibold">
                Your 3 reels — links or notes
              </label>
              <textarea
                id="block-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="Reel 1: … &#10;Reel 2: … &#10;Reel 3: …"
                className="mt-2 w-full resize-none rounded-xl border border-[hsl(var(--input))] bg-black/40 p-3 text-[13px] leading-relaxed outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
              />
              <div className="mt-3">
                <Button variant="champagne" className="w-full" disabled={!text.trim()} onClick={() => { d({ type: "submit_block", text }); }}>
                  Submit · unlocks Week 5
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[hsl(var(--success))]">
                <Check className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-[0.12em]">
                  {s.blockStatus === "accepted" ? "Accepted by Rahul" : "Submitted — Week 5 is open"}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[hsl(var(--secondary))] p-3 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">{s.blockText}</p>
              <p className="mt-3 text-[12px] text-[hsl(var(--muted-foreground))]">
                {s.blockStatus === "accepted"
                  ? "Approved work can go on your profile — open Creator OS."
                  : "Now play the mentor: open the Mentor desk and accept it."}
              </p>
              <div className="mt-3">
                <Button variant="outline" className="w-full" onClick={() => go(s.blockStatus === "accepted" ? "album" : "mentor")}>
                  {s.blockStatus === "accepted" ? "Open Creator OS" : "Open the Mentor desk"} <ChevronRight />
                </Button>
              </div>
            </>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}

/* ── 4 · Feed (playable) ────────────────────────────────────────────────── */

const SEED_FEED = [
  { id: "s1", author: "Meghna Iyer", body: "Week 4 hook test. Third version is the one that finally felt like me.", url: "https://www.instagram.com/reel/xw2", ts: 0 },
  { id: "s2", author: "Pranav Kotecha", body: "Rough cut before I post tomorrow. Is the open too slow?", url: "https://youtu.be/r0ughcut", ts: 0 },
];

export function FeedScreen({ s, d }: ScreenProps) {
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const posts = [...s.feedPosts, ...SEED_FEED];
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="The room" title="Feed" subtitle="Share what you made. Videos go in as links — YouTube, Instagram or Drive. PDFs attach directly." />
      <SurfaceCard variant="static" padding="lg">
        <label htmlFor="feed-body" className="text-[13px] font-semibold">Share this week's work</label>
        <textarea
          id="feed-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="What did you make?"
          className="mt-2 w-full resize-none rounded-xl border border-[hsl(var(--input))] bg-black/40 p-3 text-[13px] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link (optional) — it becomes a preview card"
          className="mt-2 w-full rounded-xl border border-[hsl(var(--input))] bg-black/40 px-3 py-2.5 text-[13px] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
        />
        {url.trim() && <div className="mt-3"><LinkCard url={url.trim()} /></div>}
        <div className="mt-3 flex justify-end">
          <Button variant="champagne" size="sm" disabled={!body.trim()} onClick={() => { d({ type: "post_feed", body, url: url.trim() || undefined }); setBody(""); setUrl(""); }}>
            Post
          </Button>
        </div>
      </SurfaceCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <AnimatePresence initial={false}>
        {posts.map((p) => (
          <motion.div
            key={p.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
          <SurfaceCard variant="static" padding="lg">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
                {p.author.split(" ").map((w) => w[0]).join("")}
              </div>
              <div>
                <div className="text-[12.5px] font-semibold">{p.author}</div>
                <div className="text-[10.5px] text-[hsl(var(--muted-foreground))]">{p.ts ? "just now" : "this week"}</div>
              </div>
            </div>
            {p.body && <p className="mt-2.5 text-[13px] leading-relaxed">{p.body}</p>}
            {p.url && <div className="mt-2.5"><LinkCard url={p.url} /></div>}
          </SurfaceCard>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── 5 · Mentor desk (playable) ─────────────────────────────────────────── */

export function MentorScreen({ s, d }: ScreenProps) {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Mentor" title="Review queue" subtitle="Close a review the way you actually work — one tap for a call review, typing optional." />
      {s.blockStatus === "none" ? (
        <EmptyState
          icon={<ClipboardList className="h-5 w-5" />}
          title="Nothing to review yet"
          description="Submit Week 4's block as the student first — then come back here and play the mentor."
        />
      ) : (
        <SurfaceCard variant="static" padding="lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">You · Week 4</div>
              <div className="mt-1 text-[14px] font-semibold">The block — 3 reels from one sitting</div>
            </div>
            {s.blockStatus === "accepted"
              ? <span className="rounded-full border border-[hsl(var(--success)/0.4)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--success))]">Closed</span>
              : <span className="rounded-full border border-[hsl(var(--gold)/0.4)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--gold))]">Open</span>}
          </div>
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[hsl(var(--secondary))] p-3 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">{s.blockText}</p>
          {s.blockStatus === "submitted" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="champagne" size="sm" onClick={() => d({ type: "mentor_accept" })}>
                <Check /> Accept — reviewed on the call
              </Button>
              <Button variant="outline" size="sm">Type feedback</Button>
            </div>
          )}
          {s.blockStatus === "accepted" && (
            <p className="mt-3 text-[12px] text-[hsl(var(--muted-foreground))]">
              Accepted. The student now sees "Add to my Album" on this piece.
            </p>
          )}
        </SurfaceCard>
      )}
    </div>
  );
}

/* ── 6 · Creator OS / Album (playable) ──────────────────────────────────── */

const ALBUM_BLOCKS = [
  { name: "Position", slots: ["pos.story", "pos.niche", "pos.audience", "pos.oneliner", "pos.bio"], openFrom: 0 },
  { name: "Scripts", slots: ["scr.hook1", "scr.hook2", "scr.hooks", "scr.long", "scr.tpl", "scr.cta", "scr.s7", "scr.s8"], openFrom: 2 },
  { name: "Body of work", slots: ["work.1", "work.2", "work.3", "work.4", "work.5", "work.6"], openFrom: 4 },
];
const PREFILLED = ["pos.story", "pos.niche", "pos.audience", "pos.oneliner", "pos.bio", "scr.hook1", "scr.hook2", "work.1", "work.2"];

export function AlbumScreen({ s, d }: ScreenProps) {
  const filled = new Set([...PREFILLED, ...s.albumFilled]);
  const total = ALBUM_BLOCKS.reduce((n, b) => n + b.slots.length, 0);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Creator OS"
        title={<>The <Serif>Album</Serif></>}
        subtitle="Every box already has your name on it and a week it gets filled. Approved work is what fills them."
        meta={<span className="text-[12px] text-[hsl(var(--muted-foreground))]">{filled.size} of {total} pieces placed</span>}
      />

      {s.blockStatus === "accepted" && !s.albumFilled.includes("scr.hooks") && (
        <SurfaceCard variant="static" padding="lg" className="border-[hsl(var(--success)/0.35)]">
          <div className="flex items-center gap-2 text-[hsl(var(--success))]">
            <Check className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Approved by Rahul — ready to place</span>
          </div>
          <div className="mt-1.5 text-[14px] font-semibold">The block — 3 reels from one sitting</div>
          <div className="mt-3">
            <Button variant="champagne" size="sm" onClick={() => d({ type: "add_to_album", slot: "scr.hooks" })}>
              Add to my Album → Scripts
            </Button>
          </div>
        </SurfaceCard>
      )}

      {ALBUM_BLOCKS.map((b) => {
        const got = b.slots.filter((x) => filled.has(x)).length;
        return (
          <Section key={b.name} title={b.name} description={`${got} of ${b.slots.length} filled`}>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {b.slots.map((code, i) => {
                const isFilled = filled.has(code);
                const locked = i >= b.openFrom + 6; // crude horizon for the demo
                const justAdded = s.albumFilled.includes(code);
                return (
                  <motion.div
                    key={code}
                    layout
                    animate={justAdded ? { scale: [1, 1.18, 1] } : undefined}
                    transition={{ type: "spring", stiffness: 300, damping: 14 }}
                    className={`grid aspect-square place-items-center rounded-xl border text-[13px] ${
                      isFilled
                        ? "border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]"
                        : locked
                          ? "border-[hsl(var(--border))] bg-black/50 text-[hsl(var(--border-hover))]"
                          : "border-dashed border-[hsl(var(--border-hover))] bg-black/30"
                    }`}
                  >
                    {isFilled ? <Check className="h-4 w-4" /> : locked ? <Lock className="h-3 w-3" /> : null}
                  </motion.div>
                );
              })}
            </div>
          </Section>
        );
      })}
    </div>
  );
}

/* ── 7 · Second Brain (playable capture) ────────────────────────────────── */

export function BrainScreen({ s, d }: ScreenProps) {
  const [url, setUrl] = useState("");
  const working = s.brain.status === "working";
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Second Brain" title="Spy a reel" subtitle="Paste a link. Capture and transcription already run in production; the breakdown layer is what's new." />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <SurfaceCard variant="static" padding="lg">
            <label htmlFor="brain-url" className="text-[13px] font-semibold">Instagram or YouTube link</label>
            <div className="mt-2 flex gap-2">
              <input
                id="brain-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="instagram.com/reel/…"
                className="w-full rounded-xl border border-[hsl(var(--input))] bg-black/40 px-3 py-2.5 text-[13px] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
              />
              <Button
                variant="champagne"
                disabled={!url.trim() || working}
                onClick={() => {
                  d({ type: "brain_capture", url: url.trim() });
                  window.setTimeout(() => d({ type: "brain_done" }), 1600);
                }}
              >
                {working ? "Working…" : "Spy"}
              </Button>
            </div>
            {working && (
              <div className="mt-3 space-y-2" role="status" aria-busy="true">
                <div className="h-3 w-3/5 rounded skeleton-shimmer" />
                <div className="h-3 w-4/5 rounded skeleton-shimmer" />
              </div>
            )}
          </SurfaceCard>

          {s.brain.status === "done" && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 240, damping: 24 }}>
            <SurfaceCard variant="static" padding="lg" className="border-[hsl(var(--cream)/0.28)]">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--gold))]">Breakdown</div>
              <div className="mt-2.5"><LinkCard url={s.brain.url} title="Captured reel" /></div>
              <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed">
                <p><span className="font-semibold">Hook.</span> <span className="text-[hsl(var(--muted-foreground))]">Contradiction — names the wrong belief in the first four words.</span></p>
                <p><span className="font-semibold">Structure.</span> <span className="text-[hsl(var(--muted-foreground))]">Problem → proof → ask.</span></p>
                <p><span className="font-semibold text-[hsl(var(--gold))]">Steal this.</span> <span className="text-[hsl(var(--muted-foreground))]">Open on the belief, not the topic.</span></p>
              </div>
            </SurfaceCard>
            </motion.div>
          )}
        </div>

        <SurfaceCard variant="static" padding="lg">
          <div className="flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5 text-[hsl(var(--cream))]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Remix in my voice</span>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
            Runs the breakdown through your Voice Profile — built from five of your own reels — and drafts the script the way you talk. One Claude API call in the studio worker; nothing runs on anyone's laptop.
          </p>
          <div className="mt-3"><Button variant="outline" size="sm" disabled={s.brain.status !== "done"}>Write it in my voice</Button></div>
        </SurfaceCard>
      </div>
    </div>
  );
}

/* ── 8 · Admin ──────────────────────────────────────────────────────────── */

export function AdminScreen({ s }: Pick<ScreenProps, "s">) {
  const rows = [
    { icon: CalendarPlus, title: "Create a live session", body: "Schedules it, creates the Zoom meeting, issues each student a personal join link." },
    { icon: Video, title: "Upload a recording", body: "Protected storage; plays only for enrolled students through an expiring link." },
    { icon: Upload, title: "Create a course", body: "The existing admin flow, reachable from here." },
    { icon: KeyRound, title: "Unlock a week for one student", body: `Override the gate with a reason and an audit trail.${s.week5Unlocked ? " (Week 5 currently open via the block.)" : ""}` },
  ];
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Admin" title="Creator Studio control" subtitle="What your team gets. Buttons are labelled with what they'll do; wiring comes after sign-off." />
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => (
          <SurfaceCard key={r.title} variant="static" padding="lg">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[hsl(var(--cream)/0.1)]">
                <r.icon className="h-4 w-4 text-[hsl(var(--cream))]" />
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">{r.title}</div>
                <p className="mt-1 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">{r.body}</p>
              </div>
            </div>
          </SurfaceCard>
        ))}
      </div>
    </div>
  );
}
