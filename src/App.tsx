import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

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
import CommunitySpace from "./pages/CommunitySpace";
import CommunityPost from "./pages/CommunityPost";
import Directory from "./pages/Directory";
import Opportunities from "./pages/Opportunities";
import Profile from "./pages/Profile";
import ProfilePublic from "./pages/ProfilePublic";
import Search from "./pages/Search";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Subscription from "./pages/Subscription";

// Admin pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminContent from "./pages/admin/AdminContent";
import AdminWorkshops from "./pages/admin/AdminWorkshops";
import AdminModeration from "./pages/admin/AdminModeration";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminCohorts from "./pages/admin/AdminCohorts";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/auth" element={<Auth />} />
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
          <Route path="/community" element={<AuthGuard><Community /></AuthGuard>} />
          <Route path="/community/space/:slug" element={<AuthGuard><CommunitySpace /></AuthGuard>} />
          <Route path="/community/post/:id" element={<AuthGuard><CommunityPost /></AuthGuard>} />
          <Route path="/community/directory" element={<AuthGuard><Directory /></AuthGuard>} />
          <Route path="/opportunities" element={<AuthGuard><Opportunities /></AuthGuard>} />
          <Route path="/profile/me" element={<AuthGuard><Profile /></AuthGuard>} />
          <Route path="/profile/:handle" element={<AuthGuard><ProfilePublic /></AuthGuard>} />
          <Route path="/search" element={<AuthGuard><Search /></AuthGuard>} />
          <Route path="/notifications" element={<AuthGuard><Notifications /></AuthGuard>} />
          <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
          <Route path="/settings/subscription" element={<AuthGuard><Subscription /></AuthGuard>} />

          {/* Admin (auth + admin guarded) */}
          <Route path="/admin" element={<AuthGuard><AdminGuard><AdminDashboard /></AdminGuard></AuthGuard>} />
          <Route path="/admin/content" element={<AuthGuard><AdminGuard><AdminContent /></AdminGuard></AuthGuard>} />
          <Route path="/admin/workshops" element={<AuthGuard><AdminGuard><AdminWorkshops /></AdminGuard></AuthGuard>} />
          <Route path="/admin/moderation" element={<AuthGuard><AdminGuard><AdminModeration /></AdminGuard></AuthGuard>} />
          <Route path="/admin/users" element={<AuthGuard><AdminGuard><AdminUsers /></AdminGuard></AuthGuard>} />
          <Route path="/admin/analytics" element={<AuthGuard><AdminGuard><AdminAnalytics /></AdminGuard></AuthGuard>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
