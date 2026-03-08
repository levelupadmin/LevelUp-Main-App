import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Clapperboard } from "lucide-react";
import { useParams } from "react-router-dom";

const CourseDetail = () => {
  const { slug } = useParams();
  return (
    <AppShell>
      <PlaceholderPage
        icon={Clapperboard}
        title={`Course: ${slug}`}
        subtitle="Full course page with video, lessons, micro-activities, and purchase CTA."
        badge="Course"
      />
    </AppShell>
  );
};

export default CourseDetail;
