import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface PortfolioProject {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string;
  thumbnail_url: string | null;
  video_url: string | null;
  duration: string | null;
  is_pinned: boolean;
  appreciations: number;
  views: number;
  tools_used: string[];
  created_at: string;
  updated_at: string;
}

export function usePortfolioProjects(userId?: string) {
  return useQuery({
    queryKey: ["portfolio_projects", userId],
    queryFn: async () => {
      let query = supabase
        .from("portfolio_projects")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PortfolioProject[];
    },
    enabled: !!userId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (project: {
      title: string;
      description?: string;
      category: string;
      thumbnail_url?: string;
      video_url?: string;
      duration?: string;
      tools_used?: string[];
    }) => {
      const { data, error } = await supabase
        .from("portfolio_projects")
        .insert({ ...project, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio_projects"] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("portfolio_projects")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio_projects"] });
    },
  });
}

export function useTogglePin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_pinned }: { id: string; is_pinned: boolean }) => {
      const { error } = await supabase
        .from("portfolio_projects")
        .update({ is_pinned })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio_projects"] });
    },
  });
}

export async function uploadPortfolioThumbnail(userId: string, file: File) {
  const ext = file.name.split(".").pop();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("portfolio")
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("portfolio").getPublicUrl(path);
  return data.publicUrl;
}
