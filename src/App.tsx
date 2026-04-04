import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { DevAuthProvider } from "@/contexts/DevAuthContext";
import DevRoleSwitcher from "@/components/dev/DevRoleSwitcher";
import ErrorBoundary from "@/components/ErrorBoundary";

import AuthGuard from "@/components/guards/AuthGuard";
import AdminGuard from "@/components/guards/AdminGuard";

// Public pages
import Explore from "./pages/Explore";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Checkout from "./pages/Checkout";
import EnrollmentSuccess from "./pages/EnrollmentSuccess";

// Member pages
import Index from "./pages/Index";
import Learn from "./pages/Learn";
import CourseDetail from "./pages/CourseDetail";
import LessonDetail from "./pages/LessonDetail";
import MasterclassDashboard from "./pages/MasterclassDashboard";
import MyLearning from "./pages/MyLearning";
import CohortDetail from "./pages/CohortDetail";
import CohortApplication from "./pages/CohortApplication";
import CohortDashboard from "./pages/CohortDashboard";
import Workshops from "./pages/Workshops";
import WorkshopDetail from "./pages/WorkshopDetail";
import Community from "./pages/Community";
import CohortCommunity from "./pages/community/CohortCommunity";
import SpaceCommunity from "./pages/community/SpaceCommunity";
import Directory from "./pages/Directory";
import CommunityPost from "./pages/CommunityPost";
import Opportunities from "./pages/Opportunities";
import OpportunityDetail from "./pages/OpportunityDetail";
import PostOpportunity from "./pages/PostOpportunity";
import Profile from "./pages/Profile";
import ProfileEdit from "./pages/ProfileEdit";
import Portfolio from "./pages/Portfolio";
import ProfilePublic from "./pages/ProfilePublic";
import Search from "./pages/Search";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Subscription from "./pages/Subscription";

// Admin pages (lazy-loaded)
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminCourses = lazy(() => import("./pages/admin/AdminCourses"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons"));
const AdminModeration = lazy(() => import("./pages/admin/AdminModeration"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminOpportunities = lazy(() => import("./pages/admin/AdminOpportunities"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminReferrals = lazy(() => import("./pages/admin/AdminReferrals"));
const AdminWaitlists = lazy(() => import("./pages/admin/AdminWaitlists"));
const AdminEngagement = lazy(() => import("./pages/admin/AdminEngagement"));
const AdminSalesPages = lazy(() => import("./pages/admin/AdminSalesPages"));
const AdminCourseBuilder = lazy(() => import("./pages/admin/AdminCourseBuilder"));
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AdminFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DevAuthProvider>
          <AuthProvider>
            <ErrorBoundary>
              <Routes>
                {/* Public */}
                <Route path="/" element={<Index />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/login" element={<Auth />} />
                <Route path="/auth" element={<Navigate to="/login" replace />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/checkout/:slug" element={<Checkout />} />
                <Route path="/enrollment-success/:slug" element={<EnrollmentSuccess />} />

                {/* Member */}
                <Route path="/home" element={<Index />} />
                <Route path="/learn" element={<Learn />} />
                <Route path="/learn/course/:slug" element={<CourseDetail />} />
                <Route path="/learn/lesson/:lessonId" element={<LessonDetail />} />
                <Route path="/learn/course/:slug/dashboard" element={<MasterclassDashboard />} />
                <Route path="/learn/my-learning" element={<MyLearning />} />
                <Route path="/learn/cohort/:slug" element={<CohortDetail />} />
                <Route path="/learn/cohort/:slug/apply" element={<CohortApplication />} />
                <Route path="/learn/cohort/:slug/dashboard" element={<CohortDashboard />} />
                <Route path="/learn/workshops" element={<Workshops />} />
                <Route path="/workshops/:slug" element={<WorkshopDetail />} />

                {/* Community */}
                <Route path="/community" element={<Community />} />
                <Route path="/community/cohort/:slug" element={<CohortCommunity />} />
                <Route path="/community/city/:slug" element={<SpaceCommunity type="city" />} />
                <Route path="/community/skill/:slug" element={<SpaceCommunity type="skill" />} />
                <Route path="/community/directory" element={<Directory />} />
                <Route path="/community/post/:id" element={<CommunityPost />} />

                <Route path="/opportunities" element={<Opportunities />} />
                <Route path="/opportunities/new" element={<PostOpportunity />} />
                <Route path="/opportunities/:id" element={<OpportunityDetail />} />
                <Route path="/profile/me" element={<Profile />} />
                <Route path="/profile/edit" element={<ProfileEdit />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/profile/:handle" element={<ProfilePublic />} />
                <Route path="/search" element={<Search />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/subscription" element={<Subscription />} />

                {/* Admin (lazy-loaded) */}
                <Route path="/admin" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminDashboard /></Suspense></AdminGuard>} />
                <Route path="/admin/sales" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminSalesPages /></Suspense></AdminGuard>} />
                <Route path="/admin/courses" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminCourses /></Suspense></AdminGuard>} />
                <Route path="/admin/courses/:courseId" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminCourseBuilder /></Suspense></AdminGuard>} />
                <Route path="/admin/content" element={<Navigate to="/admin/courses" replace />} />
                <Route path="/admin/workshops" element={<Navigate to="/admin/courses" replace />} />
                <Route path="/admin/cohorts" element={<Navigate to="/admin/courses" replace />} />
                <Route path="/admin/coupons" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminCoupons /></Suspense></AdminGuard>} />
                <Route path="/admin/moderation" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminModeration /></Suspense></AdminGuard>} />
                <Route path="/admin/users" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminUsers /></Suspense></AdminGuard>} />
                <Route path="/admin/analytics" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminAnalytics /></Suspense></AdminGuard>} />
                <Route path="/admin/opportunities" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminOpportunities /></Suspense></AdminGuard>} />
                <Route path="/admin/settings" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminSettings /></Suspense></AdminGuard>} />
                <Route path="/admin/referrals" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminReferrals /></Suspense></AdminGuard>} />
                <Route path="/admin/waitlists" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminWaitlists /></Suspense></AdminGuard>} />
                <Route path="/admin/engagement" element={<AdminGuard><Suspense fallback={<AdminFallback />}><AdminEngagement /></Suspense></AdminGuard>} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
            <DevRoleSwitcher />
          </AuthProvider>
        </DevAuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
