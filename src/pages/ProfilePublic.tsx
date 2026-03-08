import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { UserCircle } from "lucide-react";
import { useParams } from "react-router-dom";

const ProfilePublic = () => {
  const { handle } = useParams();
  return (
    <AppShell>
      <PlaceholderPage
        icon={UserCircle}
        title={`@${handle}`}
        subtitle="Public creator profile with portfolio, badges, and proof-of-work."
        badge="Profile"
      />
    </AppShell>
  );
};

export default ProfilePublic;
