import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CatalogCourse {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  product_tier: string;
  sort_order: number;
  duration_text: string | null;
  instructor_display_name: string | null;
  status: string;
  offering_id: string | null;
  offering_slug: string | null;
  offering_banner_url: string | null;
  offering_subtitle: string | null;
  price_inr: number | null;
  mrp_inr: number | null;
}

interface OfferingLite {
  id: string;
  slug: string | null;
  price_inr: number;
  mrp_inr: number | null;
  banner_url: string | null;
  subtitle: string | null;
}

// One parallel fetch instead of the old 5-step sequential waterfall:
// courses + active offerings + offering_courses land together, then the
// course→offering join happens client-side (primary_offering_id first,
// offering_courses fallback, same semantics as the old Browse page).
const fetchCatalog = async (): Promise<CatalogCourse[]> => {
  const [coursesRes, offeringsRes, ocsRes] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "id, title, description, thumbnail_url, product_tier, sort_order, duration_text, instructor_display_name, status, primary_offering_id, show_on_browse"
      )
      .in("status", ["published", "upcoming"])
      .order("sort_order", { ascending: true }),
    supabase
      .from("offerings")
      .select("id, slug, price_inr, mrp_inr, banner_url, subtitle")
      .eq("status", "active"),
    supabase.from("offering_courses").select("course_id, offering_id"),
  ]);

  if (coursesRes.error) throw coursesRes.error;

  const offeringMap: Record<string, OfferingLite> = {};
  (offeringsRes.data ?? []).forEach((o) => {
    offeringMap[o.id] = o;
  });

  // Fallback link for courses without a primary offering: first
  // offering_courses row wins (matches old behaviour).
  const fallbackOcMap: Record<string, string> = {};
  (ocsRes.data ?? []).forEach((oc) => {
    if (!fallbackOcMap[oc.course_id]) fallbackOcMap[oc.course_id] = oc.offering_id;
  });

  return (coursesRes.data ?? [])
    .filter((c) => c.show_on_browse !== false)
    .map((c) => {
      const offId = c.primary_offering_id || fallbackOcMap[c.id] || null;
      const off = offId ? offeringMap[offId] ?? null : null;
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        thumbnail_url: c.thumbnail_url,
        product_tier: c.product_tier,
        sort_order: c.sort_order,
        duration_text: c.duration_text,
        instructor_display_name: c.instructor_display_name,
        status: c.status,
        offering_id: offId,
        offering_slug: off?.slug ?? null,
        offering_banner_url: off?.banner_url ?? null,
        offering_subtitle: off?.subtitle ?? null,
        price_inr: off?.price_inr ?? null,
        mrp_inr: off?.mrp_inr ?? null,
      };
    });
};

export const CATALOG_QUERY_KEY = ["catalog"] as const;

export function useCatalog() {
  return useQuery({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: fetchCatalog,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export const ENROLLED_OFFERINGS_QUERY_KEY = "enrolled-offering-ids";

/** offering_ids the current user is actively enrolled in, drives the
 *  Continue-vs-View card CTA and the greeting sub-line on Home. */
export function useEnrolledOfferingIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [ENROLLED_OFFERINGS_QUERY_KEY, user?.id ?? "anon"],
    queryFn: async (): Promise<Set<string>> => {
      if (!user) return new Set<string>();
      const { data } = await supabase
        .from("enrolments")
        .select("offering_id")
        .eq("user_id", user.id)
        .eq("status", "active");
      return new Set(
        (data ?? [])
          .map((e) => e.offering_id)
          .filter((id): id is string => Boolean(id))
      );
    },
    // staleTime 0 (overriding the 5-min app default): render instantly from
    // cache but revalidate on every mount, so a fresh purchase flips cards
    // to "Continue" on the next visit instead of after 5 minutes.
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
