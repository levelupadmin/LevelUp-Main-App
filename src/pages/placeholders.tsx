import StudentLayout from "@/components/layout/StudentLayout";
import usePageTitle from "@/hooks/usePageTitle";

export const CommunityPage = () => {
  usePageTitle("Community");
  return (
    <StudentLayout title="Community">
      <div className="text-center py-16">
        <p className="text-lg font-serif-italic text-cream mb-2">Community</p>
        <p className="text-muted-foreground text-sm">Coming soon — connect with fellow creators.</p>
      </div>
    </StudentLayout>
  );
};

export const InstructorDashboard = () => <div className="p-8 text-muted-foreground">Instructor Dashboard — coming soon</div>;
