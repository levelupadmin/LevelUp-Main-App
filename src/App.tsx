import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as SonnerToaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import RequireAuth from "@/components/guards/RequireAuth";
import RequireRole from "@/components/guards/RequireRole";
import ErrorBoundary from "@/components/ErrorBoundary";
import OfflineBanner from "@/components/OfflineBanner";

// Critical student paths – keep synchronous
import RootRedirect from "@/pages/RootRedirect";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Home from "@/pages/Home";
import NotFoundPage from "@/pages/NotFoundPage";

// Lazy-loaded student pages
const CourseDetail = lazy(() => import("@/pages/CourseDetail"));
const ChapterViewer = lazy(() => import("@/pages/ChapterViewer"));
const CheckoutPage = lazy(() => import("@/pages/CheckoutPage"));
const BrowsePage = lazy(() => import("@/pages/BrowsePage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const MyCoursesPage = lazy(() => import("@/pages/MyCoursesPage"));
const MySessionsPage = lazy(() => import("@/pages/MySessionsPage"));
const EventsPage = lazy(() => import("@/pages/EventsPage"));
const EventDetail = lazy(() => import("@/pages/EventDetail"));
const PublicOffering = lazy(() => import("@/pages/PublicOffering"));
const ThankYou = lazy(() => import("@/pages/ThankYou"));
const CommunityPage = lazy(() => import("@/pages/CommunityPage"));
const InstructorDashboard = lazy(() => import("@/pages/InstructorDashboard"));

// Lazy-loaded admin pages
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminCourses = lazy(() => import("@/pages/admin/AdminCourses"));
const AdminCourseEditor = lazy(() => import("@/pages/admin/AdminCourseEditor"));
const AdminCourseCurriculum = lazy(() => import("@/pages/admin/AdminCourseCurriculum"));
const AdminOfferings = lazy(() => import("@/pages/admin/AdminOfferings"));
const AdminOfferingEditor = lazy(() => import("@/pages/admin/AdminOfferingEditor"));
const AdminEnrolments = lazy(() => import("@/pages/admin/AdminEnrolments"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminCoupons = lazy(() => import("@/pages/admin/AdminCoupons"));
const AdminHeroSlides = lazy(() => import("@/pages/admin/AdminHeroSlides"));
const AdminSchedule = lazy(() => import("@/pages/admin/AdminSchedule"));
const AdminEvents = lazy(() => import("@/pages/admin/AdminEvents"));
const AdminRevenue = lazy(() => import("@/pages/admin/AdminRevenue"));
const AdminAuditLogs = lazy(() => import("@/pages/admin/AdminAuditLogs"));
// Analytics merged into Dashboard
// Cohorts removed per product decision
const AdminCoursePreview = lazy(() => import("@/pages/admin/AdminCoursePreview"));
const AdminChapterPreview = lazy(() => import("@/pages/admin/AdminChapterPreview"));
const AdminCertificates = lazy(() => import("@/pages/admin/AdminCertificates"));
// Refunds merged into Revenue page
const AdminCertificateTemplateEditor = lazy(() => import("@/pages/admin/AdminCertificateTemplateEditor"));
const AdminCourseReviews = lazy(() => import("@/pages/admin/AdminCourseReviews"));
const AdminAnnouncements = lazy(() => import("@/pages/admin/AdminAnnouncements"));
const AdminEmailTemplates = lazy(() => import("@/pages/admin/AdminEmailTemplates"));
const AdminEmailCampaigns = lazy(() => import("@/pages/admin/AdminEmailCampaigns"));
const AdminApplications = lazy(() => import("@/pages/admin/AdminApplications"));
const ApplicationStatus = lazy(() => import("@/pages/ApplicationStatus"));
const AdminQuizEditor = lazy(() => import("@/pages/admin/AdminQuizEditor"));
const AdminRoles = lazy(() => import("@/pages/admin/AdminRoles"));
const AdminCommunityAnalytics = lazy(() => import("@/pages/admin/AdminCommunityAnalytics"));

const LoadingFallback = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
    <div
      style={{
        width: 40,
        height: 40,
        border: "4px solid #e5e7eb",
        borderTop: "4px solid #6366f1",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,   // prevent data refetches on tab switch
      staleTime: 5 * 60 * 1000,     // treat data as fresh for 5 minutes
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/p/:slug" element={<PublicOffering />} />
              <Route path="/thank-you/:paymentOrderId" element={<ThankYou />} />

              {/* Student routes */}
              <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
              <Route path="/courses/:courseId" element={<RequireAuth><CourseDetail /></RequireAuth>} />
              <Route path="/chapters/:chapterId" element={<RequireAuth><ErrorBoundary><ChapterViewer /></ErrorBoundary></RequireAuth>} />
              <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
              <Route path="/checkout/:offeringId" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
              <Route path="/browse" element={<RequireAuth><BrowsePage /></RequireAuth>} />
              <Route path="/community" element={<RequireAuth><CommunityPage /></RequireAuth>} />
              <Route path="/my-courses" element={<RequireAuth><MyCoursesPage /></RequireAuth>} />
              <Route path="/my-sessions" element={<RequireAuth><MySessionsPage /></RequireAuth>} />
              <Route path="/events" element={<RequireAuth><EventsPage /></RequireAuth>} />
              <Route path="/events/:eventId" element={<RequireAuth><EventDetail /></RequireAuth>} />
              <Route path="/my-application/:applicationId" element={<RequireAuth><ApplicationStatus /></RequireAuth>} />

              {/* Admin routes */}
              <Route path="/admin" element={<RequireAuth><RequireRole role="admin"><AdminDashboard /></RequireRole></RequireAuth>} />
              <Route path="/admin/hero-slides" element={<RequireAuth><RequireRole role="admin"><AdminHeroSlides /></RequireRole></RequireAuth>} />
              <Route path="/admin/courses" element={<RequireAuth><RequireRole role="admin"><AdminCourses /></RequireRole></RequireAuth>} />
              <Route path="/admin/courses/:courseId/edit" element={<RequireAuth><RequireRole role="admin"><AdminCourseEditor /></RequireRole></RequireAuth>} />
              <Route path="/admin/courses/:courseId/curriculum" element={<RequireAuth><RequireRole role="admin"><AdminCourseCurriculum /></RequireRole></RequireAuth>} />
              <Route path="/admin/courses/:courseId/preview" element={<RequireAuth><RequireRole role="admin"><AdminCoursePreview /></RequireRole></RequireAuth>} />
              <Route path="/admin/courses/:courseId/preview/:chapterId" element={<RequireAuth><RequireRole role="admin"><AdminChapterPreview /></RequireRole></RequireAuth>} />
              <Route path="/admin/courses/:courseId/reviews" element={<RequireAuth><RequireRole role="admin"><AdminCourseReviews /></RequireRole></RequireAuth>} />
              <Route path="/admin/offerings" element={<RequireAuth><RequireRole role="admin"><AdminOfferings /></RequireRole></RequireAuth>} />
              <Route path="/admin/offerings/:offeringId/edit" element={<RequireAuth><RequireRole role="admin"><AdminOfferingEditor /></RequireRole></RequireAuth>} />
              <Route path="/admin/schedule" element={<RequireAuth><RequireRole role="admin"><AdminSchedule /></RequireRole></RequireAuth>} />
              <Route path="/admin/events" element={<RequireAuth><RequireRole role="admin"><AdminEvents /></RequireRole></RequireAuth>} />
              {/* Cohorts removed */}
              <Route path="/admin/enrolments" element={<RequireAuth><RequireRole role="admin"><AdminEnrolments /></RequireRole></RequireAuth>} />
              <Route path="/admin/users" element={<RequireAuth><RequireRole role="admin"><AdminUsers /></RequireRole></RequireAuth>} />
              <Route path="/admin/coupons" element={<RequireAuth><RequireRole role="admin"><AdminCoupons /></RequireRole></RequireAuth>} />
              <Route path="/admin/revenue" element={<RequireAuth><RequireRole role="admin"><AdminRevenue /></RequireRole></RequireAuth>} />
              <Route path="/admin/audit-logs" element={<RequireAuth><RequireRole role="admin"><AdminAuditLogs /></RequireRole></RequireAuth>} />
              <Route path="/admin/certificates" element={<RequireAuth><RequireRole role="admin"><AdminCertificates /></RequireRole></RequireAuth>} />
              <Route path="/admin/courses/:courseId/certificate" element={<RequireAuth><RequireRole role="admin"><AdminCertificateTemplateEditor /></RequireRole></RequireAuth>} />
              {/* Reviews accessible per-course at /admin/courses/:courseId/reviews */}
              <Route path="/admin/announcements" element={<RequireAuth><RequireRole role="admin"><AdminAnnouncements /></RequireRole></RequireAuth>} />
              <Route path="/admin/email-templates" element={<RequireAuth><RequireRole role="admin"><AdminEmailTemplates /></RequireRole></RequireAuth>} />
              <Route path="/admin/email-campaigns" element={<RequireAuth><RequireRole role="admin"><AdminEmailCampaigns /></RequireRole></RequireAuth>} />
              <Route path="/admin/applications" element={<RequireAuth><RequireRole role="admin"><AdminApplications /></RequireRole></RequireAuth>} />
              <Route path="/admin/courses/:courseId/chapters/:chapterId/quiz" element={<RequireAuth><RequireRole role="admin"><AdminQuizEditor /></RequireRole></RequireAuth>} />
              <Route path="/admin/roles" element={<RequireAuth><RequireRole role="admin"><AdminRoles /></RequireRole></RequireAuth>} />
              <Route path="/admin/community" element={<RequireAuth><RequireRole role="admin"><AdminCommunityAnalytics /></RequireRole></RequireAuth>} />

              {/* Instructor */}
              <Route path="/instructor" element={<RequireAuth><RequireRole role="instructor"><InstructorDashboard /></RequireRole></RequireAuth>} />

              {/* Catch-all */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
      <SonnerToaster position="bottom-right" theme="dark" />
      <OfflineBanner />
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
