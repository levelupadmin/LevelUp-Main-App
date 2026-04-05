import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Shell = ({ title, subtitle }: { title: string; subtitle?: string }) => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      {profile && (
        <p className="text-xs text-muted-foreground">
          Signed in as <span className="font-semibold text-foreground">{profile.full_name || profile.email}</span>{" "}
          ({profile.role})
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          Back
        </Button>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
};

// Student pages
export const Home = () => <Shell title="Student Dashboard" subtitle="Your enrolled courses and progress will appear here." />;
export const CourseDetail = () => <Shell title="Course Detail" subtitle="Course overview, curriculum, and enrollment." />;
export const ChapterViewer = () => <Shell title="Chapter Viewer" subtitle="Video player and lesson content." />;
export const Profile = () => <Shell title="Profile" subtitle="Your profile and settings." />;
export const Checkout = () => <Shell title="Checkout" subtitle="Complete your purchase." />;

// Admin pages
export const AdminDashboard = () => <Shell title="Admin Dashboard" subtitle="Platform overview and analytics." />;
export const AdminCourses = () => <Shell title="Admin — Courses" subtitle="Manage all courses." />;
export const AdminOfferings = () => <Shell title="Admin — Offerings" subtitle="Manage offerings and pricing." />;
export const AdminEnrolments = () => <Shell title="Admin — Enrolments" subtitle="View and manage enrolments." />;
export const AdminUsers = () => <Shell title="Admin — Users" subtitle="User management and roles." />;

// Instructor pages
export const InstructorDashboard = () => <Shell title="Instructor Dashboard" subtitle="Your assigned courses and student progress." />;

// Not found
export const NotFound = () => <Shell title="404" subtitle="Page not found." />;
