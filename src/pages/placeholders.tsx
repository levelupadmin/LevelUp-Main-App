import StudentLayout from "@/components/layout/StudentLayout";

export const CourseDetail = () => (
  <StudentLayout title="Course Detail">
    <div className="text-muted-foreground">Course detail page — coming soon</div>
  </StudentLayout>
);

export const ChapterViewer = () => (
  <StudentLayout title="Chapter">
    <div className="text-muted-foreground">Chapter viewer — coming soon</div>
  </StudentLayout>
);

export const Profile = () => (
  <StudentLayout title="Profile">
    <div className="text-muted-foreground">Profile page — coming soon</div>
  </StudentLayout>
);

export const BrowsePage = () => (
  <StudentLayout title="Browse Programs">
    <div className="text-muted-foreground">Browse page — coming soon</div>
  </StudentLayout>
);

export const CommunityPage = () => (
  <StudentLayout title="Community">
    <div className="text-muted-foreground">Community page — coming soon</div>
  </StudentLayout>
);

export const MyCoursesPage = () => (
  <StudentLayout title="My Courses">
    <div className="text-muted-foreground">My Courses page — coming soon</div>
  </StudentLayout>
);

// Admin/Instructor placeholders
export const AdminDashboard = () => <div className="p-8 text-muted-foreground">Admin Dashboard — coming soon</div>;
export const AdminCourses = () => <div className="p-8 text-muted-foreground">Admin Courses — coming soon</div>;
export const AdminOfferings = () => <div className="p-8 text-muted-foreground">Admin Offerings — coming soon</div>;
export const AdminEnrolments = () => <div className="p-8 text-muted-foreground">Admin Enrolments — coming soon</div>;
export const AdminUsers = () => <div className="p-8 text-muted-foreground">Admin Users — coming soon</div>;
export const InstructorDashboard = () => <div className="p-8 text-muted-foreground">Instructor Dashboard — coming soon</div>;
export const NotFound = () => (
  <div className="flex min-h-screen items-center justify-center bg-canvas">
    <div className="text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-muted-foreground mt-2">Page not found</p>
    </div>
  </div>
);
