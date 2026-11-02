import type { ReactNode } from "react";
import MasterclassLanding from "./MasterclassLanding";
import CohortLanding from "./CohortLanding";
import type { Landing, LandingAction, MasterclassLanding as MasterclassLandingData } from "./landing";
import "@/styles/stage-ui.css";
import "@/components/stage/home/home.css";
import "@/components/stage/course/course.css";
import "./landing.css";

/**
 * The sales page as a landing page (/p/:slug under Stage) for a product whose
 * offerings.landing is filled. PublicOffering decides what the buttons do
 * (buy, apply, or continue on web in the phone apps); `after` is the
 * "More masterclasses" rail.
 */
/** Lists a page may leave out default to empty, so a missing section never crashes the page. */
const withLists = (d: MasterclassLandingData): MasterclassLandingData => ({
  ...d,
  skills: d.skills ?? [],
  included: d.included ?? [],
  value: d.value ?? [],
  for_you: d.for_you ?? [],
  not_for_you: d.not_for_you ?? [],
  faqs: d.faqs ?? [],
});

export default function StageLanding({ landing, action, after }: { landing: Landing; action: LandingAction; after?: ReactNode }) {
  return landing.kind === "masterclass"
    ? <MasterclassLanding d={withLists(landing)} action={action} after={after} />
    : <CohortLanding d={landing} action={action} after={after} />;
}
