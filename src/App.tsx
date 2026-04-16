import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as SonnerToaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import RequireAuth from "@/components/guards/RequireAuth";
import RequireRole from "@/components/guards/RequireRole";
import ErrorBoundary from "@/components/ErrorBoundary";
import OfflineBanner from "@/components/OfflineBanner";
import StudentLayout from "@/components/layout/StudentLayout";
import AdminLayout from "@/components/layout/AdminLayout";

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
          {/*
            Routing architecture:
            - Public pages: flat routes, each lazy-page has its own Suspense via the
              `lazyElement()` helper (so no full-page LoadingFallback swap).
            - Student pages: nested under a single <StudentLayout/> layout route so
              the nav shell (sidebar, top bar, mobile tab bar) stays mounted across
              navigations. Fixes the "app reloads every page" feel.
            - Admin pages: same nested-layout pattern under <AdminLayout/>.

            Suspense now lives INSIDE each layout (around <Outlet/>), so lazy chunk
            loading only swaps the content area, not the entire UI.
          */}
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/p/:slug" element={<PublicOffering />} />
              <Route path="/thank-you/:paymentOrderId" element={<ThankYou />} />

              {/* ─── Student routes share a single persistent layout ─── */}
              <Route element={<RequireAuth><StudentLayout /></RequireAuth>}>
                <Route path="/home" element={<Home />} />
                <Route path="/courses/:courseId" element={<CourseDetail />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/checkout/:offeringId" element={<CheckoutPage />} />
                <Route path="/browse" element={<BrowsePage />} />
                <Route path="/community" element={<CommunityPage />} />
                <Route path="/my-courses" element={<MyCoursesPage />} />
                <Route path="/my-sessions" element={<MySessionsPage />} />
                <Route path="/events" element={<EventsPage />} />
                <Route path="/events/:eventId" element={<EventDetail />} />
              </Route>

              {/* ChapterViewer runs full-bleed (no student nav) but stays auth-guarded */}
              <Route
                path="/chapters/:chapterId"
                element={<RequireAuth><ErrorBoundary><ChapterViewer /></ErrorBoundary></RequireAuth>}
              />

              {/* ─── Admin routes share a single persistent admin layout ─── */}
              <Route element={<RequireAuth><RequireRole role="admin"><AdminLayout /></RequireRole></RequireAuth>}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/hero-slides" element={<AdminHeroSlides />} />
                <Route path="/admin/courses" element={<AdminCourses />} />
                <Route path="/admin/courses/:courseId/edit" element={<AdminCourseEditor />} />
                <Route path="/admin/courses/:courseId/curriculum" element={<AdminCourseCurriculum />} />
                <Route path="/admin/courses/:courseId/preview" element={<AdminCoursePreview />} />
                <Route path="/admin/courses/:courseId/preview/:chapterId" element={<AdminChapterPreview />} />
                <Route path="/admin/courses/:courseId/reviews" element={<AdminCourseReviews />} />
                <Route path="/admin/offerings" element={<AdminOfferings />} />
                <Route path="/admin/offerings/:offeringId/edit" element={<AdminOfferingEditor />} />
                <Route path="/admin/schedule" element={<AdminSchedule />} />
                <Route path="/admin/events" element={<AdminEvents />} />
                <Route path="/admin/enrolments" element={<AdminEnrolments />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/coupons" element={<AdminCoupons />} />
                <Route path="/admin/revenue" element={<AdminRevenue />} />
                <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
                <Route path="/admin/certificates" element={<AdminCertificates />} />
                <Route path="/admin/courses/:courseId/certificate" element={<AdminCertificateTemplateEditor />} />
                <Route path="/admin/announcements" element={<AdminAnnouncements />} />
                <Route path="/admin/email-templates" element={<AdminEmailTemplates />} />
                <Route path="/admin/email-campaigns" element={<AdminEmailCampaigns />} />
              </Route>

              {/* Instructor dashboard also uses the student layout for consistency */}
              <Route element={<RequireAuth><RequireRole role="instructor"><StudentLayout /></RequireRole></RequireAuth>}>
                <Route path="/instructor" element={<InstructorDashboard />} />
              </Route>

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
