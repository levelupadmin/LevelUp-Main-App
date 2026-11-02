import type { ReactNode } from "react";
import MasterclassLanding from "./MasterclassLanding";
import CohortLanding from "./CohortLanding";
import type { Landing, LandingAction } from "./landing";
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
export default function StageLanding({ landing, action, after }: { landing: Landing; action: LandingAction; after?: ReactNode }) {
  return landing.kind === "masterclass"
    ? <MasterclassLanding d={landing} action={action} after={after} />
    : <CohortLanding d={landing} action={action} after={after} />;
}
