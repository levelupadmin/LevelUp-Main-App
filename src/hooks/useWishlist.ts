import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useWishlist() {
  const { user } = useAuth();
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setWishlistedIds(new Set()); setLoading(false); return; }
    const { data } = await (supabase as any)
      .from("wishlisted_offerings")
      .select("offering_id")
      .eq("user_id", user.id);
    setWishlistedIds(new Set((data || []).map((w: any) => w.offering_id)));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const toggle = useCallback(async (offeringId: string) => {
    if (!user) return;
    const isWishlisted = wishlistedIds.has(offeringId);
    // Optimistic update
    setWishlistedIds((prev) => {
      const next = new Set(prev);
      isWishlisted ? next.delete(offeringId) : next.add(offeringId);
      return next;
    });
    if (isWishlisted) {
      await (supabase as any)
        .from("wishlisted_offerings")
        .delete()
        .eq("user_id", user.id)
        .eq("offering_id", offeringId);
    } else {
      await (supabase as any)
        .from("wishlisted_offerings")
        .insert({ user_id: user.id, offering_id: offeringId });
    }
  }, [user, wishlistedIds]);

  return { wishlistedIds, toggle, loading };
}
