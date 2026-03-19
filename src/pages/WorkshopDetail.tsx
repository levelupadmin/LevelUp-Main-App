import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import { Navigate } from "react-router-dom";

/**
 * WorkshopDetail now redirects to the unified CourseDetail page.
 * Workshops are just courses with course_type='workshop' and are handled
 * by the same detail page at /learn/course/:slug.
 */
const WorkshopDetail = () => {
  const { slug } = useParams();
  // Redirect to the course detail page which handles all course types
  return <Navigate to={`/learn/course/${slug}`} replace />;
};

export default WorkshopDetail;
