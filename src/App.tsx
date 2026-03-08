import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";

import AuthGuard from "@/components/guards/AuthGuard";
import AdminGuard from "@/components/guards/AdminGuard";

// Public pages
import Explore from "./pages/Explore";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";

// Member pages
import Index from "./pages/Index";
import Learn from "./pages/Learn";
import CourseDetail from "./pages/CourseDetail";
import LessonDetail from "./pages/LessonDetail";
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

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/auth" element={<Navigate to="/login" replace />} />
            <Route path="/onboarding" element={<Onboarding />} />

            {/* Member (auth-guarded) */}
            <Route path="/home" element={<AuthGuard><Index /></AuthGuard>} />
            <Route path="/learn" element={<AuthGuard><Learn /></AuthGuard>} />
            <Route path="/learn/course/:slug" element={<AuthGuard><CourseDetail /></AuthGuard>} />
            <Route path="/learn/lesson/:lessonId" element={<AuthGuard><LessonDetail /></AuthGuard>} />
            <Route path="/learn/my-learning" element={<AuthGuard><MyLearning /></AuthGuard>} />
            <Route path="/learn/cohort/:slug" element={<AuthGuard><CohortDetail /></AuthGuard>} />
            <Route path="/learn/cohort/:slug/apply" element={<AuthGuard><CohortApplication /></AuthGuard>} />
            <Route path="/learn/cohort/:slug/dashboard" element={<AuthGuard><CohortDashboard /></AuthGuard>} />
            <Route path="/learn/workshops" element={<AuthGuard><Workshops /></AuthGuard>} />
            <Route path="/workshops/:slug" element={<AuthGuard><WorkshopDetail /></AuthGuard>} />

            {/* Community */}
            <Route path="/community" element={<AuthGuard><Community /></AuthGuard>} />
            <Route path="/community/cohort/:slug" element={<AuthGuard><CohortCommunity /></AuthGuard>} />
            <Route path="/community/city/:slug" element={<AuthGuard><SpaceCommunity type="city" /></AuthGuard>} />
            <Route path="/community/skill/:slug" element={<AuthGuard><SpaceCommunity type="skill" /></AuthGuard>} />
            <Route path="/community/directory" element={<AuthGuard><Directory /></AuthGuard>} />
            <Route path="/community/post/:id" element={<AuthGuard><CommunityPost /></AuthGuard>} />

            <Route path="/opportunities" element={<AuthGuard><Opportunities /></AuthGuard>} />
            <Route path="/opportunities/new" element={<AuthGuard><PostOpportunity /></AuthGuard>} />
            <Route path="/opportunities/:id" element={<AuthGuard><OpportunityDetail /></AuthGuard>} />
            <Route path="/profile/me" element={<AuthGuard><Profile /></AuthGuard>} />
            <Route path="/profile/edit" element={<AuthGuard><ProfileEdit /></AuthGuard>} />
            <Route path="/profile/:handle" element={<AuthGuard><ProfilePublic /></AuthGuard>} />
            <Route path="/search" element={<AuthGuard><Search /></AuthGuard>} />
            <Route path="/notifications" element={<AuthGuard><Notifications /></AuthGuard>} />
            <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
            <Route path="/settings/subscription" element={<AuthGuard><Subscription /></AuthGuard>} />

            {/* Admin */}
            <Route path="/admin" element={<AuthGuard><AdminGuard><AdminDashboard /></AdminGuard></AuthGuard>} />
            <Route path="/admin/content" element={<AuthGuard><AdminGuard><AdminContent /></AdminGuard></AuthGuard>} />
            <Route path="/admin/workshops" element={<AuthGuard><AdminGuard><AdminWorkshops /></AdminGuard></AuthGuard>} />
            <Route path="/admin/moderation" element={<AuthGuard><AdminGuard><AdminModeration /></AdminGuard></AuthGuard>} />
            <Route path="/admin/users" element={<AuthGuard><AdminGuard><AdminUsers /></AdminGuard></AuthGuard>} />
            <Route path="/admin/analytics" element={<AuthGuard><AdminGuard><AdminAnalytics /></AdminGuard></AuthGuard>} />
            <Route path="/admin/cohorts" element={<AuthGuard><AdminGuard><AdminCohorts /></AdminGuard></AuthGuard>} />
            <Route path="/admin/opportunities" element={<AuthGuard><AdminGuard><AdminOpportunities /></AdminGuard></AuthGuard>} />
            <Route path="/admin/settings" element={<AuthGuard><AdminGuard><AdminSettings /></AdminGuard></AuthGuard>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
