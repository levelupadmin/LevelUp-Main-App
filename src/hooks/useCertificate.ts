import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useCertificate = (courseId: string | undefined) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["certificate", courseId],
    enabled: !!courseId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select("*")
        .eq("course_id", courseId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
};

export const useGenerateCertificate = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ courseId, completionPct }: { courseId: string; completionPct: number }) => {
      if (!user) throw new Error("Not authenticated");
      // Check if certificate already exists
      const { data: existing } = await supabase
        .from("certificates")
        .select("id")
        .eq("course_id", courseId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing) return existing;

      const { data, error } = await supabase
        .from("certificates")
        .insert({
          course_id: courseId,
          user_id: user.id,
          completion_pct: completionPct,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["certificate", vars.courseId] });
    },
  });
};
