import instructor1 from "@/assets/instructor-1.jpg";
import instructor2 from "@/assets/instructor-2.jpg";
import courseEditing from "@/assets/course-editing.jpg";
import courseCinematography from "@/assets/course-cinematography.jpg";

// ── Types ──

export type MemberRole = "mentor" | "ta" | "student";

export interface BatchMember {
  id: string;
  name: string;
  avatar: string;
  role: MemberRole;
  level: number;
  isOnline: boolean;
}

export interface BatchChannel {
  id: string;
  name: string;
  category: string;
  description: string;
  isLocked?: boolean; // only mentors/admin can post
  unreadCount: number;
  isUnread: boolean;
}

export interface ThreadReply {
  id: string;
  authorId: string;
  content: string;
  timestamp: string;
}

export interface BatchMessage {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  timestamp: string;
  isPinned?: boolean;
  reactions: { emoji: string; count: number; reacted: boolean }[];
  threadReplies: ThreadReply[];
  image?: string;
  attachment?: { name: string; size: string };
  link?: { url: string; label: string };
}

export interface BatchCohort {
  id: string;
  name: string;
  batchNumber: number;
  memberCount: number;
  nextSession?: string;
  unreadCount: number;
  image: string;
  members: BatchMember[];
  channels: BatchChannel[];
  messages: BatchMessage[];
}

// ── Members ──

const members: BatchMember[] = [
  { id: "m-mentor", name: "Avinash", avatar: instructor1, role: "mentor", level: 10, isOnline: true },
  { id: "m-ta", name: "Devansh", avatar: instructor2, role: "ta", level: 8, isOnline: true },
  { id: "m-1", name: "Aarav Patel", avatar: instructor1, role: "student", level: 4, isOnline: true },
  { id: "m-2", name: "Ishaan Kumar", avatar: instructor2, role: "student", level: 3, isOnline: false },
  { id: "m-3", name: "Priya Sharma", avatar: instructor2, role: "student", level: 5, isOnline: true },
  { id: "m-4", name: "Ananya Reddy", avatar: instructor2, role: "student", level: 3, isOnline: false },
  { id: "m-5", name: "Rohan Gupta", avatar: instructor1, role: "student", level: 4, isOnline: true },
  { id: "m-6", name: "Kavya Singh", avatar: instructor2, role: "student", level: 2, isOnline: false },
  { id: "m-7", name: "Arjun Nair", avatar: instructor1, role: "student", level: 6, isOnline: true },
  { id: "m-8", name: "Sneha Desai", avatar: instructor2, role: "student", level: 3, isOnline: false },
  { id: "m-9", name: "Vikram Iyer", avatar: instructor1, role: "student", level: 4, isOnline: false },
  { id: "m-10", name: "Meera Joshi", avatar: instructor2, role: "student", level: 5, isOnline: true },
  { id: "m-11", name: "Aditya Verma", avatar: instructor1, role: "student", level: 2, isOnline: false },
  { id: "m-12", name: "Riya Krishnan", avatar: instructor2, role: "student", level: 3, isOnline: false },
  { id: "m-13", name: "Sameer Khan", avatar: instructor1, role: "student", level: 4, isOnline: true },
  { id: "m-14", name: "Divya Menon", avatar: instructor2, role: "student", level: 2, isOnline: false },
  { id: "m-15", name: "Harsh Thakur", avatar: instructor1, role: "student", level: 3, isOnline: false },
  { id: "m-16", name: "Pooja Rao", avatar: instructor2, role: "student", level: 5, isOnline: true },
  { id: "m-17", name: "Nikhil Saxena", avatar: instructor1, role: "student", level: 2, isOnline: false },
  { id: "m-18", name: "Tanvi Bhatt", avatar: instructor2, role: "student", level: 3, isOnline: false },
  { id: "m-19", name: "Rahul Chauhan", avatar: instructor1, role: "student", level: 4, isOnline: false },
  { id: "m-20", name: "Shruti Pillai", avatar: instructor2, role: "student", level: 2, isOnline: true },
  { id: "m-21", name: "Karan Malhotra", avatar: instructor1, role: "student", level: 3, isOnline: false },
  { id: "m-22", name: "Nandini Das", avatar: instructor2, role: "student", level: 4, isOnline: false },
  { id: "m-23", name: "Varun Srinivasan", avatar: instructor1, role: "student", level: 2, isOnline: false },
  { id: "m-24", name: "Anjali Hegde", avatar: instructor2, role: "student", level: 3, isOnline: true },
  { id: "m-25", name: "Deepak Rathi", avatar: instructor1, role: "student", level: 2, isOnline: false },
];

// ── Channels ──

const channels: BatchChannel[] = [
  // GENERAL
  { id: "announcements", name: "announcements", category: "GENERAL", description: "Official updates from mentors and TAs", isLocked: true, unreadCount: 2, isUnread: true },
  { id: "general-chat", name: "general-chat", category: "GENERAL", description: "Open discussion for the batch", unreadCount: 5, isUnread: true },
  { id: "introductions", name: "introductions", category: "GENERAL", description: "Introduce yourself to the batch!", unreadCount: 0, isUnread: false },
  // LEARNING
  { id: "session-links", name: "session-links", category: "LEARNING", description: "Live session links and recordings", unreadCount: 1, isUnread: true },
  { id: "resources", name: "resources", category: "LEARNING", description: "Shared resources, tools, and references", unreadCount: 0, isUnread: false },
  { id: "assignments", name: "assignments", category: "LEARNING", description: "Assignment briefs and submissions", unreadCount: 3, isUnread: true },
  { id: "doubts-and-questions", name: "doubts-and-questions", category: "LEARNING", description: "Ask anything about the course material", unreadCount: 2, isUnread: true },
  // SHOWCASE
  { id: "project-showcase", name: "project-showcase", category: "SHOWCASE", description: "Share your finished projects", unreadCount: 0, isUnread: false },
  { id: "work-in-progress", name: "work-in-progress", category: "SHOWCASE", description: "Get early feedback on ongoing work", unreadCount: 0, isUnread: false },
  { id: "feedback-requests", name: "feedback-requests", category: "SHOWCASE", description: "Request specific feedback from peers", unreadCount: 0, isUnread: false },
  // SOCIAL
  { id: "off-topic", name: "off-topic", category: "SOCIAL", description: "Memes, random chats, and fun", unreadCount: 4, isUnread: true },
  { id: "collabs", name: "collabs", category: "SOCIAL", description: "Find collaborators for projects", unreadCount: 0, isUnread: false },
  { id: "wins", name: "wins", category: "SOCIAL", description: "Celebrate your wins, big or small! 🎉", unreadCount: 1, isUnread: true },
];

// ── Messages ──

const messages: BatchMessage[] = [
  // #announcements
  {
    id: "msg-1",
    channelId: "announcements",
    authorId: "m-mentor",
    content: "📋 Week 4 Schedule:\n\nMonday — Color Theory Basics (7 PM)\nWednesday — DaVinci Resolve Workshop (7 PM)\nFriday — Assignment Review Session (6 PM)\n\nAll sessions are mandatory. Recordings will be available in #session-links within 24hrs.",
    timestamp: "Today at 10:30 AM",
    isPinned: true,
    reactions: [{ emoji: "👍", count: 18, reacted: false }, { emoji: "🔥", count: 7, reacted: true }],
    threadReplies: [],
  },
  {
    id: "msg-2",
    channelId: "announcements",
    authorId: "m-ta",
    content: "⚠️ Assignment 3 deadline extended to Sunday 11:59 PM. Please submit your color-graded edits in #assignments. Late submissions won't be reviewed in the live session.",
    timestamp: "Yesterday at 2:15 PM",
    isPinned: true,
    reactions: [{ emoji: "👍", count: 22, reacted: true }, { emoji: "💯", count: 5, reacted: false }],
    threadReplies: [],
  },
  {
    id: "msg-3",
    channelId: "announcements",
    authorId: "m-mentor",
    content: "Great work on the Week 3 projects everyone! Special shoutout to Aarav, Priya, and Meera for exceptional color grading work. Keep pushing yourselves! 💪",
    timestamp: "2 days ago",
    reactions: [{ emoji: "❤️", count: 15, reacted: false }, { emoji: "🔥", count: 9, reacted: false }],
    threadReplies: [],
  },

  // #general-chat
  {
    id: "msg-4",
    channelId: "general-chat",
    authorId: "m-5",
    content: "Has anyone tried the new Premiere Pro update? The AI-assisted editing tools are pretty wild",
    timestamp: "Today at 11:45 AM",
    reactions: [{ emoji: "👍", count: 4, reacted: false }],
    threadReplies: [
      { id: "tr-1", authorId: "m-7", content: "Yeah, the scene detection is way better now. Saved me hours on my last project!", timestamp: "Today at 11:52 AM" },
      { id: "tr-2", authorId: "m-3", content: "I'm still team DaVinci Resolve tbh. The free version has everything I need 😄", timestamp: "Today at 12:05 PM" },
      { id: "tr-3", authorId: "m-mentor", content: "Both are great tools. We'll cover Resolve's AI features in next week's session. Premiere's scene edit detection is excellent for rough cuts though.", timestamp: "Today at 12:18 PM" },
    ],
  },
  {
    id: "msg-5",
    channelId: "general-chat",
    authorId: "m-10",
    content: "Just finished watching the recording of Wednesday's session. The part about match cuts blew my mind 🤯",
    timestamp: "Today at 10:20 AM",
    reactions: [{ emoji: "🔥", count: 6, reacted: false }, { emoji: "💯", count: 3, reacted: false }],
    threadReplies: [],
  },
  {
    id: "msg-6",
    channelId: "general-chat",
    authorId: "m-ta",
    content: "Quick reminder: if you're having trouble with DaVinci crashing on export, make sure you're using the latest driver for your GPU. I've added a troubleshooting guide in #resources 🛠️",
    timestamp: "Today at 9:00 AM",
    reactions: [{ emoji: "👍", count: 11, reacted: true }],
    threadReplies: [],
  },
  {
    id: "msg-7",
    channelId: "general-chat",
    authorId: "m-1",
    content: "Who else is staying up late working on Assignment 3? The color grading rabbit hole is real 😅",
    timestamp: "Yesterday at 11:30 PM",
    reactions: [{ emoji: "😂", count: 14, reacted: true }, { emoji: "💯", count: 8, reacted: false }],
    threadReplies: [],
  },

  // #session-links
  {
    id: "msg-8",
    channelId: "session-links",
    authorId: "m-ta",
    content: "🔴 LIVE NOW — Week 4, Session 1: Color Theory Basics",
    timestamp: "Today at 6:55 PM",
    reactions: [{ emoji: "🔥", count: 12, reacted: false }],
    threadReplies: [],
    link: { url: "https://zoom.us/j/example", label: "Join Session" },
  },
  {
    id: "msg-9",
    channelId: "session-links",
    authorId: "m-ta",
    content: "Week 3 Session 3 recording is now available. Topic: Advanced Cutting Techniques.",
    timestamp: "Yesterday at 9:00 AM",
    reactions: [{ emoji: "👍", count: 8, reacted: false }],
    threadReplies: [],
    link: { url: "#", label: "Watch Recording" },
  },

  // #assignments
  {
    id: "msg-10",
    channelId: "assignments",
    authorId: "m-mentor",
    content: "📝 Assignment 3: Color Grade Challenge\n\nDownload the raw footage from the link below. Apply three different color grades:\n1. Warm cinematic look\n2. Cool thriller tone\n3. Your own creative grade\n\nSubmit your DaVinci Resolve project file + exported MP4s. Deadline: Sunday 11:59 PM.",
    timestamp: "3 days ago",
    isPinned: true,
    reactions: [{ emoji: "👍", count: 20, reacted: true }],
    threadReplies: [],
    attachment: { name: "Assignment3_RawFootage.zip", size: "450 MB" },
  },
  {
    id: "msg-11",
    channelId: "assignments",
    authorId: "m-3",
    content: "Submitting my Assignment 3! Really enjoyed the creative grade part — went for a Wes Anderson-inspired palette 🎨",
    timestamp: "Today at 3:00 PM",
    reactions: [{ emoji: "❤️", count: 8, reacted: false }, { emoji: "🔥", count: 5, reacted: false }],
    threadReplies: [],
    image: courseCinematography,
  },

  // #project-showcase
  {
    id: "msg-12",
    channelId: "project-showcase",
    authorId: "m-7",
    content: "Just wrapped my short documentary about street food vendors in Old Delhi. 3 weeks of shooting, 2 weeks of editing. Would love your honest feedback! 🎬",
    timestamp: "Yesterday at 4:30 PM",
    reactions: [{ emoji: "🔥", count: 24, reacted: true }, { emoji: "❤️", count: 18, reacted: false }, { emoji: "💯", count: 9, reacted: false }],
    threadReplies: [
      { id: "tr-4", authorId: "m-mentor", content: "Incredible work, Arjun! The pacing in the first act is perfect. One note: the audio levels dip around the 4-minute mark. Otherwise, festival-ready quality.", timestamp: "Yesterday at 5:15 PM" },
      { id: "tr-5", authorId: "m-10", content: "This is so good! The color grading is gorgeous. What LUT did you use as a base?", timestamp: "Yesterday at 5:45 PM" },
    ],
    image: courseEditing,
  },
  {
    id: "msg-13",
    channelId: "project-showcase",
    authorId: "m-16",
    content: "My first ever music video edit! 🎵 Shot on iPhone, edited in DaVinci. Far from perfect but I'm proud of the progress since week 1.",
    timestamp: "2 days ago",
    reactions: [{ emoji: "❤️", count: 31, reacted: true }, { emoji: "🔥", count: 14, reacted: false }],
    threadReplies: [],
    image: courseCinematography,
  },

  // #doubts-and-questions
  {
    id: "msg-14",
    channelId: "doubts-and-questions",
    authorId: "m-8",
    content: "How do I fix flickering when I apply a power window in DaVinci Resolve? It's fine in the viewer but flickers on export.",
    timestamp: "Today at 1:30 PM",
    reactions: [],
    threadReplies: [
      { id: "tr-6", authorId: "m-ta", content: "Try increasing the softness on your power window edges, and make sure you're not keyframing too aggressively. Also check your render cache — set it to Smart mode.", timestamp: "Today at 1:45 PM" },
    ],
  },

  // #off-topic
  {
    id: "msg-15",
    channelId: "off-topic",
    authorId: "m-13",
    content: "Just watched Lokesh Kanagaraj's latest — the editing in the climax is INSANE. How does Anthony cut like that?! 🤯",
    timestamp: "Today at 8:30 AM",
    reactions: [{ emoji: "🔥", count: 16, reacted: false }, { emoji: "💯", count: 8, reacted: true }],
    threadReplies: [],
  },
  {
    id: "msg-16",
    channelId: "off-topic",
    authorId: "m-6",
    content: "Unpopular opinion: vertical video is perfectly fine for storytelling. Fight me 😂",
    timestamp: "Yesterday at 9:00 PM",
    reactions: [{ emoji: "😂", count: 12, reacted: false }, { emoji: "👍", count: 4, reacted: false }],
    threadReplies: [],
  },

  // #wins
  {
    id: "msg-17",
    channelId: "wins",
    authorId: "m-1",
    content: "Got my first paid editing gig through a connection I made HERE in this batch! ₹15,000 for a wedding highlight reel. Thank you Batch 4 fam! 🎉🎊",
    timestamp: "Today at 2:00 PM",
    reactions: [{ emoji: "🔥", count: 25, reacted: true }, { emoji: "❤️", count: 19, reacted: false }, { emoji: "💯", count: 12, reacted: false }],
    threadReplies: [],
  },

  // #introductions
  {
    id: "msg-18",
    channelId: "introductions",
    authorId: "m-mentor",
    content: "Welcome to Video Editing Academy — Batch 4! 🎬\n\nI'm Avinash, your lead mentor. I've been editing professionally for 12 years, working on feature films, documentaries, and brand content. Excited to guide you all through this journey!\n\nDrop your intro below — tell us your name, where you're from, and what got you into video editing.",
    timestamp: "2 weeks ago",
    isPinned: true,
    reactions: [{ emoji: "❤️", count: 27, reacted: true }, { emoji: "🔥", count: 15, reacted: false }],
    threadReplies: [],
  },

  // #resources
  {
    id: "msg-19",
    channelId: "resources",
    authorId: "m-ta",
    content: "📚 Essential resources for this week:\n\n• DaVinci Resolve Color Grading Guide (PDF attached)\n• Free LUT pack — 25 cinematic looks\n• GPU troubleshooting guide for Windows/Mac",
    timestamp: "3 days ago",
    reactions: [{ emoji: "👍", count: 16, reacted: false }],
    threadReplies: [],
    attachment: { name: "Week4_Resources.zip", size: "120 MB" },
  },

  // #collabs
  {
    id: "msg-20",
    channelId: "collabs",
    authorId: "m-9",
    content: "Looking for a sound designer for my short film project. It's a 7-min drama, already picture-locked. Anyone interested? 🎧",
    timestamp: "Yesterday at 6:00 PM",
    reactions: [{ emoji: "👍", count: 3, reacted: false }],
    threadReplies: [],
  },

  // #feedback-requests
  {
    id: "msg-21",
    channelId: "feedback-requests",
    authorId: "m-4",
    content: "Can someone review my rough cut before I submit? It's a 3-min edit, I'm specifically struggling with the transition at 1:24. Link in thread 👇",
    timestamp: "Today at 4:00 PM",
    reactions: [{ emoji: "👍", count: 5, reacted: false }],
    threadReplies: [
      { id: "tr-7", authorId: "m-7", content: "Just watched it — the J-cut at 1:24 feels a bit jarring. Try extending the audio from the next scene by half a second before the visual cut.", timestamp: "Today at 4:20 PM" },
    ],
  },

  // #work-in-progress
  {
    id: "msg-22",
    channelId: "work-in-progress",
    authorId: "m-20",
    content: "Working on a travel edit from my recent Goa trip. Still rough but the color grade is coming together nicely 🌊",
    timestamp: "Yesterday at 3:00 PM",
    reactions: [{ emoji: "🔥", count: 8, reacted: false }, { emoji: "❤️", count: 6, reacted: false }],
    threadReplies: [],
    image: courseCinematography,
  },
];

// ── Cohort export ──

export const batchCohorts: BatchCohort[] = [
  {
    id: "batch-ve-4",
    name: "Video Editing Academy",
    batchNumber: 4,
    memberCount: 27,
    nextSession: "Sat 3 PM",
    unreadCount: 18,
    image: courseEditing,
    members,
    channels,
    messages,
  },
];

// ── Helpers ──

export function getBatchById(id: string): BatchCohort | undefined {
  return batchCohorts.find((b) => b.id === id);
}

export function getMemberById(cohort: BatchCohort, memberId: string): BatchMember | undefined {
  return cohort.members.find((m) => m.id === memberId);
}

export function getChannelMessages(cohort: BatchCohort, channelId: string): BatchMessage[] {
  return cohort.messages.filter((m) => m.channelId === channelId);
}

export function getChannelCategories(cohort: BatchCohort): string[] {
  const cats = new Set(cohort.channels.map((c) => c.category));
  return Array.from(cats);
}

export function getChannelsByCategory(cohort: BatchCohort, category: string): BatchChannel[] {
  return cohort.channels.filter((c) => c.category === category);
}
