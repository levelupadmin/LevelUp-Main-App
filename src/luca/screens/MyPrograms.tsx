import { Link, Navigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { Empty, Spinner } from "../components/ui";
import { useMyPrograms } from "../lib/api";

const LABEL: Record<string, string> = { learner: "You're in", locked: "Balance due", applicant: "Application in", none: "" };

/** /luca — the cohorts this account can open. One cohort goes straight in. */
export default function MyPrograms() {
  const { data, isLoading, error } = useMyPrograms();
  if (isLoading) return <div className="lu-load"><Spinner /></div>;
  const list = data ?? [];
  const real = list.filter((p) => !p.is_demo && p.access !== "none");
  if (!error && real.length === 1 && list.every((p) => !p.is_staff)) return <Navigate to={`/luca/${real[0].slug}`} replace />;

  return (
    <div className="page is-entering">
      <header className="appbar rv"><span className="ab-logo"><Logo className="lu-logo--bar" /></span></header>
      <div className="greet"><h1 className="h1 greet-h rv">Your cohorts</h1></div>
      <div className="sec sec--hero">
        {error ? <div className="lc-note rv"><b>We couldn&apos;t load your cohorts.</b> Check your connection and try again.</div> : null}
        {!error && !list.length ? <Empty title="No cohorts yet" sub="When you apply to a live cohort, it shows up here." /> : null}
        <div className="srs rv">
          {list.map((p) => (
            <Link key={p.slug} className="sr" to={`/luca/${p.slug}`}>
              <span className="sr-d">{p.hero_url ? <img src={p.hero_url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} /> : <Icon name="users-three" />}</span>
              <span className="sr-b"><b>{p.name}</b><span>{p.cohort_label}{p.is_demo ? " · demo, staff only" : ""}</span></span>
              {LABEL[p.access] ? <span className="sr-tag sr-tag--today">{LABEL[p.access]}</span> : p.is_staff ? <span className="sr-tag">Staff</span> : null}
            </Link>
          ))}
        </div>
      </div>
      <div className="end-space" />
    </div>
  );
}
