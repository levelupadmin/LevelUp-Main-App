import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Hash } from "lucide-react";
import { useParams } from "react-router-dom";

const CommunitySpace = () => {
  const { slug } = useParams();
  return (
    <AppShell>
      <PlaceholderPage
        icon={Hash}
        title={`Space: ${slug}`}
        subtitle="Community space with posts, discussions, and shared work."
        badge="Space"
      />
    </AppShell>
  );
};

export default CommunitySpace;
