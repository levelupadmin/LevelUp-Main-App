import StudentLayout from "@/components/layout/StudentLayout";

export const CommunityPage = () => (
  <StudentLayout title="Community">
    <div className="text-muted-foreground">Community page — coming soon</div>
  </StudentLayout>
);

export const InstructorDashboard = () => <div className="p-8 text-muted-foreground">Instructor Dashboard — coming soon</div>;
export const NotFound = () => (
  <div className="flex min-h-screen items-center justify-center bg-canvas">
    <div className="text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-muted-foreground mt-2">Page not found</p>
    </div>
  </div>
);
