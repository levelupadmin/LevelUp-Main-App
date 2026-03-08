// Admin mock data for all admin panel tables

export type UserRole = "student" | "mentor" | "super_admin";
export type UserStatus = "active" | "suspended" | "banned";
export type ContentStatus = "draft" | "published" | "archived";
export type WorkshopStatus = "upcoming" | "live" | "completed" | "cancelled";
export type ModerationAction = "dismiss" | "warn" | "remove" | "ban";
export type OpportunityReviewStatus = "pending" | "approved" | "rejected";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  city: string;
  role: UserRole;
  level: number;
  status: UserStatus;
  joined: string;
  coursesEnrolled: number;
  lastActive: string;
}

export interface AdminCourse {
  id: string;
  title: string;
  instructor: string;
  instructorId: string;
  category: string;
  status: ContentStatus;
  students: number;
  rating: number;
  lastUpdated: string;
}

export interface AdminWorkshop {
  id: string;
  title: string;
  instructor: string;
  instructorId: string;
  date: string;
  city: string;
  price: number;
  seatsBooked: number;
  seatsTotal: number;
  status: WorkshopStatus;
}

export interface FlaggedItem {
  id: string;
  type: "post" | "comment" | "user";
  content: string;
  author: string;
  reporter: string;
  reason: string;
  timestamp: string;
  status: "open" | "resolved";
}

export interface AdminOpportunity {
  id: string;
  title: string;
  type: string;
  poster: string;
  status: OpportunityReviewStatus;
  submittedAt: string;
  description: string;
  budget: string;
  location: string;
  skills: string[];
}

export interface ActivityItem {
  id: string;
  type: "signup" | "submission" | "report" | "enrollment" | "completion";
  message: string;
  timestamp: string;
}

// ── Mock Users ──
export const mockAdminUsers: AdminUser[] = [
  { id: "u1", name: "Arjun Mehta", email: "arjun@mail.com", city: "Mumbai", role: "student", level: 3, status: "active", joined: "2025-08-15", coursesEnrolled: 4, lastActive: "2h ago" },
  { id: "u2", name: "Priya Sharma", email: "priya@mail.com", city: "Delhi", role: "mentor", level: 8, status: "active", joined: "2025-03-10", coursesEnrolled: 0, lastActive: "1h ago" },
  { id: "u3", name: "Rahul Desai", email: "rahul@mail.com", city: "Bangalore", role: "student", level: 5, status: "active", joined: "2025-06-22", coursesEnrolled: 6, lastActive: "5h ago" },
  { id: "u4", name: "Sneha Iyer", email: "sneha@mail.com", city: "Chennai", role: "student", level: 2, status: "suspended", joined: "2025-10-01", coursesEnrolled: 1, lastActive: "3d ago" },
  { id: "u5", name: "Vikram Patel", email: "vikram@mail.com", city: "Hyderabad", role: "mentor", level: 7, status: "active", joined: "2025-04-18", coursesEnrolled: 0, lastActive: "30m ago" },
  { id: "u6", name: "Ananya Roy", email: "ananya@mail.com", city: "Kolkata", role: "student", level: 1, status: "banned", joined: "2025-11-05", coursesEnrolled: 0, lastActive: "15d ago" },
  { id: "u7", name: "Karthik Subbaraj", email: "karthik@mail.com", city: "Chennai", role: "super_admin", level: 10, status: "active", joined: "2025-01-01", coursesEnrolled: 0, lastActive: "Just now" },
  { id: "u8", name: "Meera Nair", email: "meera@mail.com", city: "Kochi", role: "student", level: 4, status: "active", joined: "2025-07-14", coursesEnrolled: 3, lastActive: "1d ago" },
];

// ── Mock Courses ──
export const mockAdminCourses: AdminCourse[] = [
  { id: "c1", title: "Cinematography Masterclass", instructor: "Priya Sharma", instructorId: "u2", category: "Cinematography", status: "published", students: 342, rating: 4.8, lastUpdated: "2026-01-15" },
  { id: "c2", title: "Video Editing with DaVinci Resolve", instructor: "Vikram Patel", instructorId: "u5", category: "Editing", status: "published", students: 256, rating: 4.6, lastUpdated: "2026-02-01" },
  { id: "c3", title: "Screenwriting Fundamentals", instructor: "Priya Sharma", instructorId: "u2", category: "Writing", status: "draft", students: 0, rating: 0, lastUpdated: "2026-03-01" },
  { id: "c4", title: "Sound Design for Film", instructor: "Vikram Patel", instructorId: "u5", category: "Sound", status: "published", students: 128, rating: 4.5, lastUpdated: "2025-12-10" },
  { id: "c5", title: "Color Grading Essentials", instructor: "Priya Sharma", instructorId: "u2", category: "Post-Production", status: "archived", students: 89, rating: 4.3, lastUpdated: "2025-09-20" },
  { id: "c6", title: "Documentary Filmmaking", instructor: "Vikram Patel", instructorId: "u5", category: "Filmmaking", status: "published", students: 195, rating: 4.7, lastUpdated: "2026-02-20" },
];

// ── Mock Workshops ──
export const mockAdminWorkshops: AdminWorkshop[] = [
  { id: "w1", title: "Lighting Workshop – Mumbai", instructor: "Priya Sharma", instructorId: "u2", date: "2026-03-15", city: "Mumbai", price: 2999, seatsBooked: 18, seatsTotal: 25, status: "upcoming" },
  { id: "w2", title: "Mobile Filmmaking Bootcamp", instructor: "Vikram Patel", instructorId: "u5", date: "2026-03-22", city: "Bangalore", price: 1999, seatsBooked: 30, seatsTotal: 30, status: "upcoming" },
  { id: "w3", title: "Editing Masterclass Live", instructor: "Priya Sharma", instructorId: "u2", date: "2026-02-10", city: "Chennai", price: 3499, seatsBooked: 22, seatsTotal: 25, status: "completed" },
  { id: "w4", title: "Sound Design Intensive", instructor: "Vikram Patel", instructorId: "u5", date: "2026-04-05", city: "Hyderabad", price: 2499, seatsBooked: 8, seatsTotal: 20, status: "upcoming" },
  { id: "w5", title: "VFX Fundamentals", instructor: "Priya Sharma", instructorId: "u2", date: "2026-01-20", city: "Delhi", price: 4999, seatsBooked: 15, seatsTotal: 15, status: "cancelled" },
];

// ── Mock Flagged Items ──
export const mockFlaggedItems: FlaggedItem[] = [
  { id: "f1", type: "post", content: "This post contains misleading information about camera specifications...", author: "RandomUser123", reporter: "Arjun Mehta", reason: "Misinformation", timestamp: "2h ago", status: "open" },
  { id: "f2", type: "comment", content: "Completely unprofessional and rude comment on the editing tutorial...", author: "TrollAccount", reporter: "Priya Sharma", reason: "Harassment", timestamp: "5h ago", status: "open" },
  { id: "f3", type: "user", content: "Profile contains spam links and promotional content", author: "SpamBot99", reporter: "System", reason: "Spam", timestamp: "1d ago", status: "open" },
  { id: "f4", type: "post", content: "Plagiarized content from another creator's YouTube channel...", author: "CopyPaste", reporter: "Rahul Desai", reason: "Copyright", timestamp: "2d ago", status: "resolved" },
  { id: "f5", type: "comment", content: "Inappropriate language in community discussion thread...", author: "AngryUser", reporter: "Meera Nair", reason: "Inappropriate Language", timestamp: "3d ago", status: "open" },
];

// ── Mock Opportunities for Review ──
export const mockAdminOpportunities: AdminOpportunity[] = [
  { id: "o1", title: "Wedding Videographer Needed", type: "Gig", poster: "SilverScreen Studios", status: "pending", submittedAt: "2026-03-05", description: "Looking for an experienced wedding videographer for a 3-day event in Goa. Must have own equipment.", budget: "₹50,000 – ₹80,000", location: "Goa (On-site)", skills: ["Videography", "Editing", "Color Grading"] },
  { id: "o2", title: "Junior Editor – Full Time", type: "Job", poster: "MediaWorks India", status: "pending", submittedAt: "2026-03-04", description: "Full-time junior editor position. Premiere Pro and After Effects required. Fresh graduates welcome.", budget: "₹25,000/month", location: "Mumbai (Hybrid)", skills: ["Premiere Pro", "After Effects"] },
  { id: "o3", title: "Short Film Collaboration", type: "Collaboration", poster: "Indie Collective", status: "approved", submittedAt: "2026-03-01", description: "Looking for a cinematographer and sound designer for a 15-min short film shooting in March.", budget: "Revenue share", location: "Bangalore (On-site)", skills: ["Cinematography", "Sound Design"] },
  { id: "o4", title: "YouTube Channel Editor", type: "Gig", poster: "TechVlogger", status: "rejected", submittedAt: "2026-02-28", description: "Need someone to edit 4 videos/month. Fast turnaround required.", budget: "₹8,000/video", location: "Remote", skills: ["Premiere Pro", "Thumbnails"] },
  { id: "o5", title: "Documentary Research Intern", type: "Internship", poster: "DocuFilms India", status: "pending", submittedAt: "2026-03-06", description: "3-month internship for documentary research and pre-production assistance.", budget: "₹10,000/month stipend", location: "Delhi (On-site)", skills: ["Research", "Writing", "Pre-production"] },
];

// ── Activity Feed ──
export const mockActivityFeed: ActivityItem[] = [
  { id: "a1", type: "signup", message: "Meera Nair joined Level Up", timestamp: "10m ago" },
  { id: "a2", type: "enrollment", message: "Arjun Mehta enrolled in Cinematography Masterclass", timestamp: "25m ago" },
  { id: "a3", type: "submission", message: "Rahul Desai submitted Week 3 assignment", timestamp: "1h ago" },
  { id: "a4", type: "report", message: "New flagged post: Misinformation report", timestamp: "2h ago" },
  { id: "a5", type: "completion", message: "Sneha Iyer completed Video Editing course", timestamp: "3h ago" },
  { id: "a6", type: "signup", message: "3 new users joined from Bangalore", timestamp: "5h ago" },
  { id: "a7", type: "enrollment", message: "12 new enrollments in Documentary Filmmaking", timestamp: "8h ago" },
];

// ── Analytics Data ──
export const revenueData = [
  { month: "Oct", revenue: 180000 },
  { month: "Nov", revenue: 220000 },
  { month: "Dec", revenue: 310000 },
  { month: "Jan", revenue: 280000 },
  { month: "Feb", revenue: 350000 },
  { month: "Mar", revenue: 420000 },
];

export const userGrowthData = [
  { month: "Oct", users: 1200 },
  { month: "Nov", users: 1580 },
  { month: "Dec", users: 1890 },
  { month: "Jan", users: 2100 },
  { month: "Feb", users: 2450 },
  { month: "Mar", users: 2847 },
];

export const completionData = [
  { course: "Cinematography", rate: 72 },
  { course: "Editing", rate: 65 },
  { course: "Sound Design", rate: 58 },
  { course: "Documentary", rate: 81 },
  { course: "Color Grading", rate: 45 },
];

export const cityDistribution = [
  { city: "Mumbai", users: 620 },
  { city: "Bangalore", users: 480 },
  { city: "Chennai", users: 390 },
  { city: "Delhi", users: 350 },
  { city: "Hyderabad", users: 310 },
  { city: "Kolkata", users: 280 },
  { city: "Kochi", users: 210 },
  { city: "Others", users: 207 },
];

export const enrollmentByCategory = [
  { category: "Cinematography", enrollments: 342 },
  { category: "Editing", enrollments: 256 },
  { category: "Documentary", enrollments: 195 },
  { category: "Sound", enrollments: 128 },
  { category: "Post-Production", enrollments: 89 },
  { category: "Writing", enrollments: 45 },
];

// ── Platform Settings Defaults ──
export const defaultPlatformSettings = {
  general: {
    platformName: "Level Up",
    description: "India's creative learning community for filmmakers",
    supportEmail: "support@levelup.in",
  },
  gamification: {
    xpPerLesson: 50,
    xpPerQuiz: 100,
    xpPerProject: 200,
    levelThresholds: [0, 500, 1200, 2500, 5000, 10000],
  },
  subscription: {
    freeTier: "Explorer",
    proPlan: { name: "Pro", price: 499 },
    masterPlan: { name: "Master", price: 999 },
  },
  featureFlags: {
    communityFeed: true,
    opportunities: true,
    workshops: true,
    cohorts: true,
    directory: true,
    streaks: true,
  },
};

// ── Dashboard Stats ──
export const dashboardStats = {
  totalUsers: 2847,
  totalRevenue: "₹4.2L",
  publishedCourses: 24,
  activeReports: 3,
  totalEnrollments: 1456,
  completionRate: 68,
  monthlyGrowth: 12,
  revenueGrowth: 18,
};

export const mentorStats = {
  enrolledStudents: 85,
  pendingSubmissions: 12,
  upcomingSessions: 3,
  avgRating: 4.7,
};
