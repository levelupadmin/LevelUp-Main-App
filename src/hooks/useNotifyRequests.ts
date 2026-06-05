import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/lib/toast";

// Backs the "Notify me" affordance on upcoming courses (Browse page). Loads the
// set of course ids the current user has already asked about, and exposes a
// requestNotify() that inserts interest (idempotent — a duplicate is treated as
// already-requested). The table isn't in the generated Supabase types yet, so
// we go through an `any`-typed client, matching the pattern used elsewhere for
// freshly-added tables.
const db = supabase as unknown as {
  from: (t: string) => any;
};

export function useNotifyRequests() {
  const { user } = useAuth();
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setRequestedIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await db
        .from("course_notify_requests")
        .select("course_id")
        .eq("user_id", user.id);
      if (cancelled) return;
      setRequestedIds(new Set((data || []).map((r: { course_id: string }) => r.course_id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const requestNotify = useCallback(
    async (courseId: string, courseTitle?: string) => {
      if (!user) {
        toast("Please sign in so we can email you when it launches.");
        return;
      }
      if (requestedIds.has(courseId) || pending.has(courseId)) return;

      setPending((p) => new Set(p).add(courseId));
      const { error } = await db
        .from("course_notify_requests")
        .insert({ course_id: courseId, user_id: user.id, email: user.email ?? null });
      setPending((p) => {
        const n = new Set(p);
        n.delete(courseId);
        return n;
      });

      // 23505 = unique violation = already on the list → idempotent success.
      if (error && error.code !== "23505") {
        toast.error("Couldn't save that. Please try again.");
        return;
      }
      setRequestedIds((s) => new Set(s).add(courseId));
      toast.success(
        courseTitle
          ? `We'll email you when ${courseTitle} launches.`
          : "We'll email you when it launches."
      );
    },
    [user, requestedIds, pending]
  );

  return { requestedIds, pending, requestNotify };
}
