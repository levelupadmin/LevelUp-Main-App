import { lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import usePageTitle from "@/hooks/usePageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { useStageCatalog } from "./catalog";
import { CatalogCta, Compare, Formats, SectionsError, SectionsSkeleton, Shelves, StartFree } from "./sections";
import "@/styles/stage-ui.css";
import "./home.css";

// People who already own something keep today's Home (restyled by the Stage
// tokens) until the round-4 "My learning" cards, the next-thing card and the
// week strip are built on the real session data.
const LegacyHome = lazy(() => import("@/pages/Home"));

const PLACEHOLDER_NAME = "LevelUp Student";
const longDateIST = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).replace(",", "");

/**
 * Home for someone who hasn't bought anything yet: the round-4 mockup
 * (15_LMS_Experience_Lab/home.html?p=new). Greeting, then how learning works
 * here: a free lesson to start with, the three formats, which one is for
 * you, the shelves of real products, and the full catalogue.
 */
export default function StageHome() {
  usePageTitle("Home");
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data, owned, isLoading, isError, refetch } = useStageCatalog();

  if (!isLoading && owned.length > 0) {
    return (
      <div className="sh-legacy">
        <Suspense fallback={<SectionsSkeleton />}><LegacyHome /></Suspense>
      </div>
    );
  }

  const full = (profile?.full_name ?? "").trim();
  const first = full && full !== PLACEHOLDER_NAME ? full.split(/\s+/)[0] : "";
  const toShelf = (tier: string) => {
    const el = document.getElementById(`shelf-${tier}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else navigate(`/explore#shelf-${tier}`);
  };

  return (
    <div className="hm-inner">
      <div className="hm-hello">
        <span className="eyebrow">{longDateIST(new Date())}</span>
        <h1 className="hm-h1">{first ? `Welcome, ${first}` : "Welcome to LevelUp"}</h1>
      </div>
      <p className="hm-welcome">Here is how learning works at LevelUp. Start with a free lesson, then pick the way that suits you.</p>
      {isError ? (
        <SectionsError onRetry={() => void refetch()} />
      ) : !data ? (
        <SectionsSkeleton />
      ) : (
        <div className="hm-grid">
          <div className="hm-main">
            <StartFree free={data.free} />
            <Formats formats={data.formats} onSeeShelf={toShelf} />
            <Compare formats={data.formats} />
            <Shelves formats={data.formats} onSeeAll={(tier) => navigate(`/explore?tier=${tier}`)} />
            <CatalogCta data={data} />
          </div>
        </div>
      )}
    </div>
  );
}
