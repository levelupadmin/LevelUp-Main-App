import instructor1 from "@/assets/instructor-1.jpg";
import instructor2 from "@/assets/instructor-2.jpg";
import courseEditing from "@/assets/course-editing.jpg";
import courseCinematography from "@/assets/course-cinematography.jpg";
import courseContent from "@/assets/course-content.jpg";
import heroFilmmaking from "@/assets/hero-filmmaking.jpg";
import heroCinematography from "@/assets/hero-cinematography-1.jpg";

// ── Types ──

export type PostType = "thought" | "project" | "question" | "poll" | "milestone" | "collab";

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Comment {
  id: string;
  authorName: string;
  authorAvatar: string;
  authorLevel: number;
  content: string;
  timeAgo: string;
  likes: number;
  liked: boolean;
  replies?: Comment[];
}

export interface FeedPost {
  id: string;
  type: PostType;
  authorName: string;
  authorAvatar: string;
  authorLevel: number;
  timeAgo: string;
  batchLabel?: string; // if author is a batch mate
  // Content
  title?: string;
  body: string;
  images?: string[];
  videoThumbnail?: string;
  tags?: string[];
  feedbackRequested?: boolean;
  // Poll
  pollOptions?: PollOption[];
  pollDuration?: string;
  hasVoted?: boolean;
  // Collab
  roleNeeded?: string;
  city?: string;
  timeline?: string;
  budget?: "Paid" | "Unpaid" | "Discuss";
  // Engagement
  likes: number;
  liked: boolean;
  comments: number;
  reposts: number;
  bookmarked: boolean;
  commentList?: Comment[];
}

// ── Mock data ──

export const feedPosts: FeedPost[] = [
  // 5 projects
  {
    id: "fp-1",
    type: "project",
    authorName: "Arjun Nair",
    authorAvatar: instructor1,
    authorLevel: 6,
    timeAgo: "2h ago",
    batchLabel: "Batch 4",
    title: "Street Food Stories — Short Documentary",
    body: "Just wrapped my short documentary about street food vendors in Old Delhi. 3 weeks of shooting, 2 weeks of editing. Shot on BMPCC 6K, graded in DaVinci Resolve. The toughest part was getting the audio right in such noisy environments. Would love your honest feedback!",
    images: [courseEditing, courseCinematography],
    tags: ["Documentary", "DaVinci Resolve", "Color Grading", "Sound Design"],
    feedbackRequested: true,
    likes: 42,
    liked: false,
    comments: 8,
    reposts: 3,
    bookmarked: false,
    commentList: [
      {
        id: "c-1",
        authorName: "Avinash",
        authorAvatar: instructor1,
        authorLevel: 10,
        content: "Incredible work! The pacing in the first act is perfect. The audio dip around 4:00 needs attention though.",
        timeAgo: "1h ago",
        likes: 12,
        liked: false,
        replies: [
          { id: "c-1r", authorName: "Arjun Nair", authorAvatar: instructor1, authorLevel: 6, content: "Thanks Avinash! Will fix that dip in the next cut.", timeAgo: "45m ago", likes: 3, liked: false },
        ],
      },
      { id: "c-2", authorName: "Meera Joshi", authorAvatar: instructor2, authorLevel: 5, content: "The color grading is gorgeous. What LUT did you use as a base?", timeAgo: "1h ago", likes: 5, liked: false },
    ],
  },
  {
    id: "fp-2",
    type: "project",
    authorName: "Pooja Rao",
    authorAvatar: instructor2,
    authorLevel: 5,
    timeAgo: "5h ago",
    batchLabel: "Batch 4",
    title: "My First Music Video Edit",
    body: "Shot on iPhone 15 Pro, edited entirely in DaVinci Resolve. Far from perfect but I'm so proud of the progress since week 1. The beat sync technique Avinash taught us was a game changer.",
    images: [heroFilmmaking],
    tags: ["Music Video", "iPhone", "DaVinci Resolve"],
    feedbackRequested: true,
    likes: 31,
    liked: true,
    comments: 5,
    reposts: 1,
    bookmarked: true,
  },
  {
    id: "fp-3",
    type: "project",
    authorName: "Karthik Rajan",
    authorAvatar: instructor1,
    authorLevel: 7,
    timeAgo: "1d ago",
    title: "Wedding Highlight Reel — Priya & Rahul",
    body: "My latest commercial project. Spent 40 hours editing a 6-minute highlight reel from 12 hours of footage. The couple was incredibly happy with the result. Sharing a few stills from the edit.",
    images: [heroCinematography, courseContent],
    tags: ["Wedding", "Commercial", "Premiere Pro"],
    feedbackRequested: true,
    likes: 67,
    liked: false,
    comments: 12,
    reposts: 8,
    bookmarked: false,
  },
  {
    id: "fp-4",
    type: "project",
    authorName: "Sneha Desai",
    authorAvatar: instructor2,
    authorLevel: 3,
    timeAgo: "2d ago",
    batchLabel: "Batch 4",
    title: "Color Grading Exercise — Three Moods",
    body: "Assignment 3 submission! Created three different grades from the raw footage: warm cinematic, cool thriller, and my own Wes Anderson-inspired palette. Really enjoyed experimenting with the color wheels.",
    images: [courseCinematography],
    tags: ["Color Grading", "DaVinci Resolve", "Assignment"],
    feedbackRequested: false,
    likes: 18,
    liked: false,
    comments: 3,
    reposts: 0,
    bookmarked: false,
  },
  {
    id: "fp-5",
    type: "project",
    authorName: "Rohit Menon",
    authorAvatar: instructor1,
    authorLevel: 4,
    timeAgo: "3d ago",
    batchLabel: "Batch 4",
    title: "Travel Vlog — 48 Hours in Goa",
    body: "Tried a new editing style inspired by Sam Kolder. Lots of speed ramps, whip pans, and drone transitions. Still learning but each video gets a little better!",
    images: [heroFilmmaking],
    tags: ["Travel", "Vlog", "Transitions"],
    likes: 24,
    liked: false,
    comments: 6,
    reposts: 2,
    bookmarked: false,
  },

  // 4 thoughts
  {
    id: "fp-6",
    type: "thought",
    authorName: "Priya Sharma",
    authorAvatar: instructor2,
    authorLevel: 5,
    timeAgo: "30m ago",
    batchLabel: "Batch 4",
    body: "Has anyone tried the new Premiere Pro update? The AI-assisted editing tools are pretty wild. The scene detection is insanely accurate now.",
    likes: 15,
    liked: false,
    comments: 4,
    reposts: 1,
    bookmarked: false,
  },
  {
    id: "fp-7",
    type: "thought",
    authorName: "Vikram Iyer",
    authorAvatar: instructor1,
    authorLevel: 4,
    timeAgo: "3h ago",
    body: "Hot take: the best editors are the ones who know when NOT to cut. Sometimes holding a shot longer creates more tension than any fancy transition ever could.",
    likes: 38,
    liked: true,
    comments: 7,
    reposts: 5,
    bookmarked: true,
  },
  {
    id: "fp-8",
    type: "thought",
    authorName: "Divya Menon",
    authorAvatar: instructor2,
    authorLevel: 2,
    timeAgo: "6h ago",
    batchLabel: "Batch 4",
    body: "Just finished watching the recording of Wednesday's session on match cuts. The part about using audio bridges to smooth visual match cuts completely changed how I think about transitions 🤯",
    likes: 22,
    liked: false,
    comments: 2,
    reposts: 0,
    bookmarked: false,
  },
  {
    id: "fp-9",
    type: "thought",
    authorName: "Sameer Khan",
    authorAvatar: instructor1,
    authorLevel: 4,
    timeAgo: "1d ago",
    body: "Just watched Lokesh Kanagaraj's latest — the editing in the climax is INSANE. Anthony's cutting rhythm is something else entirely. Every cut has a purpose.",
    likes: 45,
    liked: false,
    comments: 9,
    reposts: 6,
    bookmarked: false,
  },

  // 3 questions
  {
    id: "fp-10",
    type: "question",
    authorName: "Aarav Patel",
    authorAvatar: instructor1,
    authorLevel: 4,
    timeAgo: "1h ago",
    batchLabel: "Batch 4",
    body: "How do you handle flickering when applying power windows in DaVinci Resolve? It looks fine in the viewer but flickers on export. Already tried clearing cache.",
    tags: ["DaVinci Resolve", "Color Grading", "Technical"],
    likes: 8,
    liked: false,
    comments: 5,
    reposts: 0,
    bookmarked: false,
    commentList: [
      { id: "c-q1", authorName: "Devansh", authorAvatar: instructor2, authorLevel: 8, content: "Try increasing softness on your power window edges. Also check your render cache — set it to Smart mode.", timeAgo: "50m ago", likes: 6, liked: false },
    ],
  },
  {
    id: "fp-11",
    type: "question",
    authorName: "Nandini Das",
    authorAvatar: instructor2,
    authorLevel: 4,
    timeAgo: "8h ago",
    body: "What's the best export preset for Instagram Reels in Premiere Pro? I keep getting quality loss, especially on dark scenes with gradients.",
    tags: ["Premiere Pro", "Export", "Social Media"],
    likes: 12,
    liked: false,
    comments: 7,
    reposts: 2,
    bookmarked: false,
  },
  {
    id: "fp-12",
    type: "question",
    authorName: "Harsh Thakur",
    authorAvatar: instructor1,
    authorLevel: 3,
    timeAgo: "1d ago",
    batchLabel: "Batch 2",
    body: "Cinematographers — what's your go-to lens for run-and-gun documentary work? I'm torn between a 24-70mm and a fast prime setup.",
    tags: ["Cinematography", "Gear", "Documentary"],
    likes: 19,
    liked: false,
    comments: 11,
    reposts: 3,
    bookmarked: false,
  },

  // 2 polls
  {
    id: "fp-13",
    type: "poll",
    authorName: "Meera Joshi",
    authorAvatar: instructor2,
    authorLevel: 5,
    timeAgo: "4h ago",
    batchLabel: "Batch 4",
    body: "What's your primary editing software in 2026?",
    pollOptions: [
      { id: "po-1", text: "DaVinci Resolve", votes: 45 },
      { id: "po-2", text: "Adobe Premiere Pro", votes: 32 },
      { id: "po-3", text: "Final Cut Pro", votes: 12 },
      { id: "po-4", text: "CapCut / Other", votes: 8 },
    ],
    pollDuration: "3 days left",
    hasVoted: true,
    likes: 14,
    liked: false,
    comments: 6,
    reposts: 2,
    bookmarked: false,
  },
  {
    id: "fp-14",
    type: "poll",
    authorName: "Aditya Verma",
    authorAvatar: instructor1,
    authorLevel: 2,
    timeAgo: "2d ago",
    body: "Best Indian film of 2025 in terms of editing?",
    pollOptions: [
      { id: "po-5", text: "Coolie (Lokesh)", votes: 58 },
      { id: "po-6", text: "Jailer 2 (Nelson)", votes: 24 },
      { id: "po-7", text: "Pushpa 3", votes: 15 },
    ],
    pollDuration: "Ended",
    hasVoted: false,
    likes: 28,
    liked: false,
    comments: 14,
    reposts: 4,
    bookmarked: false,
  },

  // 2 milestones
  {
    id: "fp-15",
    type: "milestone",
    authorName: "Aarav Patel",
    authorAvatar: instructor1,
    authorLevel: 4,
    timeAgo: "6h ago",
    batchLabel: "Batch 4",
    body: "I just completed my first paid editing gig! ₹15,000 for a wedding highlight reel — got the client through a connection I made in this batch! 🎉🎊 Thank you Batch 4 fam!",
    likes: 78,
    liked: true,
    comments: 15,
    reposts: 4,
    bookmarked: false,
  },
  {
    id: "fp-16",
    type: "milestone",
    authorName: "Riya Krishnan",
    authorAvatar: instructor2,
    authorLevel: 3,
    timeAgo: "3d ago",
    body: "I just completed 30 days of daily editing practice! 🔥 One new edit every single day. My skills have improved more in this month than the entire previous year.",
    images: [courseContent],
    likes: 52,
    liked: false,
    comments: 8,
    reposts: 3,
    bookmarked: false,
  },

  // 2 collab calls
  {
    id: "fp-17",
    type: "collab",
    authorName: "Vikram Iyer",
    authorAvatar: instructor1,
    authorLevel: 4,
    timeAgo: "12h ago",
    title: "Sound Designer Needed for Short Film",
    body: "Looking for a sound designer for my 7-minute short drama. It's already picture-locked and has a rough sound mix. Need someone who can do proper foley, dialogue cleanup, and ambient soundscapes.",
    roleNeeded: "Sound Designer",
    city: "Mumbai",
    timeline: "2 weeks",
    budget: "Paid",
    tags: ["Sound Design", "Short Film", "Drama"],
    likes: 11,
    liked: false,
    comments: 4,
    reposts: 2,
    bookmarked: false,
  },
  {
    id: "fp-18",
    type: "collab",
    authorName: "Kavya Singh",
    authorAvatar: instructor2,
    authorLevel: 2,
    timeAgo: "1d ago",
    title: "Cinematographer for Music Video",
    body: "Shooting an indie music video in Bangalore next month. Looking for a cinematographer who's comfortable with handheld and gimbal work. We have a RED Komodo available.",
    roleNeeded: "Cinematographer",
    city: "Bangalore",
    timeline: "1 month",
    budget: "Discuss",
    tags: ["Cinematography", "Music Video", "RED"],
    likes: 16,
    liked: false,
    comments: 7,
    reposts: 3,
    bookmarked: false,
  },

  // 2 regular posts
  {
    id: "fp-19",
    type: "thought",
    authorName: "Tanvi Bhatt",
    authorAvatar: instructor2,
    authorLevel: 3,
    timeAgo: "5h ago",
    body: "Unpopular opinion: vertical video is perfectly fine for storytelling. Some of the best content I've seen this year was shot and edited for mobile-first viewing. The medium doesn't limit the art.",
    likes: 29,
    liked: false,
    comments: 13,
    reposts: 2,
    bookmarked: false,
  },
  {
    id: "fp-20",
    type: "thought",
    authorName: "Deepak Rathi",
    authorAvatar: instructor1,
    authorLevel: 2,
    timeAgo: "2d ago",
    batchLabel: "Batch 4",
    body: "Who else is staying up late working on Assignment 3? The color grading rabbit hole is real 😅 I've been tweaking the same 10-second clip for 3 hours.",
    likes: 34,
    liked: true,
    comments: 11,
    reposts: 1,
    bookmarked: false,
  },
];

// ── Sidebar mock data ──

export interface SidebarBatch {
  id: string;
  name: string;
  unreadCount: number;
}

export interface SidebarSpace {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  hasUnread: boolean;
}

export const sidebarBatches: SidebarBatch[] = [
  { id: "batch-ve-4", name: "Video Editing — Batch 4", unreadCount: 12 },
  { id: "batch-fm-2", name: "Filmmaking Intensive — Batch 2", unreadCount: 5 },
  { id: "batch-cg-1", name: "Color Grading — Batch 1", unreadCount: 0 },
];

export const sidebarSpaces: SidebarSpace[] = [
  { id: "sp-1", slug: "filmmaking", name: "Filmmaking", emoji: "🎬", hasUnread: true },
  { id: "sp-2", slug: "video-editing", name: "Video Editing", emoji: "✂️", hasUnread: false },
  { id: "sp-3", slug: "cinematography", name: "Cinematography", emoji: "📷", hasUnread: true },
  { id: "sp-4", slug: "mumbai-creators", name: "Mumbai Creators", emoji: "🏙️", hasUnread: false },
  { id: "sp-5", slug: "bangalore-creators", name: "Bangalore Creators", emoji: "🌳", hasUnread: false },
  { id: "sp-6", slug: "chennai-creators", name: "Chennai Creators", emoji: "🌊", hasUnread: true },
];
