import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { tapTick } from "@/lib/haptics";
import type { ApplicantStageView } from "@/hooks/useApplicantStage";
import { applicantCardContent } from "@/components/home/applicantCardContent";

/*
 * Someone mid-application, on the Stage Home: the classic Home's applicant
 * card (fee pending, in review, decision ready, or the claim step). Same hook
 * (useApplicantStage), same words (applicantCardContent), drawn with Stage
 * tokens: one chip, the program, one line, one way in. It links only into the
 * app, never to a payment.
 */
export default function StageApplicantCard({ view }: { view: ApplicantStageView }) {
  const c = applicantCardContent(view);
  return (
    <section className="hm-app" aria-label="Your application">
      {c.chip && <span className="hm-app-chip">{c.chip}</span>}
      <h2 className="hm-app-t">{c.title}</h2>
      <p className="hm-app-s">{c.body}</p>
      {c.action && (
        <Link className="btn btn--md hm-app-go" to={c.action.to} onClick={() => { void tapTick(); }}>
          {c.action.label}<ArrowRight className="ic" />
        </Link>
      )}
    </section>
  );
}
