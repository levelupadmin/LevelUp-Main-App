import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type SortOption = "recent" | "helpful" | "highest" | "lowest";

export interface ReviewUser {
  full_name: string | null;
  avatar_url: string | null;
}

export interface Review {
  id: string;
  user_id: string;
  course_id: string;
  rating: number;
  review_text: string | null;
  status: string;
  helpful_count: number;
  is_verified_purchase: boolean;
  created_at: string;
  updated_at: string;
  user: ReviewUser;
}

export interface RatingStats {
  course_id: string;
  avg_rating: number;
  total_reviews: number;
  rating_1: number;
  rating_2: number;
  rating_3: number;
  rating_4: number;
  rating_5: number;
}

const PAGE_SIZE = 10;

const EMPTY_STATS: RatingStats = {
  course_id: "",
  avg_rating: 0,
  total_reviews: 0,
  rating_1: 0,
  rating_2: 0,
  rating_3: 0,
  rating_4: 0,
  rating_5: 0,
};

export function useReviews(courseId: string) {
  const { user } = useAuth();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<RatingStats>(EMPTY_STATS);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set());

  // ── Fetch stats ──────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("course_rating_stats")
      .select("*")
      .eq("course_id", courseId)
      .maybeSingle();
    if (data) setStats(data);
    else setStats({ ...EMPTY_STATS, course_id: courseId });
  }, [courseId]);

  // ── Fetch user's own review ──────────────────────────────────────
  const fetchUserReview = useCallback(async () => {
    if (!user) { setUserReview(null); return; }
    const { data } = await supabase
      .from("course_reviews")
      .select("*, user:users(full_name, avatar_url)")
      .eq("course_id", courseId)
      .eq("user_id", user.id)
      .maybeSingle();
    setUserReview(data as unknown as Review | null);
  }, [courseId, user]);

  // ── Fetch reviews list ───────────────────────────────────────────
  const fetchReviews = useCallback(
    async (pageNum: number, append: boolean) => {
      let query = supabase
        .from("course_reviews")
        .select("*, user:users(full_name, avatar_url)")
        .eq("course_id", courseId)
        .eq("status", "approved")
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (sortBy === "recent") query = query.order("created_at", { ascending: false });
      else if (sortBy === "helpful") query = query.order("helpful_count", { ascending: false });
      else if (sortBy === "highest") query = query.order("rating", { ascending: false });
      else if (sortBy === "lowest") query = query.order("rating", { ascending: true });

      const { data, error } = await query;
      if (error) { console.error(error); return; }

      const typed = (data || []) as unknown as Review[];
      setHasMore(typed.length === PAGE_SIZE);

      if (append) setReviews((prev) => [...prev, ...typed]);
      else setReviews(typed);
    },
    [courseId, sortBy]
  );

  // ── Fetch user's helpful votes ──────────────────────────────────
  const fetchVotes = useCallback(
    async (reviewIds: string[]) => {
      if (!user || reviewIds.length === 0) return;
      const { data } = await (supabase as any)
        .from("review_helpful_votes")
        .select("review_id")
        .eq("user_id", user.id)
        .in("review_id", reviewIds);
      setUserVotes(new Set((data || []).map((v: any) => v.review_id)));
    },
    [user]
  );

  // ── Initial load ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setPage(0);
      await Promise.all([fetchStats(), fetchUserReview(), fetchReviews(0, false)]);
      if (!cancelled) setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [fetchStats, fetchUserReview, fetchReviews]);

  // ── Fetch votes when reviews change ──────────────────────────────
  useEffect(() => {
    if (reviews.length > 0) fetchVotes(reviews.map((r) => r.id));
  }, [reviews, fetchVotes]);

  // ── Load more ────────────────────────────────────────────────────
  const loadMore = async () => {
    const next = page + 1;
    setPage(next);
    await fetchReviews(next, true);
  };

  // ── Check verified purchase ──────────────────────────────────────
  const checkVerifiedPurchase = async (): Promise<boolean> => {
    if (!user) return false;
    // Find offerings linked to this course
    const { data: links } = await supabase
      .from("offering_courses")
      .select("offering_id")
      .eq("course_id", courseId);
    if (!links || links.length === 0) return false;

    const offeringIds = links.map((l) => l.offering_id);
    const { data: orders } = await supabase
      .from("payment_orders")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "captured")
      .in("offering_id", offeringIds)
      .limit(1);
    return (orders || []).length > 0;
  };

  // ── Submit / update review ───────────────────────────────────────
  const submitReview = async (rating: number, reviewText: string) => {
    if (!user) { toast.error("Please sign in to leave a review"); return; }

    const isVerified = await checkVerifiedPurchase();

    const { error } = await supabase.from("course_reviews").upsert(
      {
        user_id: user.id,
        course_id: courseId,
        rating,
        review_text: reviewText || null,
        is_verified_purchase: isVerified,
        status: "approved",
      },
      { onConflict: "user_id,course_id" }
    );

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(userReview ? "Review updated" : "Review submitted");
    // Refresh
    await Promise.all([fetchStats(), fetchUserReview(), fetchReviews(0, false)]);
    setPage(0);
  };

  const updateReview = submitReview;

  // ── Toggle helpful vote ──────────────────────────────────────────
  const toggleHelpful = async (reviewId: string) => {
    if (!user) { toast.error("Please sign in to vote"); return; }

    const hasVoted = userVotes.has(reviewId);

    if (hasVoted) {
      await (supabase as any)
        .from("review_helpful_votes")
        .delete()
        .eq("review_id", reviewId)
        .eq("user_id", user.id);
      setUserVotes((prev) => {
        const next = new Set(prev);
        next.delete(reviewId);
        return next;
      });
    } else {
      await (supabase as any)
        .from("review_helpful_votes")
        .insert({ review_id: reviewId, user_id: user.id });
      setUserVotes((prev) => new Set(prev).add(reviewId));
    }

    // Optimistic update helpful_count
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId
          ? { ...r, helpful_count: r.helpful_count + (hasVoted ? -1 : 1) }
          : r
      )
    );
  };

  return {
    reviews,
    stats,
    userReview,
    loading,
    sortBy,
    setSortBy,
    loadMore,
    hasMore,
    submitReview,
    updateReview,
    toggleHelpful,
    userVotes,
    refetch: () => Promise.all([fetchStats(), fetchUserReview(), fetchReviews(0, false)]),
  };
}
