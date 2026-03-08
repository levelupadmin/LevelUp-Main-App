import instructor1 from "@/assets/instructor-1.jpg";
import instructor2 from "@/assets/instructor-2.jpg";
import courseEditing from "@/assets/course-editing.jpg";
import courseCinematography from "@/assets/course-cinematography.jpg";
import courseContent from "@/assets/course-content.jpg";
import mcKarthik from "@/assets/mc-karthik-subbaraj.png";
import mcAnthony from "@/assets/mc-anthony-gonsalvez.png";
import mcVenketRam from "@/assets/mc-venket-ram.png";
import mcDrkKiran from "@/assets/mc-drk-kiran.webp";
import mcRaviBasrur from "@/assets/mc-ravi-basrur.webp";
import mcLokesh from "@/assets/mc-lokesh-kanagaraj.png";
import mcNelson from "@/assets/mc-nelson-dilipkumar.jpg";
import mcComingSoon from "@/assets/mc-coming-soon.jpg";

export type Difficulty = "Beginner" | "Intermediate" | "Advanced";
export type LessonState = "not_started" | "in_progress" | "completed";

export interface MicroActivity {
  id: string;
  type: "quiz" | "reflection" | "upload" | "poll";
  prompt: string;
  options?: string[];
  submitted?: boolean;
  answer?: string;
}

export interface Lesson {
  id: string;
  courseId: string;
  moduleIndex: number;
  title: string;
  duration: string;
  videoProgress: number;
  state: LessonState;
  notes: string;
  microActivity: MicroActivity;
  isFree?: boolean;
}

export interface CourseModule {
  title: string;
  lessons: Lesson[];
}

export interface Review {
  id: string;
  author: string;
  avatar: string;
  rating: number;
  text: string;
  date: string;
}

export interface CourseDetailed {
  id: string;
  title: string;
  subtitle: string;
  instructor: string;
  instructorBio: string;
  instructorImage: string;
  thumbnail: string;
  cardImage?: string;
  category: string;
  difficulty: Difficulty;
  format: "Masterclass" | "Cohort" | "Workshop";
  rating: number;
  ratingsCount: number;
  students: number;
  duration: string;
  lessonsCount: number;
  price: number;
  subscriptionPrice: number;
  isSubscription: boolean;
  progress: number;
  purchased: boolean;
  subscribed: boolean;
  description: string;
  highlights: string[];
  skills: string[];
  modules: CourseModule[];
  reviews: Review[];
  sampleProjects: { title: string; image: string }[];
  lastLessonId?: string;
}

// ── Workshop types ──
export interface Workshop {
  id: string;
  title: string;
  instructor: string;
  instructorBio: string;
  instructorImage: string;
  thumbnail: string;
  category: string;
  description: string;
  highlights: string[];
  date: string;
  time: string;
  duration: string;
  price: number;
  seatsTotal: number;
  seatsRemaining: number;
  isPast: boolean;
  hasReplay: boolean;
  testimonials: { author: string; text: string }[];
  faq: { question: string; answer: string }[];
}

const makeLesson = (
  id: string,
  courseId: string,
  moduleIndex: number,
  title: string,
  duration: string,
  state: LessonState = "not_started",
  videoProgress = 0,
  isFree = false
): Lesson => ({
  id,
  courseId,
  moduleIndex,
  title,
  duration,
  videoProgress,
  state,
  isFree,
  notes: `Key takeaways from "${title}":\n• Focus on practical application\n• Review the reference materials\n• Practice the technique before moving on`,
  microActivity: {
    id: `ma-${id}`,
    type: moduleIndex % 4 === 0 ? "quiz" : moduleIndex % 4 === 1 ? "reflection" : moduleIndex % 4 === 2 ? "upload" : "poll",
    prompt:
      moduleIndex % 4 === 0
        ? "Which framing technique works best for establishing shots?"
        : moduleIndex % 4 === 1
        ? "Reflect on how you'd apply this technique to your next project."
        : moduleIndex % 4 === 2
        ? "Upload a 15-second clip applying the technique from this lesson."
        : "Which editing style resonated with you the most?",
    options:
      moduleIndex % 4 === 0
        ? ["Wide angle", "Close-up", "Dutch angle", "Bird's eye"]
        : moduleIndex % 4 === 3
        ? ["Jump cuts", "Match cuts", "L-cuts", "Montage"]
        : undefined,
    submitted: state === "completed",
  },
});

export const detailedCourses: CourseDetailed[] = [
  {
    id: "1",
    title: "The Art of Cinematic Storytelling",
    subtitle: "Storytelling to editing to working with actors",
    instructor: "Karthik Subbaraj",
    instructorBio: "Award-winning filmmaker known for Petta, Jigarthanda, and Pizza. Master of genre filmmaking in Indian cinema.",
    instructorImage: instructor1,
    thumbnail: courseCinematography,
    cardImage: mcKarthik,
    category: "Filmmaking",
    difficulty: "Intermediate",
    format: "Masterclass",
    rating: 4.9,
    ratingsCount: 847,
    students: 2340,
    duration: "4h 30m",
    lessonsCount: 21,
    price: 1999,
    subscriptionPrice: 499,
    isSubscription: true,
    progress: 45,
    purchased: true,
    subscribed: false,
    description: "Learn the core principles of cinematic storytelling — from finding your story to crafting sequences that hold audiences. This masterclass covers narrative structure, visual grammar, directing actors, and post-production storytelling.",
    highlights: [
      "21 in-depth video lessons",
      "Hands-on micro-activities after every lesson",
      "Direct feedback from Rajiv Menon",
      "Certificate of completion",
      "Lifetime access + community",
    ],
    skills: ["Storytelling", "Directing", "Visual Grammar", "Narrative Structure", "Post-Production"],
    lastLessonId: "1-8",
    modules: [
      {
        title: "Finding Your Story",
        lessons: [
          makeLesson("1-1", "1", 0, "Why Stories Matter in Cinema", "12m", "completed", 100),
          makeLesson("1-2", "1", 0, "Identifying Your Core Theme", "15m", "completed", 100),
          makeLesson("1-3", "1", 0, "Research & Reference Building", "18m", "completed", 100),
        ],
      },
      {
        title: "Narrative Structure",
        lessons: [
          makeLesson("1-4", "1", 1, "Three-Act Structure for Short Films", "20m", "completed", 100),
          makeLesson("1-5", "1", 1, "Non-Linear Storytelling", "16m", "completed", 100),
          makeLesson("1-6", "1", 1, "Building Tension and Conflict", "22m", "completed", 100),
        ],
      },
      {
        title: "Visual Grammar",
        lessons: [
          makeLesson("1-7", "1", 2, "Shot Composition Fundamentals", "25m", "completed", 100),
          makeLesson("1-8", "1", 2, "Camera Movement as Storytelling", "18m", "in_progress", 62),
          makeLesson("1-9", "1", 2, "Color and Mood", "14m"),
        ],
      },
      {
        title: "Directing Performance",
        lessons: [
          makeLesson("1-10", "1", 3, "Working with Non-Actors", "20m"),
          makeLesson("1-11", "1", 3, "Blocking and Staging", "16m"),
          makeLesson("1-12", "1", 3, "Emotional Authenticity", "19m"),
        ],
      },
      {
        title: "Post-Production Storytelling",
        lessons: [
          makeLesson("1-13", "1", 4, "The Editor's Eye", "22m"),
          makeLesson("1-14", "1", 4, "Sound Design Basics", "17m"),
          makeLesson("1-15", "1", 4, "Music and Emotion", "14m"),
        ],
      },
      {
        title: "Distribution & Festivals",
        lessons: [
          makeLesson("1-16", "1", 5, "Preparing for Film Festivals", "18m"),
          makeLesson("1-17", "1", 5, "Online Distribution", "15m"),
          makeLesson("1-18", "1", 5, "Building Your Audience", "20m"),
        ],
      },
      {
        title: "Final Project",
        lessons: [
          makeLesson("1-19", "1", 6, "Brief & Planning", "10m"),
          makeLesson("1-20", "1", 6, "Shoot & Edit", "12m"),
          makeLesson("1-21", "1", 6, "Review & Feedback", "15m"),
        ],
      },
    ],
    reviews: [
      { id: "r1", author: "Vikram Das", avatar: instructor1, rating: 5, text: "Completely changed how I approach storytelling. Rajiv's insights on visual grammar are incredible.", date: "2 weeks ago" },
      { id: "r2", author: "Ananya Iyer", avatar: instructor2, rating: 5, text: "Best filmmaking course in India, hands down. The micro-activities keep you engaged.", date: "1 month ago" },
      { id: "r3", author: "Rohit Nair", avatar: instructor1, rating: 4, text: "Great content, well structured. Would love more on documentary filmmaking.", date: "1 month ago" },
    ],
    sampleProjects: [
      { title: "Urban Solitude — Short Film", image: courseCinematography },
      { title: "The Last Train — Documentary", image: courseEditing },
      { title: "Monsoon Diaries — Visual Essay", image: courseContent },
    ],
  },
  {
    id: "2",
    title: "Professional Video Editing Masterclass",
    subtitle: "An all-out practical editing experience",
    instructor: "Anthony Gonsalvez",
    instructorBio: "One of India's most sought-after film editors. Known for his work on blockbuster Tamil and Hindi films.",
    instructorImage: instructor2,
    thumbnail: courseEditing,
    cardImage: mcAnthony,
    category: "Editing",
    difficulty: "Beginner",
    format: "Masterclass",
    rating: 4.8,
    ratingsCount: 632,
    students: 1890,
    duration: "6h 15m",
    lessonsCount: 32,
    price: 2499,
    subscriptionPrice: 499,
    isSubscription: true,
    progress: 0,
    purchased: false,
    subscribed: false,
    description: "Master the art of video editing from organizing your media to delivering polished final cuts. Learn industry-standard workflows in DaVinci Resolve and Premiere Pro.",
    highlights: [
      "32 hands-on video lessons",
      "Project files included",
      "Edit real footage from indie films",
      "Color grading fundamentals",
      "Certificate of completion",
    ],
    skills: ["DaVinci Resolve", "Premiere Pro", "Color Grading", "Audio Mixing", "Transitions"],
    modules: [
      {
        title: "Getting Started",
        lessons: [
          makeLesson("2-1", "2", 0, "Setting Up Your Editing Suite", "10m", "not_started", 0, true),
          makeLesson("2-2", "2", 0, "Understanding Timelines", "14m", "not_started", 0, true),
          makeLesson("2-3", "2", 0, "Importing & Organizing Media", "12m"),
        ],
      },
      {
        title: "Core Editing Techniques",
        lessons: [
          makeLesson("2-4", "2", 1, "Cuts, Transitions & Pacing", "20m"),
          makeLesson("2-5", "2", 1, "J-Cuts and L-Cuts", "16m"),
          makeLesson("2-6", "2", 1, "Match Cuts & Jump Cuts", "18m"),
        ],
      },
      {
        title: "Audio & Sound",
        lessons: [
          makeLesson("2-7", "2", 2, "Audio Levels & Mixing", "15m"),
          makeLesson("2-8", "2", 2, "Adding Music & SFX", "18m"),
          makeLesson("2-9", "2", 2, "Dialogue Editing", "20m"),
        ],
      },
      {
        title: "Color Grading",
        lessons: [
          makeLesson("2-10", "2", 3, "Color Theory for Editors", "16m"),
          makeLesson("2-11", "2", 3, "Primary Color Correction", "22m"),
          makeLesson("2-12", "2", 3, "Creating a Look", "19m"),
        ],
      },
      {
        title: "Advanced Workflows",
        lessons: [
          makeLesson("2-13", "2", 4, "Multi-cam Editing", "20m"),
          makeLesson("2-14", "2", 4, "Proxy Workflows", "14m"),
          makeLesson("2-15", "2", 4, "Exporting for Platforms", "12m"),
        ],
      },
    ],
    reviews: [
      { id: "r4", author: "Sneha Patel", avatar: instructor2, rating: 5, text: "Finally understood color grading after years of guessing. Priya explains things so clearly.", date: "3 weeks ago" },
      { id: "r5", author: "Arjun Mehta", avatar: instructor1, rating: 4, text: "Comprehensive and well-paced. The project files are a great bonus.", date: "2 months ago" },
    ],
    sampleProjects: [
      { title: "Reel Edit — Before & After", image: courseEditing },
      { title: "Music Video Grade", image: courseCinematography },
    ],
  },
  {
    id: "3",
    title: "Content Creation for Social Media",
    subtitle: "Build your audience and create content that resonates",
    instructor: "Arjun Kapoor",
    instructorBio: "500K+ subscribers, brand filmmaker and content strategist. Building India's creator economy.",
    instructorImage: instructor1,
    thumbnail: courseContent,
    category: "Content Creation",
    difficulty: "Beginner",
    format: "Masterclass",
    rating: 4.7,
    ratingsCount: 1203,
    students: 3210,
    duration: "3h 20m",
    lessonsCount: 18,
    price: 1499,
    subscriptionPrice: 499,
    isSubscription: true,
    progress: 100,
    purchased: true,
    subscribed: false,
    description: "Learn how to create scroll-stopping content for Instagram, YouTube, and beyond. From ideation to analytics, this course covers the full creator workflow.",
    highlights: [
      "18 actionable lessons",
      "Templates for content calendars",
      "Analytics deep-dive",
      "Brand collaboration playbook",
      "Community feedback rounds",
    ],
    skills: ["Instagram", "YouTube", "Content Strategy", "Analytics", "Brand Deals"],
    modules: [
      {
        title: "Creator Mindset",
        lessons: [
          makeLesson("3-1", "3", 0, "Finding Your Niche", "14m", "completed", 100, true),
          makeLesson("3-2", "3", 0, "Building a Content Calendar", "12m", "completed", 100),
          makeLesson("3-3", "3", 0, "Understanding Algorithms", "16m", "completed", 100),
        ],
      },
      {
        title: "Production Basics",
        lessons: [
          makeLesson("3-4", "3", 1, "Phone Filming Techniques", "18m", "completed", 100),
          makeLesson("3-5", "3", 1, "Quick Editing for Reels", "15m", "completed", 100),
          makeLesson("3-6", "3", 1, "Thumbnail & Hook Design", "14m", "completed", 100),
        ],
      },
      {
        title: "Growth & Monetization",
        lessons: [
          makeLesson("3-7", "3", 2, "Growing from 0 to 10K", "20m", "completed", 100),
          makeLesson("3-8", "3", 2, "Brand Deals 101", "16m", "completed", 100),
          makeLesson("3-9", "3", 2, "Building Multiple Revenue Streams", "18m", "completed", 100),
        ],
      },
    ],
    reviews: [
      { id: "r6", author: "Meera K", avatar: instructor2, rating: 5, text: "Went from 200 to 5K followers in 2 months using Arjun's framework!", date: "1 week ago" },
    ],
    sampleProjects: [
      { title: "Reel Series — 7 Day Challenge", image: courseContent },
    ],
  },
  {
    id: "4",
    title: "Cinematography Fundamentals",
    subtitle: "Master the visual language of cinema from framing to lighting",
    instructor: "Nandini Reddy",
    instructorBio: "DoP with credits on 20+ indie films. Teaches at FTII and conducts workshops across India.",
    instructorImage: instructor2,
    thumbnail: courseCinematography,
    category: "Cinematography",
    difficulty: "Intermediate",
    format: "Masterclass",
    rating: 4.9,
    ratingsCount: 489,
    students: 1560,
    duration: "5h 10m",
    lessonsCount: 20,
    price: 1999,
    subscriptionPrice: 499,
    isSubscription: true,
    progress: 72,
    purchased: true,
    subscribed: false,
    description: "Dive deep into the craft of cinematography — from understanding lenses and lighting to creating mood through camera movement. Taught with real-world examples from Indian indie cinema.",
    highlights: [
      "20 cinematic lessons",
      "Lighting setup breakdowns",
      "Lens comparison guides",
      "Practical shooting exercises",
      "Feedback from Nandini Reddy",
    ],
    skills: ["Lighting", "Lenses", "Composition", "Camera Movement", "Color Science"],
    lastLessonId: "4-7",
    modules: [
      {
        title: "Foundations",
        lessons: [
          makeLesson("4-1", "4", 0, "The Role of a Cinematographer", "14m", "completed", 100),
          makeLesson("4-2", "4", 0, "Understanding Exposure", "18m", "completed", 100),
          makeLesson("4-3", "4", 0, "Lenses & Focal Length", "20m", "completed", 100),
        ],
      },
      {
        title: "Lighting Craft",
        lessons: [
          makeLesson("4-4", "4", 1, "Natural vs Artificial Light", "22m", "completed", 100),
          makeLesson("4-5", "4", 1, "Three-Point Lighting Setup", "16m", "completed", 100),
          makeLesson("4-6", "4", 1, "Lighting for Mood", "19m", "completed", 100),
        ],
      },
      {
        title: "Camera Movement",
        lessons: [
          makeLesson("4-7", "4", 2, "Dolly, Pan, Tilt & Crane", "20m", "in_progress", 55),
          makeLesson("4-8", "4", 2, "Handheld vs Stabilized", "15m"),
          makeLesson("4-9", "4", 2, "Movement as Emotion", "18m"),
        ],
      },
      {
        title: "Advanced Techniques",
        lessons: [
          makeLesson("4-10", "4", 3, "Shooting in Low Light", "20m"),
          makeLesson("4-11", "4", 3, "Color Science on Set", "16m"),
          makeLesson("4-12", "4", 3, "Working with a Director", "14m"),
        ],
      },
    ],
    reviews: [
      { id: "r7", author: "Akash G", avatar: instructor1, rating: 5, text: "Nandini's lighting module is worth the price alone. Pure gold.", date: "2 weeks ago" },
      { id: "r8", author: "Ritu K", avatar: instructor2, rating: 5, text: "Best cinematography resource in India. Period.", date: "1 month ago" },
    ],
    sampleProjects: [
      { title: "Golden Hour — Lighting Study", image: courseCinematography },
      { title: "City Frames — Composition", image: courseContent },
    ],
  },
  {
    id: "5",
    title: "Design Thinking for Creators",
    subtitle: "Apply design principles to elevate your creative output",
    instructor: "Rajiv Menon",
    instructorBio: "Award-winning filmmaker with 15+ years in Indian cinema.",
    instructorImage: instructor1,
    thumbnail: courseContent,
    category: "Design",
    difficulty: "Beginner",
    format: "Masterclass",
    rating: 4.6,
    ratingsCount: 312,
    students: 980,
    duration: "2h 45m",
    lessonsCount: 14,
    price: 999,
    subscriptionPrice: 499,
    isSubscription: true,
    progress: 0,
    purchased: false,
    subscribed: false,
    description: "Learn how design thinking can transform your creative process — from thumbnails to brand identity.",
    highlights: ["14 concise lessons", "Design templates included", "Portfolio exercises", "Certificate"],
    skills: ["Typography", "Visual Hierarchy", "Brand Design", "Thumbnails", "Layouts"],
    modules: [
      {
        title: "Design Foundations",
        lessons: [
          makeLesson("5-1", "5", 0, "What is Design Thinking?", "12m", "not_started", 0, true),
          makeLesson("5-2", "5", 0, "Visual Hierarchy", "14m"),
          makeLesson("5-3", "5", 0, "Typography for Creators", "10m"),
        ],
      },
      {
        title: "Applied Design",
        lessons: [
          makeLesson("5-4", "5", 1, "Thumbnail Design Masterclass", "18m"),
          makeLesson("5-5", "5", 1, "Brand Kit Building", "16m"),
          makeLesson("5-6", "5", 1, "Social Media Layouts", "14m"),
        ],
      },
    ],
    reviews: [],
    sampleProjects: [{ title: "Brand Kit — Creator Edition", image: courseContent }],
  },
  {
    id: "6",
    title: "Screenwriting Fundamentals",
    subtitle: "Write compelling screenplays from concept to final draft",
    instructor: "Priya Sharma",
    instructorBio: "Lead editor and screenwriting mentor. Published screenwriter with 3 produced shorts.",
    instructorImage: instructor2,
    thumbnail: courseEditing,
    category: "Filmmaking",
    difficulty: "Beginner",
    format: "Masterclass",
    rating: 4.7,
    ratingsCount: 278,
    students: 820,
    duration: "3h 40m",
    lessonsCount: 16,
    price: 1499,
    subscriptionPrice: 499,
    isSubscription: true,
    progress: 0,
    purchased: false,
    subscribed: false,
    description: "Learn the fundamentals of screenwriting — from character development and dialogue to formatting and pitching your screenplay.",
    highlights: ["16 structured lessons", "Script templates included", "Character worksheets", "Pitch deck guide", "Peer review exercises"],
    skills: ["Screenwriting", "Character Development", "Dialogue", "Story Structure", "Pitching"],
    modules: [
      {
        title: "Story Foundations",
        lessons: [
          makeLesson("6-1", "6", 0, "What Makes a Great Script?", "14m", "not_started", 0, true),
          makeLesson("6-2", "6", 0, "Character Development 101", "18m"),
          makeLesson("6-3", "6", 0, "Building a Logline", "12m"),
        ],
      },
      {
        title: "Writing Craft",
        lessons: [
          makeLesson("6-4", "6", 1, "Dialogue That Sounds Real", "20m"),
          makeLesson("6-5", "6", 1, "Scene Transitions & Pacing", "16m"),
          makeLesson("6-6", "6", 1, "Formatting Your Screenplay", "14m"),
        ],
      },
      {
        title: "Pitching & Distribution",
        lessons: [
          makeLesson("6-7", "6", 2, "Writing a Pitch Deck", "16m"),
          makeLesson("6-8", "6", 2, "Finding Producers", "14m"),
        ],
      },
    ],
    reviews: [
      { id: "r9", author: "Kavita D", avatar: instructor2, rating: 5, text: "Finally a screenwriting course for Indian storytellers. The examples are so relatable.", date: "1 week ago" },
    ],
    sampleProjects: [
      { title: "Short Film Script — Urban Stories", image: courseEditing },
    ],
  },
];

// ── Workshops ──
export const workshopsList: Workshop[] = [
  {
    id: "w1",
    title: "Intro to Color Grading with DaVinci Resolve",
    instructor: "Priya Sharma",
    instructorBio: "Lead editor at a top Mumbai post-production house. 10+ years crafting narratives through the cut. Known for her vibrant color grading style across indie films and brand campaigns.",
    instructorImage: instructor2,
    thumbnail: courseEditing,
    category: "Editing",
    description: "A hands-on workshop to get you started with color grading in DaVinci Resolve. We'll cover color wheels, nodes, LUTs, and how to build a cinematic look from scratch using real footage.",
    highlights: [
      "Understand color theory for video",
      "Set up a DaVinci Resolve color workflow",
      "Apply LUTs and create custom looks",
      "Grade a short film clip live together",
      "Q&A with Priya on post-production careers",
    ],
    date: "Sat, 22 Mar 2026",
    time: "3:00 PM IST",
    duration: "2 hours",
    price: 99,
    seatsTotal: 100,
    seatsRemaining: 23,
    isPast: false,
    hasReplay: false,
    testimonials: [
      { author: "Sneha Patel", text: "Priya's color grading tips completely changed my editing workflow. Worth every rupee!" },
      { author: "Rohit Nair", text: "The live grading session was incredible. Learned more in 2 hours than weeks of YouTube." },
    ],
    faq: [
      { question: "Do I need DaVinci Resolve installed?", answer: "Yes, please download the free version of DaVinci Resolve before the workshop. We'll provide project files to follow along." },
      { question: "Is this suitable for beginners?", answer: "Absolutely! This workshop is designed for beginners who have basic editing knowledge but are new to color grading." },
      { question: "Will there be a recording?", answer: "Yes, all registered participants will receive a replay link within 24 hours of the session." },
    ],
  },
  {
    id: "w2",
    title: "Mobile Filmmaking Basics",
    instructor: "Arjun Kapoor",
    instructorBio: "500K+ subscribers, brand filmmaker and content strategist. Known for creating cinematic content using just a smartphone.",
    instructorImage: instructor1,
    thumbnail: courseCinematography,
    category: "Filmmaking",
    description: "Learn how to shoot professional-looking videos using just your smartphone. Covers framing, lighting with natural light, audio capture, and quick editing on mobile apps.",
    highlights: [
      "Shoot cinematic video on any smartphone",
      "Master natural light setups",
      "Capture clean audio with budget gear",
      "Edit on CapCut and InShot",
      "Build a mini portfolio from the workshop",
    ],
    date: "Sun, 30 Mar 2026",
    time: "5:00 PM IST",
    duration: "1.5 hours",
    price: 149,
    seatsTotal: 80,
    seatsRemaining: 42,
    isPast: false,
    hasReplay: false,
    testimonials: [
      { author: "Ananya Iyer", text: "Arjun made mobile filmmaking feel so accessible. Shot my first reel the same evening!" },
    ],
    faq: [
      { question: "What phone do I need?", answer: "Any smartphone with a decent camera — iPhone 11+ or Android with OIS recommended, but not required." },
      { question: "Do I need any accessories?", answer: "No accessories needed. Arjun will show you how to achieve great results with just your phone." },
    ],
  },
  {
    id: "w3",
    title: "Sound Design for Short Films",
    instructor: "Rajiv Menon",
    instructorBio: "Award-winning filmmaker known for documentary storytelling. Deep expertise in atmospheric sound design.",
    instructorImage: instructor1,
    thumbnail: courseContent,
    category: "Filmmaking",
    description: "Explore the world of sound design for cinema. Learn how to layer audio, create atmosphere, work with foley, and use free sound libraries to elevate your short films.",
    highlights: [
      "Understand the role of sound in storytelling",
      "Layer ambient audio and foley",
      "Work with free SFX libraries",
      "Mix dialogue and music effectively",
      "Create an atmospheric soundscape from scratch",
    ],
    date: "Sat, 5 Apr 2026",
    time: "4:00 PM IST",
    duration: "2 hours",
    price: 199,
    seatsTotal: 60,
    seatsRemaining: 8,
    isPast: false,
    hasReplay: false,
    testimonials: [],
    faq: [
      { question: "Do I need Pro Tools?", answer: "No! We'll use Audacity (free) and DaVinci Resolve's Fairlight page. Both are free and cross-platform." },
      { question: "Is this for editors or filmmakers?", answer: "Both! Anyone who works with video and wants to improve their audio game will benefit." },
    ],
  },
  {
    id: "w4",
    title: "YouTube Growth Strategies 2026",
    instructor: "Arjun Kapoor",
    instructorBio: "500K+ subscribers, brand filmmaker and content strategist.",
    instructorImage: instructor1,
    thumbnail: courseContent,
    category: "Content Creation",
    description: "A deep-dive into YouTube growth strategies that actually work in 2026. Covering algorithm updates, Shorts strategy, audience retention, and monetization beyond AdSense.",
    highlights: [
      "2026 algorithm deep-dive",
      "Shorts vs long-form strategy",
      "Audience retention techniques",
      "Monetization beyond ads",
    ],
    date: "Sat, 8 Mar 2026",
    time: "5:00 PM IST",
    duration: "1.5 hours",
    price: 99,
    seatsTotal: 120,
    seatsRemaining: 0,
    isPast: true,
    hasReplay: true,
    testimonials: [
      { author: "Meera K", text: "Applied the retention hook technique and saw immediate improvement in my watch time." },
      { author: "Vikram Das", text: "Best YouTube strategy session I've attended. Practical and no fluff." },
    ],
    faq: [],
  },
  {
    id: "w5",
    title: "Lighting Masterclass for Indie Filmmakers",
    instructor: "Nandini Reddy",
    instructorBio: "DoP with credits on 20+ indie films. Teaches at FTII.",
    instructorImage: instructor2,
    thumbnail: courseCinematography,
    category: "Cinematography",
    description: "Learn how to create professional lighting setups on a budget. Covers three-point lighting, natural light techniques, and mood-based lighting for different genres.",
    highlights: [
      "Budget lighting setups",
      "Three-point lighting mastery",
      "Natural light techniques",
      "Genre-based lighting moods",
    ],
    date: "Sun, 2 Mar 2026",
    time: "4:00 PM IST",
    duration: "2 hours",
    price: 149,
    seatsTotal: 50,
    seatsRemaining: 0,
    isPast: true,
    hasReplay: true,
    testimonials: [
      { author: "Akash G", text: "Nandini showed us how to light a scene with just ₹500 worth of gear. Mind-blown." },
    ],
    faq: [],
  },
];

export const getWorkshopById = (id: string) => workshopsList.find((w) => w.id === id);

// Helper to get all lessons flat
export const getAllLessons = (): Lesson[] =>
  detailedCourses.flatMap((c) => c.modules.flatMap((m) => m.lessons));

export const getCourseById = (id: string) => detailedCourses.find((c) => c.id === id);
export const getLessonById = (id: string) => getAllLessons().find((l) => l.id === id);
export const getCourseLessons = (courseId: string) => getAllLessons().filter((l) => l.courseId === courseId);
