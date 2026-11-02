import { supabaseUrl } from "@/integrations/supabase/client";

/**
 * The shape of offerings.landing: one product's landing page, copied from its
 * marketing page (leveluplearning.in masterclass pages, leveluplearning.live
 * cohort pages). `kind` picks the template. Media values are keys in the
 * public `landing` bucket (or absolute URLs), resolved with `media()` so the
 * same JSON works on staging and live.
 */

export interface Item { title: string; detail?: string | null }
export interface Faq { question: string; answer: string }
export interface Review {
  name: string;
  role: string | null;
  /** 1 to 5 */
  score: number;
  text: string;
  program: string | null;
  date: string | null;
  /** About this product, not another LevelUp programme */
  own: boolean;
}

export interface MasterclassLanding {
  kind: "masterclass";
  v: 1;
  source_url: string;
  name: string;
  discipline: string;
  hero: {
    kicker: string | null;
    eyebrow: string | null;
    headline: string;
    headline2: string | null;
    lines: string[];
    proof: string | null;
    image: { d: string; m: string | null };
    /** pixel sizes, so the hero frame takes each photo's own shape and never cuts a face */
    size?: { d: [number, number]; m: [number, number] | null };
    video: { d: string | null; m: string | null };
    alt: string;
    position: string | null;
  };
  trailer: { youtube: string; title: string; caption: string | null; poster?: string | null } | null;
  films: {
    heading: string;
    body: string | null;
    items: { title: string; year: number | null; image: string; note: string | null; isNew?: boolean; wide?: boolean; alt?: string | null }[];
  } | null;
  ideas: {
    heading: string | null;
    body: string | null;
    items: { title: string; body: string; lesson: string | null; image: string; video: string | null; alt?: string | null }[];
  } | null;
  on_set: { image: string; alt: string } | null;
  lessons: { body: string | null; items: { n: number; title: string; line: string | null; seconds: number | null }[] };
  skills: { skill: string; lesson: string | null }[];
  /** null when the page has no quotes (Karthik) */
  quotes: { body: string | null; items: { text: string; lesson: string | null }[] } | null;
  included: Item[];
  bonuses: { heading: string | null; items: Item[] } | null;
  value: { label: string; value: string; note?: string | null }[];
  certificate: { image: string; alt: string } | null;
  reviews: { body: string | null; items: Review[] } | null;
  for_you: string[];
  not_for_you: string[];
  faqs: Faq[];
  closing: string | null;
  cta: { hero: string; card: string };
  facts: { lessons: number; minutes: number; language: string; price: number };
  refund: { days: number; sentence: string; short: string; steps: { title: string; body: string }[] } | null;
}

/**
 * A live cohort's page, v2: the same sections in the same order for every
 * cohort (founder, 2026-11-02: "keep a pattern for the cohorts"), carrying
 * only what someone needs to decide; "See the full program" links to the
 * cohort's website page for the rest. Text is the cohort page's own,
 * trimmed; nothing invented.
 */
export interface CohortLanding {
  kind: "cohort";
  v: 2;
  code: string;
  name: string;
  /** the cohort's full page on leveluplearning.live */
  full_page_url: string;
  hero: {
    eyebrow: string; headline: string; sub: string; image: string | null; video?: string | null; video_m?: string | null; position?: string | null;
    /** real people instead of one picture: a grid of portraits (Creator Academy's own creators) */
    mosaic?: string[];
  };
  /** 4 or 5: duration, format, time each week, next cohort, fee */
  facts: { label: string; value: string }[];
  trailer: Video | null;
  make: { title: string; body?: string | null; items: { title: string; body: string; image?: string | null }[] };
  how: { title: string; items: { title: string; body: string }[] };
  learn: { title: string; body?: string | null; modules: { label?: string | null; title: string; line: string }[] };
  mentors: { title: string; body?: string | null; items: { name: string; role?: string | null; line?: string | null; photo?: string | null }[]; work?: string[] };
  proof: {
    title: string;
    stats: { value: string; label: string }[];
    quotes?: { text: string; name: string; role?: string | null }[];
    creators?: { name: string; handle?: string | null; followers?: string | null; photo?: string | null }[];
    logos?: { title: string; items: string[] } | null;
    photos?: string[];
  };
  fit: { yes: { title: string; body: string }[]; no?: string | null } | null;
  admission: { title: string; steps: { title: string; body?: string | null }[] };
  fee: { price: string; note?: string | null; includes: string[]; extras?: string[] };
  faqs: Faq[];
  closing: { title: string; body?: string | null };
  /** false while the program's Vimeo videos only embed on its own website */
  vimeo_embeds?: boolean;
}

export type Landing = MasterclassLanding | CohortLanding;

/** A trailer or story: YouTube or Vimeo by id, or an mp4 key/URL. */
export interface Video { kind: "youtube" | "vimeo" | "mp4"; id_or_url: string; title: string | null; poster: string | null }

/** Where on the page a buy button sits, for the pay_cta_tapped funnel event. */
export type CtaSurface = "hero" | "sticky" | "price_card" | "closing";

/** What the product's buttons do, decided by PublicOffering with the same rules as its HeroActions. */
export type LandingAction =
  | { kind: "buy"; price: number; go: (surface: CtaSurface) => void }
  | { kind: "apply"; href: string }
  /** The phone apps: no prices, no buying (store rules); ContinueOnWebCTA instead. */
  | { kind: "native"; webPath: string };

export const isLanding = (v: unknown): v is Landing =>
  !!v && typeof v === "object" &&
  (((v as Landing).kind === "masterclass" && (v as Landing).v === 1) || ((v as Landing).kind === "cohort" && (v as Landing).v === 2));

/** A key in the public landing bucket, or an absolute URL, as a URL. */
export const media = (key: string | null | undefined): string | undefined =>
  !key ? undefined : /^https?:\/\//.test(key) ? key : `${supabaseUrl}/storage/v1/object/public/landing/${key}`;

/** How the page calls the mentor: "Nelson", but "G Venket Ram" and "DRK Kiran" in full. */
export const callName = (name: string) => {
  const first = name.split(/\s+/)[0] ?? name;
  return first.length <= 3 && first === first.toUpperCase() ? name : first;
};

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export const runtime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  // No-break spaces keep "2 h" and "33 min" whole when a heading wraps.
  return h ? `${h}\u00a0h${m ? ` ${m}\u00a0min` : ""}` : `${m}\u00a0min`;
};

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

/** On the phone apps, copy that names a price is left out (store rules). */
export const priceFree = (native: boolean) => (s: string | null | undefined) => !native || !s || !s.includes("₹");
