import masterclassLokesh from "@/assets/masterclass-lokesh-kanagaraj.png";
import masterclassNelson from "@/assets/masterclass-nelson-dilipkumar.png";
import masterclassKarthik from "@/assets/masterclass-karthik-subbaraj.png";
import masterclassRavi from "@/assets/masterclass-ravi-basrur.png";
import masterclassAnthony from "@/assets/masterclass-anthony-gonsalvez.png";
import masterclassVenketRam from "@/assets/masterclass-venket-ram.png";
import masterclassDrkKiran from "@/assets/masterclass-drk-kiran.png";

/**
 * Maps course slugs to locally bundled thumbnail images.
 * Used as a fallback when the DB thumbnail_url points to a missing file.
 */
export const COURSE_THUMBNAIL_MAP: Record<string, string> = {
  "lokesh-kanagaraj": masterclassLokesh,
  "nelson-dilipkumar": masterclassNelson,
  "karthik-subbaraj": masterclassKarthik,
  "ravi-basrur": masterclassRavi,
  "anthony-gonsalvez": masterclassAnthony,
  "g-venket-ram": masterclassVenketRam,
  "drk-kiran": masterclassDrkKiran,
};

/** Resolve a course thumbnail: use local asset if available, otherwise DB url */
export function resolveCourseThumbnail(slug: string, dbUrl: string | null): string | null {
  return COURSE_THUMBNAIL_MAP[slug] || dbUrl || null;
}
