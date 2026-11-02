import { FORMAT_COPY, TIERS, useStageCatalog, type Tier } from "@/components/stage/home/catalog";
import { ProductCard } from "@/components/stage/home/sections";
import "@/styles/stage-ui.css";
import "@/components/stage/home/home.css";

/**
 * "Also from LevelUp" on a sales page (round-3 mockup): the other listed
 * programs in the same format, from the same catalogue Home and Explore use,
 * minus this one and anything the person already owns. Nothing to show,
 * nothing rendered.
 */
export default function StageAlsoFrom({ offeringId, tier }: { offeringId: string; tier?: string | null }) {
  const { data } = useStageCatalog();
  if (!data) return null;
  const t = TIERS.includes(tier as Tier) ? (tier as Tier) : null;
  const pool = t ? data.formats.find((f) => f.tier === t)?.list ?? [] : data.catalog;
  const list = pool.filter((x) => x.offering.id !== offeringId && !x.owned).slice(0, 8);
  if (!list.length) return null;
  return (
    <div className="stage-ui po-also">
      <section className="sec" aria-labelledby="po-also-h">
        <div className="sec-head">
          <h2 className="sec-h" id="po-also-h">{t ? `More ${FORMAT_COPY[t].plural.toLowerCase()}` : "Also from LevelUp"}</h2>
        </div>
        <div className={`pds pds--${t ?? "masterclass"}`}>
          {list.map((x) => <ProductCard key={x.offering.id} x={x} />)}
        </div>
      </section>
    </div>
  );
}
