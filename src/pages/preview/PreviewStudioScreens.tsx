/**
 * Creator Studio prototype — social & portfolio surfaces: the Album (now a
 * real creator PROFILE), the doc/script viewer, the Feed (post types, likes,
 * comments, people), the Mentor desk (a full dummy queue) and Admin.
 *
 * Same law as PreviewScreens.tsx: the app's canonical primitives only.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, Lock, ClipboardList, ChevronRight,
  Heart, MessageCircle, Share2, FileText, Instagram, Youtube, HandHelping,
  Clapperboard, Users, ExternalLink, Flame, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, SurfaceCard, StatCard, EmptyState } from "@/components/patterns";
import {
  PROFILE, SCRIPTS, POSITION_PACK, PUBLISHED_WORK, SPRINT, PEOPLE, MENTOR_SEED,
  type PreviewDoc, type PostType,
} from "./previewData";
import { LinkCard, BackRow, Serif, type ScreenProps } from "./PreviewScreens";
import avatarImg from "./assets/meghna-avatar.webp";
import coverImg from "./assets/meghna-cover.webp";

/* ── 6 · Creator OS / Album — an actual creator profile ─────────────────── */

export function AlbumScreen({ s, d, go }: ScreenProps) {
  const placed = PROFILE.piecesPlaced + s.albumFilled.length;
  const [shared, setShared] = useState(false);
  return (
    <div className="space-y-8">
      {/* Profile header — cover, face, name, niche. A page you'd be proud to share. */}
      <SurfaceCard variant="static" padding="none" className="overflow-hidden">
        <div className="relative h-40 sm:h-48">
          <img src={coverImg} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
        </div>
        <div className="relative px-5 pb-5">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <img
              src={avatarImg}
              alt={PROFILE.name}
              className="h-20 w-20 rounded-2xl border-2 border-[hsl(var(--border))] object-cover shadow-xl"
            />
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[19px] font-bold tracking-[-0.01em]">{PROFILE.name}</h2>
                <span className="text-[12.5px] text-[hsl(var(--gold))]">{PROFILE.handle}</span>
              </div>
              <p className="mt-0.5 text-[12.5px] text-[hsl(var(--muted-foreground))]">{PROFILE.bio}</p>
            </div>
            <div className="flex gap-2 pb-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShared(true); window.setTimeout(() => setShared(false), 1500); }}
              >
                {shared ? <><Check /> Link copied</> : <><Share2 /> Share</>}
              </Button>
              <Button variant="champagne" size="sm">
                <Globe /> Public page
              </Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-[hsl(var(--muted-foreground))]">
            <span><span className="font-bold text-[hsl(var(--foreground))]">{PROFILE.followers}</span> followers</span>
            <span><span className="font-bold text-[hsl(var(--foreground))]">{placed}</span> of {PROFILE.piecesTotal} pieces placed</span>
            <span>{PROFILE.niche} · {PROFILE.city}</span>
            <span>Cohort 01 · Week 4</span>
          </div>
        </div>
      </SurfaceCard>

      {/* Approved work waiting to be placed — the loop's payoff moment. */}
      {s.blockStatus === "accepted" && !s.albumFilled.includes("scr.batch") && (
        <SurfaceCard variant="static" padding="lg" className="border-[hsl(var(--success)/0.35)]">
          <div className="flex items-center gap-2 text-[hsl(var(--success))]">
            <Check className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Approved by Rahul — ready to place</span>
          </div>
          <div className="mt-1.5 text-[14px] font-semibold">The block — 3 reels from one sitting</div>
          <div className="mt-3">
            <Button variant="champagne" size="sm" onClick={() => d({ type: "add_to_album", slot: "scr.batch" })}>
              Add to my Album → Published work
            </Button>
          </div>
        </SurfaceCard>
      )}

      {/* Scripts — functional, not text. Open one and read it like a doc. */}
      <Section title="Scripts" description={`${SCRIPTS.length} approved of 8 · four more land in Weeks 5–8`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {SCRIPTS.map((sc) => (
            <SurfaceCard key={sc.id} variant="interactive" padding="lg" onClick={() => go(`doc/${sc.id}`)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--gold))]">Script · Week {sc.approvedWeek}</div>
                  <div className="mt-1 text-[14px] font-semibold">{sc.title}</div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">"{sc.hook}"</p>
                </div>
                <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--cream))]" />
              </div>
              <div className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[hsl(var(--gold))]">
                Read the script <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </SurfaceCard>
          ))}
          {[5, 6, 7, 8].map((slot) => (
            <div key={slot} className="grid min-h-[104px] place-items-center rounded-2xl border border-dashed border-[hsl(var(--border-hover))] bg-black/30 p-4 text-center">
              <div>
                <Lock className="mx-auto h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Script {slot} · fills in Week {slot} </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Published work — real link cards, tap through. */}
      <Section title="Published work" description="Mentor-approved pieces, live on the internet.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PUBLISHED_WORK.map((w) => (
            <a key={w.id} href={w.url} target="_blank" rel="noreferrer" className="group block">
              <LinkCard url={w.url} title={w.title} />
              <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                <span>{w.duration} · {w.views} views</span>
                <span className="inline-flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">Week {w.week} <ExternalLink className="h-3 w-3" /></span>
              </div>
            </a>
          ))}
          {s.albumFilled.includes("scr.batch") && (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 16 }}>
              <LinkCard url="https://www.instagram.com/reel/your-batch-day" title="3 reels from one sitting — batch day" />
              <div className="mt-1.5 px-1 text-[11px] text-[hsl(var(--success))]">Just placed · Week 4</div>
            </motion.div>
          )}
        </div>
      </Section>

      {/* The 21-Day Creator Sprint — each shipped day is a real link. */}
      <Section title="21-Day Creator Sprint" description="Weeks 9–11 · one post a day, every day. 9 shipped, day 10 is today.">
        <SurfaceCard variant="static" padding="lg">
          <div className="grid grid-cols-7 gap-2">
            {SPRINT.map((sd) => {
              const Icon = sd.platform === "youtube" ? Youtube : Instagram;
              if (sd.state === "posted")
                return (
                  <a
                    key={sd.day}
                    href={sd.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`Day ${sd.day} — shipped`}
                    className="grid aspect-square place-items-center rounded-xl border border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.12)] transition-transform hover:scale-105"
                  >
                    <Icon className="h-4 w-4 text-[hsl(var(--success))]" />
                  </a>
                );
              if (sd.state === "today")
                return (
                  <div key={sd.day} className="grid aspect-square animate-pulse place-items-center rounded-xl border border-[hsl(var(--gold)/0.5)] bg-[hsl(var(--gold)/0.1)] text-[11px] font-extrabold text-[hsl(var(--gold))]">
                    {sd.day}
                  </div>
                );
              return (
                <div key={sd.day} className="grid aspect-square place-items-center rounded-xl border border-[hsl(var(--border))] bg-black/30 text-[11px] text-[hsl(var(--muted-foreground))]">
                  {sd.day}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11.5px] text-[hsl(var(--muted-foreground))]">
            <span className="inline-flex items-center gap-1.5"><Flame className="h-3.5 w-3.5 text-[hsl(var(--accent-amber))]" /> 9-day ship streak</span>
            <span>Tap a green day to open the post</span>
          </div>
        </SurfaceCard>
      </Section>

      {/* Position pack — the Week 0–1 foundations, readable. */}
      <Section title="Position pack" description="The Week 0–1 foundations everything else stands on.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {POSITION_PACK.map((doc) => (
            <SurfaceCard key={doc.id} variant="interactive" padding="lg" onClick={() => go(`doc/${doc.id}`)}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Week {doc.approvedWeek}</div>
                  <div className="mt-0.5 truncate text-[13px] font-semibold">{doc.title}</div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
              </div>
            </SurfaceCard>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ── 6b · Doc / script viewer ───────────────────────────────────────────── */

const ALL_DOCS: PreviewDoc[] = [...SCRIPTS, ...POSITION_PACK];

export function DocScreen({ go, docId }: Pick<ScreenProps, "go"> & { docId: string }) {
  const doc = ALL_DOCS.find((x) => x.id === docId) ?? SCRIPTS[0];
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackRow label="Creator OS" onClick={() => go("album")} />
      <PageHeader
        eyebrow={doc.kind === "script" ? `Script · approved Week ${doc.approvedWeek}` : `Position pack · Week ${doc.approvedWeek}`}
        title={doc.title}
        subtitle={doc.kind === "script" ? "Reads the way it shoots — hook first, payoff earned, one ask." : undefined}
      />
      <SurfaceCard variant="static" padding="lg">
        <div className="space-y-5">
          {doc.sections.map((sec) => (
            <div key={sec.label}>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--gold))]">{sec.label}</div>
              <p className="mt-1 text-[14px] leading-relaxed">{sec.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-2 border-t border-[hsl(var(--border))] pt-4 text-[11.5px] text-[hsl(var(--muted-foreground))]">
          <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Approved by Rahul · placed in the Album Week {doc.approvedWeek}
        </div>
      </SurfaceCard>
    </div>
  );
}

/* ── 7 · Feed — post types, likes, comments, and the people in the room ─── */

const POST_TYPES: Array<{ key: PostType; label: string; icon: typeof Clapperboard; tint: string; placeholder: string }> = [
  { key: "work", label: "Share work", icon: Clapperboard, tint: "hsl(var(--gold))", placeholder: "What did you make? Paste the link below." },
  { key: "feedback", label: "Ask for feedback", icon: MessageCircle, tint: "hsl(var(--accent-violet))", placeholder: "What do you want eyes on — and what kind of feedback?" },
  { key: "request", label: "Raise a request", icon: HandHelping, tint: "hsl(var(--accent-emerald))", placeholder: "Need gear, a shoot buddy, a location? Ask the room." },
];

const TYPE_BADGE: Record<PostType, { label: string; cls: string }> = {
  work: { label: "Work", cls: "border-[hsl(var(--gold)/0.4)] text-[hsl(var(--gold))]" },
  feedback: { label: "Feedback wanted", cls: "border-[hsl(var(--accent-violet)/0.45)] text-[hsl(var(--accent-violet))]" },
  request: { label: "Request", cls: "border-[hsl(var(--accent-emerald)/0.45)] text-[hsl(var(--accent-emerald))]" },
};

export function FeedScreen({ s, d }: ScreenProps) {
  const [view, setView] = useState<"feed" | "people">("feed");
  const [postType, setPostType] = useState<PostType>("work");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const active = POST_TYPES.find((t) => t.key === postType)!;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="The room"
        title="Feed"
        subtitle="Cohort 01 — share work, ask for eyes, raise a hand. Videos go in as links; nothing needs uploading."
        actions={
          <div className="flex rounded-lg border border-[hsl(var(--border))] p-0.5">
            {([["feed", "Feed"], ["people", "People"]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  view === k ? "bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))]" : "text-[hsl(var(--muted-foreground))]"
                }`}
              >
                {k === "people" && <Users className="h-3.5 w-3.5" />} {label}
              </button>
            ))}
          </div>
        }
      />

      {view === "people" ? (
        <PeopleGrid onMention={(name) => { setView("feed"); setPostType("request"); setBody(`@${name} `); }} />
      ) : (
        <>
          {/* Composer — three kinds of post, because a room isn't only submissions. */}
          <SurfaceCard variant="static" padding="lg">
            <div className="flex flex-wrap gap-2">
              {POST_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setPostType(t.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                    postType === t.key ? "border-[hsl(var(--border-hover))] bg-[hsl(var(--secondary))]" : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
                  }`}
                  style={postType === t.key ? { color: t.tint } : undefined}
                >
                  <t.icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(ev) => setBody(ev.target.value)}
              rows={2}
              placeholder={active.placeholder}
              aria-label="Write a post"
              className="mt-3 w-full resize-none rounded-xl border border-[hsl(var(--input))] bg-black/40 p-3 text-[13px] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
            />
            {postType !== "request" && (
              <input
                value={url}
                onChange={(ev) => setUrl(ev.target.value)}
                placeholder="Paste a link (optional) — it becomes a preview card"
                className="mt-2 w-full rounded-xl border border-[hsl(var(--input))] bg-black/40 px-3 py-2.5 text-[13px] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
              />
            )}
            {url.trim() && postType !== "request" && <div className="mt-3"><LinkCard url={url.trim()} /></div>}
            <div className="mt-3 flex justify-end">
              <Button
                variant="champagne"
                size="sm"
                disabled={!body.trim()}
                onClick={() => { d({ type: "post_feed", postType, body, url: url.trim() || undefined }); setBody(""); setUrl(""); }}
              >
                Post to the room
              </Button>
            </div>
          </SurfaceCard>

          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {s.posts.map((p) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                >
                  <FeedPost p={p} d={d} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}

function FeedPost({ p, d }: { p: import("./previewStore").PlayPost; d: React.Dispatch<import("./previewStore").PlayAction> }) {
  const [openComments, setOpenComments] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const badge = TYPE_BADGE[p.type];
  return (
    <SurfaceCard variant="static" padding="lg">
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
          {p.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-semibold">{p.author}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${badge.cls}`}>{badge.label}</span>
          </div>
          <div className="text-[10.5px] text-[hsl(var(--muted-foreground))]">{p.when} · Week 4</div>
        </div>
      </div>

      {p.body && <p className="mt-3 text-[13px] leading-relaxed">{p.body}</p>}
      {p.url && <div className="mt-3"><LinkCard url={p.url} title={p.urlTitle} /></div>}

      {/* Like · comment · share — what a feed actually is. */}
      <div className="mt-3 flex items-center gap-1 border-t border-[hsl(var(--border))] pt-2.5">
        <button
          type="button"
          onClick={() => d({ type: "toggle_like", id: p.id })}
          aria-pressed={p.likedByMe}
          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${
            p.likedByMe ? "text-[hsl(var(--accent-crimson))]" : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          }`}
        >
          <motion.span key={p.likes} initial={{ scale: 1.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}>
            <Heart className={`h-4 w-4 ${p.likedByMe ? "fill-current" : ""}`} />
          </motion.span>
          {p.likes > 0 ? p.likes : "Like"}
        </button>
        <button
          type="button"
          onClick={() => setOpenComments((v) => !v)}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        >
          <MessageCircle className="h-4 w-4" /> {p.comments.length > 0 ? p.comments.length : "Comment"}
        </button>
        <button
          type="button"
          onClick={() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        >
          {copied ? <><Check className="h-4 w-4 text-[hsl(var(--success))]" /> Link copied</> : <><Share2 className="h-4 w-4" /> Share</>}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {openComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2.5">
              {p.comments.map((c, i) => (
                <div key={`${p.id}-c${i}`} className="flex gap-2.5">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[9.5px] font-semibold text-[hsl(var(--muted-foreground))]">
                    {c.author.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                  </div>
                  <div className="min-w-0 rounded-xl bg-[hsl(var(--secondary))] px-3 py-2">
                    <div className="text-[11px] font-semibold">{c.author}</div>
                    <div className="text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">{c.body}</div>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(ev) => setDraft(ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === "Enter" && draft.trim()) { d({ type: "add_comment", id: p.id, body: draft }); setDraft(""); } }}
                  placeholder="Reply to the room…"
                  aria-label={`Comment on ${p.author}'s post`}
                  className="w-full rounded-xl border border-[hsl(var(--input))] bg-black/40 px-3 py-2 text-[12.5px] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!draft.trim()}
                  onClick={() => { d({ type: "add_comment", id: p.id, body: draft }); setDraft(""); }}
                >
                  Send
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SurfaceCard>
  );
}

function PeopleGrid({ onMention }: { onMention: (name: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {PEOPLE.map((person) => (
        <SurfaceCard key={person.id} variant="static" padding="lg" className={person.isMentor ? "border-[hsl(var(--gold)/0.35)]" : ""}>
          <div className="flex items-center gap-3">
            {person.hasPhoto ? (
              <img src={avatarImg} alt="" className="h-11 w-11 rounded-full border border-[hsl(var(--border))] object-cover" />
            ) : (
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[13px] font-bold text-[hsl(var(--muted-foreground))]">
                {person.initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13.5px] font-semibold">{person.name}</span>
                {person.isMentor && (
                  <span className="rounded-full border border-[hsl(var(--gold)/0.4)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[hsl(var(--gold))]">Mentor</span>
                )}
              </div>
              <div className="truncate text-[11.5px] text-[hsl(var(--muted-foreground))]">{person.niche}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
              {person.city}{!person.isMentor && <> · W{person.week} · <Flame className="inline h-3 w-3 text-[hsl(var(--accent-amber))]" /> {person.streak}</>}
            </span>
            {!person.isMentor && (
              <Button variant="outline" size="sm" onClick={() => onMention(person.name.split(" ")[0])}>
                Mention
              </Button>
            )}
          </div>
        </SurfaceCard>
      ))}
    </div>
  );
}

/* ── 8 · Mentor desk — a real queue to walk ─────────────────────────────── */

export function MentorScreen({ s, d }: ScreenProps) {
  const [seedState, setSeedState] = useState<Record<string, "open" | "accepted" | "feedback">>({});
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const openCount = MENTOR_SEED.filter((m) => m.status === "open" && !seedState[m.id]).length + (s.blockStatus === "submitted" ? 1 : 0);
  const closedCount = MENTOR_SEED.filter((m) => m.status === "closed").length
    + Object.values(seedState).filter((v) => v !== "open").length
    + (s.blockStatus === "accepted" ? 1 : 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mentor"
        title="Review queue"
        subtitle="Thursday night, blocks land. Close a review the way you actually work — one tap for a call review, typing optional."
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Open" value={openCount} accent="amber" icon={<ClipboardList className="h-4 w-4" />} />
        <StatCard label="Closed this week" value={closedCount} accent="emerald" icon={<Check className="h-4 w-4" />} />
        <StatCard label="Median turnaround" value="16h" accent="cream" icon={<Flame className="h-4 w-4" />} />
      </div>

      <Section title="This week's blocks" description="Week 4 — B-roll bank + 3 reels from one sitting.">
        <div className="space-y-3">
          {/* The student's OWN submission, live from the loop. */}
          {s.blockStatus !== "none" && (
            <SurfaceCard variant="static" padding="lg" className="border-[hsl(var(--cream)/0.28)]">
              <QueueHeader name="You" initials="YO" week={4} type="Text" when="just now"
                status={s.blockStatus === "accepted" ? "closed" : "open"} closedNote={s.blockStatus === "accepted" ? "Ship — accepted" : undefined} />
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
                <p className="mt-3 text-[12px] text-[hsl(var(--muted-foreground))]">Accepted. The student now sees "Add to my Album" on this piece.</p>
              )}
            </SurfaceCard>
          )}

          {MENTOR_SEED.map((m) => {
            const local = seedState[m.id];
            const isClosed = m.status === "closed" || (local && local !== "open");
            const closedNote = m.closedNote ?? (local === "accepted" ? "Ship — accepted" : local === "feedback" ? "Feedback sent" : undefined);
            return (
              <SurfaceCard key={m.id} variant="static" padding="lg">
                <QueueHeader name={m.student} initials={m.initials} week={m.week} type={m.type} when={m.when}
                  status={isClosed ? "closed" : "open"} closedNote={closedNote} />
                <p className="mt-3 rounded-xl bg-[hsl(var(--secondary))] p-3 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">{m.body}</p>
                {m.url && <div className="mt-3"><LinkCard url={m.url} compact /></div>}
                {!isClosed && (
                  <div className="mt-4">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="champagne" size="sm" onClick={() => setSeedState((st) => ({ ...st, [m.id]: "accepted" }))}>
                        <Check /> Accept — reviewed on the call
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
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!note.trim()}
                          onClick={() => { setSeedState((st) => ({ ...st, [m.id]: "feedback" })); setFeedbackFor(null); }}
                        >
                          Send
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </SurfaceCard>
            );
          })}

          {s.blockStatus === "none" && (
            <EmptyState
              icon={<ClipboardList className="h-5 w-5" />}
              title="Your own block isn't in this queue yet"
              description="Submit Week 4's block as the student — it'll appear here at the top for you to review as the mentor."
            />
          )}
        </div>
      </Section>
    </div>
  );
}

function QueueHeader({ name, initials, week, type, when, status, closedNote }: {
  name: string; initials: string; week: number; type: string; when: string; status: "open" | "closed"; closedNote?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold">{name}</div>
          <div className="text-[11px] text-[hsl(var(--muted-foreground))]">Week {week} · {type} · {when}</div>
        </div>
      </div>
      {status === "closed"
        ? <span className="shrink-0 rounded-full border border-[hsl(var(--success)/0.4)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--success))]">{closedNote ?? "Closed"}</span>
        : <span className="shrink-0 rounded-full border border-[hsl(var(--gold)/0.4)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--gold))]">Open</span>}
    </div>
  );
}
