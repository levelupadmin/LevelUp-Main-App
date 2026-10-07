import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Av, Empty, SecHead, Spinner, VChip } from "../components/ui";
import { NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { errMsg } from "../components/bits";
import { rpc, useDesk } from "../lib/api";
import { detect, shortUrl } from "../lib/links";
import { num } from "../lib/format";
import { KIND_LABEL } from "../lib/derive";
import { sound } from "../lib/sound";
import * as T from "../lib/time";
import type { Desk as DeskT } from "../lib/types";

type Tab = "review" | "sprint" | "hot" | "people";
const TABS: [Tab, string][] = [["review", "Review"], ["sprint", "Sprint"], ["hot", "Hot seat"], ["people", "People"]];

/** A datetime-local value in the browser's zone, for the fix-due picker. */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

function useDeskRefresh(slug: string) {
  const qc = useQueryClient();
  const { refresh } = useLuca();
  return async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["luca", "desk", slug] }), refresh()]); };
}

/* ---- Review: Ship / Fix / Hold with notes ---- */
function ReviewCard({ s, desk, onDone }: { s: DeskT["submissions"][number]; desk: DeskT; onDone: () => Promise<void> }) {
  const { d } = useLuca();
  const ui = useUI();
  const m = desk.members.find((x) => x.id === s.member_id);
  const a = desk.assignments?.find((x) => x.id === s.assignment_id) ?? d.asg(s.assignment_id);
  const rs = a ? d.reviewFor(a) : undefined;
  const [notes, setNotes] = useState((s.notes ?? []).join("\n"));
  const [due, setDue] = useState(() => toLocalInput(rs && Date.parse(rs.starts_at) > Date.now() ? new Date(Date.parse(rs.starts_at) - T.HOUR) : new Date(Date.now() + 2 * T.DAYMS)));
  const [busy, setBusy] = useState<string | null>(null);
  const call = async (v: "ship" | "fix" | "hold") => {
    setBusy(v);
    try {
      await rpc("luca_review", {
        p_submission: s.id, p_verdict: v,
        p_notes: notes.split("\n").map((x) => x.trim()).filter(Boolean),
        p_fix_due: v === "fix" ? new Date(due).toISOString() : null,
      });
      sound.play("success");
      ui.toast(`${m?.name.split(" ")[0] ?? "Learner"}: ${v === "ship" ? "Ship" : v === "fix" ? "Fix" : "Hold"}`, "seal-check");
      await onDone();
    } catch (e) { ui.toast(errMsg(e), "warning-circle"); }
    finally { setBusy(null); }
  };
  return (
    <div className="lu-desk-card">
      <div className="lu-desk-row"><Av p={m} /><b style={{ flex: 1 }}>{m?.name ?? "Learner"}</b><VChip v={s.was_fix ? "fixed" : s.verdict} /></div>
      <div className="fine">Week {a?.week_n ?? "?"} · {a?.title ?? "Assignment"} · in {T.day(s.submitted_at)}, {T.time(s.submitted_at)}{s.on_time ? "" : " · late"}</div>
      <div className="lu-desk-links">
        {s.links.map((l, i) => l.kind === "sign"
          ? <span key={i} className="fine">Signed: {l.label}</span>
          : l.url ? <a key={i} href={l.url} target="_blank" rel="noopener noreferrer">{detect(l.url)?.name ?? "Link"} · {l.title || l.label} · {shortUrl(l.url)}</a> : null)}
        {s.fix_url ? <a href={s.fix_url} target="_blank" rel="noopener noreferrer">The fix · {shortUrl(s.fix_url)}</a> : null}
      </div>
      <label className="field"><span className="label">Notes, one per line (the learner sees these)</span>
        <span className="input-wrap"><textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="The hook is at 0:40. Move it to the first line." /></span>
      </label>
      <label className="field"><span className="label">If Fix: due by</span>
        <span className="input-wrap"><input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></span>
      </label>
      <div className="lu-desk-row">
        <button className="btn btn-sm" type="button" disabled={!!busy} onClick={() => call("ship")}>{busy === "ship" ? "Saving" : "Ship"}</button>
        <button className="btn btn-sm btn-secondary" type="button" disabled={!!busy} onClick={() => call("fix")}>{busy === "fix" ? "Saving" : "Fix"}</button>
        <button className="btn btn-sm btn-secondary" type="button" disabled={!!busy} onClick={() => call("hold")}>{busy === "hold" ? "Saving" : "Hold"}</button>
      </div>
    </div>
  );
}

function ReviewTab({ desk, onDone }: { desk: DeskT; onDone: () => Promise<void> }) {
  const [done, setDone] = useState(false);
  const list = desk.submissions.filter((s) => (done ? s.verdict !== "pending" : s.verdict === "pending"));
  return (
    <>
      <div className="seg seg--sm rv">
        <button type="button" className={done ? "" : "is-on"} onClick={() => setDone(false)}>Waiting · {desk.submissions.filter((s) => s.verdict === "pending").length}</button>
        <button type="button" className={done ? "is-on" : ""} onClick={() => setDone(true)}>Called</button>
      </div>
      <div className="mt-4">
        {list.length ? list.map((s) => <ReviewCard key={`${s.id}:${s.verdict}`} s={s} desk={desk} onDone={onDone} />)
          : <Empty title={done ? "Nothing called yet" : "Nothing waiting"} sub={done ? "Calls you make show up here." : "New submissions land here the moment they're in."} />}
      </div>
    </>
  );
}

/* ---- Sprint: a call on every post ---- */
function SprintTab({ desk, onDone }: { desk: DeskT; onDone: () => Promise<void> }) {
  const ui = useUI();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const list = desk.sprint_posts.filter((p) => p.kind === "post" && p.verdict === "pending");
  const call = async (id: string, v: "ship" | "fix") => {
    setBusy(id);
    try { await rpc("luca_sprint_verdict", { p_post: id, p_verdict: v, p_note: notes[id] ?? null }); sound.play("success"); await onDone(); }
    catch (e) { ui.toast(errMsg(e), "warning-circle"); }
    finally { setBusy(null); }
  };
  if (!list.length) return <Empty title="No Sprint posts waiting" sub="Each day's posts land here for a Ship or Fix." />;
  return (
    <>
      {list.map((p) => {
        const m = desk.members.find((x) => x.id === p.member_id);
        return (
          <div key={p.id} className="lu-desk-card">
            <div className="lu-desk-row"><Av p={m} /><b style={{ flex: 1 }}>{m?.name ?? "Learner"}</b><span className="fine">Day {p.day_n}</span></div>
            {p.url ? <div className="lu-desk-links"><a href={p.url} target="_blank" rel="noopener noreferrer">{p.title || detect(p.url)?.name || "Post"} · {shortUrl(p.url)}</a></div> : null}
            <span className="input-wrap"><input className="input" placeholder="One line for the learner (optional)" value={notes[p.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))} /></span>
            <div className="lu-desk-row">
              <button className="btn btn-sm" type="button" disabled={busy === p.id} onClick={() => call(p.id, "ship")}>Ship</button>
              <button className="btn btn-sm btn-secondary" type="button" disabled={busy === p.id} onClick={() => call(p.id, "fix")}>Fix</button>
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ---- Hot seat: order the queue; after, mark where each one is in the recording ---- */
function HotTab({ desk, onDone }: { desk: DeskT; onDone: () => Promise<void> }) {
  const { d } = useLuca();
  const ui = useUI();
  const sessions = d.sessions.filter((s) => ["review", "standup", "demo"].includes(s.kind));
  const upcoming = sessions.find((s) => Date.parse(s.ends_at) > Date.now());
  const [sid, setSid] = useState(upcoming?.id ?? sessions[sessions.length - 1]?.id ?? "");
  const s = d.sess(sid);
  const saved = useMemo(() => desk.hotseat.filter((h) => h.session_id === sid).sort((a, b) => a.position - b.position).map((h) => h.member_id), [desk.hotseat, sid]);
  const [order, setOrder] = useState<string[] | null>(null);
  const q = order ?? saved;
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const real = desk.members.filter((m) => !m.ghost || d.p.is_demo);
  // Who handed in work reviewed at this session goes first in the picker.
  const reviewedHere = new Set(desk.submissions.filter((x) => {
    const a = desk.assignments?.find((y) => y.id === x.assignment_id) ?? d.asg(x.assignment_id);
    return a && d.reviewFor(a)?.id === sid;
  }).map((x) => x.member_id));
  const pool = real.filter((m) => !q.includes(m.id)).sort((a, b) => Number(reviewedHere.has(b.id)) - Number(reviewedHere.has(a.id)));
  const name = (id: string) => desk.members.find((m) => m.id === id)?.name ?? "Learner";
  const move = (i: number, k: number) => { const n = [...q]; const [x] = n.splice(i, 1); n.splice(i + k, 0, x); setOrder(n); };

  const save = async () => {
    setBusy(true);
    try { await rpc("luca_hotseat_set", { p_session: sid, p_members: q }); setOrder(null); sound.play("success"); ui.toast("Hot seat saved. Learners see their place now.", "flame-fill"); await onDone(); }
    catch (e) { ui.toast(errMsg(e), "warning-circle"); }
    finally { setBusy(false); }
  };
  const mark = async (mid: string) => {
    const v = (marks[mid] ?? "").trim();
    if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(v)) { ui.toast("Use m:ss or h:mm:ss", "warning-circle"); return; }
    try { await rpc("luca_hotseat_mark", { p_session: sid, p_member: mid, p_rec_at_sec: T.parseT(v) }); sound.play("success"); await onDone(); }
    catch (e) { ui.toast(errMsg(e), "warning-circle"); }
  };

  if (!sessions.length) return <Empty title="No review sessions" sub="Add review sessions in the admin console first." />;
  const after = s ? Date.parse(s.ends_at) < Date.now() : false;
  return (
    <>
      <label className="field"><span className="label">Session</span>
        <span className="input-wrap"><select className="input" value={sid} onChange={(e) => { setSid(e.target.value); setOrder(null); }}>
          {sessions.map((x) => <option key={x.id} value={x.id}>{T.day(x.starts_at)} · {KIND_LABEL[x.kind]} · {x.title}</option>)}
        </select></span>
      </label>
      <SecHead title={`Queue · ${q.length}`} sub={after ? "After the session: mark where each hot seat starts in the recording." : "Learners see their place. Pre-watch keeps a seat."} cls="mt-4" />
      {q.map((mid, i) => {
        const h = desk.hotseat.find((x) => x.session_id === sid && x.member_id === mid);
        return (
          <div key={mid} className="lu-q">
            <b>{i + 1}</b><span>{name(mid)}{reviewedHere.has(mid) ? " · has work in" : ""}</span>
            {after ? (
              <>
                <input className="input" style={{ width: 84 }} placeholder={h?.rec_at_sec != null ? T.fmtT(h.rec_at_sec) : "m:ss"} value={marks[mid] ?? ""} onChange={(e) => setMarks((m) => ({ ...m, [mid]: e.target.value }))} />
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => mark(mid)}>Mark</button>
              </>
            ) : (
              <>
                <button className="icon-btn" type="button" aria-label="Up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arrow-up" /></button>
                <button className="icon-btn" type="button" aria-label="Down" disabled={i === q.length - 1} onClick={() => move(i, 1)}><Icon name="arrow-down" /></button>
                <button className="icon-btn" type="button" aria-label="Remove" onClick={() => setOrder(q.filter((x) => x !== mid))}><Icon name="x" /></button>
              </>
            )}
          </div>
        );
      })}
      {!after ? (
        <>
          <button className="btn btn-lg btn-block mt-4" type="button" disabled={busy || order === null} onClick={save}>{busy ? "Saving" : "Save the order"}</button>
          <SecHead title="Add to the queue" cls="mt-5" />
          {pool.slice(0, 60).map((m) => (
            <div key={m.id} className="lu-q"><span>{m.name}{reviewedHere.has(m.id) ? " · has work in" : ""}</span><button className="btn btn-sm btn-secondary" type="button" onClick={() => setOrder([...q, m.id])}><Icon name="plus" />Add</button></div>
          ))}
        </>
      ) : null}
    </>
  );
}

/* ---- People: who's showing up, who's slipping ---- */
function PeopleTab({ desk, onDone }: { desk: DeskT; onDone: () => Promise<void> }) {
  const { slug, d } = useLuca();
  const ui = useUI();
  const [ghosts, setGhosts] = useState(d.p.is_demo);
  const [names, setNames] = useState("");
  const [size, setSize] = useState(String(d.p.clan_size ?? 6));
  const list = desk.members.filter((m) => ghosts || !m.ghost);
  const past = d.sessions.filter((s) => Date.parse(s.starts_at) < Date.now()).length;
  const att = (id: string) => desk.attendance.filter((a) => a.member_id === id).length;
  const subs = (id: string) => desk.submissions.filter((a) => a.member_id === id).length;
  const clanName = (id: string | null) => desk.clans.find((c) => c.id === id)?.name ?? "No Clan";

  const form = async (reset: boolean) => {
    try {
      const r = await rpc<{ assigned: number; clans?: number }>("luca_form_clans", {
        p_slug: slug, p_names: names.split(",").map((x) => x.trim()).filter(Boolean), p_size: Number(size), p_reset: reset,
      });
      sound.play("success");
      ui.toast(`${r.assigned} learners placed${r.clans ? ` into ${r.clans} Clans` : ""}`, "users-three");
      await onDone();
    } catch (e) { ui.toast(errMsg(e), "warning-circle"); }
  };

  return (
    <>
      <div className="lu-desk-row">
        <span className="fine" style={{ flex: 1 }}>{list.length} people · {past} sessions so far</span>
        {d.p.is_demo ? null : <button type="button" className="chip" onClick={() => setGhosts(!ghosts)}>{ghosts ? "Hide" : "Show"} sample people</button>}
      </div>
      <div className="mt-3">
        {list.map((m) => (
          <div key={m.id} className="lu-q">
            <Av p={m} />
            <span><b>{m.name}</b><br /><span className="fine">{clanName(m.clan_id)} · Track {m.track} · {att(m.id)}/{past} sessions · {subs(m.id)} in · streak {m.streak}{m.email ? ` · ${m.email}` : ""}{m.phone ? ` · ${m.phone}` : ""}</span></span>
            <b>{num(m.coins)}</b>
          </div>
        ))}
      </div>
      {desk.is_admin ? (
        <div className="lu-desk-card mt-5">
          <b>Form Clans</b>
          <p className="fine">Places everyone without a Clan, mixing tracks and niches. Existing Clans keep their people unless you reset.</p>
          <span className="input-wrap"><input className="input" placeholder="Clan names, comma separated (optional)" value={names} onChange={(e) => setNames(e.target.value)} /></span>
          <span className="input-wrap"><input className="input" type="number" min={2} max={20} value={size} onChange={(e) => setSize(e.target.value)} aria-label="Clan size" /></span>
          <div className="lu-desk-row">
            <button className="btn btn-sm" type="button" onClick={() => form(false)}>Place new people</button>
            <button className="btn btn-sm btn-secondary" type="button" onClick={() => { if (window.confirm("Re-form every Clan from scratch? Everyone moves.")) void form(true); }}>Re-form all</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** The mentor desk: everything a mentor does during the cohort, in one place. */
export default function Desk() {
  const { slug, d } = useLuca();
  const [q, setQ] = useSearchParams();
  const tab = (TABS.some((t) => t[0] === q.get("tab")) ? q.get("tab") : "review") as Tab;
  const { data: desk, isLoading, error, refetch } = useDesk(slug);
  const refresh = useDeskRefresh(slug);
  const onDone = async () => { await refresh(); await refetch(); };
  const waiting = desk?.submissions.filter((s) => s.verdict === "pending").length ?? 0;
  const sprintWaiting = desk?.sprint_posts.filter((p) => p.kind === "post" && p.verdict === "pending").length ?? 0;

  return (
    <Page cls="page--me">
      <NavBar title="Mentor desk" back />
      <div className="sec sec--hero">
        <div className="eyebrow rv">{d.p.name} · {d.p.cohort_label}{d.p.is_demo ? " · demo" : ""}</div>
        <h1 className="h1 rv">{waiting ? `${waiting} to call` : "All caught up."}</h1>
        <p className="muted rv">Your calls reach the learner the moment you make them: in the app, with a notification.</p>
      </div>
      <div className="lu-desk-tabs">
        <div className="seg" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={k === tab} className={k === tab ? "is-on" : ""} onClick={() => setQ(k === "review" ? {} : { tab: k }, { replace: true })}>
              {l}{k === "review" && waiting ? ` · ${waiting}` : k === "sprint" && sprintWaiting ? ` · ${sprintWaiting}` : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="sec">
        {isLoading ? <div className="lu-load"><Spinner /></div>
          : error || !desk ? <div className="lc-note"><b>We couldn&apos;t load the desk.</b> {errMsg(error)}</div>
          : tab === "review" ? <ReviewTab desk={desk} onDone={onDone} />
          : tab === "sprint" ? <SprintTab desk={desk} onDone={onDone} />
          : tab === "hot" ? <HotTab desk={desk} onDone={onDone} />
          : <PeopleTab desk={desk} onDone={onDone} />}
      </div>
    </Page>
  );
}
