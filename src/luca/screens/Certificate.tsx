import { Navigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { DemoBar, NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { fill, num } from "../lib/format";
import * as T from "../lib/time";

/** After Demo Day: a certificate to print or share, with the numbers that earned it. */
export default function Certificate() {
  const { slug, d } = useLuca();
  const ui = useUI();
  if (!d.alumni) return <Navigate to={`/luca/${slug}/today`} replace />;
  const me = d.me!;
  const p = d.p;
  const shipped = (d.r.submissions ?? []).filter((s) => s.verdict === "ship").length;
  const posts = (d.r.sprint_posts ?? []).filter((x) => x.kind === "post").length;
  const done = p.demo_day_at ? new Date(p.demo_day_at) : p.ends_at ? new Date(p.ends_at) : T.now();
  const line = fill(p.content.certificate?.line ?? "completed {program}, {cohort}, and shipped on Demo Day.", p);
  const pageUrl = `${window.location.origin}/luca/${slug}/program`;
  const linkedIn = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(`${p.name} · ${p.cohort_label}`)}&organizationName=${encodeURIComponent("LevelUp Learning")}&issueYear=${T.year(done)}&issueMonth=${T.parts(done).mo + 1}&certUrl=${encodeURIComponent(pageUrl)}`;

  return (
    <Page cls="page--me">
      <DemoBar />
      <NavBar title="Certificate" back />
      <div className="sec sec--hero">
        <div className="lc-cert rv" style={{ padding: "28px 22px", borderRadius: 18, background: "var(--surface-2)", border: "1px solid var(--line, rgba(255,255,255,.08))", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}><Logo className="lu-logo--bar" /></div>
          <div className="eyebrow mt-4">Certificate of completion</div>
          <h1 className="h1 mt-3">{me.name}</h1>
          <p className="muted mt-3">{line}</p>
          <div className="lc-wrap-n mt-4">
            <div><b>{shipped}</b><span>shipped</span></div>
            <div><b>{posts}</b><span>Sprint posts</span></div>
            <div><b>{num(me.coins)}</b><span>coins</span></div>
          </div>
          <p className="fine mt-4">{T.dayLong(done)} {T.year(done)}</p>
        </div>
      </div>
      <div className="sec">
        <div className="stack-2">
          <a className="btn btn-lg btn-block" href={linkedIn} target="_blank" rel="noopener noreferrer"><Icon name="share-network" />Add to LinkedIn</a>
          <button className="btn btn-lg btn-block btn-secondary" type="button" onClick={() => window.print()}><Icon name="download-simple" />Save as PDF</button>
          <button className="btn-text" type="button" onClick={async () => { try { await navigator.clipboard.writeText(pageUrl); ui.toast("Link copied", "link-simple"); } catch { /* ignore */ } }}>Copy the program link</button>
        </div>
      </div>
    </Page>
  );
}
