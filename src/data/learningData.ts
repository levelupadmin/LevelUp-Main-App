import instructor1 from "@/assets/instructor-1.jpg";
import instructor2 from "@/assets/instructor-2.jpg";
import courseEditing from "@/assets/course-editing.jpg";
import courseCinematography from "@/assets/course-cinematography.jpg";
import courseContent from "@/assets/course-content.jpg";

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
  videoProgress: number; // 0-100
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
  modules: CourseModule[];
  reviews: Review[];
  sampleProjects: { title: string; image: string }[];
  lastLessonId?: string;
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
    subtitle: "From script to screen — master the craft of visual narrative",
    instructor: "Rajiv Menon",
    instructorBio: "Award-winning filmmaker with 15+ years in Indian cinema. Known for documentary storytelling and visual poetry.",
    instructorImage: instructor1,
    thumbnail: courseCinematography,
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
    subtitle: "From raw footage to final cut — learn professional editing workflows",
    instructor: "Priya Sharma",
    instructorBio: "Lead editor at a top Mumbai post-production house. 10+ years crafting narratives through the cut.",
    instructorImage: instructor2,
    thumbnail: courseEditing,
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
    format: "Cohort",
    rating: 4.7,
    ratingsCount: 1203,
    students: 3210,
    duration: "3h 20m",
    lessonsCount: 18,
    price: 1499,
    subscriptionPrice: 499,
    isSubscription: true,
    progress: 0,
    purchased: false,
    subscribed: false,
    description: "Learn how to create scroll-stopping content for Instagram, YouTube, and beyond. From ideation to analytics, this course covers the full creator workflow.",
    highlights: [
      "18 actionable lessons",
      "Templates for content calendars",
      "Analytics deep-dive",
      "Brand collaboration playbook",
      "Community feedback rounds",
    ],
    modules: [
      {
        title: "Creator Mindset",
        lessons: [
          makeLesson("3-1", "3", 0, "Finding Your Niche", "14m", "not_started", 0, true),
          makeLesson("3-2", "3", 0, "Building a Content Calendar", "12m"),
          makeLesson("3-3", "3", 0, "Understanding Algorithms", "16m"),
        ],
      },
      {
        title: "Production Basics",
        lessons: [
          makeLesson("3-4", "3", 1, "Phone Filming Techniques", "18m"),
          makeLesson("3-5", "3", 1, "Quick Editing for Reels", "15m"),
          makeLesson("3-6", "3", 1, "Thumbnail & Hook Design", "14m"),
        ],
      },
      {
        title: "Growth & Monetization",
        lessons: [
          makeLesson("3-7", "3", 2, "Growing from 0 to 10K", "20m"),
          makeLesson("3-8", "3", 2, "Brand Deals 101", "16m"),
          makeLesson("3-9", "3", 2, "Building Multiple Revenue Streams", "18m"),
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
    format: "Cohort",
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
    format: "Workshop",
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
    title: "Music Production for Film & Content",
    subtitle: "Create original scores and soundscapes for your projects",
    instructor: "Priya Sharma",
    instructorBio: "Lead editor and sound designer at a top Mumbai studio.",
    instructorImage: instructor2,
    thumbnail: courseEditing,
    category: "Music",
    difficulty: "Advanced",
    format: "Masterclass",
    rating: 4.8,
    ratingsCount: 198,
    students: 640,
    duration: "5h 00m",
    lessonsCount: 22,
    price: 2999,
    subscriptionPrice: 499,
    isSubscription: true,
    progress: 0,
    purchased: false,
    subscribed: false,
    description: "Compose, produce, and mix music for film and digital content. From GarageBand to Logic Pro, learn the complete pipeline.",
    highlights: ["22 deep-dive lessons", "Sample packs included", "Mix & master exercises", "Collaboration opportunities"],
    modules: [
      {
        title: "Getting Started with Music",
        lessons: [
          makeLesson("6-1", "6", 0, "Music Theory Crash Course", "16m", "not_started", 0, true),
          makeLesson("6-2", "6", 0, "Setting Up Your DAW", "14m"),
          makeLesson("6-3", "6", 0, "Creating Your First Beat", "20m"),
        ],
      },
      {
        title: "Scoring for Film",
        lessons: [
          makeLesson("6-4", "6", 1, "Understanding Scene Emotion", "18m"),
          makeLesson("6-5", "6", 1, "Layering Instruments", "22m"),
          makeLesson("6-6", "6", 1, "Mixing for Dialogue", "16m"),
        ],
      },
    ],
    reviews: [
      { id: "r9", author: "Aditya V", avatar: instructor1, rating: 5, text: "Finally a music course made for filmmakers, not musicians. Exactly what I needed.", date: "3 weeks ago" },
    ],
    sampleProjects: [{ title: "Original Score — Short Film", image: courseEditing }],
  },
];

// Helper to get all lessons flat
export const getAllLessons = (): Lesson[] =>
  detailedCourses.flatMap((c) => c.modules.flatMap((m) => m.lessons));

export const getCourseById = (id: string) => detailedCourses.find((c) => c.id === id);
export const getLessonById = (id: string) => getAllLessons().find((l) => l.id === id);
export const getCourseLessons = (courseId: string) => getAllLessons().filter((l) => l.courseId === courseId);
