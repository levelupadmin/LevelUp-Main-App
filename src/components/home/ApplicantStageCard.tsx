import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { claimRoute } from "@/hooks/useClaimApplication";
import type { ApplicantStage, ApplicantStageView } from "@/hooks/useApplicantStage";

// ── Applicant stage card (REQ-IDENT-4) ──
// The applicant's one line on Home: a single label chip and a single primary
// (champagne) action. Everything it knows comes from `useApplicantStage`, which
// projects `cohort_applications.status` — and the reconciled stage when
// `VITE_FUNNEL_RECON` is on — onto the label states. This file owns COPY only;
// it derives nothing.
//
// The single action always routes into the app (the application's own page, or
// the claim step). No payment CTA is rendered here from any source: staged
// payments and their `isIOS()` anti-steering guard stay where they already
// live, on ApplicationStatus.

const STAGE_COPY: Record<
  ApplicantStage,
  { chip: string; body: string; action?: string }
> = {
  // Chip-only, no action, mirroring how `ApplicationStatus` renders the same
  // register (`partial` → "Application started", no CTA): the app has no
  // form-resume affordance to route to — `/my-application/:id` is a read-only
  // timeline — so an action here could only promise something it cannot
  // deliver. Nothing produces this state today (see STATUS_STAGE); it exists
  // so a first-party draft status renders honestly the day one is added.
  draft: {
    chip: "applicant · draft",
    body: "Your application is not submitted yet.",
  },
  "fee-pending": {
    chip: "fee pending",
    body: "Your application is in. The application fee is the next step.",
    action: "See your next step",
  },
  "in-review": {
    chip: "in review",
    body: "Your application is with the team. We will update this card as it moves.",
    action: "Track your application",
  },
  "decision-ready": {
    chip: "decision ready",
    body: "There is an update waiting on your application.",
    action: "See your decision",
  },
};

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

const ApplicantStageCard = ({ view }: { view: ApplicantStageView }) => {
  const title = view.offeringTitle ?? "Your application";

  // A row that has not been proven to belong to this account: the claim step
  // (S-4) is the only honest next move, so no stage is asserted about it. The
  // route comes from S-4's own `claimRoute` helper so the two halves of the
  // pinned contract can never drift apart.
  if (view.kind === "claim") {
    return (
      <CardFrame
        title={title}
        body="We found an application that looks like yours. One quick check links it to this account."
        action={{ to: claimRoute(view.applicationId), label: "Confirm it is you" }}
      />
    );
  }

  // Orphan / unrecognised state: information, never a guessed CTA.
  if (view.kind === "neutral") {
    return <CardFrame title={title} body="We are checking your application." />;
  }

  const copy = STAGE_COPY[view.stage];
  return (
    <CardFrame
      chip={copy.chip}
      title={title}
      body={copy.body}
      action={
        copy.action
          ? { to: `/my-application/${view.applicationId}`, label: copy.action }
          : undefined
      }
    />
  );
};

export default ApplicantStageCard;
