import { MessageSquare, Calendar, BookOpen, Bell, Award, RotateCcw, CheckCircle, Star, Mail, Megaphone } from "lucide-react";

export const NOTIFICATION_TYPES = [
  { key: "community_reply", label: "Community Replies", icon: MessageSquare, alwaysOn: false },
  { key: "session_reminder", label: "Session Reminders", icon: Calendar, alwaysOn: false },
  { key: "course_update", label: "Course Updates", icon: BookOpen, alwaysOn: false },
  { key: "admin_announcement", label: "Announcements", icon: Megaphone, alwaysOn: true },
  { key: "assignment_feedback", label: "Assignment Feedback", icon: Star, alwaysOn: false },
  { key: "review_reply", label: "Review Responses", icon: MessageSquare, alwaysOn: false },
  { key: "refund_processed", label: "Refund Updates", icon: RotateCcw, alwaysOn: true },
  { key: "enrollment_confirmed", label: "Enrollment Confirmations", icon: CheckCircle, alwaysOn: true },
  { key: "course_completed", label: "Course Completion", icon: Award, alwaysOn: false },
  { key: "certificate_ready", label: "Certificates", icon: Award, alwaysOn: false },
  { key: "new_course_available", label: "New Courses", icon: BookOpen, alwaysOn: false },
] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number]["key"];

export const NOTIFICATION_TYPE_MAP = Object.fromEntries(
  NOTIFICATION_TYPES.map((t) => [t.key, t])
);
