import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { tapTick } from "@/lib/haptics";
import { media } from "@/components/stage/landing/landing";
import { FORMAT_COPY, inr, runtime, type CatalogItem, type StageCatalog } from "./catalog";
import { ProductCard } from "./sections";

/*
 * Home for someone who hasn't bought yet, the second round (vault
 * 03_Specs/01_Home_New_Person_Plan.md, approved 2026-11-02): one next step
 * instead of explaining the formats four times. These are its new pieces:
 * the "I want to…" picker (leveluplearning.in's own move) that answers with
 * the masterclass and the live cohort for one craft, the live cohorts as
 * cards, and the community as proof. The catalogue lives in Explore.
 */

/* ---- crafts: what someone wants to make, and what LevelUp has for it ---- */
export type CraftKey = "films" | "editing" | "content" | "writing" | "photography" | "music";
interface Craft { key: CraftKey; label: string; who: string; masterclasses: string[]; cohort: string | null; from: string[] }
/** By offering slug; a slug that isn't listed is skipped. Order = the order shown. */
export const CRAFTS: Craft[] = [
  { key: "films", label: "Make films", who: "filmmakers", masterclasses: ["nelson-dilipkumar-teaches-filmmaking", "lokesh-kanagaraj-teaches-film-making", "karthick-subbaraj-teaches-filmmaking", "drk-kiran-teaches-art-direction"], cohort: "breakthrough-filmmakers-program", from: ["filmmaking"] },
  { key: "editing", label: "Edit videos", who: "editors", masterclasses: ["anthony-gonsalvez-teaches-film-editing"], cohort: "video-editing-academy", from: ["editing", "vfx"] },
  { key: "content", label: "Create content", who: "creators", masterclasses: [], cohort: "creator-academy", from: [] },
  { key: "writing", label: "Write stories", who: "writers", masterclasses: ["lokesh-kanagaraj-teaches-film-making", "nelson-dilipkumar-teaches-filmmaking"], cohort: "screenwriting-storytelling", from: ["writing"] },
  { key: "photography", label: "Take photographs", who: "photographers", masterclasses: ["g-venket-ram-teaches-photography"], cohort: null, from: ["photography"] },
  { key: "music", label: "Make music", who: "composers", masterclasses: ["ravi-basrur-teaches-music-composition"], cohort: null, from: ["music"] },
];

/** The crafts picked in onboarding (users.craft_interests), first one first. */
export function useMyCrafts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["stage-my-crafts", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase.from("users").select("craft_interests").eq("id", user!.id).maybeSingle();
      return ((data?.craft_interests ?? []) as string[]).filter(Boolean);
    },
  });
}
export const craftFor = (picked: string[]): CraftKey =>
  CRAFTS.find((c) => c.from.some((f) => picked.includes(f)))?.key ?? "films";

/** Offering slugs for a craft's masterclasses, for leading Home's free lesson with one that fits. */
export const craftSlugs = (key: CraftKey) => CRAFTS.find((c) => c.key === key)?.masterclasses ?? [];

/* ---- the live cohorts' pages: their promise, facts and proof (offerings.landing, v2) ---- */
interface CohortHead {
  id: string; slug: string; title: string; thumbnail_url: string | null;
  hero: { eyebrow?: string; headline?: string; image?: string | null; mosaic?: string[] } | null;
  facts: { label: string; value: string }[] | null;
  proof: { stats?: { value: string; label: string }[]; quotes?: { text: string; name: string; role?: string | null }[] } | null;
}
export function useCohortPages() {
  return useQuery({
    queryKey: ["stage-cohort-pages"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<CohortHead[]> => {
      const { data, error } = await supabase
        .from("offerings")
        .select("id, slug, title, thumbnail_url, hero:landing->hero, facts:landing->facts, proof:landing->proof, v:landing->v")
        .eq("product_tier", "live_cohort").eq("is_public", true).eq("status", "active")
        .not("landing", "is", null);
      if (error) throw error;
      const order = ["breakthrough-filmmakers-program", "video-editing-academy", "creator-academy"];
      return ((data ?? []) as unknown as (CohortHead & { v: number })[])
        .filter((r) => r.v === 2)
        .sort((a, b) => (order.indexOf(a.slug) + 99) % 99 - (order.indexOf(b.slug) + 99) % 99);
    },
  });
}
const fact = (c: CohortHead, re: RegExp) => c.facts?.find((f) => re.test(f.label))?.value ?? null;

/* ---- the masterclasses, led by the mentors ---- */
export function MentorRail({ data }: { data: StageCatalog }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const mf = data.formats.find((f) => f.tier === "masterclass");
  const list = mf?.list ?? [];
  if (!list.length) return null;
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.9, behavior: "smooth" });
  return (
    <section className="sec shelf" aria-labelledby="dvMentorsH">
      <div className="sec-head">
        <h2 className="sec-h" id="dvMentorsH">India's greatest creative minds. Now your mentors.</h2>
        <span className="sec-tools">
          {list.length > 3 && (
            <span className="rail-nav">
              <button type="button" onClick={() => scroll(-1)} aria-label="Scroll left"><ChevronLeft className="ic" /></button>
              <button type="button" onClick={() => scroll(1)} aria-label="Scroll right"><ChevronRight className="ic" /></button>
            </span>
          )}
          <button className="sec-link" type="button" onClick={() => navigate("/explore?tier=masterclass")}>See all</button>
        </span>
      </div>
      <p className="dv-lede">{FORMAT_COPY.masterclass.line} Recorded lessons, at your own pace{mf?.lifetime ? ", and yours to keep" : ""}.</p>
      <div ref={ref} className="pds pds--masterclass">
        {list.map((x) => <ProductCard key={x.offering.id} x={x} />)}
      </div>
    </section>
  );
}

/* ---- "I want to…" ---- */
function AnswerCard({ x, kind, cohort }: { x: CatalogItem; kind: "masterclass" | "cohort"; cohort?: CohortHead | null }) {
  const navigate = useNavigate();
  const o = x.offering;
  const go = () => { void tapTick(); navigate(`/p/${o.slug}`); };
  const facts = kind === "masterclass"
    ? [x.lessons ? `${x.lessons} lessons` : null, x.course?.duration_minutes ? runtime(x.course.duration_minutes) : null, o.price > 0 ? inr(o.price) : null]
    : [cohort && fact(cohort, /duration/i), cohort && fact(cohort, /next cohort/i), "By application"];
  return (
    <button type="button" className={`dv-card dv-card--${kind}`} onClick={go}>
      <span className="dv-card-art">{o.thumbnail_url && <img src={o.thumbnail_url} alt="" loading="lazy" decoding="async" />}</span>
      <span className="dv-card-b">
        <span className="eyebrow">{kind === "masterclass" ? FORMAT_COPY.masterclass.word : FORMAT_COPY.live_cohort.word}</span>
        <b className="dv-card-t">{kind === "cohort" && cohort?.hero?.headline ? cohort.hero.headline : o.title}</b>
        <span className="dv-card-l">{kind === "masterclass" ? FORMAT_COPY.masterclass.line : o.title}</span>
        <span className="dv-card-f">{facts.filter(Boolean).join(" · ")}</span>
        <span className="dv-card-go">{kind === "masterclass" ? "See the masterclass" : "See the program"}<ArrowRight className="ic" /></span>
      </span>
    </button>
  );
}

export function WantTo({ data, initial }: { data: StageCatalog; initial: CraftKey }) {
  const navigate = useNavigate();
  const cohorts = useCohortPages();
  const [key, setKey] = useState<CraftKey>(initial);
  useEffect(() => setKey(initial), [initial]);
  const bySlug = new Map(data.catalog.map((x) => [x.offering.slug, x]));
  const available = CRAFTS.filter((c) => c.masterclasses.some((s) => bySlug.has(s)) || (c.cohort && bySlug.has(c.cohort)));
  const craft = available.find((c) => c.key === key) ?? available[0];
  if (!craft) return null;
  const mcs = craft.masterclasses.map((s) => bySlug.get(s)).filter((x): x is CatalogItem => !!x);
  const cohort = craft.cohort ? bySlug.get(craft.cohort) ?? null : null;
  const cohortHead = cohort ? cohorts.data?.find((c) => c.id === cohort.offering.id) ?? null : null;
  const [lead, ...more] = mcs;

  return (
    <section className="sec dv-want" aria-labelledby="dvWantH">
      <div className="sec-head"><h2 className="sec-h" id="dvWantH">I want to…</h2></div>
      <div className="s-chips dv-chips" role="tablist" aria-label="What do you want to make?">
        {available.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={c.key === craft.key} className={`s-chip${c.key === craft.key ? " is-on" : ""}`}
            onClick={() => { if (c.key !== craft.key) { void tapTick(); setKey(c.key); } }}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="dv-answer" role="tabpanel" aria-live="polite">
        {lead && <AnswerCard x={lead} kind="masterclass" />}
        {cohort && <AnswerCard x={cohort} kind="cohort" cohort={cohortHead} />}
      </div>
      {more.length > 0 && (
        <p className="dv-more">
          More for {craft.who}:{" "}
          {more.map((x, i) => (
            <span key={x.offering.id}>
              {i > 0 && ", "}
              <button type="button" className="dv-link" onClick={() => { void tapTick(); navigate(`/p/${x.offering.slug}`); }}>
                {x.offering.instructor_name || x.offering.title}
              </button>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/* ---- "From learner to creator": the live cohorts ---- */
export function CohortCards() {
  const navigate = useNavigate();
  const { data } = useCohortPages();
  if (!data?.length) return null;
  return (
    <section className="sec dv-cohorts" aria-labelledby="dvCohortsH">
      <div className="sec-head"><h2 className="sec-h" id="dvCohortsH">From learner to creator</h2></div>
      <p className="dv-lede">Live, mentor-led cohorts on weekends: make real work, with feedback, and a batch beside you.</p>
      <div className="dv-cohort-list">
        {data.map((c) => {
          const art = c.thumbnail_url ?? media(c.hero?.image ?? c.hero?.mosaic?.[0]);
          return (
            <button key={c.id} type="button" className="dv-cohort" onClick={() => { void tapTick(); navigate(`/p/${c.slug}`); }}>
              <span className="dv-cohort-art">{art && <img src={art} alt="" loading="lazy" decoding="async" />}</span>
              <span className="dv-cohort-b">
                <span className="eyebrow">{c.title}</span>
                <b>{c.hero?.headline ?? c.title}</b>
                <span className="dv-card-f">{[fact(c, /duration/i), fact(c, /next cohort/i)].filter(Boolean).join(" · ")}</span>
                <span className="dv-card-go">See the program<ArrowRight className="ic" /></span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ---- the community, as proof (the same numbers as the cohort pages) ---- */
export function Proof() {
  const { data } = useCohortPages();
  const withProof = data?.find((c) => c.proof?.stats?.length);
  const stats = withProof?.proof?.stats ?? [];
  const quotes = data?.flatMap((c) => c.proof?.quotes ?? []).slice(0, 3) ?? [];
  if (!stats.length && !quotes.length) return null;
  return (
    <section className="sec dv-proof" aria-labelledby="dvProofH">
      <div className="sec-head"><h2 className="sec-h" id="dvProofH">Come for the learning. Stay for the community.</h2></div>
      {stats.length > 0 && (
        <dl className="dv-stats">
          {stats.map((s) => <div key={s.label}><dd>{s.value}</dd><dt>{s.label}</dt></div>)}
        </dl>
      )}
      {quotes.length > 0 && (
        <div className="dv-quotes">
          {quotes.map((q) => (
            <figure key={q.name} className="dv-quote">
              <blockquote>{q.text}</blockquote>
              <figcaption><b>{q.name}</b>{q.role && <span>{q.role}</span>}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
