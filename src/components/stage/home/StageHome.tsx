import { useMemo } from "react";
import usePageTitle from "@/hooks/usePageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { useStageCatalog } from "./catalog";
import { useBuyerHome } from "./buyer";
import BuyerHome from "./BuyerHome";
import { CatalogCta, SectionsError, SectionsSkeleton, StartFree } from "./sections";
import { CohortCards, MentorRail, Proof, WantTo, craftFor, craftSlugs, useMyCrafts } from "./discover";
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
 * - owns nothing    -> one next step (03_Specs/01_Home_New_Person_Plan.md):
 *                      a free lesson (one from their craft first), the mentors,
 *                      "I want to…", the live cohorts, the community, and a
 *                      link to Explore, which holds the catalogue.
 */
export default function StageHome() {
  usePageTitle("Home");
  const { profile } = useAuth();
  const buyer = useBuyerHome();
  const { data, isError, refetch } = useStageCatalog();
  const crafts = useMyCrafts();
  const craft = craftFor(crafts.data ?? []);

  // The free lesson leads with one from the craft they picked, when there is one.
  const free = useMemo(() => {
    if (!data) return [];
    const mine = craftSlugs(craft);
    const rank = (slug: string) => (mine.includes(slug) ? mine.indexOf(slug) : mine.length);
    return [...data.free].sort((a, b) => rank(a.offering.slug) - rank(b.offering.slug));
  }, [data, craft]);

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
      <p className="hm-welcome">Learn from the people who made the films you love, then make your own.</p>
      {isError || buyer.isError ? (
        <SectionsError onRetry={() => { void refetch(); void buyer.refetch(); }} />
      ) : !data ? (
        <SectionsSkeleton />
      ) : (
        <div className="hm-grid">
          <div className="hm-main">
            <StartFree free={free} />
            <MentorRail data={data} />
            <WantTo data={data} initial={craft} />
            <CohortCards />
            <Proof />
            <CatalogCta data={data} />
          </div>
        </div>
      )}
    </div>
  );
}
