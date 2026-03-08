import instructor1 from "@/assets/instructor-1.jpg";
import instructor2 from "@/assets/instructor-2.jpg";
import courseCinematography from "@/assets/course-cinematography.jpg";
import courseEditing from "@/assets/course-editing.jpg";
import courseContent from "@/assets/course-content.jpg";

export type ApplicationStatus = "draft" | "submitted" | "under_review" | "accepted" | "waitlisted" | "rejected";
export type AssignmentStatus = "not_started" | "in_progress" | "submitted" | "reviewed";

export interface CohortMentor {
  id: string;
  name: string;
  title: string;
  image: string;
  bio: string;
}

export interface CohortWeek {
  week: number;
  title: string;
  description: string;
  topics: string[];
  assignment?: string;
}

export interface CohortTestimonial {
  id: string;
  name: string;
  avatar: string;
  cohortBatch: string;
  outcome: string;
  quote: string;
}

export interface CohortDemoProject {
  id: string;
  title: string;
  creator: string;
  image: string;
  description: string;
}

export interface CohortSession {
  id: string;
  title: string;
  date: string;
  time: string;
  type: "live" | "workshop" | "review" | "demo";
  mentor: string;
  completed: boolean;
}

export interface CohortAssignment {
  id: string;
  week: number;
  title: string;
  description: string;
  dueDate: string;
  status: AssignmentStatus;
  submittedAt?: string;
  feedback?: string;
  grade?: string;
}

export interface CohortResource {
  id: string;
  title: string;
  type: "pdf" | "video" | "link" | "template";
  url: string;
  week?: number;
}

export interface PeerReview {
  id: string;
  assignmentId: string;
  reviewerName: string;
  reviewerAvatar: string;
  rating: number;
  feedback: string;
  date: string;
}

export interface CohortApplication {
  id: string;
  cohortId: string;
  status: ApplicationStatus;
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    city: string;
    age: string;
  };
  creativeBackground: {
    experience: string;
    currentRole: string;
    tools: string[];
    yearsOfExperience: string;
  };
  portfolioLinks: {
    website: string;
    instagram: string;
    youtube: string;
    other: string;
  };
  statementOfPurpose: string;
  creativeBriefResponse: string;
  submittedAt?: string;
  reviewNotes?: string;
}

export interface Cohort {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  thumbnail: string;
  mentors: CohortMentor[];
  duration: string;
  startDate: string;
  applicationDeadline: string;
  price: number;
  emiPrice: number;
  emiMonths: number;
  totalSeats: number;
  filledSeats: number;
  outcome: string;
  description: string;
  selectionCriteria: string[];
  syllabus: CohortWeek[];
  testimonials: CohortTestimonial[];
  demoProjects: CohortDemoProject[];
  isApplicationOpen: boolean;
  // User-specific mock state
  userApplicationStatus?: ApplicationStatus;
  userAccepted?: boolean;
}

// ── Mock Mentors ──
const mentors: Record<string, CohortMentor> = {
  rajiv: { id: "m1", name: "Rajiv Menon", title: "Award-winning Filmmaker", image: instructor1, bio: "15+ years in Indian cinema. Known for documentary storytelling and visual poetry." },
  priya: { id: "m2", name: "Priya Sharma", title: "Senior Editor, YRF", image: instructor2, bio: "Lead editor on 20+ Bollywood features. Expert in rhythm-driven editing." },
  arjun: { id: "m3", name: "Arjun Kapoor", title: "Cinematographer", image: instructor1, bio: "Cannes-selected DP known for naturalistic lighting and handheld work." },
  meera: { id: "m4", name: "Meera Nair", title: "Content Strategist", image: instructor2, bio: "Built audiences of 2M+ across platforms. Runs a creator accelerator." },
};

// ── Syllabus builder ──
const makeSyllabus = (weeks: Array<{ title: string; description: string; topics: string[]; assignment?: string }>): CohortWeek[] =>
  weeks.map((w, i) => ({ week: i + 1, ...w }));

// ── Cohorts ──
export const cohorts: Cohort[] = [
  {
    id: "cohort-1",
    title: "Documentary Filmmaking Intensive",
    subtitle: "Tell stories that matter — from concept to festival submission",
    category: "Filmmaking",
    thumbnail: courseCinematography,
    mentors: [mentors.rajiv, mentors.arjun],
    duration: "8 weeks",
    startDate: "April 15, 2026",
    applicationDeadline: "March 31, 2026",
    price: 24999,
    emiPrice: 4499,
    emiMonths: 6,
    totalSeats: 30,
    filledSeats: 22,
    outcome: "Complete a festival-ready short documentary",
    description: "An intensive 8-week cohort where you'll go from idea to a polished short documentary. Live sessions, 1-on-1 mentorship, peer reviews, and a Demo Day showcase to industry professionals.",
    selectionCriteria: [
      "Basic understanding of filmmaking or photography",
      "Access to any camera (phone is fine)",
      "Ability to commit 10–15 hours per week",
      "Passion for documentary storytelling",
      "Portfolio or work samples preferred but not mandatory",
    ],
    isApplicationOpen: true,
    userApplicationStatus: undefined,
    userAccepted: false,
    syllabus: makeSyllabus([
      { title: "Finding Your Story", description: "Discover compelling subjects in everyday life", topics: ["Story research", "Subject identification", "Ethical considerations", "Proposal writing"], assignment: "Submit a 1-page documentary proposal" },
      { title: "Pre-Production", description: "Plan your shoot like a pro", topics: ["Shot lists", "Location scouting", "Interview planning", "Release forms"], assignment: "Create a detailed shot list and schedule" },
      { title: "Camera & Sound", description: "Technical foundations for documentary", topics: ["Handheld techniques", "Natural lighting", "Field audio recording", "B-roll strategy"], assignment: "Shoot a 2-minute observational sequence" },
      { title: "The Interview", description: "Get authentic stories from real people", topics: ["Interview techniques", "Building rapport", "Question design", "Multi-camera setups"], assignment: "Record a 10-minute interview" },
      { title: "Editing I: Structure", description: "Shape raw footage into narrative", topics: ["Assembly cuts", "Narrative structure", "Pacing fundamentals", "Selects and stringouts"], assignment: "Create a rough cut of your documentary" },
      { title: "Editing II: Polish", description: "Refine your edit to professional quality", topics: ["Sound design", "Color grading basics", "Music selection", "Graphics and titles"], assignment: "Submit your fine cut for peer review" },
      { title: "Feedback & Revision", description: "Iterate based on mentor and peer feedback", topics: ["Giving constructive feedback", "Revision strategies", "Festival submission prep", "Poster and synopsis"], assignment: "Final cut submission" },
      { title: "Demo Day", description: "Present your work to industry professionals", topics: ["Presentation skills", "Q&A preparation", "Networking", "Distribution strategy"] },
    ]),
    testimonials: [
      { id: "t1", name: "Aarav Patel", avatar: instructor1, cohortBatch: "Batch 1 — 2025", outcome: "Selected for MAMI Film Festival", quote: "This cohort transformed my approach to storytelling. The mentorship from Rajiv was invaluable." },
      { id: "t2", name: "Kavya Singh", avatar: instructor2, cohortBatch: "Batch 2 — 2025", outcome: "Now working at Vice India", quote: "The structured feedback loop and peer community pushed me to create my best work yet." },
      { id: "t3", name: "Rohan Gupta", avatar: instructor1, cohortBatch: "Batch 1 — 2025", outcome: "Launched a YouTube documentary channel (50K subs)", quote: "Demo Day gave me the confidence and connections to go independent." },
    ],
    demoProjects: [
      { id: "d1", title: "Streets of Dharavi", creator: "Aarav Patel", image: courseCinematography, description: "An intimate portrait of daily life in one of Asia's largest informal settlements" },
      { id: "d2", title: "The Last Puppeteer", creator: "Kavya Singh", image: courseEditing, description: "Following the final traditional puppeteer in Rajasthan" },
      { id: "d3", title: "Code & Chai", creator: "Rohan Gupta", image: courseContent, description: "India's startup culture through the lens of its chai stalls" },
    ],
  },
  {
    id: "cohort-2",
    title: "Professional Video Editing Bootcamp",
    subtitle: "Master the cut — from Premiere to DaVinci Resolve",
    category: "Editing",
    thumbnail: courseEditing,
    mentors: [mentors.priya],
    duration: "6 weeks",
    startDate: "May 1, 2026",
    applicationDeadline: "April 20, 2026",
    price: 17999,
    emiPrice: 3199,
    emiMonths: 6,
    totalSeats: 25,
    filledSeats: 25,
    outcome: "Build a professional editing reel for your portfolio",
    description: "A hands-on 6-week bootcamp covering professional editing workflows, color grading, sound design, and building a reel that gets you hired. Led by Priya Sharma, Senior Editor at YRF.",
    selectionCriteria: [
      "Basic familiarity with any editing software",
      "Access to Premiere Pro or DaVinci Resolve",
      "10 hours/week commitment",
      "Interest in narrative or commercial editing",
    ],
    isApplicationOpen: false,
    userApplicationStatus: "accepted",
    userAccepted: true,
    syllabus: makeSyllabus([
      { title: "Editing Fundamentals", description: "The grammar of the cut", topics: ["Cut types", "Pacing", "Continuity editing", "Assembly workflow"], assignment: "Re-edit a provided scene in two different styles" },
      { title: "Advanced Techniques", description: "Beyond the basics", topics: ["J & L cuts", "Match cuts", "Montage theory", "Multi-cam editing"], assignment: "Create a 1-minute montage" },
      { title: "Sound Design", description: "Audio that elevates visuals", topics: ["Dialogue editing", "Foley basics", "Music scoring", "Mixing fundamentals"], assignment: "Complete audio design for a scene" },
      { title: "Color Grading", description: "Set the mood with color", topics: ["Color theory", "DaVinci Resolve nodes", "Look development", "Matching shots"], assignment: "Grade a short film scene" },
      { title: "The Editor's Reel", description: "Build your calling card", topics: ["Reel structure", "Project selection", "Branding", "Online presentation"], assignment: "Draft your editing reel" },
      { title: "Industry & Demo Day", description: "Present to hiring managers", topics: ["Freelance workflow", "Rate negotiation", "Client management", "Presentation skills"] },
    ]),
    testimonials: [
      { id: "t4", name: "Nisha Reddy", avatar: instructor2, cohortBatch: "Batch 1 — 2025", outcome: "Hired as Junior Editor at Excel Entertainment", quote: "Priya's feedback on my reel directly led to my job offer. Incredible mentorship." },
    ],
    demoProjects: [
      { id: "d4", title: "Rhythm of Mumbai", creator: "Nisha Reddy", image: courseEditing, description: "A music-driven edit showcasing the rhythm of Mumbai's train system" },
    ],
  },
  {
    id: "cohort-3",
    title: "Creator Economy Accelerator",
    subtitle: "Turn your content into a sustainable creative business",
    category: "Content Creation",
    thumbnail: courseContent,
    mentors: [mentors.meera, mentors.rajiv],
    duration: "10 weeks",
    startDate: "June 1, 2026",
    applicationDeadline: "May 15, 2026",
    price: 29999,
    emiPrice: 5499,
    emiMonths: 6,
    totalSeats: 20,
    filledSeats: 8,
    outcome: "Launch a monetizable content brand with a clear growth roadmap",
    description: "A 10-week accelerator for serious creators. Build your brand, grow an audience, and monetize — with live strategy sessions, 1-on-1 coaching, and a capstone project pitch to brand partners.",
    selectionCriteria: [
      "Active on at least one content platform",
      "Minimum 1,000 followers on any platform",
      "Clear niche or area of expertise",
      "Willingness to publish weekly during the cohort",
      "Business mindset — interested in monetization",
    ],
    isApplicationOpen: true,
    userApplicationStatus: undefined,
    userAccepted: false,
    syllabus: makeSyllabus([
      { title: "Brand Foundation", description: "Define your unique creator identity", topics: ["Niche analysis", "Brand voice", "Visual identity", "Mission statement"], assignment: "Create your brand one-pager" },
      { title: "Content Strategy", description: "Plan content that grows", topics: ["Content pillars", "Platform strategy", "Content calendar", "Trend analysis"], assignment: "Build a 30-day content plan" },
      { title: "Production Systems", description: "Create consistently without burnout", topics: ["Batch creation", "SOPs", "Tool stack", "Team building"], assignment: "Document your production workflow" },
      { title: "Audience Growth", description: "Grow intentionally, not virally", topics: ["SEO for creators", "Collaboration strategy", "Community building", "Newsletter growth"], assignment: "Execute a growth experiment" },
      { title: "Monetization I", description: "Revenue streams for creators", topics: ["Sponsorships", "Digital products", "Consulting", "Memberships"], assignment: "Create a revenue model" },
      { title: "Monetization II", description: "Closing deals and pricing", topics: ["Media kit creation", "Rate cards", "Negotiation", "Contract basics"], assignment: "Build your media kit" },
      { title: "Analytics & Optimization", description: "Data-driven content decisions", topics: ["Platform analytics", "A/B testing", "Engagement metrics", "Revenue tracking"], assignment: "Monthly analytics report" },
      { title: "Community & Network", description: "Build your creator ecosystem", topics: ["Mastermind groups", "Event hosting", "Cross-promotion", "Mentorship"], assignment: "Host a community event" },
      { title: "Capstone Preparation", description: "Polish your brand pitch", topics: ["Pitch deck creation", "Storytelling for brands", "Demo reel", "Rehearsal"], assignment: "Final pitch deck" },
      { title: "Demo Day & Pitch", description: "Present to brand partners and investors", topics: ["Live pitch", "Q&A handling", "Follow-up strategy", "Next steps planning"] },
    ]),
    testimonials: [
      { id: "t5", name: "Vikram Joshi", avatar: instructor1, cohortBatch: "Batch 1 — 2025", outcome: "Grew from 5K to 80K followers, ₹3L/month revenue", quote: "The accelerator gave me a business framework I was missing. Meera's coaching changed everything." },
      { id: "t6", name: "Sneha Kapoor", avatar: instructor2, cohortBatch: "Batch 1 — 2025", outcome: "Signed 4 brand deals within 2 months of graduating", quote: "The media kit workshop alone was worth the entire investment." },
    ],
    demoProjects: [
      { id: "d5", title: "The Sustainable Kitchen", creator: "Vikram Joshi", image: courseContent, description: "A content brand around sustainable Indian cooking that grew to 80K followers" },
    ],
  },
];

export const getCohortById = (id: string): Cohort | undefined => cohorts.find((c) => c.id === id);

// ── Mock application state ──
export const mockApplications: CohortApplication[] = [
  {
    id: "app-1",
    cohortId: "cohort-1",
    status: "submitted",
    personalInfo: { fullName: "Aditya Kumar", email: "aditya@email.com", phone: "+91 98765 43210", city: "Mumbai", age: "24" },
    creativeBackground: { experience: "2 years of freelance videography", currentRole: "Freelance Videographer", tools: ["Premiere Pro", "After Effects", "Canon R6"], yearsOfExperience: "2" },
    portfolioLinks: { website: "https://adityakumar.com", instagram: "@aditya.films", youtube: "AdityaFilms", other: "" },
    statementOfPurpose: "I want to transition from wedding videography to documentary filmmaking. This cohort is the perfect bridge.",
    creativeBriefResponse: "I would document the daily life of Mumbai's dabbawalas, focusing on the human stories behind the logistics.",
    submittedAt: "2026-03-05T10:30:00Z",
  },
  {
    id: "app-2",
    cohortId: "cohort-1",
    status: "under_review",
    personalInfo: { fullName: "Riya Desai", email: "riya@email.com", phone: "+91 87654 32109", city: "Delhi", age: "28" },
    creativeBackground: { experience: "5 years in advertising", currentRole: "Creative Director", tools: ["DaVinci Resolve", "FinalCut Pro", "RED Camera"], yearsOfExperience: "5" },
    portfolioLinks: { website: "https://riyadesai.in", instagram: "@riya.creates", youtube: "", other: "https://vimeo.com/riyadesai" },
    statementOfPurpose: "After years in advertising, I want to tell stories that are truly mine. Documentary is where I see my future.",
    creativeBriefResponse: "I'd explore the vanishing art of hand-block printing in Jaipur through the eyes of a third-generation artisan family.",
    submittedAt: "2026-03-02T14:15:00Z",
  },
  {
    id: "app-3",
    cohortId: "cohort-1",
    status: "accepted",
    personalInfo: { fullName: "Sameer Khan", email: "sameer@email.com", phone: "+91 76543 21098", city: "Bangalore", age: "22" },
    creativeBackground: { experience: "Film school graduate", currentRole: "Student", tools: ["Premiere Pro", "Sony A7III"], yearsOfExperience: "1" },
    portfolioLinks: { website: "", instagram: "@sameer.shoots", youtube: "SameerKhan", other: "" },
    statementOfPurpose: "Fresh out of film school, I need structured mentorship to make my first real documentary.",
    creativeBriefResponse: "I'd document the underground indie music scene in Bangalore and its collision with classical traditions.",
    submittedAt: "2026-02-28T09:00:00Z",
    reviewNotes: "Strong creative vision. Accepted for Batch 3.",
  },
];

// ── Mock accepted user data (for cohort-2 which user is accepted into) ──
export const mockCohortSessions: CohortSession[] = [
  { id: "s1", title: "Editing Fundamentals — Live Session", date: "May 3, 2026", time: "7:00 PM IST", type: "live", mentor: "Priya Sharma", completed: true },
  { id: "s2", title: "Cut Types Workshop", date: "May 5, 2026", time: "7:00 PM IST", type: "workshop", mentor: "Priya Sharma", completed: true },
  { id: "s3", title: "Week 1 Assignment Review", date: "May 7, 2026", time: "6:00 PM IST", type: "review", mentor: "Priya Sharma", completed: true },
  { id: "s4", title: "Advanced Techniques — Live Session", date: "May 10, 2026", time: "7:00 PM IST", type: "live", mentor: "Priya Sharma", completed: false },
  { id: "s5", title: "J & L Cuts Workshop", date: "May 12, 2026", time: "7:00 PM IST", type: "workshop", mentor: "Priya Sharma", completed: false },
  { id: "s6", title: "Week 2 Peer Review", date: "May 14, 2026", time: "6:00 PM IST", type: "review", mentor: "Priya Sharma", completed: false },
  { id: "s7", title: "Demo Day", date: "June 7, 2026", time: "5:00 PM IST", type: "demo", mentor: "Priya Sharma", completed: false },
];

export const mockAssignments: CohortAssignment[] = [
  { id: "a1", week: 1, title: "Re-edit a scene in two different styles", description: "Take the provided raw footage and create two edits: one fast-paced commercial style and one slow contemplative documentary style.", dueDate: "May 7, 2026", status: "submitted", submittedAt: "May 6, 2026", feedback: "Great contrast between the two styles. Your pacing in the commercial cut is excellent. Work on the transitions in the doc version.", grade: "A-" },
  { id: "a2", week: 2, title: "Create a 1-minute montage", description: "Using the provided footage or your own, create a 1-minute montage that tells a complete story arc.", dueDate: "May 14, 2026", status: "in_progress" },
  { id: "a3", week: 3, title: "Complete audio design for a scene", description: "Take the silent scene provided and create a complete audio landscape: dialogue, ambience, foley, and music.", dueDate: "May 21, 2026", status: "not_started" },
  { id: "a4", week: 4, title: "Grade a short film scene", description: "Apply color grading to the provided raw footage. Create three different looks and justify your creative choices.", dueDate: "May 28, 2026", status: "not_started" },
  { id: "a5", week: 5, title: "Draft your editing reel", description: "Compile your best work from this cohort and previous projects into a 2-minute editing reel.", dueDate: "June 4, 2026", status: "not_started" },
];

export const mockPeerReviews: PeerReview[] = [
  { id: "pr1", assignmentId: "a1", reviewerName: "Nisha Reddy", reviewerAvatar: instructor2, rating: 4, feedback: "Love the pacing on the commercial cut! The doc version could use slightly longer holds on the interview moments.", date: "May 8, 2026" },
  { id: "pr2", assignmentId: "a1", reviewerName: "Karan Mehta", reviewerAvatar: instructor1, rating: 5, feedback: "Both cuts are strong. The way you used music in the commercial version was really effective.", date: "May 8, 2026" },
];

export const mockResources: CohortResource[] = [
  { id: "r1", title: "Raw Footage Pack — Week 1", type: "link", url: "#", week: 1 },
  { id: "r2", title: "Editing Fundamentals Slides", type: "pdf", url: "#", week: 1 },
  { id: "r3", title: "Cut Types Reference Guide", type: "pdf", url: "#", week: 1 },
  { id: "r4", title: "Raw Footage Pack — Week 2", type: "link", url: "#", week: 2 },
  { id: "r5", title: "Advanced Cuts Masterclass Recording", type: "video", url: "#", week: 2 },
  { id: "r6", title: "Premiere Pro Keyboard Shortcuts", type: "template", url: "#" },
  { id: "r7", title: "DaVinci Resolve Getting Started", type: "video", url: "#" },
  { id: "r8", title: "Editing Reel Template", type: "template", url: "#" },
];

// ── Empty application template ──
export const emptyApplication = (cohortId: string): CohortApplication => ({
  id: `app-${Date.now()}`,
  cohortId,
  status: "draft",
  personalInfo: { fullName: "", email: "", phone: "", city: "", age: "" },
  creativeBackground: { experience: "", currentRole: "", tools: [], yearsOfExperience: "" },
  portfolioLinks: { website: "", instagram: "", youtube: "", other: "" },
  statementOfPurpose: "",
  creativeBriefResponse: "",
});
