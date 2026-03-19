import { useParams, Navigate } from "react-router-dom";

/**
 * Cohort dashboard redirects to the course detail page.
 * The course detail page handles all course types including cohorts.
 */
const CohortDashboard = () => {
  const { slug } = useParams();
  return <Navigate to={`/learn/course/${slug}`} replace />;
};

export default CohortDashboard;
