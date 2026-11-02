import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApplicantStageView } from "@/hooks/useApplicantStage";
import { applicantCardContent } from "./applicantCardContent";

// ── Applicant stage card (REQ-IDENT-4) ──
// The applicant's one line on Home: a single label chip and a single primary
// (champagne) action. Everything it knows comes from `useApplicantStage`, which
// projects `cohort_applications.status` — and the reconciled stage when
// `VITE_FUNNEL_RECON` is on — onto the label states. The copy, and which copy a
// view gets, live in `applicantCardContent.ts` (shared with the Stage Home);
// this file owns the classic look only.
//
// The single action always routes into the app (the application's own page, or
// the claim step). No payment CTA is rendered here from any source: staged
// payments and their `isIOS()` anti-steering guard stay where they already
// live, on ApplicationStatus.

// The shared frame. One surface, one optional chip, one optional action, so
// every state is visually the same card and only its content changes. Static by
// design: the feed's `.anim-rise` entrance already covers it, so this adds no
// new motion and no new backdrop-blur.
const CardFrame = ({
  chip,
  title,
  body,
  action,
}: {
  chip?: string;
  title: string;
  body: ReactNode;
  action?: { to: string; label: string };
}) => (
  <section
    aria-label="Your application"
    className="rounded-2xl bg-surface ring-1 ring-white/5 px-4 py-4 sm:px-5 sm:py-5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)]"
  >
    {chip && (
      <Badge
        variant="outline"
        className="border-[hsl(var(--cream))]/30 bg-[hsl(var(--cream))]/10 text-[hsl(var(--cream))]"
      >
        {chip}
      </Badge>
    )}
    <h2 className="mt-3 text-base sm:text-lg font-semibold tracking-[-0.01em]">
      {title}
    </h2>
    <p className="mt-1 text-sm text-muted-foreground">{body}</p>

    {/* EXACTLY ONE primary action, champagne, full-width on phones and 48px
        tall (size lg) so it clears the 44px touch floor on both shells. */}
    {action && (
      <Button
        asChild
        variant="champagne"
        size="lg"
        className="mt-4 w-full sm:w-auto"
      >
        <Link to={action.to}>
          {action.label}
          <ArrowRight />
        </Link>
      </Button>
    )}
  </section>
);

const ApplicantStageCard = ({ view }: { view: ApplicantStageView }) => (
  <CardFrame {...applicantCardContent(view)} />
);

export default ApplicantStageCard;
