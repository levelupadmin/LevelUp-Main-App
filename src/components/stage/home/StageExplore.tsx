import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import usePageTitle from "@/hooks/usePageTitle";
import { tapTick } from "@/lib/haptics";
import { FORMAT_COPY, TIERS, useStageCatalog, type Tier } from "./catalog";
import { Compare, Formats, SectionsError, SectionsSkeleton, Shelves } from "./sections";
import "@/styles/stage-ui.css";
import "./home.css";

/**
 * Explore: the full catalogue, one tab from everywhere. The same sections as
 * Home's discovery half, with tier chips (spec 7.2: neutral pills, the
 * selected one inverted) and every product in a grid instead of a rail.
 */
export default function StageExplore() {
  usePageTitle("Explore");
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const { data, isError, refetch } = useStageCatalog();
  const tierParam = params.get("tier");
  const tier: Tier | null = TIERS.includes(tierParam as Tier) ? (tierParam as Tier) : null;

  // /explore#shelf-<tier> from Home's format cards: scroll once it renders.
  useEffect(() => {
    if (!data || !hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [data, hash]);

  const pick = (t: Tier | null) => {
    void tapTick();
    const next = new URLSearchParams(params);
    if (t) next.set("tier", t);
    else next.delete("tier");
    setParams(next, { replace: true });
  };

  const formats = data ? data.formats.filter((f) => f.count && (!tier || f.tier === tier)) : [];

  return (
    <div className="hm-inner">
      <div className="ex-head">
        <div className="hm-hello">
          <span className="eyebrow">Explore</span>
          <h1 className="hm-h1">Everything you can learn here</h1>
        </div>
        <div className="s-chips" role="tablist" aria-label="Formats">
          <button type="button" role="tab" aria-selected={!tier} className={`s-chip${!tier ? " is-on" : ""}`} onClick={() => pick(null)}>All</button>
          {TIERS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tier === t} className={`s-chip${tier === t ? " is-on" : ""}`} onClick={() => pick(t)}>
              {FORMAT_COPY[t].plural}
            </button>
          ))}
        </div>
      </div>
      {isError ? (
        <SectionsError onRetry={() => void refetch()} />
      ) : !data ? (
        <SectionsSkeleton />
      ) : (
        <div className="hm-grid">
          <div className="hm-main">
            {!tier && <Formats formats={data.formats} onSeeShelf={(t) => pick(t as Tier)} />}
            {!tier && <Compare formats={data.formats} />}
            <Shelves formats={formats} grid />
          </div>
        </div>
      )}
    </div>
  );
}
