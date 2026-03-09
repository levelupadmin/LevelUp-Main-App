// Comprehensive mock data for Learn module

export interface Instructor {
  name: string;
  avatar: string;
  bio: string;
  notableWorks: string[];
}

export interface Lesson {
  id: string;
  number: number;
  title: string;
  duration: string;
  isFree: boolean;
  notes: string;
  activityType: "none" | "text" | "image" | "video" | "creative";
  activityPrompt?: string;
  videoUrl?: string;
}

export interface CourseSection {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface CourseReview {
  avatar: string;
  name: string;
  stars: number;
  text: string;
}

export interface MockCourse {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  thumbnail: string;
  category: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  instructor: Instructor;
  price: number;
  rating: number;
  learners: number;
  totalLessons: number;
  duration: string;
  whatYoullLearn: string[];
  skills: string[];
  whoIsThisFor: string[];
  sections: CourseSection[];
  reviews: CourseReview[];
  isPurchased: boolean;
  completedLessons: string[];
}

export interface MockWorkshop {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail: string;
  instructor: Instructor;
  date: string;
  time: string;
  duration: string;
  capacity: number;
  registered: number;
  price: number;
  isRegistered: boolean;
  isUpcoming: boolean;
  resourcesEnabled: boolean;
  whatYoullLearn: string[];
  faq: { q: string; a: string }[];
  testimonials: { name: string; text: string }[];
  zoomLink: string;
  recordingUrl?: string;
  slidesUrl?: string;
  resources?: { title: string; url: string; size: string }[];
  relatedCourseSlug?: string;
}

const instructors: Record<string, Instructor> = {
  rajesh: {
    name: "Rajesh Mapuskar",
    avatar: "",
    bio: "National Award-winning filmmaker known for blending social themes with cinematic beauty. Former AD to Rajkumar Hirani.",
    notableWorks: ["Ventilator", "Ferrari Ki Sawaari"],
  },
  priya: {
    name: "Priya Srinivasan",
    avatar: "",
    bio: "Lead colorist at Prime Focus with 12+ years in post-production. Worked on 40+ feature films and ad campaigns.",
    notableWorks: ["Drishyam 2", "Tumbbad color grade"],
  },
  arjun: {
    name: "Arjun Menon",
    avatar: "",
    bio: "YouTube creator with 2M+ subscribers. Specializes in cinematic travel and documentary content.",
    notableWorks: ["2M YouTube subscribers", "Adobe Max Speaker"],
  },
  kavitha: {
    name: "Kavitha Lankesh",
    avatar: "",
    bio: "Award-winning screenwriter and playwright. Teaches storytelling workshops across India.",
    notableWorks: ["Deveeri", "Multiple Kannada Film Awards"],
  },
  sanjay: {
    name: "Sanjay Leela Bhatt",
    avatar: "",
    bio: "DOP with 15 years of experience in Indian cinema. Known for evocative lighting and handheld work.",
    notableWorks: ["Ship of Theseus (camera team)", "Multiple ad films"],
  },
  deepak: {
    name: "Deepak Choudhary",
    avatar: "",
    bio: "Professional video editor and educator. Certified DaVinci Resolve trainer with 8 years in post-production.",
    notableWorks: ["Blackmagic Certified Trainer", "Online education pioneer"],
  },
};

function makeLessons(titles: string[], firstFree = true): Lesson[] {
  return titles.map((t, i) => ({
    id: `lesson-${i + 1}`,
    number: i + 1,
    title: t,
    duration: `${5 + Math.floor(Math.random() * 15)} min`,
    isFree: firstFree && i === 0,
    notes: `## ${t}\n\nDetailed notes for this lesson covering key concepts, techniques, and practical tips.\n\n- Point 1: Core concept explanation\n- Point 2: Practical application\n- Point 3: Common mistakes to avoid`,
    activityType: i % 3 === 1 ? "creative" : i % 3 === 2 ? "text" : "none",
    activityPrompt:
      i % 3 === 1
        ? "Shoot a 15-second clip applying the technique from this lesson."
        : i % 3 === 2
        ? "Write a short reflection on what you learned."
        : undefined,
  }));
}

export const mockCourses: MockCourse[] = [
  {
    id: "c1",
    slug: "art-of-cinematography",
    title: "The Art of Cinematography",
    tagline: "See the world through a filmmaker's lens",
    description:
      "Master the fundamental principles of cinematography — from understanding light and shadow to crafting compelling visual narratives. This course takes you through camera operations, lens selection, composition rules, and the emotional language of cinema. Whether you're shooting on a phone or a cinema camera, these timeless principles will elevate your visual storytelling.",
    thumbnail: "/placeholder.svg",
    category: "Cinematography",
    difficulty: "Intermediate",
    instructor: instructors.sanjay,
    price: 1499,
    rating: 4.8,
    learners: 2400,
    totalLessons: 8,
    duration: "3.5 hrs",
    whatYoullLearn: [
      "Understand camera sensors, lenses, and focal lengths",
      "Master the exposure triangle for any lighting condition",
      "Apply the rule of thirds, leading lines, and depth",
      "Light indoor and outdoor scenes professionally",
      "Use camera movement to enhance storytelling",
      "Create mood through color temperature and contrast",
    ],
    skills: ["Cinematography", "Camera Operation", "Lighting", "Composition", "Visual Storytelling"],
    whoIsThisFor: [
      "Aspiring filmmakers who want to upgrade their visual quality",
      "Content creators transitioning from phone to camera",
      "Photography enthusiasts exploring motion picture",
    ],
    sections: [
      {
        id: "s1",
        title: "Foundations of Visual Storytelling",
        lessons: makeLessons([
          "Introduction to Cinematography",
          "Understanding Camera Sensors",
          "The Exposure Triangle",
        ]),
      },
      {
        id: "s2",
        title: "Composition & Framing",
        lessons: makeLessons(
          ["Rule of Thirds & Beyond", "Leading Lines and Depth", "Framing for Emotion"],
          false
        ),
      },
      {
        id: "s3",
        title: "Lighting Masterclass",
        lessons: makeLessons(["Natural Light Techniques", "Three-Point Lighting Setup"], false),
      },
    ],
    reviews: [
      { avatar: "", name: "Aditya K.", stars: 5, text: "This course completely changed how I see light. Sanjay explains complex concepts so simply." },
      { avatar: "", name: "Meera J.", stars: 4, text: "Great practical examples. Wish there were more outdoor shooting scenarios." },
      { avatar: "", name: "Rohan P.", stars: 5, text: "Best cinematography course in Hindi/English I've found. Worth every rupee." },
    ],
    isPurchased: true,
    completedLessons: ["lesson-1", "lesson-2", "lesson-3"],
  },
  {
    id: "c2",
    slug: "video-editing-masterclass",
    title: "Video Editing Masterclass",
    tagline: "From raw footage to polished stories",
    description:
      "Learn professional video editing from scratch using DaVinci Resolve. This comprehensive course covers timeline editing, transitions, audio sync, color correction, and export settings. By the end, you'll be able to edit wedding films, short films, YouTube videos, and corporate content with confidence.",
    thumbnail: "/placeholder.svg",
    category: "Editing",
    difficulty: "Beginner",
    instructor: instructors.deepak,
    price: 1299,
    rating: 4.7,
    learners: 3100,
    totalLessons: 10,
    duration: "4.2 hrs",
    whatYoullLearn: [
      "Navigate the DaVinci Resolve interface confidently",
      "Edit multi-camera footage with sync tools",
      "Apply professional transitions and effects",
      "Mix and master audio for video",
      "Color correct and grade footage",
      "Export for YouTube, Instagram, and cinema",
    ],
    skills: ["DaVinci Resolve", "Video Editing", "Color Grading", "Audio Mixing", "Post-Production"],
    whoIsThisFor: [
      "Complete beginners who want to learn professional editing",
      "YouTubers looking to improve production quality",
      "Freelancers wanting to add editing to their services",
    ],
    sections: [
      {
        id: "s1",
        title: "Getting Started",
        lessons: makeLessons(["Welcome & Setup", "DaVinci Resolve Interface Tour", "Importing & Organizing Media"]),
      },
      {
        id: "s2",
        title: "Core Editing",
        lessons: makeLessons(["Basic Cuts and Trims", "Working with Audio", "Transitions and Effects", "Multi-cam Editing"], false),
      },
      {
        id: "s3",
        title: "Finishing",
        lessons: makeLessons(["Color Correction Basics", "Audio Mastering", "Export & Delivery"], false),
      },
    ],
    reviews: [
      { avatar: "", name: "Sneha R.", stars: 5, text: "Finally a DaVinci course that doesn't assume you know Premiere!" },
      { avatar: "", name: "Vikram T.", stars: 4, text: "Very practical approach. I was editing my own videos by lesson 5." },
      { avatar: "", name: "Lakshmi M.", stars: 5, text: "Deepak is an amazing teacher. Clear, patient, and thorough." },
    ],
    isPurchased: false,
    completedLessons: [],
  },
  {
    id: "c3",
    slug: "screenwriting-fundamentals",
    title: "Screenwriting Fundamentals",
    tagline: "Write stories that move audiences",
    description:
      "Discover the craft of screenwriting with a focus on Indian storytelling traditions. Learn three-act structure, character development, dialogue writing, and how to format a professional screenplay. Includes exercises and feedback prompts for every lesson.",
    thumbnail: "/placeholder.svg",
    category: "Filmmaking",
    difficulty: "Beginner",
    instructor: instructors.kavitha,
    price: 999,
    rating: 4.6,
    learners: 1800,
    totalLessons: 6,
    duration: "2.8 hrs",
    whatYoullLearn: [
      "Structure a compelling three-act screenplay",
      "Create memorable, multi-dimensional characters",
      "Write natural, impactful dialogue",
      "Format screenplays to industry standard",
      "Develop a concept from idea to outline",
    ],
    skills: ["Screenwriting", "Storytelling", "Character Development", "Dialogue", "Script Formatting"],
    whoIsThisFor: [
      "Aspiring screenwriters with stories to tell",
      "Directors who want to write their own scripts",
      "Content creators looking to improve narrative skills",
    ],
    sections: [
      {
        id: "s1",
        title: "Story Foundations",
        lessons: makeLessons(["The Power of Story", "Three-Act Structure", "Character Creation"]),
      },
      {
        id: "s2",
        title: "Craft & Format",
        lessons: makeLessons(["Writing Great Dialogue", "Screenplay Formatting", "Rewriting & Feedback"], false),
      },
    ],
    reviews: [
      { avatar: "", name: "Ananya S.", stars: 5, text: "Kavitha's insights into Indian storytelling are invaluable." },
      { avatar: "", name: "Dev G.", stars: 4, text: "The exercises really push you to write. Loved the feedback structure." },
      { avatar: "", name: "Priti N.", stars: 5, text: "I finished my first short film script thanks to this course!" },
    ],
    isPurchased: false,
    completedLessons: [],
  },
  {
    id: "c4",
    slug: "color-grading-davinci",
    title: "Color Grading with DaVinci Resolve",
    tagline: "Transform mood and emotion through color",
    description:
      "Take your footage from flat to cinematic with professional color grading techniques. Learn color theory, scopes, node-based grading, LUT creation, and how to match shots across a scene. This is the course that separates amateur from professional.",
    thumbnail: "/placeholder.svg",
    category: "Editing",
    difficulty: "Advanced",
    instructor: instructors.priya,
    price: 1999,
    rating: 4.9,
    learners: 950,
    totalLessons: 7,
    duration: "3.1 hrs",
    whatYoullLearn: [
      "Understand color theory for cinema",
      "Read and use video scopes accurately",
      "Build node-based color grading workflows",
      "Create and apply custom LUTs",
      "Match shots for consistent scene color",
      "Grade for different moods and genres",
    ],
    skills: ["Color Grading", "DaVinci Resolve", "Color Theory", "LUTs", "Post-Production"],
    whoIsThisFor: [
      "Editors ready to specialize in color grading",
      "DOPs who want to guide the grading process",
      "Post-production professionals upgrading skills",
    ],
    sections: [
      {
        id: "s1",
        title: "Color Science",
        lessons: makeLessons(["Color Theory for Film", "Understanding Video Scopes", "Primary Corrections"]),
      },
      {
        id: "s2",
        title: "Advanced Grading",
        lessons: makeLessons(["Node-Based Workflows", "Secondary Corrections & Masks", "Creating Custom LUTs", "Shot Matching"], false),
      },
    ],
    reviews: [
      { avatar: "", name: "Karthik R.", stars: 5, text: "Priya's grading breakdowns are like watching a master at work." },
      { avatar: "", name: "Farah K.", stars: 5, text: "The node workflow section alone is worth the entire course fee." },
      { avatar: "", name: "Nikhil J.", stars: 4, text: "Very advanced content. Make sure you know DaVinci basics first." },
    ],
    isPurchased: false,
    completedLessons: [],
  },
  {
    id: "c5",
    slug: "documentary-filmmaking-course",
    title: "Documentary Filmmaking",
    tagline: "Tell real stories that change perspectives",
    description:
      "Learn the art and ethics of documentary filmmaking. From research and pre-production to interview techniques, vérité shooting, and narrative editing — this course covers the complete documentary pipeline with real-world examples from Indian documentary cinema.",
    thumbnail: "/placeholder.svg",
    category: "Filmmaking",
    difficulty: "Intermediate",
    instructor: instructors.rajesh,
    price: 1799,
    rating: 4.7,
    learners: 1200,
    totalLessons: 8,
    duration: "3.8 hrs",
    whatYoullLearn: [
      "Research and develop documentary subjects",
      "Conduct compelling on-camera interviews",
      "Shoot vérité and observational footage",
      "Structure a documentary narrative in editing",
      "Navigate the ethics of real-story filmmaking",
      "Submit to documentary film festivals",
    ],
    skills: ["Documentary", "Filmmaking", "Interviewing", "Research", "Narrative Editing", "Ethics"],
    whoIsThisFor: [
      "Storytellers passionate about real-world subjects",
      "Journalists transitioning to long-form video",
      "Filmmakers wanting to explore non-fiction",
    ],
    sections: [
      {
        id: "s1",
        title: "Pre-Production",
        lessons: makeLessons(["Finding Your Subject", "Research & Development", "Planning the Shoot"]),
      },
      {
        id: "s2",
        title: "Production",
        lessons: makeLessons(["Interview Techniques", "Vérité & Observational Shooting"], false),
      },
      {
        id: "s3",
        title: "Post-Production",
        lessons: makeLessons(["Structuring Your Narrative", "Ethics in Documentary", "Festival Submission"], false),
      },
    ],
    reviews: [
      { avatar: "", name: "Harsh V.", stars: 5, text: "Rajesh brings so much humanity to his teaching. Truly inspiring." },
      { avatar: "", name: "Zara M.", stars: 5, text: "The interview techniques section was a game-changer for my work." },
      { avatar: "", name: "Suresh K.", stars: 4, text: "Would love a follow-up course on documentary post-production." },
    ],
    isPurchased: false,
    completedLessons: [],
  },
  {
    id: "c6",
    slug: "content-creation-youtube",
    title: "Content Creation for YouTube",
    tagline: "Build your channel from zero to thriving",
    description:
      "A practical guide to building a YouTube channel in India. Learn content strategy, filming on a budget, editing workflows, SEO, thumbnail design, and monetization. Taught by a creator who grew from 0 to 2M subscribers.",
    thumbnail: "/placeholder.svg",
    category: "Content Creation",
    difficulty: "Beginner",
    instructor: instructors.arjun,
    price: 899,
    rating: 4.5,
    learners: 4200,
    totalLessons: 5,
    duration: "2.2 hrs",
    whatYoullLearn: [
      "Define your niche and content strategy",
      "Film professional content on a budget",
      "Edit efficiently for YouTube",
      "Optimize titles, thumbnails, and SEO",
      "Monetize your channel effectively",
    ],
    skills: ["YouTube", "Content Strategy", "SEO", "Thumbnails", "Monetization"],
    whoIsThisFor: [
      "Aspiring YouTubers ready to start their channel",
      "Creators stuck under 10K subscribers",
      "Professionals wanting to build a personal brand",
    ],
    sections: [
      {
        id: "s1",
        title: "Strategy & Setup",
        lessons: makeLessons(["Finding Your Niche", "Channel Setup & Branding"]),
      },
      {
        id: "s2",
        title: "Production & Growth",
        lessons: makeLessons(["Filming on a Budget", "Editing Workflows for YouTube", "SEO & Monetization"], false),
      },
    ],
    reviews: [
      { avatar: "", name: "Pooja L.", stars: 5, text: "Arjun's budget filming tips saved me so much money. Practical gold." },
      { avatar: "", name: "Rahul D.", stars: 4, text: "Great overview. I hit 1K subs within a month of applying these tips." },
      { avatar: "", name: "Sita G.", stars: 5, text: "Finally someone who understands the Indian YouTube landscape!" },
    ],
    isPurchased: false,
    completedLessons: [],
  },
];

export const mockWorkshops: MockWorkshop[] = [
  {
    id: "w1",
    slug: "mobile-filmmaking-masterclass",
    title: "Mobile Filmmaking Masterclass",
    description: "Learn to shoot professional-quality films using just your smartphone. Covers apps, stabilization, lighting hacks, and editing on mobile.",
    thumbnail: "/placeholder.svg",
    instructor: instructors.arjun,
    date: "2026-03-22",
    time: "11:00 AM IST",
    duration: "2 hours",
    capacity: 100,
    registered: 63,
    price: 99,
    isRegistered: false,
    isUpcoming: true,
    resourcesEnabled: false,
    whatYoullLearn: ["Smartphone camera settings for cinema", "DIY stabilization hacks", "Editing on mobile with free apps", "Publishing workflow"],
    faq: [
      { q: "Do I need an expensive phone?", a: "Any phone from 2022 onwards with a decent camera will work." },
      { q: "Will there be a recording?", a: "Recordings will be shared with registered attendees after the session." },
    ],
    testimonials: [
      { name: "Amit P.", text: "Arjun's mobile tips are insane. My Reels quality jumped 10x." },
      { name: "Neha S.", text: "Best ₹99 I ever spent on learning." },
    ],
    zoomLink: "https://zoom.us/placeholder",
  },
  {
    id: "w2",
    slug: "lighting-for-interviews",
    title: "Lighting for Interviews",
    description: "Master the art of lighting interview subjects. From corporate talking heads to cinematic documentary interviews.",
    thumbnail: "/placeholder.svg",
    instructor: instructors.sanjay,
    date: "2026-03-29",
    time: "3:00 PM IST",
    duration: "1.5 hours",
    capacity: 80,
    registered: 37,
    price: 199,
    isRegistered: true,
    isUpcoming: true,
    resourcesEnabled: false,
    whatYoullLearn: ["Three-point interview lighting", "Natural light setups", "Budget-friendly lighting gear", "Common mistakes to avoid"],
    faq: [
      { q: "Do I need professional lights?", a: "We'll show techniques using both pro lights and household lamps." },
    ],
    testimonials: [
      { name: "Ravi T.", text: "Sanjay's lighting workshop transformed how I light my YouTube videos." },
    ],
    zoomLink: "https://zoom.us/placeholder",
  },
  {
    id: "w3",
    slug: "storytelling-for-brands",
    title: "Storytelling for Brands",
    description: "Learn how to create compelling brand narratives through video content. Perfect for freelancers and agency professionals.",
    thumbnail: "/placeholder.svg",
    instructor: instructors.rajesh,
    date: "2026-04-05",
    time: "11:00 AM IST",
    duration: "2 hours",
    capacity: 120,
    registered: 45,
    price: 149,
    isRegistered: false,
    isUpcoming: true,
    resourcesEnabled: false,
    whatYoullLearn: ["Brand storytelling frameworks", "Client brief to concept", "Shooting brand films", "Case studies from Indian brands"],
    faq: [
      { q: "Is this for beginners?", a: "Some basic filmmaking knowledge is recommended." },
    ],
    testimonials: [
      { name: "Deepa K.", text: "Rajesh's brand storytelling framework changed my freelance career." },
      { name: "Mohan S.", text: "I landed my first brand deal after applying these concepts." },
    ],
    zoomLink: "https://zoom.us/placeholder",
  },
  {
    id: "w4",
    slug: "color-grading-workshop",
    title: "Introduction to Color Grading",
    description: "A hands-on session covering the basics of color correction and grading in DaVinci Resolve. Includes practice footage.",
    thumbnail: "/placeholder.svg",
    instructor: instructors.priya,
    date: "2026-02-15",
    time: "2:00 PM IST",
    duration: "2 hours",
    capacity: 80,
    registered: 78,
    price: 149,
    isRegistered: true,
    isUpcoming: false,
    resourcesEnabled: true,
    whatYoullLearn: ["Color correction vs grading", "Using scopes", "Basic node workflows", "Exporting graded footage"],
    faq: [],
    testimonials: [],
    zoomLink: "",
    recordingUrl: "https://example.com/recording",
    slidesUrl: "https://example.com/slides.pdf",
    resources: [
      { title: "Practice Footage Pack", url: "#", size: "450 MB" },
      { title: "LUT Pack (5 looks)", url: "#", size: "12 MB" },
      { title: "Session Notes PDF", url: "#", size: "2.4 MB" },
    ],
    relatedCourseSlug: "color-grading-davinci",
  },
  {
    id: "w5",
    slug: "audio-for-video",
    title: "Audio Essentials for Video",
    description: "Covering microphone selection, on-set recording, and basic audio post-production for filmmakers.",
    thumbnail: "/placeholder.svg",
    instructor: instructors.deepak,
    date: "2026-02-28",
    time: "4:00 PM IST",
    duration: "1.5 hours",
    capacity: 60,
    registered: 55,
    price: 99,
    isRegistered: true,
    isUpcoming: false,
    resourcesEnabled: false,
    whatYoullLearn: ["Mic types and when to use them", "Recording clean audio on set", "Basic audio editing"],
    faq: [],
    testimonials: [],
    zoomLink: "",
  },
];

export const courseCategories = [
  "All",
  "Filmmaking",
  "Editing",
  "Cinematography",
  "Content Creation",
  "Design",
  "Music",
];

export function getAllLessons(course: MockCourse): Lesson[] {
  return course.sections.flatMap((s) => s.lessons);
}

export function getLessonById(course: MockCourse, lessonId: string): Lesson | undefined {
  return getAllLessons(course).find((l) => l.id === lessonId);
}

export function getNextLesson(course: MockCourse): Lesson | undefined {
  const all = getAllLessons(course);
  return all.find((l) => !course.completedLessons.includes(l.id));
}
