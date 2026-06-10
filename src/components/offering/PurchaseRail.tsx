import { useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import GuaranteeBadge from "./GuaranteeBadge";
import ProofRow, { type OfferingProof } from "./ProofRow";

interface PurchaseRailProps {
  offeringId: string;
  price: number;
  mrp?: number | null;
  highlights: string[];
  refundPolicyDays?: number | null;
  /** Tally form URL for application-only cohorts; switches the CTA. */
  applyUrl?: string | null;
  isStaged: boolean;
  proof: OfferingProof;
}

/**
 * Desktop (lg+) sticky purchase rail for the offering page. Price + proof
 * + top highlights + guarantee + CTA, parked at top-24 beside the long
 * marketing column so the buy affordance never scrolls away.
 *
 * NEVER render this on native: it is a price/buy surface and must stay
 * behind the !isNative() gate at the callsite (Google Reader Rule /
 * Apple anti-steering). The in-flow hero CTA covers <lg.
 */
export default function PurchaseRail({
  offeringId,
  price,
  mrp,
  highlights,
  refundPolicyDays,
  applyUrl,
  isStaged,
  proof,
}: PurchaseRailProps) {
  const navigate = useNavigate();
  const isFree = Number(price) <= 0;
  const showStrike = !!mrp && Number(mrp) > Number(price);
  const top4 = highlights.slice(0, 4);

  return (
    <div className="sticky top-24 rounded-2xl border border-border bg-[hsl(var(--surface))] p-6 space-y-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]">
      {applyUrl ? (
        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--cream))]/80">
          Application-only
        </p>
      ) : (
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold text-foreground tracking-[-0.01em]">
            {isFree ? "Free" : `₹${Number(price).toLocaleString("en-IN")}`}
          </span>
          {showStrike && (
            <span className="text-base text-muted-foreground line-through font-mono">
              ₹{Number(mrp).toLocaleString("en-IN")}
            </span>
          )}
        </div>
      )}

      <ProofRow avg={proof.avg} enrolled={proof.enrolled} />

      {top4.length > 0 && (
        <ul className="space-y-2">
          {top4.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="h-4 w-4 mt-0.5 text-[hsl(var(--accent-emerald))] flex-shrink-0" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}

      <GuaranteeBadge days={refundPolicyDays} />

      {applyUrl ? (
        <a
          href={applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-champagne pressable flex w-full items-center justify-center h-12 text-base font-semibold rounded-2xl text-[hsl(var(--cream-text))]"
        >
          Apply for an invite
          <ArrowRight className="h-4 w-4 ml-2" />
        </a>
      ) : (
        <Button
          onClick={() => navigate(`/checkout/${offeringId}`)}
          className="btn-champagne pressable w-full h-12 text-base font-semibold rounded-2xl text-[hsl(var(--cream-text))]"
        >
          {isStaged ? "Apply now" : isFree ? "Start for free" : "Enrol now"}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      )}

      {!applyUrl && (
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground text-center">
          Secure payments · Razorpay
        </p>
      )}
    </div>
  );
}
