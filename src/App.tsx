import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import RequireAuth from "@/components/guards/RequireAuth";
import RequireRole from "@/components/guards/RequireRole";
import ErrorBoundary from "@/components/ErrorBoundary";

import RootRedirect from "@/pages/RootRedirect";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Home from "@/pages/Home";
import CourseDetail from "@/pages/CourseDetail";
import ChapterViewer from "@/pages/ChapterViewer";
import CheckoutPage from "@/pages/CheckoutPage";
import BrowsePage from "@/pages/BrowsePage";
import ProfilePage from "@/pages/ProfilePage";
import MyCoursesPage from "@/pages/MyCoursesPage";
import NotFoundPage from "@/pages/NotFoundPage";

// Admin pages
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminCourses from "@/pages/admin/AdminCourses";
import AdminCourseEditor from "@/pages/admin/AdminCourseEditor";
import AdminCourseCurriculum from "@/pages/admin/AdminCourseCurriculum";
import AdminOfferings from "@/pages/admin/AdminOfferings";
import AdminEnrolments from "@/pages/admin/AdminEnrolments";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminCoupons from "@/pages/admin/AdminCoupons";
import AdminHeroSlides from "@/pages/admin/AdminHeroSlides";
import AdminEvents from "@/pages/admin/AdminEvents";
import EventsPage from "@/pages/EventsPage";
import EventDetail from "@/pages/EventDetail";
import PublicOffering from "@/pages/PublicOffering";

import {
  CommunityPage,
  InstructorDashboard,
} from "@/pages/placeholders";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/p/:slug" element={<PublicOffering />} />

            {/* Student routes */}
            <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="/courses/:courseId" element={<RequireAuth><CourseDetail /></RequireAuth>} />
            <Route path="/chapters/:chapterId" element={<RequireAuth><ErrorBoundary><ChapterViewer /></ErrorBoundary></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/checkout/:offeringId" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
            <Route path="/browse" element={<RequireAuth><BrowsePage /></RequireAuth>} />
            <Route path="/community" element={<RequireAuth><CommunityPage /></RequireAuth>} />
            <Route path="/my-courses" element={<RequireAuth><MyCoursesPage /></RequireAuth>} />
            <Route path="/events" element={<RequireAuth><EventsPage /></RequireAuth>} />
            <Route path="/events/:eventId" element={<RequireAuth><EventDetail /></RequireAuth>} />

            {/* Admin routes */}
            <Route path="/admin" element={<RequireAuth><RequireRole role="admin"><AdminDashboard /></RequireRole></RequireAuth>} />
            <Route path="/admin/hero-slides" element={<RequireAuth><RequireRole role="admin"><AdminHeroSlides /></RequireRole></RequireAuth>} />
            <Route path="/admin/courses" element={<RequireAuth><RequireRole role="admin"><AdminCourses /></RequireRole></RequireAuth>} />
            <Route path="/admin/courses/:courseId/edit" element={<RequireAuth><RequireRole role="admin"><AdminCourseEditor /></RequireRole></RequireAuth>} />
            <Route path="/admin/courses/:courseId/curriculum" element={<RequireAuth><RequireRole role="admin"><AdminCourseCurriculum /></RequireRole></RequireAuth>} />
            <Route path="/admin/offerings" element={<RequireAuth><RequireRole role="admin"><AdminOfferings /></RequireRole></RequireAuth>} />
            <Route path="/admin/events" element={<RequireAuth><RequireRole role="admin"><AdminEvents /></RequireRole></RequireAuth>} />
            <Route path="/admin/enrolments" element={<RequireAuth><RequireRole role="admin"><AdminEnrolments /></RequireRole></RequireAuth>} />
            <Route path="/admin/users" element={<RequireAuth><RequireRole role="admin"><AdminUsers /></RequireRole></RequireAuth>} />
            <Route path="/admin/coupons" element={<RequireAuth><RequireRole role="admin"><AdminCoupons /></RequireRole></RequireAuth>} />

            {/* Instructor */}
            <Route path="/instructor" element={<RequireAuth><RequireRole role="instructor"><InstructorDashboard /></RequireRole></RequireAuth>} />

            {/* Catch-all */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
      <Toaster />
      <SonnerToaster position="bottom-right" theme="dark" />
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
