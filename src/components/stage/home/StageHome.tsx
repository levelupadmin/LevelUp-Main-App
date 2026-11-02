import usePageTitle from "@/hooks/usePageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { useStageCatalog } from "./catalog";
import { useBuyerHome } from "./buyer";
import BuyerHome from "./BuyerHome";
import { SectionsError, SectionsSkeleton } from "./sections";
import { HomeCarousel, HomeRows, useLandingHeads } from "./discover";
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
 * - owns nothing    -> the carousel of five programmes, then the masterclasses,
 *                      the live cohorts and the workshops as wide cards
 *                      (03_Specs/01_Home_New_Person_Plan.md, round 3).
 */
export default function StageHome() {
  usePageTitle("Home");
  const { profile } = useAuth();
  const buyer = useBuyerHome();
  const { data, isError, refetch } = useStageCatalog();
  const heads = useLandingHeads();

  const full = (profile?.full_name ?? "").trim();
  const first = full && full !== PLACEHOLDER_NAME ? full.split(/\s+/)[0] : "";

  if (buyer.isLoading) return <div className="hm-inner"><SectionsSkeleton /></div>;
  if (buyer.data && buyer.data.items.length > 0) return <BuyerHome data={buyer.data} catalog={data} firstName={first} />;

  return (
    <div className="hm-inner">
      <div className="hm-hello">
        <span className="eyebrow">{longDateIST(new Date())}</span>
        <h1 className="hm-h1">{first ? `Welcome, ${first}` : "Welcome to LevelUp"}</h1>
      </div>
      {isError || buyer.isError ? (
        <SectionsError onRetry={() => { void refetch(); void buyer.refetch(); }} />
      ) : !data ? (
        <SectionsSkeleton />
      ) : (
        <div className="hm-main">
          <HomeCarousel heads={heads.data ?? []} />
          <HomeRows data={data} heads={heads.data ?? []} />
        </div>
      )}
    </div>
  );
}
