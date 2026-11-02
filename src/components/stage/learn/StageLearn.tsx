import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronRight, PlayCircle } from "lucide-react";
import usePageTitle from "@/hooks/usePageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { useWishlist } from "@/hooks/useWishlist";
import { tapTick } from "@/lib/haptics";
import { sessionTimeState } from "@/lib/room";
import { LevelUpMark } from "@/components/brand/LevelUpMark";
import { buildAgenda, useBuyerHome, type CohortItem, type CourseItem, type OwnedThing } from "@/components/stage/home/buyer";
import { AgendaList, OwnCard, cardView } from "@/components/stage/home/BuyerHome";
import { useStageCatalog } from "@/components/stage/home/catalog";
import { ProductCard, SectionsSkeleton } from "@/components/stage/home/sections";
import "@/styles/stage-ui.css";
import "@/components/stage/home/home.css";
import "./learn.css";

// Kept as they were, one tap away: certificates (Completed) and LevelUp's
// public events (the old "Events" tab).
const CertificateGallery = lazy(() => import("@/components/certificates/CertificateGallery"));
const EventsPage = lazy(() => import("@/pages/EventsPage"));

/*
 * My learning, under Stage. The round-3 mockup's tabs (In progress,
 * Completed, Saved; 15_LMS_Experience_Lab assets/js/views.js) with the
 * round-4 cards Home uses, plus Schedule, which takes over the old "Live"
 * tab. The old ?seg= links keep working: courses -> In progress,
 * live -> Schedule, calendar -> Schedule (with Events one tap below).
 */

type Seg = "progress" | "schedule" | "done" | "saved" | "events";
const SEGS: { key: Exclude<Seg, "events">; label: string }[] = [
  { key: "progress", label: "In progress" },
  { key: "schedule", label: "Schedule" },
  { key: "done", label: "Completed" },
  { key: "saved", label: "Saved" },
];
const LEGACY: Record<string, Seg> = { courses: "progress", live: "schedule", calendar: "schedule" };
const GROUPS: { title: string; kinds: OwnedThing["kind"][] }[] = [
  { title: "Live cohorts", kinds: ["cohort"] },
  { title: "Masterclasses", kinds: ["masterclass"] },
  { title: "Courses", kinds: ["course"] },
  { title: "Workshops", kinds: ["liveworkshop", "workshop"] },
];

const isDone = (i: OwnedThing) => (i.kind === "masterclass" || i.kind === "workshop" || i.kind === "course") && (i as CourseItem).total > 0 && (i as CourseItem).done >= (i as CourseItem).total;
const IST = 5.5 * 36e5;
const short = (ms: number) => new Date(ms + IST).toUTCString().slice(0, 11).replace(/^(\w+), 0?(\d+) (\w+)$/, "$1, $2 $3");

function Empty({ title, body, cta, onCta }: { title: string; body: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="lrn-empty">
      <LevelUpMark play="draw" showWord={false} className="lrn-empty-mark" title="" />
      <h3 className="lrn-empty-t">{title}</h3>
      <p className="lrn-empty-s">{body}</p>
      {cta && onCta && <button className="btn btn--md" type="button" onClick={onCta}>{cta}</button>}
    </div>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const iv = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(iv); }, [ms]);
  return now;
}

export default function StageLearn() {
  usePageTitle("My learning");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const raw = params.get("seg") ?? "progress";
  const seg: Seg = (LEGACY[raw] ?? (["progress", "schedule", "done", "saved", "events"].includes(raw) ? raw : "progress")) as Seg;
  const now = useNow(30_000);
  const buyer = useBuyerHome();
  const { data: catalog } = useStageCatalog();
  const { wishlistedIds, loading: savedLoading } = useWishlist();
  const open = (path: string) => { void tapTick(); navigate(path); };
  const pick = (k: Seg) => { void tapTick(); setParams({ seg: k }, { replace: true }); };

  const items = buyer.data?.items ?? [];
  const inProgress = items.filter((i) => !isDone(i));
  const done = items.filter(isDone);
  const schedule = useMemo(() => buildAgenda(items, now, null, 30), [items, now]);
  const recordings = useMemo(() => {
    const out: { key: string; title: string; at: number; item: CohortItem }[] = [];
    for (const i of items) {
      if (i.kind !== "cohort") continue;
      for (const s of i.sessions) {
        const at = Date.parse(s.scheduled_at);
        if (sessionTimeState(s, now) === "recorded" && now - at < 30 * 864e5) out.push({ key: s.id, title: s.title, at, item: i });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  }, [items, now]);
  const saved = (catalog?.catalog ?? []).filter((x) => wishlistedIds.has(x.offering.id));
  const firstFree = catalog?.free[0];

  const counts: Record<string, number> = { progress: inProgress.length, schedule: schedule.length, done: done.length, saved: saved.length };

  const body = () => {
    if (buyer.isLoading) return <SectionsSkeleton />;
    if (seg === "progress") {
      if (!inProgress.length) {
        return items.length
          ? <Empty title="Everything here is finished" body="Find your next masterclass or live cohort." cta="Explore" onCta={() => open("/explore")} />
          : <Empty title="Your learning shows up here" body="Start with a free lesson. No payment, no card, and it saves your place." cta={firstFree ? "Watch a free lesson" : "Explore"} onCta={() => open(firstFree ? `/chapters/${firstFree.chapter.id}` : "/explore")} />;
      }
      return GROUPS.map((g) => {
        const list = inProgress.filter((i) => g.kinds.includes(i.kind));
        if (!list.length) return null;
        return (
          <section className="sec" key={g.title} aria-label={g.title}>
            <div className="sec-head"><h2 className="sec-h">{g.title}</h2></div>
            <div className="own">{list.map((i) => { const o = cardView(i, now); return <OwnCard key={o.key} o={o} onOpen={open} />; })}</div>
          </section>
        );
      });
    }
    if (seg === "schedule") {
      return (
        <>
          {schedule.length ? (
            <section className="sec" aria-label="Coming up">
              <div className="sec-head"><h2 className="sec-h">Coming up</h2><span className="lrn-note">Next 30 days</span></div>
              <AgendaList rows={schedule} now={now} onOpen={open} />
            </section>
          ) : (
            <Empty title="Nothing scheduled" body="Classes and deadlines from your live cohorts and workshops show up here." />
          )}
          {recordings.length > 0 && (
            <section className="sec" aria-label="Recordings">
              <div className="sec-head"><h2 className="sec-h">Recordings</h2></div>
              <div className="lrn-list">
                {recordings.map((r) => (
                  <button className="lrn-row" type="button" key={r.key} onClick={() => open(r.item.roomPath)}>
                    <PlayCircle className="ic" />
                    <span className="lrn-row-b"><b>{r.title}</b><span>{short(r.at)} · {r.item.batchName}</span></span>
                    <ChevronRight className="ic lrn-go" />
                  </button>
                ))}
              </div>
            </section>
          )}
          <button className="lrn-row lrn-row--link" type="button" onClick={() => pick("events")}>
            <CalendarDays className="ic" /><span className="lrn-row-b"><b>LevelUp events</b><span>Free sessions and screenings you can register for</span></span><ChevronRight className="ic lrn-go" />
          </button>
        </>
      );
    }
    if (seg === "done") {
      return (
        <>
          {done.length ? (
            <section className="sec" aria-label="Finished">
              <div className="own">{done.map((i) => { const o = cardView(i, now); return <OwnCard key={o.key} o={o} onOpen={open} />; })}</div>
            </section>
          ) : (
            <Empty title="Nothing finished yet" body="Finish a masterclass or workshop and it shows up here, with your certificate." />
          )}
          {user && (
            <section className="sec lrn-certs" aria-label="Certificates">
              <div className="sec-head"><h2 className="sec-h">Certificates</h2></div>
              <Suspense fallback={<SectionsSkeleton />}><CertificateGallery userId={user.id} /></Suspense>
            </section>
          )}
        </>
      );
    }
    if (seg === "saved") {
      if (savedLoading) return <SectionsSkeleton />;
      if (!saved.length) return <Empty title="Nothing saved yet" body="Save a masterclass, cohort or workshop from its page to keep it here for later." cta="Explore" onCta={() => open("/explore")} />;
      return <div className="pds pds--grid">{saved.map((x) => <ProductCard key={x.offering.id} x={x} showTag />)}</div>;
    }
    return (
      <div className="lrn-legacy">
        <button className="lrn-back" type="button" onClick={() => pick("schedule")}><ChevronRight className="ic" style={{ transform: "rotate(180deg)" }} />Schedule</button>
        <Suspense fallback={<SectionsSkeleton />}><EventsPage /></Suspense>
      </div>
    );
  };

  return (
    <div className="hm-inner">
      <div className="hm-hello">
        <span className="eyebrow">{items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} you own` : "Everything you own"}</span>
        <h1 className="hm-h1">My learning</h1>
      </div>
      {seg !== "events" && (
        <div className="ex-tabs lrn-tabs" role="tablist" aria-label="My learning">
          {SEGS.map((s) => (
            <button key={s.key} type="button" role="tab" aria-selected={seg === s.key} className={seg === s.key ? "is-on" : undefined} onClick={() => pick(s.key)}>
              {s.label}{counts[s.key] > 0 && <span>{counts[s.key]}</span>}
            </button>
          ))}
        </div>
      )}
      {body()}
    </div>
  );
}
