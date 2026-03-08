import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Presentation } from "lucide-react";
import { useParams } from "react-router-dom";

const WorkshopDetail = () => {
  const { slug } = useParams();
  return (
    <AppShell>
      <PlaceholderPage
        icon={Presentation}
        title={`Workshop: ${slug}`}
        subtitle="Workshop details, schedule, pricing, and enrollment."
        badge="Workshop"
      />
    </AppShell>
  );
};

export default WorkshopDetail;
