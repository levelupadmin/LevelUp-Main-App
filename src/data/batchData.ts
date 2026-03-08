import instructor1 from "@/assets/instructor-1.jpg";
import instructor2 from "@/assets/instructor-2.jpg";
import courseEditing from "@/assets/course-editing.jpg";
import courseCinematography from "@/assets/course-cinematography.jpg";
import heroFilmmaking from "@/assets/hero-filmmaking.jpg";

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
  isLocked?: boolean;
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
  dateGroup: string; // "Today", "Yesterday", "March 5"
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

// ══════════════════════════════════════════════
// BATCH 1: Video Editing Academy — Batch 4
// ══════════════════════════════════════════════

const veMembers: BatchMember[] = [
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

const veChannels: BatchChannel[] = [
  { id: "ve-announcements", name: "announcements", category: "GENERAL", description: "Official updates from mentors and TAs", isLocked: true, unreadCount: 2, isUnread: true },
  { id: "ve-general-chat", name: "general-chat", category: "GENERAL", description: "Open discussion for the batch", unreadCount: 5, isUnread: true },
  { id: "ve-introductions", name: "introductions", category: "GENERAL", description: "Introduce yourself to the batch!", unreadCount: 0, isUnread: false },
  { id: "ve-session-links", name: "session-links", category: "LEARNING", description: "Live session links and recordings", unreadCount: 1, isUnread: true },
  { id: "ve-resources", name: "resources", category: "LEARNING", description: "Shared resources, tools, and references", unreadCount: 0, isUnread: false },
  { id: "ve-assignments", name: "assignments", category: "LEARNING", description: "Assignment briefs and submissions", unreadCount: 3, isUnread: true },
  { id: "ve-doubts-and-questions", name: "doubts-and-questions", category: "LEARNING", description: "Ask anything about the course material", unreadCount: 2, isUnread: true },
  { id: "ve-project-showcase", name: "project-showcase", category: "SHOWCASE", description: "Share your finished projects", unreadCount: 0, isUnread: false },
  { id: "ve-work-in-progress", name: "work-in-progress", category: "SHOWCASE", description: "Get early feedback on ongoing work", unreadCount: 0, isUnread: false },
  { id: "ve-feedback-requests", name: "feedback-requests", category: "SHOWCASE", description: "Request specific feedback from peers", unreadCount: 0, isUnread: false },
  { id: "ve-off-topic", name: "off-topic", category: "SOCIAL", description: "Memes, random chats, and fun", unreadCount: 4, isUnread: true },
  { id: "ve-collabs", name: "collabs", category: "SOCIAL", description: "Find collaborators for projects", unreadCount: 0, isUnread: false },
  { id: "ve-wins", name: "wins", category: "SOCIAL", description: "Celebrate your wins, big or small! 🎉", unreadCount: 1, isUnread: true },
];

const veMessages: BatchMessage[] = [
  // ── #announcements (3 messages, 2 pinned) ──
  {
    id: "ve-msg-1", channelId: "ve-announcements", authorId: "m-mentor", dateGroup: "Today",
    content: "📋 **Week 6 Schedule:**\n\nMonday — Sound Design Fundamentals (7 PM)\nWednesday — Foley Recording Workshop (7 PM)\nFriday — Assignment 5 Review Session (6 PM)\n\nAll sessions are mandatory. Recordings available in #session-links within 24hrs.",
    timestamp: "10:30 AM", isPinned: true,
    reactions: [{ emoji: "👍", count: 18, reacted: false }, { emoji: "🔥", count: 7, reacted: true }],
    threadReplies: [],
  },
  {
    id: "ve-msg-2", channelId: "ve-announcements", authorId: "m-ta", dateGroup: "Yesterday",
    content: "⚠️ **Assignment 4 deadline:** Sunday 11:59 PM. Submit your sound-mixed edits in #assignments. Late submissions won't be reviewed in the live session.\n\nReminder: include both the project file AND exported MP4.",
    timestamp: "2:15 PM", isPinned: true,
    reactions: [{ emoji: "👍", count: 22, reacted: true }, { emoji: "💯", count: 5, reacted: false }],
    threadReplies: [],
  },
  {
    id: "ve-msg-3", channelId: "ve-announcements", authorId: "m-mentor", dateGroup: "March 5",
    content: "Great work on the Week 5 projects everyone! Special shoutout to Aarav, Priya, and Meera for exceptional audio work. The foley in Arjun's documentary was chef's kiss 💪",
    timestamp: "4:00 PM",
    reactions: [{ emoji: "❤️", count: 15, reacted: false }, { emoji: "🔥", count: 9, reacted: false }],
    threadReplies: [],
  },

  // ── #general-chat (8 messages, 1 thread with 4 replies) ──
  {
    id: "ve-msg-4", channelId: "ve-general-chat", authorId: "m-5", dateGroup: "Today",
    content: "Has anyone tried the new Premiere Pro update? The AI-assisted editing tools are pretty wild",
    timestamp: "11:45 AM",
    reactions: [{ emoji: "👍", count: 4, reacted: false }],
    threadReplies: [
      { id: "ve-tr-1", authorId: "m-7", content: "Yeah, the scene detection is way better now. Saved me hours on my last project!", timestamp: "11:52 AM" },
      { id: "ve-tr-2", authorId: "m-3", content: "I'm still team DaVinci Resolve tbh. The free version has everything I need 😄", timestamp: "12:05 PM" },
      { id: "ve-tr-3", authorId: "m-mentor", content: "Both are great tools. We'll cover Resolve's AI features in next week's session. Premiere's scene edit detection is excellent for rough cuts though.", timestamp: "12:18 PM" },
      { id: "ve-tr-4", authorId: "m-13", content: "Has anyone tried CapCut Pro for quick social media edits? Surprisingly powerful for the price.", timestamp: "12:30 PM" },
    ],
  },
  {
    id: "ve-msg-5", channelId: "ve-general-chat", authorId: "m-10", dateGroup: "Today",
    content: "Just finished watching the recording of Wednesday's session. The part about match cuts blew my mind 🤯",
    timestamp: "10:20 AM",
    reactions: [{ emoji: "🔥", count: 6, reacted: false }, { emoji: "💯", count: 3, reacted: false }],
    threadReplies: [],
  },
  {
    id: "ve-msg-6", channelId: "ve-general-chat", authorId: "m-ta", dateGroup: "Today",
    content: "Quick reminder: if you're having trouble with DaVinci crashing on export, make sure you're using the latest driver for your GPU. I've added a troubleshooting guide in #resources 🛠️",
    timestamp: "9:00 AM",
    reactions: [{ emoji: "👍", count: 11, reacted: true }],
    threadReplies: [],
  },
  {
    id: "ve-msg-7", channelId: "ve-general-chat", authorId: "m-1", dateGroup: "Yesterday",
    content: "Who else is staying up late working on Assignment 4? The sound mixing rabbit hole is real 😅",
    timestamp: "11:30 PM",
    reactions: [{ emoji: "😂", count: 14, reacted: true }, { emoji: "💯", count: 8, reacted: false }],
    threadReplies: [],
  },
  {
    id: "ve-msg-8", channelId: "ve-general-chat", authorId: "m-24", dateGroup: "Yesterday",
    content: "Anyone else's ears ringing after 6 hours of audio editing? 😂 Need to invest in better monitoring headphones.",
    timestamp: "9:15 PM",
    reactions: [{ emoji: "😂", count: 9, reacted: false }],
    threadReplies: [],
  },
  {
    id: "ve-msg-8b", channelId: "ve-general-chat", authorId: "m-7", dateGroup: "Yesterday",
    content: "Pro tip: Audio-Technica ATH-M50x are the sweet spot for editing. Flat response, comfortable, and under ₹12K.",
    timestamp: "9:25 PM",
    reactions: [{ emoji: "👍", count: 7, reacted: false }],
    threadReplies: [],
    link: { url: "https://amazon.in/audio-technica-m50x", label: "View on Amazon" },
  },
  {
    id: "ve-msg-8c", channelId: "ve-general-chat", authorId: "m-16", dateGroup: "March 5",
    content: "Just realized we're already in Week 6. Time flies when you're having fun (and pulling all-nighters editing) 🎬",
    timestamp: "7:00 PM",
    reactions: [{ emoji: "❤️", count: 12, reacted: false }, { emoji: "🔥", count: 5, reacted: false }],
    threadReplies: [],
  },
  {
    id: "ve-msg-8d", channelId: "ve-general-chat", authorId: "m-mentor", dateGroup: "March 5",
    content: "Proud of every single one of you. The growth I've seen from Week 1 to now is incredible. Keep pushing! 💪",
    timestamp: "5:30 PM",
    reactions: [{ emoji: "❤️", count: 24, reacted: true }, { emoji: "🔥", count: 11, reacted: false }],
    threadReplies: [],
  },

  // ── #session-links (2 messages with styled links) ──
  {
    id: "ve-msg-9", channelId: "ve-session-links", authorId: "m-ta", dateGroup: "Today",
    content: "🔴 LIVE NOW — Week 6, Session 1: Sound Design Fundamentals",
    timestamp: "6:55 PM",
    reactions: [{ emoji: "🔥", count: 12, reacted: false }],
    threadReplies: [],
    link: { url: "https://zoom.us/j/example", label: "Join Session — Sat 3 PM" },
  },
  {
    id: "ve-msg-10", channelId: "ve-session-links", authorId: "m-ta", dateGroup: "Yesterday",
    content: "Week 5 Session 3 recording is now available. Topic: Advanced Audio Mixing Techniques.",
    timestamp: "9:00 AM",
    reactions: [{ emoji: "👍", count: 8, reacted: false }],
    threadReplies: [],
    link: { url: "#", label: "Watch Recording" },
  },

  // ── #assignments (3 messages with attachments) ──
  {
    id: "ve-msg-11", channelId: "ve-assignments", authorId: "m-mentor", dateGroup: "March 5",
    content: "📝 **Assignment 4: Sound Design Challenge**\n\nDownload the silent footage from the link below. Add:\n1. Dialogue cleanup and EQ\n2. Foley sound effects\n3. Ambient soundscape\n4. Music bed (royalty-free)\n\nSubmit DaVinci project file + exported MP4. Deadline: Sunday 11:59 PM.",
    timestamp: "10:00 AM", isPinned: true,
    reactions: [{ emoji: "👍", count: 20, reacted: true }],
    threadReplies: [],
    attachment: { name: "Assignment4_SilentFootage.zip", size: "380 MB" },
  },
  {
    id: "ve-msg-12", channelId: "ve-assignments", authorId: "m-ta", dateGroup: "March 4",
    content: "📋 **Assignment 3 Results are out!**\n\nScores have been shared individually via email. Top 3 submissions:\n🥇 Priya Sharma — 94/100\n🥈 Arjun Nair — 91/100\n🥉 Meera Joshi — 89/100\n\nGreat work everyone!",
    timestamp: "3:00 PM",
    reactions: [{ emoji: "🔥", count: 18, reacted: false }, { emoji: "❤️", count: 12, reacted: false }],
    threadReplies: [],
    attachment: { name: "Assignment3_Feedback.pdf", size: "2.4 MB" },
  },
  {
    id: "ve-msg-13", channelId: "ve-assignments", authorId: "m-3", dateGroup: "Today",
    content: "Submitting my Assignment 4! The foley work was so much fun — recorded actual kitchen sounds for the cooking scene 🎨🔊",
    timestamp: "3:00 PM",
    reactions: [{ emoji: "❤️", count: 8, reacted: false }, { emoji: "🔥", count: 5, reacted: false }],
    threadReplies: [],
    image: courseCinematography,
  },

  // ── #project-showcase (4 messages with images, high reactions) ──
  {
    id: "ve-msg-14", channelId: "ve-project-showcase", authorId: "m-7", dateGroup: "Today",
    content: "Just wrapped my short documentary about street food vendors in Old Delhi. 3 weeks of shooting, 2 weeks of editing. Would love your honest feedback! 🎬\n\nThe sound design was all done using techniques from Week 5.",
    timestamp: "4:30 PM",
    reactions: [{ emoji: "🔥", count: 24, reacted: true }, { emoji: "❤️", count: 18, reacted: false }, { emoji: "💯", count: 9, reacted: false }],
    threadReplies: [
      { id: "ve-tr-5", authorId: "m-mentor", content: "Incredible work, Arjun! The pacing in the first act is perfect. The foley is natural — doesn't feel forced at all. Festival-ready quality.", timestamp: "5:15 PM" },
      { id: "ve-tr-6", authorId: "m-10", content: "This is so good! The ambient sounds really pull you into the scene. What mic setup did you use?", timestamp: "5:45 PM" },
    ],
    image: courseEditing,
  },
  {
    id: "ve-msg-15", channelId: "ve-project-showcase", authorId: "m-16", dateGroup: "Yesterday",
    content: "My first ever music video edit! 🎵 Shot on iPhone, edited in DaVinci. The beat sync technique Avinash taught us was a game changer.",
    timestamp: "2:00 PM",
    reactions: [{ emoji: "❤️", count: 31, reacted: true }, { emoji: "🔥", count: 14, reacted: false }],
    threadReplies: [],
    image: courseCinematography,
  },
  {
    id: "ve-msg-16", channelId: "ve-project-showcase", authorId: "m-1", dateGroup: "Yesterday",
    content: "Wedding highlight reel for my first paid client! 4 minutes, shot across 2 days. Feedback welcome 🙏",
    timestamp: "11:00 AM",
    reactions: [{ emoji: "🔥", count: 19, reacted: false }, { emoji: "❤️", count: 15, reacted: false }, { emoji: "💯", count: 7, reacted: false }],
    threadReplies: [],
    image: heroFilmmaking,
  },
  {
    id: "ve-msg-17", channelId: "ve-project-showcase", authorId: "m-22", dateGroup: "March 5",
    content: "Travel montage from my Rajasthan trip. Tried the invisible cut technique from Session 4 — let me know if you can spot them! 😄",
    timestamp: "6:00 PM",
    reactions: [{ emoji: "🔥", count: 11, reacted: false }, { emoji: "👍", count: 8, reacted: false }],
    threadReplies: [],
    image: courseCinematography,
  },

  // ── #off-topic (5 messages, casual, emoji reactions) ──
  {
    id: "ve-msg-18", channelId: "ve-off-topic", authorId: "m-13", dateGroup: "Today",
    content: "Just watched Lokesh Kanagaraj's latest — the editing in the climax is INSANE. How does Anthony cut like that?! 🤯",
    timestamp: "8:30 AM",
    reactions: [{ emoji: "🔥", count: 16, reacted: false }, { emoji: "💯", count: 8, reacted: true }],
    threadReplies: [],
  },
  {
    id: "ve-msg-19", channelId: "ve-off-topic", authorId: "m-6", dateGroup: "Yesterday",
    content: "Unpopular opinion: vertical video is perfectly fine for storytelling. Fight me 😂",
    timestamp: "9:00 PM",
    reactions: [{ emoji: "😂", count: 12, reacted: false }, { emoji: "👍", count: 4, reacted: false }],
    threadReplies: [],
  },
  {
    id: "ve-msg-20", channelId: "ve-off-topic", authorId: "m-11", dateGroup: "Yesterday",
    content: "Just realized I've spent more time organizing my footage library than actually editing this week 📁😅",
    timestamp: "4:30 PM",
    reactions: [{ emoji: "😂", count: 18, reacted: true }, { emoji: "💯", count: 6, reacted: false }],
    threadReplies: [],
  },
  {
    id: "ve-msg-21", channelId: "ve-off-topic", authorId: "m-20", dateGroup: "March 5",
    content: "Anyone else dream in timelines? I literally saw a J-cut in my sleep last night 😭",
    timestamp: "10:00 PM",
    reactions: [{ emoji: "😂", count: 22, reacted: false }, { emoji: "❤️", count: 5, reacted: false }],
    threadReplies: [],
  },
  {
    id: "ve-msg-22", channelId: "ve-off-topic", authorId: "m-9", dateGroup: "March 4",
    content: "Mumbai editors meetup this Saturday at Versova! DM me if you're in. Coffee's on me ☕",
    timestamp: "6:00 PM",
    reactions: [{ emoji: "🔥", count: 8, reacted: false }, { emoji: "👍", count: 6, reacted: false }],
    threadReplies: [],
  },

  // ── #wins ──
  {
    id: "ve-msg-23", channelId: "ve-wins", authorId: "m-1", dateGroup: "Today",
    content: "Got my first paid editing gig through a connection I made HERE in this batch! ₹15,000 for a wedding highlight reel. Thank you Batch 4 fam! 🎉🎊",
    timestamp: "2:00 PM",
    reactions: [{ emoji: "🔥", count: 25, reacted: true }, { emoji: "❤️", count: 19, reacted: false }, { emoji: "💯", count: 12, reacted: false }],
    threadReplies: [],
  },

  // ── #introductions ──
  {
    id: "ve-msg-24", channelId: "ve-introductions", authorId: "m-mentor", dateGroup: "February 20",
    content: "Welcome to Video Editing Academy — Batch 4! 🎬\n\nI'm Avinash, your lead mentor. I've been editing professionally for 12 years, working on feature films, documentaries, and brand content.\n\nDrop your intro below — tell us your name, where you're from, and what got you into video editing.",
    timestamp: "10:00 AM", isPinned: true,
    reactions: [{ emoji: "❤️", count: 27, reacted: true }, { emoji: "🔥", count: 15, reacted: false }],
    threadReplies: [],
  },
  {
    id: "ve-msg-25", channelId: "ve-introductions", authorId: "m-1", dateGroup: "February 20",
    content: "Hey everyone! I'm Aarav from Pune. Started editing vlogs for fun and now I want to go professional. Excited to learn from all of you! 🙌",
    timestamp: "11:30 AM",
    reactions: [{ emoji: "👍", count: 8, reacted: false }],
    threadReplies: [],
  },

  // ── #resources ──
  {
    id: "ve-msg-26", channelId: "ve-resources", authorId: "m-ta", dateGroup: "March 5",
    content: "📚 Essential resources for Week 6:\n\n• Sound Design for Film — Free PDF Guide\n• Royalty-free SFX library (10,000+ sounds)\n• Recommended monitoring headphones list",
    timestamp: "9:00 AM",
    reactions: [{ emoji: "👍", count: 16, reacted: false }],
    threadReplies: [],
    attachment: { name: "Week6_SoundResources.zip", size: "85 MB" },
  },

  // ── #doubts-and-questions ──
  {
    id: "ve-msg-27", channelId: "ve-doubts-and-questions", authorId: "m-8", dateGroup: "Today",
    content: "How do I reduce room echo in dialogue recordings without making it sound robotic? Using DaVinci Fairlight.",
    timestamp: "1:30 PM",
    reactions: [],
    threadReplies: [
      { id: "ve-tr-7", authorId: "m-ta", content: "Use the De-Reverb plugin in Fairlight — start with a light setting (around 30%) and increase gradually. Also try the Noise Gate to cut silence between dialogue.", timestamp: "1:45 PM" },
    ],
  },
  {
    id: "ve-msg-28", channelId: "ve-doubts-and-questions", authorId: "m-14", dateGroup: "Yesterday",
    content: "What's the best way to sync external audio with camera audio? I'm using a Zoom H6 recorder.",
    timestamp: "3:00 PM",
    reactions: [{ emoji: "👍", count: 3, reacted: false }],
    threadReplies: [
      { id: "ve-tr-8", authorId: "m-mentor", content: "Use DaVinci's auto-sync feature: select both clips → right-click → Auto Align. Works based on waveform matching. For best results, always clap at the start of each take!", timestamp: "3:20 PM" },
    ],
  },

  // ── #collabs ──
  {
    id: "ve-msg-29", channelId: "ve-collabs", authorId: "m-9", dateGroup: "Yesterday",
    content: "Looking for a sound designer for my short film project. It's a 7-min drama, already picture-locked. Anyone interested? 🎧",
    timestamp: "6:00 PM",
    reactions: [{ emoji: "👍", count: 3, reacted: false }],
    threadReplies: [],
  },

  // ── #feedback-requests ──
  {
    id: "ve-msg-30", channelId: "ve-feedback-requests", authorId: "m-4", dateGroup: "Today",
    content: "Can someone review my rough cut before I submit? It's a 3-min edit, I'm specifically struggling with the audio transition at 1:24. Link in thread 👇",
    timestamp: "4:00 PM",
    reactions: [{ emoji: "👍", count: 5, reacted: false }],
    threadReplies: [
      { id: "ve-tr-9", authorId: "m-7", content: "Just watched it — the audio crossfade at 1:24 is too abrupt. Try a 0.5s exponential fade instead of linear. Also, the ambient bed drops out completely.", timestamp: "4:20 PM" },
    ],
  },

  // ── #work-in-progress ──
  {
    id: "ve-msg-31", channelId: "ve-work-in-progress", authorId: "m-20", dateGroup: "Yesterday",
    content: "Working on a travel edit from my recent Goa trip. Still rough but the color grade and sound design are coming together nicely 🌊",
    timestamp: "3:00 PM",
    reactions: [{ emoji: "🔥", count: 8, reacted: false }, { emoji: "❤️", count: 6, reacted: false }],
    threadReplies: [],
    image: courseCinematography,
  },
];


// ══════════════════════════════════════════════
// BATCH 2: Filmmaking Intensive — Batch 2
// ══════════════════════════════════════════════

const fmMembers: BatchMember[] = [
  { id: "fm-mentor", name: "Raghav", avatar: instructor1, role: "mentor", level: 10, isOnline: true },
  { id: "fm-1", name: "Aisha Khan", avatar: instructor2, role: "student", level: 3, isOnline: true },
  { id: "fm-2", name: "Siddharth Nair", avatar: instructor1, role: "student", level: 4, isOnline: false },
  { id: "fm-3", name: "Lakshmi Iyer", avatar: instructor2, role: "student", level: 2, isOnline: true },
  { id: "fm-4", name: "Rajesh Pillai", avatar: instructor1, role: "student", level: 5, isOnline: false },
  { id: "fm-5", name: "Tanya Verma", avatar: instructor2, role: "student", level: 3, isOnline: false },
  { id: "fm-6", name: "Manish Gupta", avatar: instructor1, role: "student", level: 2, isOnline: true },
  { id: "fm-7", name: "Neha Sharma", avatar: instructor2, role: "student", level: 4, isOnline: false },
  { id: "fm-8", name: "Pranav Desai", avatar: instructor1, role: "student", level: 3, isOnline: false },
  { id: "fm-9", name: "Swati Reddy", avatar: instructor2, role: "student", level: 2, isOnline: true },
  { id: "fm-10", name: "Gaurav Mehta", avatar: instructor1, role: "student", level: 3, isOnline: false },
  { id: "fm-11", name: "Roshni Kapoor", avatar: instructor2, role: "student", level: 4, isOnline: false },
  { id: "fm-12", name: "Ankit Joshi", avatar: instructor1, role: "student", level: 2, isOnline: false },
  { id: "fm-13", name: "Pallavi Das", avatar: instructor2, role: "student", level: 3, isOnline: true },
  { id: "fm-14", name: "Vishal Thakkar", avatar: instructor1, role: "student", level: 2, isOnline: false },
];

const fmChannels: BatchChannel[] = [
  { id: "fm-announcements", name: "announcements", category: "GENERAL", description: "Official updates from the mentor", isLocked: true, unreadCount: 1, isUnread: true },
  { id: "fm-general-chat", name: "general-chat", category: "GENERAL", description: "Open discussion", unreadCount: 3, isUnread: true },
  { id: "fm-introductions", name: "introductions", category: "GENERAL", description: "Introduce yourself!", unreadCount: 0, isUnread: false },
  { id: "fm-session-links", name: "session-links", category: "LEARNING", description: "Session links and recordings", unreadCount: 1, isUnread: true },
  { id: "fm-assignments", name: "assignments", category: "LEARNING", description: "Assignment briefs", unreadCount: 0, isUnread: false },
  { id: "fm-project-showcase", name: "project-showcase", category: "SHOWCASE", description: "Share your projects", unreadCount: 0, isUnread: false },
  { id: "fm-off-topic", name: "off-topic", category: "SOCIAL", description: "Off-topic fun", unreadCount: 0, isUnread: false },
];

const fmMessages: BatchMessage[] = [
  {
    id: "fm-msg-1", channelId: "fm-announcements", authorId: "fm-mentor", dateGroup: "Today",
    content: "📋 **Week 3 Update:**\n\nWe'll be covering pre-production planning this week. Come prepared with your short film concepts!\n\nSaturday — Storyboarding Workshop (4 PM)\nSunday — Script Table Read (5 PM)",
    timestamp: "9:00 AM", isPinned: true,
    reactions: [{ emoji: "👍", count: 11, reacted: false }, { emoji: "🔥", count: 4, reacted: false }],
    threadReplies: [],
  },
  {
    id: "fm-msg-2", channelId: "fm-general-chat", authorId: "fm-1", dateGroup: "Today",
    content: "Super excited for the storyboarding workshop! I've been sketching out my concept all week 🎨",
    timestamp: "10:30 AM",
    reactions: [{ emoji: "🔥", count: 5, reacted: false }],
    threadReplies: [],
  },
  {
    id: "fm-msg-3", channelId: "fm-general-chat", authorId: "fm-mentor", dateGroup: "Today",
    content: "Quick tip: for your storyboards, focus on camera angles and movement. Don't worry about artistic quality — stick figures are totally fine! The goal is shot planning.",
    timestamp: "11:00 AM",
    reactions: [{ emoji: "👍", count: 8, reacted: false }, { emoji: "💯", count: 3, reacted: false }],
    threadReplies: [],
  },
  {
    id: "fm-msg-4", channelId: "fm-general-chat", authorId: "fm-4", dateGroup: "Yesterday",
    content: "Just watched the Kurosawa analysis video Raghav shared. The way he uses weather as a narrative device is brilliant.",
    timestamp: "7:00 PM",
    reactions: [{ emoji: "❤️", count: 6, reacted: false }],
    threadReplies: [],
  },
  {
    id: "fm-msg-5", channelId: "fm-session-links", authorId: "fm-mentor", dateGroup: "Today",
    content: "🔴 Join today's session: Storyboarding Workshop",
    timestamp: "3:50 PM",
    reactions: [{ emoji: "🔥", count: 7, reacted: false }],
    threadReplies: [],
    link: { url: "https://zoom.us/j/filmmaking", label: "Join Session — Sat 4 PM" },
  },
  {
    id: "fm-msg-6", channelId: "fm-assignments", authorId: "fm-mentor", dateGroup: "March 4",
    content: "📝 **Assignment 2: Write a 3-page screenplay**\n\nGenre: Your choice. Must include at least 3 distinct locations and 2 characters. Due by Friday.",
    timestamp: "10:00 AM",
    reactions: [{ emoji: "👍", count: 9, reacted: false }],
    threadReplies: [],
    attachment: { name: "Screenplay_Template.pdf", size: "1.2 MB" },
  },
  {
    id: "fm-msg-7", channelId: "fm-project-showcase", authorId: "fm-3", dateGroup: "Yesterday",
    content: "Here's my first short film concept art and mood board! Going for a neo-noir vibe set in Kochi backwaters 🌙",
    timestamp: "5:00 PM",
    reactions: [{ emoji: "🔥", count: 10, reacted: false }, { emoji: "❤️", count: 7, reacted: false }],
    threadReplies: [],
    image: heroFilmmaking,
  },
];


// ── Cohort exports ──

export const batchCohorts: BatchCohort[] = [
  {
    id: "batch-ve-4",
    name: "Video Editing Academy",
    batchNumber: 4,
    memberCount: 27,
    nextSession: "Sat 3 PM",
    unreadCount: 18,
    image: courseEditing,
    members: veMembers,
    channels: veChannels,
    messages: veMessages,
  },
  {
    id: "batch-fm-2",
    name: "Filmmaking Intensive",
    batchNumber: 2,
    memberCount: 16,
    nextSession: "Sat 4 PM",
    unreadCount: 5,
    image: heroFilmmaking,
    members: fmMembers,
    channels: fmChannels,
    messages: fmMessages,
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
