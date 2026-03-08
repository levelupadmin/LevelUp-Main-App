import instructor1 from "@/assets/instructor-1.jpg";
import instructor2 from "@/assets/instructor-2.jpg";
import courseEditing from "@/assets/course-editing.jpg";
import courseCinematography from "@/assets/course-cinematography.jpg";
import courseContent from "@/assets/course-content.jpg";
import heroImage from "@/assets/hero-filmmaking.jpg";

export const heroData = {
  image: heroImage,
  title: "Master the Craft of Filmmaking",
  subtitle: "Learn from India's top creative minds",
};

export const courses = [
  {
    id: "1",
    title: "The Art of Cinematic Storytelling",
    instructor: "Rajiv Menon",
    instructorImage: instructor1,
    thumbnail: courseCinematography,
    category: "Filmmaking",
    rating: 4.9,
    students: 2340,
    lessons: 24,
    duration: "4h 30m",
    price: 1999,
    isSubscription: true,
    progress: 45,
  },
  {
    id: "2",
    title: "Professional Video Editing Masterclass",
    instructor: "Priya Sharma",
    instructorImage: instructor2,
    thumbnail: courseEditing,
    category: "Editing",
    rating: 4.8,
    students: 1890,
    lessons: 32,
    duration: "6h 15m",
    price: 2499,
    isSubscription: true,
    progress: 0,
  },
  {
    id: "3",
    title: "Content Creation for Social Media",
    instructor: "Arjun Kapoor",
    instructorImage: instructor1,
    thumbnail: courseContent,
    category: "Content Creation",
    rating: 4.7,
    students: 3210,
    lessons: 18,
    duration: "3h 20m",
    price: 1499,
    isSubscription: true,
    progress: 0,
  },
  {
    id: "4",
    title: "Cinematography Fundamentals",
    instructor: "Nandini Reddy",
    instructorImage: instructor2,
    thumbnail: courseCinematography,
    category: "Cinematography",
    rating: 4.9,
    students: 1560,
    lessons: 20,
    duration: "5h 10m",
    price: 1999,
    isSubscription: true,
    progress: 72,
  },
];

export const workshops = [
  {
    id: "w1",
    title: "Intro to Color Grading",
    instructor: "Priya Sharma",
    date: "Mar 15, 2026",
    time: "7:00 PM IST",
    price: 99,
    seats: 12,
    totalSeats: 50,
    category: "Editing",
  },
  {
    id: "w2",
    title: "Mobile Filmmaking Basics",
    instructor: "Arjun Kapoor",
    date: "Mar 18, 2026",
    time: "6:30 PM IST",
    price: 149,
    seats: 28,
    totalSeats: 50,
    category: "Filmmaking",
  },
  {
    id: "w3",
    title: "Sound Design for Short Films",
    instructor: "Rajiv Menon",
    date: "Mar 22, 2026",
    time: "7:00 PM IST",
    price: 199,
    seats: 5,
    totalSeats: 30,
    category: "Sound",
  },
];

export const categories = [
  { id: "filmmaking", label: "Filmmaking", icon: "🎬", count: 8 },
  { id: "editing", label: "Editing", icon: "✂️", count: 12 },
  { id: "cinematography", label: "Cinematography", icon: "📷", count: 6 },
  { id: "content", label: "Content Creation", icon: "📱", count: 10 },
  { id: "design", label: "Design", icon: "🎨", count: 5 },
  { id: "music", label: "Music", icon: "🎵", count: 4 },
];

export const communityPosts = [
  {
    id: "p1",
    author: "Vikram Das",
    authorLevel: "Creator",
    avatar: instructor1,
    content: "Just finished my first short film using techniques from the Cinematography course! Check it out 🎬",
    likes: 42,
    comments: 8,
    timeAgo: "2h ago",
    tag: "Show & Tell",
  },
  {
    id: "p2",
    author: "Ananya Iyer",
    authorLevel: "Apprentice",
    avatar: instructor2,
    content: "Day 14 of my editing streak! The color grading module completely changed how I approach post-production. 🔥",
    likes: 28,
    comments: 5,
    timeAgo: "4h ago",
    tag: "Progress",
  },
  {
    id: "p3",
    author: "Rohit Nair",
    authorLevel: "Professional",
    avatar: instructor1,
    content: "Looking for a sound designer for a documentary project in Mumbai. DM if interested!",
    likes: 15,
    comments: 12,
    timeAgo: "6h ago",
    tag: "Collaboration",
  },
];

export const talentDirectory = [
  {
    id: "t1",
    name: "Meera Krishnan",
    role: "Cinematographer",
    city: "Mumbai",
    avatar: instructor2,
    level: "Professional",
    available: true,
    skills: ["Cinema Camera", "Lighting", "Color Science"],
    projectCount: 14,
  },
  {
    id: "t2",
    name: "Aditya Verma",
    role: "Video Editor",
    city: "Bangalore",
    avatar: instructor1,
    level: "Craftsperson",
    available: true,
    skills: ["DaVinci Resolve", "Premiere Pro", "After Effects"],
    projectCount: 23,
  },
  {
    id: "t3",
    name: "Sneha Patel",
    role: "Content Creator",
    city: "Delhi",
    avatar: instructor2,
    level: "Creator",
    available: false,
    skills: ["Reels", "YouTube", "Brand Collab"],
    projectCount: 8,
  },
];

export const userProfile = {
  name: "Arjun Mehta",
  bio: "Aspiring filmmaker | Learning cinematography | Mumbai 🎬",
  avatar: instructor1,
  level: "Apprentice",
  xp: 1240,
  xpToNext: 2000,
  streak: 12,
  coursesCompleted: 2,
  coursesInProgress: 2,
  badges: [
    { id: "b1", name: "First Lesson", icon: "🎯", earned: true },
    { id: "b2", name: "7-Day Streak", icon: "🔥", earned: true },
    { id: "b3", name: "First Upload", icon: "📤", earned: true },
    { id: "b4", name: "Community Star", icon: "⭐", earned: false },
    { id: "b5", name: "Portfolio Pro", icon: "💼", earned: false },
    { id: "b6", name: "Mentor", icon: "🧑‍🏫", earned: false },
  ],
  creatorLevel: 2,
  totalLevels: 6,
  levelName: "Apprentice",
  levelNames: ["Explorer", "Apprentice", "Creator", "Craftsperson", "Professional", "Master"],
};

export const dailyChallenge = {
  title: "Capture a 15-second golden hour clip",
  category: "Cinematography",
  xpReward: 50,
  participants: 234,
  timeLeft: "8h 32m",
};
