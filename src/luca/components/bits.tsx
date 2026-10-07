import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Icon } from "./Icon";
import { Graph } from "./Logo";
import { Av, Bar, Check, LivePill, Spinner } from "./ui";
import { useUI } from "./overlays";
import { useLuca } from "./shell";
import { KIND_LABEL, type Derived } from "../lib/derive";
import { detect, extractUrl, shortUrl, wordFor } from "../lib/links";
import { rpc, LucaError } from "../lib/api";
import * as T from "../lib/time";
import { sound } from "../lib/sound";
import type { AssignmentPart, Session } from "../lib/types";

/* ---- coins: the server awards, the client celebrates ---- */
export function useCelebrate() {
  const ui = useUI();
  return useCallback((n: number | undefined | null, why: string) => {
    if (!n) return;
    sound.node(2); setTimeout(() => sound.node(3), 130);
    sound.buzz(12);
    ui.toast(<><b className="tc-n">+{n}</b>{why}</>, "coin-vertical-fill");
  }, [ui]);
}

export function errMsg(e: unknown, fallback = "That didn't go through. Try once more?") {
  return e instanceof LucaError ? e.message : fallback;
}

/* ---- session row + recording card ---- */
export function SessRow({ s, d, cls }: { s: Session; d: Derived; cls?: string }) {
  const { slug } = useLuca();
  const st = d.sState(s);
  const today = T.same(s.starts_at, T.now());
  return (
    <Link className={`sr ${cls ?? ""}`} to={`/luca/${slug}/session/${s.id}`}>
      <span className="sr-d"><b>{T.parts(s.starts_at).d}</b>{T.wd(s.starts_at)}</span>
      <span className="sr-b"><b>{s.title}</b><span>{KIND_LABEL[s.kind]} · {T.range(s.starts_at, s.ends_at)} · {d.mentorNames(s.mentor_ids)}</span></span>
      {st === "live" ? <LivePill label="Live" cls="live-pill--sm" /> : st === "after" ? (s.recording_url || s.recording_minutes ? <span className="sr-tag">Recording</span> : null) : today ? <span className="sr-tag sr-tag--today">{T.hour() >= 17 ? "Tonight" : "Today"}</span> : null}
    </Link>
  );
}

export function RecCard({ s, d, big, cls }: { s: Session; d: Derived; big?: boolean; cls?: string }) {
  const { slug } = useLuca();
  const mins = s.recording_minutes ?? 0;
  const dur = mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m` : mins ? `${mins}m` : "";
  const seen = mins ? Math.min(1, d.watched(s.id) / (mins * 60)) : 0;
  const hot = d.myHot(s.id);
  return (
    <Link className={`rc${big ? " rc--big" : ""} ${cls ?? ""}`} to={`/luca/${slug}/rec/${s.id}`}>
      <span className="rc-art">
        {s.image_url ? <img src={s.image_url} alt="" loading="lazy" decoding="async" /> : null}
        <span className="rc-play"><Icon name="play-fill" /></span>
        {dur ? <span className="rc-dur">{dur}</span> : null}
        {seen ? <Bar p={seen} cls="bar--on-art" /> : null}
      </span>
      <span className="rc-b">
        <span className="rc-k">{d.kindLine(s)}</span>
        <b>{s.title}</b>
        <span>{T.day(s.starts_at)} · {d.mentorNames(s.mentor_ids)}</span>
        {hot?.rec_at_sec != null ? <span className="rc-hot"><Icon name="flame-fill" />Your hot seat · {T.fmtT(hot.rec_at_sec)}</span> : null}
      </span>
    </Link>
  );
}

/* ---- join a live session: marks present, opens Zoom ---- */
export function useJoin() {
  const ui = useUI();
  const { refresh, room } = useLuca();
  const celebrate = useCelebrate();
  return useCallback(async (s: Session) => {
    // Open the tab inside the tap so pop-up blockers allow it; point it at Zoom once we have the link.
    const tab = window.open("", "_blank");
    try {
      const r = await rpc<{ zoom_url: string | null; awarded: number; present: boolean }>("luca_join_session", { p_session: s.id });
      if (r.zoom_url && tab) tab.location.href = r.zoom_url;
      else {
        tab?.close();
        ui.toast(room.program.is_demo ? "Demo cohort: there's no Zoom link. You're marked present." : "The Zoom link isn't up yet. Try again in a minute.", "video-camera");
      }
      celebrate(r.awarded, `Showed up: ${s.title}`);
      await refresh();
    } catch (e) {
      tab?.close();
      sound.play("error");
      ui.toast(errMsg(e), "warning-circle");
    }
  }, [ui, refresh, celebrate, room.program.is_demo]);
}

/* ==========================================================================
   Link slots: everything handed in is a link. Paste or type it, see what it
   is, and check the mentor can open it (Google files + YouTube visibility).
   ========================================================================== */
export interface SlotState { url: string; ok: boolean; warn?: "private" | "yt-private"; checking?: boolean; title?: string }

/** Ask the luca-link-check function whether a mentor can open this link. */
async function checkLink(url: string): Promise<"ok" | "private" | "unknown"> {
  try {
    const { data, error } = await supabase.functions.invoke("luca-link-check", { body: { url } });
    if (error || !data) return "unknown";
    return data.status === "private" ? "private" : data.status === "ok" ? "ok" : "unknown";
  } catch {
    return "unknown";
  }
}

export function useSlots(scope: string, parts: AssignmentPart[]) {
  const key = `luca.draft.${scope}`;
  const [slots, setSlots] = useState<Record<number, SlotState>>(() => {
    try { return JSON.parse(sessionStorage.getItem(key) || "{}") as Record<number, SlotState>; } catch { return {}; }
  });
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(slots)); } catch { /* storage unavailable */ } }, [slots, key]);
  const allIn = parts.length > 0 && parts.every((p, i) => p.k === "sign" ? true : slots[i]?.ok);
  const count = parts.filter((p, i) => p.k !== "sign" && slots[i]?.ok).length;
  const clear = () => { setSlots({}); try { sessionStorage.removeItem(key); } catch { /* ignore */ } };
  return { slots, setSlots, allIn, count, clear };
}

export function LinkSlot({ part, i, slots, setSlots, signed, onSign, onTicket }: {
  part: AssignmentPart; i: number; slots: Record<number, SlotState>;
  setSlots: (fn: (s: Record<number, SlotState>) => Record<number, SlotState>) => void;
  signed?: boolean; onSign?: () => void; onTicket?: boolean;
}) {
  const ui = useUI();
  const st = slots[i];
  const [typing, setTyping] = useState(false);
  const [val, setVal] = useState("");

  const set = async (raw: string) => {
    const url = extractUrl(raw);
    const k = detect(url);
    if (!k) { sound.play("error"); ui.toast("That doesn't look like a link", "warning-circle"); return; }
    if (part.check === "yt" && !k.yt) { sound.play("error"); ui.toast("Paste a YouTube link. Upload your export as Unlisted first.", "youtube-logo"); return; }
    setTyping(false);
    setSlots((s) => ({ ...s, [i]: { url, ok: !(k.share || k.yt), checking: !!(k.share || k.yt) } }));
    sound.play("soft"); sound.buzz(8);
    if (k.share || k.yt) {
      const r = await checkLink(url);
      setSlots((s) => ({ ...s, [i]: { url, ok: r !== "private", warn: r === "private" ? (k.yt ? "yt-private" : "private") : undefined } }));
      if (r === "private") { sound.play("error"); sound.buzz([20, 30, 20]); }
    }
  };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { await set(t); return; }
    } catch { /* clipboard blocked: fall back to typing */ }
    setTyping(true);
  };
  const recheck = async () => {
    if (!st) return;
    setSlots((s) => ({ ...s, [i]: { ...st, checking: true } }));
    const r = await checkLink(st.url);
    setSlots((s) => ({ ...s, [i]: { url: st.url, ok: r !== "private", warn: r === "private" ? st.warn : undefined } }));
    sound.play(r === "private" ? "error" : "success");
  };

  if (part.k === "sign") {
    return (
      <div className={`ls${signed ? " is-in" : ""}`}>
        <div className="ls-top"><span className="ls-word">SIGN</span><span className="ls-meta"><b>{part.label}</b><span>{part.where}</span></span>{signed ? <Check on /> : null}</div>
        {signed ? <div className="ls-ok"><Icon name="signature" />Signed</div> : <div className="ls-acts"><button className="btn btn-sm" type="button" onClick={onSign}><Icon name="signature" />Read and sign</button></div>}
      </div>
    );
  }

  const k = st ? detect(st.url) : null;
  return (
    <div className={`ls${st ? (st.warn ? " is-warn" : st.ok ? " is-in" : "") : ""}`}>
      <div className="ls-top">
        <span className="ls-word">{k?.word ?? wordFor(part.k)}</span>
        <span className="ls-meta"><b>{part.label}</b><span>{part.where}</span></span>
        {st?.ok && !st.warn ? <Check on /> : null}
      </div>
      {!st ? (
        typing ? (
          <label className="ls-type">
            <span className="input-wrap"><input className="input" type="url" inputMode="url" placeholder="https://" aria-label="Paste or type a link" autoFocus value={val}
              onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) void set(val); }}
              onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t) { e.preventDefault(); void set(t); } }} /></span>
            <button className="btn btn-sm" type="button" disabled={!val.trim()} onClick={() => void set(val)}>Add</button>
          </label>
        ) : (
          <div className="ls-acts">
            <button className="btn btn-sm ls-paste" type="button" onClick={paste}><Icon name="clipboard-text" />Paste link</button>
            <button className="btn-text btn-text--sm" type="button" onClick={() => setTyping(true)}>Type it</button>
          </div>
        )
      ) : (
        <>
          <div className={`ls-card${st.warn ? " is-warn" : ""}`}>
            <span className="ls-ic"><Icon name={k?.icon ?? "link"} /></span>
            <span className="ls-b"><b>{k?.name ?? "Link"}</b><span>{shortUrl(st.url)}</span></span>
            <button className="ls-x" type="button" aria-label="Change link" onClick={() => { setSlots((s) => { const n = { ...s }; delete n[i]; return n; }); sound.play("close"); }}><Icon name="x" /></button>
          </div>
          {st.checking ? <div className="ls-ok"><Spinner />Checking your mentor can open it</div>
            : st.warn === "yt-private" ? (
              <div className="ls-warn"><Icon name="warning-circle" /><div><b>This video is Private.</b> Your mentor will see &quot;Video unavailable&quot;. In YouTube Studio: Details, then Visibility, then <b>Unlisted</b>.
                <button className="btn btn-sm btn-secondary" type="button" onClick={recheck}>Check again</button></div></div>
            ) : st.warn === "private" ? (
              <div className="ls-warn"><Icon name="warning-circle" /><div><b>Only you can open this.</b> Your mentor will see a locked page. In the {(k?.name ?? "file").replace("Google ", "")}: Share, then General access, then <b>Anyone with the link</b> can comment.
                <button className="btn btn-sm btn-secondary" type="button" onClick={recheck}>Check again</button></div></div>
            ) : (
              <div className="ls-ok"><Icon name="check-circle-fill" />{k?.yt ? "Plays for your mentor and cohort" : k?.share ? "Your mentor can open it" : k?.ig ? "Public, opens for your mentor" : "Added"}</div>
            )}
          {(part.k === "post" && !onTicket) ? (
            <label className="field mt-3"><span className="label">What&apos;s it called? <em className="ap-opt">optional</em></span>
              <span className="input-wrap"><input className="input" maxLength={140} value={st.title ?? ""} placeholder="So your Clan knows what to watch" onChange={(e) => setSlots((s) => ({ ...s, [i]: { ...st, title: e.target.value } }))} /></span>
            </label>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ---- the streak sheet ---- */
export function useStreakSheet() {
  const ui = useUI();
  const { d } = useLuca();
  return useCallback(() => {
    const me = d.me;
    if (!me) return;
    const sprint = d.sprintOn();
    const days = Array.from({ length: 7 }, (_, k) => 6 - k).map((back) => {
      const day = T.add(T.now(), -back);
      const on = back === 0 ? me.streak_today : back <= Math.min(6, me.streak - (me.streak_today ? 1 : 0)) && back >= 1;
      return { day, on };
    });
    ui.sheet({
      label: "Streak",
      render: (close) => (
        <div className="sheet-pad">
          <div className="lc-streak-big"><Icon name="flame-fill" /><b>{me.streak}</b><span>day streak</span></div>
          <div className="lc-days">{days.map((x, k) => <span key={k} className={`${x.on ? "is-on" : ""}${k === 6 ? " is-today" : ""}`}><i />{T.wd(x.day).slice(0, 1)}</span>)}</div>
          <p className="muted mt-2">{me.streak_today ? "Today counts. See you tomorrow."
            : sprint ? `Post today's Sprint link before 11:59 PM to make it ${me.streak + 1}.`
            : `Do one cohort thing today to make it ${me.streak + 1}: a pre-watch, a submit, a live session or feedback for your Clan.`}</p>
          <p className="fine mt-2">Every 7 days in a row adds a {d.p.coin_rules?.streak_bonus?.value ?? 300}-coin bonus.</p>
          <button className="btn btn-lg btn-block mt-4" type="button" onClick={close}>Got it</button>
        </div>
      ),
    });
  }, [ui, d]);
}

/* ---- subscribe to the cohort calendar (real ICS feed via luca-calendar) ---- */
export function useSyncSheet() {
  const ui = useUI();
  const { d, slug, refresh } = useLuca();
  return useCallback(() => {
    const tok = d.me?.cal_token;
    const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
    const feed = tok && base ? `${base}/functions/v1/luca-calendar?t=${tok}` : null;
    const webcal = feed?.replace(/^https:/, "webcal:");
    const mark = async (v: string) => {
      try { const r = await rpc<Record<string, boolean>>("luca_setup", { p_slug: slug, p_key: "calendar" }); void r; await refresh(); } catch { /* optional step */ }
      ui.toast(`${d.p.cohort_label || d.p.name} added to ${v}`, "calendar-plus");
      sound.play("success");
    };
    ui.sheet({
      label: "Add the cohort to your calendar",
      render: (close) => (
        <div className="sheet-pad">
          <div className="sheet-mark"><Graph /></div>
          <h3 className="h2">Every session, one tap</h3>
          <p className="muted">Subscribe once. If a session moves, your calendar moves with it. Deadlines and breaks come too.</p>
          {feed ? (
            <div className="stack-2 mt-4">
              <a className="btn btn-lg btn-block" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal as string)}`} target="_blank" rel="noopener noreferrer" onClick={() => { close(); void mark("Google Calendar"); }}>Google Calendar</a>
              <a className="btn btn-lg btn-block btn-secondary" href={webcal} onClick={() => { close(); void mark("Apple Calendar"); }}>Apple Calendar</a>
              <a className="btn btn-lg btn-block btn-secondary" href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}&name=${encodeURIComponent(d.p.cohort_label || d.p.name)}`} target="_blank" rel="noopener noreferrer" onClick={() => { close(); void mark("Outlook"); }}>Outlook</a>
              <button className="btn-text" type="button" onClick={async () => { try { await navigator.clipboard.writeText(feed); ui.toast("Calendar link copied", "link-simple"); } catch { /* ignore */ } }}>Copy the calendar link</button>
            </div>
          ) : <p className="lu-native mt-4">The calendar link isn&apos;t ready yet.</p>}
          <p className="fine mt-4">The link is private to you. If it leaks, make a new one from You.</p>
        </div>
      ),
    });
  }, [ui, d, slug, refresh]);
}

/* ---- feedback on a clanmate's post (+coins) ---- */
export function useFeedbackSheet() {
  const ui = useUI();
  const { slug, room, d, refresh } = useLuca();
  const celebrate = useCelebrate();
  return useCallback((to: string, ref: string, title: string, url?: string | null) => {
    const m = d.member(to);
    const chips = room.program.content.feedback_chips ?? ["Hook landed", "Cut the intro", "Say it faster", "Caption too long", "Great ending", "Show, don't tell"];
    const img = room.program.content.trailer?.beats?.[(title.length + (m?.name.length ?? 0)) % Math.max(1, room.program.content.trailer?.beats?.length ?? 1)]?.[0];
    function Body({ close }: { close: () => void }) {
      const [on, setOn] = useState<string[]>([]);
      const [text, setText] = useState("");
      const [busy, setBusy] = useState(false);
      const send = async () => {
        setBusy(true);
        try {
          const r = await rpc<{ awarded: number }>("luca_feedback", { p_slug: slug, p_to: to, p_ref: ref, p_chips: on, p_body: text });
          close();
          setTimeout(() => celebrate(r.awarded, `Feedback for ${(m?.name ?? "").split(" ")[0]}`), 320);
          await refresh();
        } catch (e) { setBusy(false); sound.play("error"); ui.toast(errMsg(e), "warning-circle"); }
      };
      return (
        <div className="sheet-pad">
          <div className="fb-head"><Av p={m} cls="lc-av--md" /><div><div className="eyebrow">{m?.name} posted</div><h3 className="h2">{title}</h3></div></div>
          {url ? <a className="fb-post" href={url} target="_blank" rel="noopener noreferrer">{img ? <img src={img} alt="" /> : null}<span><Icon name="play-fill" /></span></a> : null}
          <div className="label mt-4">Quick notes</div>
          <div className="fb-chips">{chips.map((c) => <button key={c} type="button" className={`chip${on.includes(c) ? " is-on" : ""}`} onClick={() => { setOn((x) => x.includes(c) ? x.filter((y) => y !== c) : [...x, c]); sound.play("toggle"); }}>{c}</button>)}</div>
          <label className="field mt-4"><span className="label">One thing to change</span><span className="input-wrap"><input className="input" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Be specific. One line is enough." /></span></label>
          <button className="btn btn-lg btn-block mt-4" type="button" disabled={busy || (!on.length && !text.trim())} onClick={send}>{busy ? "Sending" : `Send feedback · +${room.program.coin_rules?.feedback?.value ?? 25}`}</button>
        </div>
      );
    }
    ui.sheet({ label: "Feedback", render: (close) => <Body close={close} /> });
  }, [ui, slug, room, d, refresh, celebrate]);
}

/* ---- nudge a clanmate (a notification, once a day) ---- */
export function useNudge() {
  const ui = useUI();
  const { slug, d, refresh } = useLuca();
  return useCallback(async (to: string) => {
    try {
      const r = await rpc<{ sent: boolean }>("luca_nudge", { p_slug: slug, p_to: to });
      sound.play("soft");
      ui.toast(r.sent ? `Nudge sent to ${(d.member(to)?.name ?? "").split(" ")[0]}` : "Already nudged today", "hand-waving");
      await refresh();
    } catch (e) { ui.toast(errMsg(e), "warning-circle"); }
  }, [ui, slug, d, refresh]);
}
