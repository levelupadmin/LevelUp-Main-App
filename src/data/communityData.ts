import instructor1 from "@/assets/instructor-1.jpg";
import instructor2 from "@/assets/instructor-2.jpg";

// ── Channel types ──
export interface Channel {
  id: string;
  label: string;
  icon: string; // emoji
  unread?: number;
  pinned?: boolean;
}

export interface ChannelMessage {
  id: string;
  author: string;
  avatar: string;
  role?: string;
  content: string;
  timeAgo: string;
  likes: number;
  replies: number;
  pinned?: boolean;
}

// ── Cohort Community ──
export interface CohortCommunity {
  id: string;
  cohortId: string;
  title: string;
  batchLabel: string;
  memberCount: number;
  channels: Channel[];
}

export const cohortChannels: Channel[] = [
  { id: "welcome", label: "Welcome", icon: "👋", pinned: true },
  { id: "rules", label: "Rules", icon: "📋", pinned: true },
  { id: "announcements", label: "Announcements", icon: "📢", unread: 2 },
  { id: "live-class-alerts", label: "Live Class Alerts", icon: "🔴", unread: 1 },
  { id: "calendar", label: "Calendar", icon: "📅" },
  { id: "replay-vault", label: "Replay Vault", icon: "🎬" },
  { id: "assignments", label: "Assignments", icon: "📝", unread: 1 },
  { id: "qa", label: "Q&A", icon: "❓", unread: 3 },
  { id: "lounge", label: "Lounge", icon: "☕" },
  { id: "introduce-yourself", label: "Introduce Yourself", icon: "🙋" },
  { id: "ask-mentors", label: "Ask Mentors", icon: "🧑‍🏫" },
  { id: "support", label: "Support / Tech Help", icon: "🛠️" },
];

export const cohortCommunities: CohortCommunity[] = [
  {
    id: "cc-1",
    cohortId: "cohort-2",
    title: "Professional Video Editing Bootcamp",
    batchLabel: "Batch 3 — 2026",
    memberCount: 25,
    channels: cohortChannels,
  },
];

// ── City Communities ──
export interface CityCommunity {
  id: string;
  slug: string;
  name: string;
  memberCount: number;
  description: string;
  channels: Channel[];
}

export const cityChannels: Channel[] = [
  { id: "overview", label: "Overview", icon: "🏠" },
  { id: "discussions", label: "Discussions", icon: "💬", unread: 5 },
  { id: "showcase", label: "Showcase", icon: "🖼️" },
  { id: "feedback", label: "Feedback", icon: "🎯" },
  { id: "resources", label: "Resources", icon: "📚" },
  { id: "collaborations", label: "Collaborations", icon: "🤝", unread: 2 },
  { id: "opportunities", label: "Opportunities", icon: "💼" },
  { id: "meetups", label: "Meetups", icon: "📍", unread: 1 },
];

export const cityCommunities: CityCommunity[] = [
  { id: "city-chennai", slug: "chennai", name: "Chennai", memberCount: 342, description: "Connect with creators in Chennai — from Kollywood to indie filmmaking.", channels: cityChannels },
  { id: "city-bangalore", slug: "bangalore", name: "Bangalore", memberCount: 518, description: "Bangalore's vibrant creator community — tech meets art.", channels: cityChannels },
  { id: "city-mumbai", slug: "mumbai", name: "Mumbai", memberCount: 891, description: "The heart of Indian cinema and content creation.", channels: cityChannels },
  { id: "city-hyderabad", slug: "hyderabad", name: "Hyderabad", memberCount: 276, description: "Telugu cinema powerhouse and growing creator hub.", channels: cityChannels },
  { id: "city-kochi", slug: "kochi", name: "Kochi", memberCount: 198, description: "Kerala's creative capital — storytelling rooted in culture.", channels: cityChannels },
];

// ── Skill Communities ──
export interface SkillCommunity {
  id: string;
  slug: string;
  name: string;
  memberCount: number;
  description: string;
  channels: Channel[];
}

export const skillChannels: Channel[] = [
  { id: "overview", label: "Overview", icon: "🏠" },
  { id: "discussions", label: "Discussions", icon: "💬", unread: 8 },
  { id: "showcase", label: "Showcase", icon: "🖼️", unread: 3 },
  { id: "feedback", label: "Feedback", icon: "🎯" },
  { id: "resources", label: "Resources", icon: "📚" },
  { id: "collaborations", label: "Collaborations", icon: "🤝" },
  { id: "opportunities", label: "Opportunities", icon: "💼", unread: 1 },
];

export const skillCommunities: SkillCommunity[] = [
  { id: "skill-filmmaking", slug: "filmmaking", name: "Filmmaking", memberCount: 1240, description: "For everyone who breathes cinema — from shorts to features.", channels: skillChannels },
  { id: "skill-editing", slug: "editing", name: "Editing", memberCount: 980, description: "Editors shaping stories one cut at a time.", channels: skillChannels },
  { id: "skill-cinematography", slug: "cinematography", name: "Cinematography", memberCount: 756, description: "The art of visual storytelling through the lens.", channels: skillChannels },
  { id: "skill-content", slug: "content-creation", name: "Content Creation", memberCount: 1580, description: "Reels, YouTube, podcasts — creating for the internet.", channels: skillChannels },
  { id: "skill-writing", slug: "writing", name: "Writing", memberCount: 620, description: "Screenwriters, scriptwriters, and storytellers.", channels: skillChannels },
  { id: "skill-design", slug: "design", name: "Design", memberCount: 430, description: "Visual design for film, content, and brands.", channels: skillChannels },
  { id: "skill-music", slug: "music", name: "Music", memberCount: 340, description: "Scoring, sound design, and music production.", channels: skillChannels },
];

// ── Channel mock messages ──
export const mockChannelMessages: Record<string, ChannelMessage[]> = {
  welcome: [
    { id: "m1", author: "LevelUp Team", avatar: instructor1, role: "Admin", content: "Welcome to the community! 🎉 Introduce yourself in #introduce-yourself and start connecting with fellow creators.", timeAgo: "2 days ago", likes: 24, replies: 0, pinned: true },
  ],
  announcements: [
    { id: "m2", author: "Priya Sharma", avatar: instructor2, role: "Mentor", content: "📢 Week 3 live session rescheduled to Thursday 7 PM. Please update your calendars!", timeAgo: "3h ago", likes: 8, replies: 2, pinned: true },
    { id: "m3", author: "LevelUp Team", avatar: instructor1, role: "Admin", content: "New resource added to the Replay Vault — Week 2 Color Grading session is now available.", timeAgo: "1 day ago", likes: 15, replies: 1 },
  ],
  discussions: [
    { id: "m4", author: "Vikram Das", avatar: instructor1, content: "What's everyone working on this weekend? I'm shooting a short doc about street food vendors in my neighborhood.", timeAgo: "2h ago", likes: 12, replies: 8 },
    { id: "m5", author: "Ananya Iyer", avatar: instructor2, content: "Just discovered this incredible free LUT pack for DaVinci Resolve. Will share the link in #resources!", timeAgo: "5h ago", likes: 18, replies: 4 },
    { id: "m6", author: "Rohit Nair", avatar: instructor1, content: "Anyone here from the Batch 2 editing cohort? Would love to connect and share reels.", timeAgo: "8h ago", likes: 6, replies: 3 },
  ],
  qa: [
    { id: "m7", author: "Sneha Patel", avatar: instructor2, content: "How do you handle audio sync issues when shooting with external recorders? My Zoom H6 keeps drifting.", timeAgo: "1h ago", likes: 4, replies: 7 },
    { id: "m8", author: "Aditya Kumar", avatar: instructor1, content: "Best export settings for Instagram Reels? I keep getting quality loss on upload.", timeAgo: "4h ago", likes: 9, replies: 11 },
  ],
  showcase: [
    { id: "m9", author: "Riya Desai", avatar: instructor2, content: "Just finished my first color-graded short! 🎨 Feedback welcome. Shot on Sony A7III, graded in DaVinci.", timeAgo: "6h ago", likes: 32, replies: 14 },
    { id: "m10", author: "Sameer Khan", avatar: instructor1, content: "My documentary project from the filmmaking cohort got selected for a local film festival! 🏆", timeAgo: "1 day ago", likes: 56, replies: 22 },
  ],
  lounge: [
    { id: "m11", author: "Kavya Singh", avatar: instructor2, content: "Unpopular opinion: vertical video is the future and we should embrace it, not fight it. 😅", timeAgo: "30m ago", likes: 14, replies: 19 },
    { id: "m12", author: "Rohan Gupta", avatar: instructor1, content: "What's everyone watching this week? Need recommendations for well-edited series.", timeAgo: "3h ago", likes: 8, replies: 12 },
  ],
};

// ── Creator Directory ──
export interface DirectoryCreator {
  id: string;
  name: string;
  role: string;
  city: string;
  experience: string;
  experienceLevel: "Beginner" | "Intermediate" | "Advanced" | "Expert";
  avatar: string;
  description: string;
  skills: string[];
  available: boolean;
  portfolioUrl?: string;
  notableWork?: string;
}

export const directoryCreators: DirectoryCreator[] = [
  { id: "dc-1", name: "Meera Krishnan", role: "Cinematographer", city: "Mumbai", experience: "8 years", experienceLevel: "Expert", avatar: instructor2, description: "Shot 3 national award-winning documentaries. Specializes in natural light.", skills: ["Cinema Camera", "Lighting", "Color Science", "Documentary"], available: true, portfolioUrl: "https://meera.film", notableWork: "National Award — Best Cinematography 2024" },
  { id: "dc-2", name: "Aditya Verma", role: "Video Editor", city: "Bangalore", experience: "5 years", experienceLevel: "Advanced", avatar: instructor1, description: "Lead editor at a top Mumbai post-production house. Fast-paced narrative edits.", skills: ["DaVinci Resolve", "Premiere Pro", "After Effects", "Color Grading"], available: true, portfolioUrl: "https://adityaverma.in" },
  { id: "dc-3", name: "Sneha Patel", role: "Content Creator", city: "Chennai", experience: "3 years", experienceLevel: "Intermediate", avatar: instructor2, description: "500K+ subscribers on YouTube. Cinematic travel vlogs and brand films.", skills: ["YouTube", "Brand Films", "Travel", "Reels"], available: false },
  { id: "dc-4", name: "Arjun Reddy", role: "Filmmaker", city: "Hyderabad", experience: "10 years", experienceLevel: "Expert", avatar: instructor1, description: "Independent filmmaker with 4 short films at international festivals.", skills: ["Directing", "Screenwriting", "Film Production"], available: true, notableWork: "Official Selection — Cannes Court Métrage 2025" },
  { id: "dc-5", name: "Priya Nair", role: "Sound Designer", city: "Kochi", experience: "6 years", experienceLevel: "Advanced", avatar: instructor2, description: "Designed sound for 12+ indie features. Building India's open-source SFX library.", skills: ["Pro Tools", "Foley", "Film Sound", "Music Production"], available: true },
  { id: "dc-6", name: "Rahul Sharma", role: "Content Creator", city: "Mumbai", experience: "2 years", experienceLevel: "Intermediate", avatar: instructor1, description: "Rising creator focused on educational content about filmmaking techniques.", skills: ["YouTube", "Instagram", "Content Strategy"], available: true },
  { id: "dc-7", name: "Kavita Desai", role: "Screenwriter", city: "Mumbai", experience: "7 years", experienceLevel: "Advanced", avatar: instructor2, description: "Written for 3 web series and 2 feature films. Mentors emerging writers.", skills: ["Screenwriting", "Story Development", "Dialogue", "Writing"], available: false },
  { id: "dc-8", name: "Vikash Gupta", role: "Cinematographer", city: "Bangalore", experience: "4 years", experienceLevel: "Intermediate", avatar: instructor1, description: "Commercial DP specializing in product films and brand campaigns.", skills: ["Lighting", "Commercial", "Product Films", "Cinema Camera"], available: true },
  { id: "dc-9", name: "Ananya Krishnamurthy", role: "Designer", city: "Chennai", experience: "5 years", experienceLevel: "Advanced", avatar: instructor2, description: "Motion graphics and title design for film and OTT platforms.", skills: ["After Effects", "Motion Graphics", "Title Design", "Design"], available: true },
  { id: "dc-10", name: "Sameer Joshi", role: "Video Editor", city: "Hyderabad", experience: "1 year", experienceLevel: "Beginner", avatar: instructor1, description: "Film school graduate passionate about documentary editing.", skills: ["Premiere Pro", "Documentary", "Color Grading"], available: true },
];

export const directoryFilters = {
  cities: ["Mumbai", "Bangalore", "Chennai", "Hyderabad", "Kochi"],
  skills: ["Filmmaking", "Editing", "Cinematography", "Content Creation", "Writing", "Design", "Music", "Sound Design"],
  roles: ["Filmmaker", "Cinematographer", "Video Editor", "Content Creator", "Sound Designer", "Screenwriter", "Designer"],
  experienceLevels: ["Beginner", "Intermediate", "Advanced", "Expert"] as const,
  availability: ["Available", "Not Available"] as const,
};
