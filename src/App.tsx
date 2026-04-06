import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/contexts/AuthContext";
import RequireAuth from "@/components/guards/RequireAuth";
import RequireRole from "@/components/guards/RequireRole";

import RootRedirect from "@/pages/RootRedirect";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Home from "@/pages/Home";
import CourseDetail from "@/pages/CourseDetail";
import ChapterViewer from "@/pages/ChapterViewer";
import CheckoutPage from "@/pages/CheckoutPage";
import {
  Profile,
  BrowsePage,
  CommunityPage,
  MyCoursesPage,
  AdminDashboard,
  AdminCourses,
  AdminOfferings,
  AdminEnrolments,
  AdminUsers,
  InstructorDashboard,
  NotFound,
} from "@/pages/placeholders";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Student routes */}
          <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/courses/:courseId" element={<RequireAuth><CourseDetail /></RequireAuth>} />
          <Route path="/chapters/:chapterId" element={<RequireAuth><ChapterViewer /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/checkout/:offeringId" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="/browse" element={<RequireAuth><BrowsePage /></RequireAuth>} />
          <Route path="/community" element={<RequireAuth><CommunityPage /></RequireAuth>} />
          <Route path="/my-courses" element={<RequireAuth><MyCoursesPage /></RequireAuth>} />

          {/* Admin routes */}
          <Route path="/admin" element={<RequireAuth><RequireRole role="admin"><AdminDashboard /></RequireRole></RequireAuth>} />
          <Route path="/admin/courses" element={<RequireAuth><RequireRole role="admin"><AdminCourses /></RequireRole></RequireAuth>} />
          <Route path="/admin/offerings" element={<RequireAuth><RequireRole role="admin"><AdminOfferings /></RequireRole></RequireAuth>} />
          <Route path="/admin/enrolments" element={<RequireAuth><RequireRole role="admin"><AdminEnrolments /></RequireRole></RequireAuth>} />
          <Route path="/admin/users" element={<RequireAuth><RequireRole role="admin"><AdminUsers /></RequireRole></RequireAuth>} />

          {/* Instructor */}
          <Route path="/instructor" element={<RequireAuth><RequireRole role="instructor"><InstructorDashboard /></RequireRole></RequireAuth>} />

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
