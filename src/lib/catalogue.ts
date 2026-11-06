/**
 * The catalogue's words and rules, in one place (founder, 6 Nov 2026;
 * vault LevelUp LMS Supercharged/03_Specs/04_Catalogue_Model_Plan.md).
 *
 *   Page      what people see (Explore, Home, /p/<slug>)      → pages
 *   Offering  what people pay for: the checkout                → offerings
 *   Content   what they watch                                  → courses
 *
 * Students are enrolled in an OFFERING. A page sells one offering at a time
 * (its button) and can hold several (batches). An offering unlocks one or more
 * courses, and a course can sit in many offerings.
 */

export const OFFERING_STATUS: Record<string, { label: string; hint: string }> = {
  active: { label: "Selling", hint: "Its checkout works" },
  archived: { label: "Closed", hint: "No new buyers; students keep access" },
  draft: { label: "Draft", hint: "Not sold, not shown" },
};

export const ACCESS: Record<string, { label: string; hint: string }> = {
  buy: { label: "Buy", hint: "Sold at its checkout. Needs a price above ₹0" },
  free: { label: "Free", hint: "Anyone can claim it at ₹0" },
  apply: { label: "Apply", hint: "Joined through an application (Tally or staged payments)" },
  team: { label: "Team adds", hint: "Only the team adds people (batches, imports, resource packs)" },
};
export const ACCESS_ORDER = ["buy", "free", "apply", "team"] as const;

export const LISTING: Record<string, { label: string; hint: string }> = {
  hidden: { label: "Hidden", hint: "Not shown anywhere" },
  link: { label: "Link only", hint: "The page works at its address but isn't listed" },
  listed: { label: "Listed", hint: "On Explore and in its Home row" },
  featured: { label: "Featured", hint: "Listed, and in the Home carousel" },
};
export const LISTING_ORDER = ["hidden", "link", "listed", "featured"] as const;

/** Formats (offerings.product_tier). Only the first three have a row on Home and Explore. */
export const FORMAT: Record<string, string> = {
  masterclass: "Masterclass",
  live_cohort: "Live cohort",
  workshop: "Workshop",
  other: "Resource pack / other",
  program: "Program",
  mastery: "Mastery program",
};
export const ROW_FORMATS = ["masterclass", "live_cohort", "workshop"] as const;
export const ROW_TITLE: Record<string, string> = {
  masterclass: "Masterclasses",
  live_cohort: "Live cohorts",
  workshop: "Workshops",
};

export interface ReadinessOffering {
  status: string;
  access: string;
  price_inr: number | string | null;
  product_tier: string | null;
  tally_form_url?: string | null;
  payment_mode?: string | null;
  thumbnail_url?: string | null;
  has_landing?: boolean;
}

export interface ReadinessCheck { ok: boolean; label: string }

/**
 * What a page needs before it may be Listed or Featured. `lessons` is the
 * number of lessons across the courses its button offering unlocks.
 */
export function pageReadiness(
  page: { button_offering_id: string | null; card_image_url?: string | null; listing?: string },
  offering: ReadinessOffering | null,
  lessons: number,
): ReadinessCheck[] {
  const price = Number(offering?.price_inr ?? 0);
  const access = offering?.access;
  const priced =
    access === "buy" ? price > 0
    : access === "apply" ? (offering?.tally_form_url ?? "").trim() !== "" || offering?.payment_mode === "staged"
    : access === "free";
  const pictured = !!(page.card_image_url || offering?.thumbnail_url || offering?.has_landing);
  return [
    { ok: !!offering, label: "Its button sells an offering" },
    { ok: offering?.status === "active", label: "It is Selling" },
    {
      ok: !!offering && priced,
      label: access === "apply" ? "It has an application link"
        : access === "team" ? "It can be bought or claimed (it is Team adds)"
        : access === "free" ? "It is free to claim"
        : "It has a price above ₹0",
    },
    { ok: !!offering && (ROW_FORMATS as readonly string[]).includes(offering.product_tier ?? ""), label: "Its format has a row (masterclass, live cohort or workshop)" },
    { ok: lessons > 0 || offering?.product_tier === "live_cohort", label: "It unlocks a course with lessons" },
    { ok: pictured, label: "It has a picture or a page design" },
  ];
}

export const isReady = (checks: ReadinessCheck[]) => checks.every((c) => c.ok);

/** Turn a title into an address: "Film Direction 101!" → "film-direction-101". */
export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);

/** Re-number a row 10, 20, 30… in the given order (stable gaps for later moves). */
export function renumber<T extends { id: string }>(items: T[]): { id: string; position: number }[] {
  return items.map((x, i) => ({ id: x.id, position: (i + 1) * 10 }));
}
