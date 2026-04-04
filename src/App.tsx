import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { DevAuthProvider } from "@/contexts/DevAuthContext";
import DevRoleSwitcher from "@/components/dev/DevRoleSwitcher";

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

// Admin pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminCourses from "./pages/admin/AdminCourses";
import AdminCoupons from "./pages/admin/AdminCoupons";
import AdminModeration from "./pages/admin/AdminModeration";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminOpportunities from "./pages/admin/AdminOpportunities";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminReferrals from "./pages/admin/AdminReferrals";
import AdminWaitlists from "./pages/admin/AdminWaitlists";
import AdminEngagement from "./pages/admin/AdminEngagement";
import AdminSalesPages from "./pages/admin/AdminSalesPages";
import AdminCourseBuilder from "./pages/admin/AdminCourseBuilder";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DevAuthProvider>
          <AuthProvider>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/login" element={<Auth />} />
              <Route path="/auth" element={<Navigate to="/login" replace />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/checkout/:slug" element={<Checkout />} />

              {/* Member (no auth guard in dev mode) */}
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

              {/* Admin (still guarded by role check) */}
              <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
              <Route path="/admin/sales" element={<AdminGuard><AdminSalesPages /></AdminGuard>} />
              <Route path="/admin/courses" element={<AdminGuard><AdminCourses /></AdminGuard>} />
              <Route path="/admin/courses/:courseId" element={<AdminGuard><AdminCourseBuilder /></AdminGuard>} />
              <Route path="/admin/content" element={<Navigate to="/admin/courses" replace />} />
              <Route path="/admin/workshops" element={<Navigate to="/admin/courses" replace />} />
              <Route path="/admin/cohorts" element={<Navigate to="/admin/courses" replace />} />
              <Route path="/admin/coupons" element={<AdminGuard><AdminCoupons /></AdminGuard>} />
              <Route path="/admin/moderation" element={<AdminGuard><AdminModeration /></AdminGuard>} />
              <Route path="/admin/users" element={<AdminGuard><AdminUsers /></AdminGuard>} />
              <Route path="/admin/analytics" element={<AdminGuard><AdminAnalytics /></AdminGuard>} />
              <Route path="/admin/opportunities" element={<AdminGuard><AdminOpportunities /></AdminGuard>} />
              <Route path="/admin/settings" element={<AdminGuard><AdminSettings /></AdminGuard>} />
              <Route path="/admin/referrals" element={<AdminGuard><AdminReferrals /></AdminGuard>} />
              <Route path="/admin/waitlists" element={<AdminGuard><AdminWaitlists /></AdminGuard>} />
              <Route path="/admin/engagement" element={<AdminGuard><AdminEngagement /></AdminGuard>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            <DevRoleSwitcher />
          </AuthProvider>
        </DevAuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
