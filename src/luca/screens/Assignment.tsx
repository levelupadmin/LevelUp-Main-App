import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Av, Check, Count, SecHead, VChip } from "../components/ui";
import { DemoBar, NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { LinkSlot, errMsg, useSlots } from "../components/bits";
import { detect, shortUrl, wordFor } from "../lib/links";
import { rpc } from "../lib/api";
import { fill } from "../lib/format";
import { sound } from "../lib/sound";
import * as T from "../lib/time";
import type { AssignmentPart } from "../lib/types";

const FIX_PART: AssignmentPart[] = [{ k: "doc", label: "The fixed version", where: "Same Doc is fine, or a new one" }];

/** Paste, check, submit. Then the verdict, and the fix if one is asked for. */
export default function Assignment() {
  const { id } = useParams();
  const { slug, d, refresh } = useLuca();
  const ui = useUI();
  const a = d.asg(id);
  const main = useSlots(a?.id ?? "none", a?.parts ?? []);
  const fix = useSlots(`${a?.id ?? "none"}fix`, FIX_PART);
  const [busy, setBusy] = useState(false);
  if (!a) return <Navigate to={`/luca/${slug}/work`} replace />;

  const s = d.aState(a);
  const sub = "sub" in s ? s.sub : undefined;
  const rs = s.sess;
  const open = ["due", "late", "soon"].includes(s.v);
  const signed = !!d.me?.contract_signed_at;
  const linkParts = a.parts.filter((p) => p.k !== "sign").length;
  const allIn = main.allIn && (a.parts.every((p) => p.k !== "sign") || signed);
  const by = sub?.reviewed_by ? d.mentor(sub.reviewed_by) : undefined;
  const p = d.p;
  const week = d.weekRow(a.week_n);
  const hot = rs ? d.myHot(rs.id) : undefined;

  const sign = () => {
    const C = p.content.contract;
    const items = (d.me?.track === "B" && C?.items_b?.length ? C.items_b : C?.items) ?? [];
    function Body({ close }: { close: () => void }) {
      const [name, setName] = useState("");
      const [b, setB] = useState(false);
      return (
        <div className="sheet-pad">
          <div className="eyebrow">{C?.eyebrow ?? "Sprint contract"}</div>
          <h3 className="h2">{C?.title ?? "The Sprint, in writing."}</h3>
          <ol className="lc-contract">{items.map((x, i) => <li key={i}>{fill(x, p, { handle: d.me?.handle || "your account" })}</li>)}</ol>
          <label className="field mt-4"><span className="label">Type your full name to sign</span>
            <span className="input-wrap"><input className="input lc-sign-in" autoFocus autoComplete="off" placeholder={d.me?.name} value={name} onChange={(e) => setName(e.target.value)} /></span>
          </label>
          <button className="btn btn-lg btn-block mt-4" type="button" disabled={b || name.trim().length < 3} onClick={async () => {
            setB(true);
            try {
              await rpc("luca_sign_contract", { p_slug: slug, p_name: name.trim() });
              close(); sound.play("success");
              await refresh();
            } catch (e) { setB(false); ui.toast(errMsg(e), "warning-circle"); }
          }}>{b ? "Signing" : "Sign the contract"}</button>
        </div>
      );
    }
    ui.sheet({ label: "Sprint contract", render: (close) => <Body close={close} /> });
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const links = a.parts.map((part, i) => part.k === "sign" ? { url: null } : { url: main.slots[i]?.url, title: main.slots[i]?.title ?? null });
      const r = await rpc<{ id: string; on_time: boolean; awarded: number }>("luca_submit", { p_assignment: a.id, p_links: links });
      main.clear();
      const when = rs ? `${T.same(rs.starts_at, T.now()) ? "tonight" : T.day(rs.starts_at)} at ${T.time(rs.starts_at)}` : "soon";
      ui.moment({
        eyebrow: `Week ${a.week_n}`, title: `That's Week ${a.week_n} in the bank.`,
        sub: `Reviewed live ${when}. ${d.mentorNames(rs?.mentor_ids ?? []) || "Your mentor"} will call it: Ship, Fix or Hold.`,
        coins: r.awarded || undefined, coinsWhy: "In on time", cta: "Done",
        onDone: () => { void refresh(); },
      });
    } catch (e) {
      sound.play("error");
      ui.toast(errMsg(e), "warning-circle");
    } finally { setBusy(false); }
  };

  const sendFix = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await rpc("luca_submit_fix", { p_assignment: a.id, p_url: fix.slots[0]?.url });
      fix.clear();
      ui.moment({
        eyebrow: "Fix sent", title: `Back with ${by?.name.split(" ")[0] ?? "your mentor"}.`,
        sub: rs && Date.parse(rs.starts_at) > T.now().getTime() ? `They look again before ${T.same(rs.starts_at, T.now()) ? "tonight's" : "the"} review. You hear the call live.` : "They look again and call it: Ship, Fix or Hold.",
        cta: "Done", onDone: () => { void refresh(); },
      });
    } catch (e) {
      sound.play("error");
      ui.toast(errMsg(e), "warning-circle");
    } finally { setBusy(false); }
  };

  const verdict = () => {
    if (!sub) return null;
    if (s.v === "pending" || s.v === "fixed") {
      const tonight = rs && T.same(rs.starts_at, T.now());
      return (
        <div className="vb vb--pending rv">
          <span className="vb-k">{s.v === "fixed" ? "Fix sent" : "In review"}</span>
          <b className="vb-w">{tonight ? (T.hour() >= 17 ? "Live tonight" : "Live today") : rs ? T.day(rs.starts_at) : "Soon"}</b>
          {rs ? <p>Reviewed at {rs.title}, {T.time(rs.starts_at)}.{hot ? ` You're #${hot.position} on the hot seat.` : ""}</p> : null}
          {rs ? <Link className="btn btn-sm btn-secondary" to={`/luca/${slug}/session/${rs.id}`}>See the session</Link> : null}
        </div>
      );
    }
    return (
      <div className={`vb vb--${s.v} rv`}>
        <span className="vb-k">Mentor&apos;s call{sub.reviewed_at ? ` · ${T.day(sub.reviewed_at)}` : ""}</span>
        <b className="vb-w">{s.v === "ship" ? "Ship" : s.v === "fix" ? "Fix" : "Hold"}</b>
        {by ? <div className="vb-by"><Av p={by} /><span><b>{by.name}</b><em>{by.angle}</em></span></div> : null}
        {sub.notes?.length ? <ul className="vb-notes">{sub.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
        {sub.was_fix && s.v === "ship" ? <p className="vb-fixed"><Icon name="arrow-bend-up-right" />Started as Fix. You fixed it.</p> : null}
        {s.v === "hold" ? <p className="muted mt-2">Hold means park this one. Talk to your mentor about what&apos;s next; it doesn&apos;t count against you.</p> : null}
      </div>
    );
  };

  return (
    <Page cls="page--assign">
      <DemoBar />
      <NavBar title={`Week ${a.week_n}`} back />
      <div className="sec sec--hero">
        <div className="eyebrow rv">Week {a.week_n}{week ? ` · ${week.module}` : ""}{a.is_group ? " · reviewed with your Clan" : ""}</div>
        <h1 className="h1 rv">{a.title}</h1>
        <div className="as-line rv">
          <VChip v={sub?.was_fix && s.v === "ship" ? "ship" : s.v} />
          <span>{open ? <>Due {T.day(a.due_at)}, {T.time(a.due_at)} · <Count to={a.due_at} fmt="left" zero="closed" /> left</> : sub ? `Submitted ${T.day(sub.submitted_at)}${sub.on_time ? "" : " · late"}` : ""}</span>
        </div>
        {a.brief ? <p className="muted rv mt-3" style={{ whiteSpace: "pre-line" }}>{a.brief}</p> : null}
      </div>

      {open ? (
        <div className="sec">
          {s.v === "soon" ? <div className="lc-note rv"><b>Opens with Week {a.week_n}.</b> You can get your links ready now and send them any time before the deadline.</div> : null}
          <div className="as-how rv"><b>Paste the links. Nothing to upload.</b><span>Make sure your mentor can open them. We check for you.</span></div>
          <div className="lss rv">
            {a.parts.map((part, i) => (
              <LinkSlot key={i} part={part} i={i} slots={main.slots} setSlots={main.setSlots} signed={signed} onSign={sign} />
            ))}
          </div>
          <button className="btn btn-lg btn-block as-submit rv" type="button" disabled={!allIn || busy} onClick={submit}>
            {busy ? "Submitting" : allIn ? `Submit Week ${a.week_n}` : `Submit Week ${a.week_n} · ${main.count} of ${linkParts} in`}
          </button>
          <p className="fine center rv">{s.v === "late" ? "It's past the deadline. Send it anyway: late work still gets a call." : `+${a.coins ?? p.coin_rules?.submit_on_time?.value ?? 150} coins if it's in before the deadline.`}</p>
        </div>
      ) : <div className="sec">{verdict()}</div>}

      {s.v === "fix" && sub ? (
        <div className="sec">
          <SecHead title="Send the fix" sub={sub.fix_due_at ? `By ${T.day(sub.fix_due_at)}, ${T.time(sub.fix_due_at)}.` : undefined} />
          {sub.fix_due_at ? <div className="vb-due rv"><Count to={sub.fix_due_at} fmt={Date.parse(sub.fix_due_at) - T.now().getTime() > 2 * T.DAYMS ? "dhm" : "hms"} /></div> : null}
          <div className="lss rv"><LinkSlot part={FIX_PART[0]} i={0} slots={fix.slots} setSlots={fix.setSlots} /></div>
          <button className="btn btn-lg btn-block rv" type="button" disabled={!fix.allIn || busy} onClick={sendFix}>{busy ? "Sending" : "Send the fix"}</button>
        </div>
      ) : null}

      {!open && sub ? (
        <div className="sec">
          <SecHead title="What you sent" />
          <div className="lss lss--ro rv">
            {sub.links.map((l, i) => {
              if (l.kind === "sign") return <div key={i} className="ls is-in"><div className="ls-top"><span className="ls-word">SIGN</span><span className="ls-meta"><b>{l.label}</b><span>Signed by {d.me?.contract_name ?? d.me?.name}</span></span><Check on /></div></div>;
              const k = l.url ? detect(l.url) : null;
              return (
                <a key={i} className="ls is-in" href={l.url ?? undefined} target="_blank" rel="noopener noreferrer">
                  <div className="ls-top"><span className="ls-word">{k?.word ?? wordFor(l.kind)}</span><span className="ls-meta"><b>{l.title || l.label}</b><span>{l.url ? shortUrl(l.url) : ""}</span></span><Check on /></div>
                </a>
              );
            })}
            {sub.fix_url ? (
              <a className="ls is-in" href={sub.fix_url} target="_blank" rel="noopener noreferrer">
                <div className="ls-top"><span className="ls-word">FIX</span><span className="ls-meta"><b>The fixed version</b><span>{shortUrl(sub.fix_url)}</span></span><Check on /></div>
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {p.content.drive_folders?.length ? (
        <div className="sec">
          <SecHead title="Where your files live" />
          {p.drive_url
            ? <a className="drv rv" href={p.drive_url} target="_blank" rel="noopener noreferrer">{p.content.drive_folders.map((f) => <span key={f}><Icon name="folder-simple" />{f}</span>)}</a>
            : <div className="drv rv">{p.content.drive_folders.map((f) => <span key={f}><Icon name="folder-simple" />{f}</span>)}</div>}
          <p className="fine rv mt-2">Your copy of the cohort Drive. Work in Docs and Sheets there, then paste the link here.</p>
        </div>
      ) : null}
    </Page>
  );
}
