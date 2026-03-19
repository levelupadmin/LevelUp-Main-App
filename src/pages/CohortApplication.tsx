import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate, Navigate } from "react-router-dom";

/**
 * Cohort applications are not yet implemented with a backend.
 * Redirect to the cohort detail page for now.
 */
const CohortApplication = () => {
  const { slug } = useParams();
  return <Navigate to={`/learn/cohort/${slug}`} replace />;
};

export default CohortApplication;
