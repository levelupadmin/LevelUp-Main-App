import { claimRoute } from "@/hooks/useClaimApplication";
import type { ApplicantStage, ApplicantStageView } from "@/hooks/useApplicantStage";

// ── What the applicant card says (REQ-IDENT-4) ──
// The copy for every state, and the one decision of which copy a view gets.
// Shared by the two cards that draw it: the classic Home's ApplicantStageCard
// and the Stage Home's card, so the two looks can never say different things
// about the same application. Everything it knows comes from
// `useApplicantStage`; this file derives nothing beyond picking the copy.
//
// The single action always routes into the app (the application's own page, or
// the claim step). No payment CTA comes from here from any source: staged
// payments and their `isIOS()` anti-steering guard stay where they already
// live, on ApplicationStatus.

export const STAGE_COPY: Record<
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

export interface ApplicantCardContent {
  chip?: string;
  title: string;
  body: string;
  action?: { to: string; label: string };
}

export function applicantCardContent(view: ApplicantStageView): ApplicantCardContent {
  const title = view.offeringTitle ?? "Your application";

  // A row that has not been proven to belong to this account: the claim step
  // (S-4) is the only honest next move, so no stage is asserted about it. The
  // route comes from S-4's own `claimRoute` helper so the two halves of the
  // pinned contract can never drift apart.
  if (view.kind === "claim") {
    return {
      title,
      body: "We found an application that looks like yours. One quick check links it to this account.",
      action: { to: claimRoute(view.applicationId), label: "Confirm it is you" },
    };
  }

  // Orphan / unrecognised state: information, never a guessed CTA.
  if (view.kind === "neutral") {
    return { title, body: "We are checking your application." };
  }

  const copy = STAGE_COPY[view.stage];
  return {
    chip: copy.chip,
    title,
    body: copy.body,
    action: copy.action
      ? { to: `/my-application/${view.applicationId}`, label: copy.action }
      : undefined,
  };
}
