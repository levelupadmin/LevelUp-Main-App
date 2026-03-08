import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { MessageSquare } from "lucide-react";
import { useParams } from "react-router-dom";

const CommunityPost = () => {
  const { id } = useParams();
  return (
    <AppShell>
      <PlaceholderPage
        icon={MessageSquare}
        title={`Post #${id}`}
        subtitle="Full post view with comments, reactions, and creator info."
        badge="Post"
      />
    </AppShell>
  );
};

export default CommunityPost;
