import { useNavigate } from "react-router-dom";
import usePageTitle from "@/hooks/usePageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { useStageCatalog } from "./catalog";
import { useBuyerHome } from "./buyer";
import BuyerHome from "./BuyerHome";
import { CatalogCta, Compare, Formats, SectionsError, SectionsSkeleton, Shelves, StartFree } from "./sections";
import "@/styles/stage-ui.css";
import "./home.css";

const PLACEHOLDER_NAME = "LevelUp Student";
const longDateIST = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).replace(",", "");

/**
 * Home, round 4 (15_LMS_Experience_Lab/home.html). Built only from what the
 * database returns for the person signed in:
 * - owns something  -> BuyerHome: the next thing, My learning, the next 7 days,
 *                      Explore more;
 * - owns nothing    -> how learning works here: a free lesson to start, the
 *                      three formats, which one is for you, the shelves, the
 *                      full catalogue (home.html?p=new).
 */
export default function StageHome() {
  usePageTitle("Home");
  const navigate = useNavigate();
  const { profile } = useAuth();
  const buyer = useBuyerHome();
  const { data, isError, refetch } = useStageCatalog();

  const full = (profile?.full_name ?? "").trim();
  const first = full && full !== PLACEHOLDER_NAME ? full.split(/\s+/)[0] : "";

  if (buyer.isLoading) return <div className="hm-inner"><SectionsSkeleton /></div>;
  if (buyer.data && buyer.data.items.length > 0) return <BuyerHome data={buyer.data} catalog={data} firstName={first} />;

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
      {isError || buyer.isError ? (
        <SectionsError onRetry={() => { void refetch(); void buyer.refetch(); }} />
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
