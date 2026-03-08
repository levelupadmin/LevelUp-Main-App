import instructor1 from "@/assets/instructor-1.jpg";
import instructor2 from "@/assets/instructor-2.jpg";
import heroFilmmaking from "@/assets/hero-filmmaking-1.jpg";
import heroEditing from "@/assets/hero-editing-1.jpg";

// ── Types ──
export type OpportunityType = "Job" | "Gig" | "Collaboration" | "Internship" | "Project Call";
export type VerificationLevel = "Admin" | "Verified Employer" | "Member";
export type LocationType = "Remote" | "On-site" | "Hybrid";
export type ApplicationStatus = "Applied" | "Shortlisted" | "Selected" | "Not Selected" | null;
export type Duration = "1 week" | "2 weeks" | "1 month" | "2–3 months" | "3+ months";

export interface OpportunityPoster {
  name: string;
  avatar: string;
  verification: VerificationLevel;
}

export interface Opportunity {
  id: string;
  title: string;
  type: OpportunityType;
  poster: OpportunityPoster;
  location: LocationType;
  city?: string;
  budgetMin: number;
  budgetMax: number;
  skills: string[];
  description: string;
  deadline: string;         // ISO date
  daysLeft: number;
  startDate: string;        // ISO date
  duration: Duration;
  postedAgo: string;
  applicationStatus: ApplicationStatus;
}

export const skillTaxonomy = [
  "Video Editing", "Cinematography", "Color Grading", "Sound Design",
  "Screenwriting", "Directing", "Motion Graphics", "VFX",
  "Content Strategy", "YouTube", "Instagram Reels", "Photography",
  "Music Production", "Foley", "DaVinci Resolve", "Premiere Pro",
  "After Effects", "Lighting", "Production Design", "Storyboarding",
];

export const opportunityTypes: OpportunityType[] = ["Job", "Gig", "Collaboration", "Internship", "Project Call"];
export const locationTypes: LocationType[] = ["Remote", "On-site", "Hybrid"];
export const durations: Duration[] = ["1 week", "2 weeks", "1 month", "2–3 months", "3+ months"];

export const mockOpportunities: Opportunity[] = [
  {
    id: "opp-1",
    title: "Lead Video Editor for Web Series",
    type: "Job",
    poster: { name: "LevelUp Team", avatar: instructor1, verification: "Admin" },
    location: "Remote",
    budgetMin: 40000,
    budgetMax: 75000,
    skills: ["Video Editing", "Color Grading", "DaVinci Resolve", "Sound Design"],
    description: `We're looking for a skilled video editor to join our post-production team for an upcoming 8-episode web series.\n\n**Responsibilities:**\n- Edit narrative-driven episodes (20–30 min each)\n- Collaborate with the director on pacing and story structure\n- Handle color grading and basic sound design\n- Deliver final exports in multiple formats\n\n**Requirements:**\n- 3+ years of professional editing experience\n- Proficiency in DaVinci Resolve or Premiere Pro\n- Strong storytelling instincts\n- Portfolio with narrative work samples\n\nThis is a remote position with weekly sync calls. Ideal for editors who love long-form storytelling.`,
    deadline: "2026-03-20",
    daysLeft: 12,
    startDate: "2026-04-01",
    duration: "2–3 months",
    postedAgo: "2 days ago",
    applicationStatus: null,
  },
  {
    id: "opp-2",
    title: "Cinematographer for Brand Film — Nike India",
    type: "Gig",
    poster: { name: "Rohan Kapoor", avatar: instructor1, verification: "Verified Employer" },
    location: "On-site",
    city: "Mumbai",
    budgetMin: 80000,
    budgetMax: 150000,
    skills: ["Cinematography", "Lighting", "Photography"],
    description: `Seeking an experienced cinematographer for a 2-day brand film shoot for Nike India's upcoming campaign.\n\n**Project Details:**\n- 60-second hero film + 3 cutdowns for social\n- Athletic/lifestyle aesthetic\n- Shoot location: Mumbai (studio + outdoor)\n- Production company handling all logistics\n\n**Requirements:**\n- Showreel with commercial/brand work\n- Own cinema camera setup preferred (RED/ARRI)\n- Experience with high-paced sports/lifestyle shoots\n- Available for pre-production meeting 1 week before shoot\n\nCompetitive day rate. Travel and accommodation covered for non-Mumbai candidates.`,
    deadline: "2026-03-15",
    daysLeft: 7,
    startDate: "2026-03-25",
    duration: "1 week",
    postedAgo: "5 days ago",
    applicationStatus: "Applied",
  },
  {
    id: "opp-3",
    title: "Collaborate on Indie Short Film — 'Neon Chai'",
    type: "Collaboration",
    poster: { name: "Priya Menon", avatar: instructor2, verification: "Verified Employer" },
    location: "Hybrid",
    city: "Bangalore",
    budgetMin: 10000,
    budgetMax: 25000,
    skills: ["Directing", "Screenwriting", "Cinematography", "Sound Design"],
    description: `Looking for passionate filmmakers to collaborate on 'Neon Chai' — a 15-minute indie short exploring Bangalore's late-night chai culture through a neo-noir lens.\n\n**What we need:**\n- Co-director or assistant director\n- Sound designer (post-production)\n- Anyone with a passion for indie cinema\n\n**What we offer:**\n- Shared credit and festival submissions\n- Small stipend (₹10K–25K depending on role)\n- A really good story and a fun team\n\n**Timeline:**\n- Pre-production: March\n- Shoot: April (3 nights)\n- Post: April–May\n\nThis is a passion project first. If you love cinema more than money, let's talk.`,
    deadline: "2026-03-18",
    daysLeft: 10,
    startDate: "2026-03-22",
    duration: "2–3 months",
    postedAgo: "1 day ago",
    applicationStatus: null,
  },
  {
    id: "opp-4",
    title: "Motion Graphics Intern — EdTech Startup",
    type: "Internship",
    poster: { name: "Aditya Sharma", avatar: instructor1, verification: "Member" },
    location: "Remote",
    budgetMin: 8000,
    budgetMax: 15000,
    skills: ["Motion Graphics", "After Effects", "Content Strategy"],
    description: `We're a fast-growing EdTech startup looking for a motion graphics intern to help create engaging educational content.\n\n**What you'll do:**\n- Design animated explainer videos (2–3 min each)\n- Create social media motion graphics (Instagram/YouTube)\n- Collaborate with the content team on visual storytelling\n- Learn from our senior design team\n\n**Ideal candidate:**\n- Currently studying or recently graduated in design/animation\n- Basic proficiency in After Effects\n- Bonus: Illustrator/Figma skills\n- Creative thinker with an eye for clean design\n\n**Perks:**\n- Monthly stipend: ₹8K–15K\n- Certificate of completion\n- Portfolio pieces you can actually be proud of\n- Potential for full-time conversion`,
    deadline: "2026-03-25",
    daysLeft: 17,
    startDate: "2026-04-01",
    duration: "2–3 months",
    postedAgo: "3 days ago",
    applicationStatus: null,
  },
  {
    id: "opp-5",
    title: "Project Call: Documentary on Street Musicians of Chennai",
    type: "Project Call",
    poster: { name: "Kavita Rajan", avatar: instructor2, verification: "Member" },
    location: "On-site",
    city: "Chennai",
    budgetMin: 20000,
    budgetMax: 50000,
    skills: ["Cinematography", "Sound Design", "Video Editing", "Music Production"],
    description: `Calling all documentary filmmakers, sound recordists, and music lovers!\n\nI'm producing a short documentary (25–30 min) about the street musicians of Chennai — from Marina Beach mridangam players to Mylapore flutists.\n\n**Crew needed:**\n- Cinematographer (available for 5–6 shoot days across 2 weeks)\n- Sound recordist (must have own field recording gear)\n- Editor (post-production, ~3 weeks turnaround)\n\n**Budget:** ₹20K–50K per role depending on experience\n\n**Why this project:**\n- Accepted into the Chennai Documentary Fund's mentorship program\n- Festival submission planned (MIFF, IDSFFK)\n- A chance to tell stories that matter\n\nSend your reel and a note about why this project speaks to you.`,
    deadline: "2026-03-22",
    daysLeft: 14,
    startDate: "2026-04-05",
    duration: "1 month",
    postedAgo: "6 hours ago",
    applicationStatus: "Shortlisted",
  },
];

export const getOpportunityById = (id: string) => mockOpportunities.find((o) => o.id === id);

export const typeColors: Record<OpportunityType, string> = {
  "Job": "bg-[hsl(var(--info))]",
  "Gig": "bg-[hsl(var(--highlight))]",
  "Collaboration": "bg-[hsl(var(--success))]",
  "Internship": "bg-[hsl(var(--streak))]",
  "Project Call": "bg-[hsl(var(--destructive))]",
};

export const verificationLabel: Record<VerificationLevel, { label: string; icon: string }> = {
  "Admin": { label: "Admin", icon: "✓✓" },
  "Verified Employer": { label: "Verified Employer", icon: "✓" },
  "Member": { label: "Member", icon: "" },
};
