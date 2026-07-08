import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { bootAnalytics } from "@/lib/analytics";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient, persistOptions } from "@/lib/queryClient";
import { toast as sonnerToast } from "sonner";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import RequireAuth from "@/components/guards/RequireAuth";
import RequireRole from "@/components/guards/RequireRole";
import ErrorBoundary from "@/components/ErrorBoundary";
import OfflineBanner from "@/components/OfflineBanner";
import FloatingSupport from "@/components/FloatingSupport";
import ScrollToTop from "@/components/ScrollToTop";
import NativeDeepLinks from "@/components/NativeDeepLinks";
import StudentLayout from "@/components/layout/StudentLayout";
import RouteFallback from "@/components/RouteFallback";
// AdminLayout is lazy: admin paths are <1% of traffic; no reason to ship its
// 20 KB of nav chrome + 14 admin route imports inside every anon page load.
const AdminLayout = lazy(() => import("@/components/layout/AdminLayout"));

// Critical student paths, keep synchronous so first-paint of the most common
// anon landings (/, /login, /signup) doesn't await a chunk fetch.
import RootRedirect from "@/pages/RootRedirect";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import NotFoundPage from "@/pages/NotFoundPage";

// Home is the authenticated dashboard; anon visitors land on Login or /p/<slug>
// and never see it. Lazy so the 40 KB source (TanStack-Query'd home grid +
// course cards + hero carousel) doesn't ride along with the main bundle.
const Home = lazy(() => import("@/pages/Home"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));

// Lazy-loaded student pages
const CourseDetail = lazy(() => import("@/pages/CourseDetail"));
const ChapterViewer = lazy(() => import("@/pages/ChapterViewer"));
const CheckoutPage = lazy(() => import("@/pages/CheckoutPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const MyCoursesPage = lazy(() => import("@/pages/MyCoursesPage"));
const Studio = lazy(() => import("@/pages/Studio"));
const StudioSecondBrain = lazy(() => import("@/pages/StudioSecondBrain"));
const Learn = lazy(() => import("@/pages/Learn"));
const MySessionsPage = lazy(() => import("@/pages/MySessionsPage"));
const EventsPage = lazy(() => import("@/pages/EventsPage"));
const EventDetail = lazy(() => import("@/pages/EventDetail"));
const PublicOffering = lazy(() => import("@/pages/PublicOffering"));
const ThankYou = lazy(() => import("@/pages/ThankYou"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const Terms = lazy(() => import("@/pages/Terms"));
const RefundPolicy = lazy(() => import("@/pages/RefundPolicy"));
const DeleteAccount = lazy(() => import("@/pages/DeleteAccount"));
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
const AdminLegacyMappings = lazy(() => import("@/pages/admin/AdminLegacyMappings"));
const AdminApi = lazy(() => import("@/pages/admin/AdminApi"));
const AdminDocs = lazy(() => import("@/pages/admin/AdminDocs"));
const AdminEmailTemplates = lazy(() => import("@/pages/admin/AdminEmailTemplates"));
const AdminEmailCampaigns = lazy(() => import("@/pages/admin/AdminEmailCampaigns"));
const AdminApplications = lazy(() => import("@/pages/admin/AdminApplications"));
const ApplicationStatus = lazy(() => import("@/pages/ApplicationStatus"));
const AdminQuizEditor = lazy(() => import("@/pages/admin/AdminQuizEditor"));
const AdminRoles = lazy(() => import("@/pages/admin/AdminRoles"));
const AdminAnalyticsSettings = lazy(() => import("@/pages/admin/AdminAnalyticsSettings"));
const AdminCommunityAnalytics = lazy(() => import("@/pages/admin/AdminCommunityAnalytics"));
const AdminCohorts = lazy(() => import("@/pages/admin/AdminCohorts"));
const AdminCohortWeeks = lazy(() => import("@/pages/admin/AdminCohortWeeks"));
const AdminCohortSubmissions = lazy(() => import("@/pages/admin/AdminCohortSubmissions"));
const AdminCohortAttendance = lazy(() => import("@/pages/admin/AdminCohortAttendance"));
const AdminNotifyRequests = lazy(() => import("@/pages/admin/AdminNotifyRequests"));
const CohortDashboard = lazy(() => import("@/pages/CohortDashboard"));

// The QueryClient + its localStorage persister live in @/lib/queryClient so the
// sign-out path can purge the persisted cache without importing this app root.

const App = () => {
  // Fire-and-forget analytics boot. Reads analytics_settings from the
  // DB and injects whichever platform scripts are enabled. Skips on
  // localhost so dev work doesn't pollute production funnels (the
  // bootAnalytics function gates that internally). Idempotent.
  useEffect(() => {
    bootAnalytics().catch(() => {/* analytics must never break the app */});
  }, []);

  // Android hardware back button: dynamically import the Capacitor App
  // plugin (it's a no-op on web), and wire backButton so it walks the
  // WebView history. When there's nowhere left to go back to (e.g. the
  // user is on the Home screen), exit the app instead of doing nothing -
  // matches every other Android app's behaviour.
  useEffect(() => {
    let remove: (() => void) | undefined;
    let lastBackPress = 0;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App: CapApp } = await import("@capacitor/app");
        const handle = await CapApp.addListener("backButton", ({ canGoBack }) => {
          // 1) If any overlay is open (modal, sheet, drawer, dropdown, the
          //    mobile sidebar), close THAT first instead of navigating away.
          //    Radix + vaul close on Escape; our hand-rolled overlays listen
          //    for the same key (see StudentLayout). We only swallow the back
          //    press when something is actually open.
          const overlay = document.querySelector(
            '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper], [role="menu"][data-state="open"], [role="listbox"][data-state="open"], [data-vaul-drawer][data-state="open"], [data-overlay-open="true"]'
          );
          if (overlay) {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            return;
          }
          // 2) Walk the in-app history when we can.
          if (canGoBack) {
            window.history.back();
            return;
          }
          // 3) Root of the stack: require a second press within 2s before
          //    handing control back to the OS, so a stray tap never exits the
          //    app (especially on /home after a post-login replace-nav, where
          //    canGoBack can be false even though the user expects to stay).
          if (Date.now() - lastBackPress < 2000) {
            CapApp.exitApp();
          } else {
            lastBackPress = Date.now();
            sonnerToast("Press back again to exit");
          }
        });
        remove = () => handle.remove();
      } catch {
        // Plugin not installed (e.g. running in browser) - no-op.
      }
    })();
    return () => { remove?.(); };
  }, []);

  return (
  <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
    <AuthProvider>
      <ErrorBoundary>
        <BrowserRouter>
          {/*
            Routing architecture:
            - Public pages: flat routes.
            - Student pages: nested under a single <StudentLayout/> layout route so
              the nav shell (sidebar, top bar, mobile tab bar) stays mounted across
              navigations. Fixes the "app reloads every page" feel.
            - Admin pages: same nested-layout pattern under <AdminLayout/>.

            Suspense lives INSIDE each layout (around <Outlet/>), so lazy chunk
            loading only swaps the content area, not the entire UI.
          */}
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              {/* Full-bleed post-OTP onboarding, self-guards, renders OUTSIDE
                  the StudentLayout shell (no bottom nav). */}
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/p/:slug" element={<PublicOffering />} />
              <Route path="/thank-you/:paymentOrderId" element={<ThankYou />} />
              {/* Checkout sits in the public block - anon visitors landing
                  here from a Meta ad or marketing site can complete a guest
                  purchase. CheckoutPage branches internally on the auth
                  state to show either the guest form or the logged-in
                  prefill. */}
              <Route path="/checkout/:offeringId" element={<CheckoutPage />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/refunds" element={<RefundPolicy />} />
              {/*
                Public self-serve account deletion (Google Play requirement).
                Unauthenticated, must be reachable without signing in.
              */}
              <Route path="/delete-account" element={<DeleteAccount />} />

              {/* Browse merged into Home, keep old deep links working. */}
              <Route path="/browse" element={<Navigate to="/" replace />} />
              {/* Friendly alias for the sessions tab. */}
              <Route path="/sessions" element={<Navigate to="/learn?seg=live" replace />} />

              {/* ─── Student routes share a single persistent layout ─── */}
              <Route element={<RequireAuth><StudentLayout /></RequireAuth>}>
                <Route path="/home" element={<Home />} />
                <Route path="/learn" element={<Learn />} />
                <Route path="/courses/:courseId" element={<CourseDetail />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/community" element={<CommunityPage />} />
                <Route path="/my-courses" element={<Navigate to="/learn?seg=courses" replace />} />
                <Route path="/studio" element={<Studio />} />
                <Route path="/studio/second-brain" element={<StudioSecondBrain />} />
                <Route path="/my-sessions" element={<Navigate to="/learn?seg=live" replace />} />
                <Route path="/events" element={<Navigate to="/learn?seg=calendar" replace />} />
                <Route path="/events/:eventId" element={<EventDetail />} />
                <Route path="/my-application/:applicationId" element={<ApplicationStatus />} />
                <Route path="/cohort/:offeringId" element={<CohortDashboard />} />
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
                <Route path="/admin/applications" element={<AdminApplications />} />
                <Route path="/admin/courses/:courseId/chapters/:chapterId/quiz" element={<AdminQuizEditor />} />
                <Route path="/admin/roles" element={<AdminRoles />} />
                <Route path="/admin/analytics-settings" element={<AdminAnalyticsSettings />} />
                <Route path="/admin/community" element={<AdminCommunityAnalytics />} />
                <Route path="/admin/legacy-mappings" element={<AdminLegacyMappings />} />
                <Route path="/admin/api" element={<AdminApi />} />
                <Route path="/admin/docs" element={<AdminDocs />} />
                <Route path="/admin/cohorts" element={<AdminCohorts />} />
                <Route path="/admin/offerings/:offeringId/cohort-weeks" element={<AdminCohortWeeks />} />
                <Route path="/admin/cohort-submissions" element={<AdminCohortSubmissions />} />
                <Route path="/admin/notify-requests" element={<AdminNotifyRequests />} />
                <Route path="/admin/cohorts/:batchId/attendance" element={<AdminCohortAttendance />} />
              </Route>

              {/* Instructor dashboard also uses the student layout for consistency */}
              <Route element={<RequireAuth><RequireRole role="instructor"><StudentLayout /></RequireRole></RequireAuth>}>
                <Route path="/instructor" element={<InstructorDashboard />} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          <ScrollToTop />
          <NativeDeepLinks />
          <FloatingSupport />
        </BrowserRouter>
      </ErrorBoundary>
      {/* Sonner is the app's single toast renderer. Position/duration/surface
          styling live in ui/sonner.tsx; only the forced dark theme is set here
          (this app has no next-themes provider). */}
      <SonnerToaster theme="dark" />
      <OfflineBanner />
    </AuthProvider>
  </PersistQueryClientProvider>
  );
};

export default App;
