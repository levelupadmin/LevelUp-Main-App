import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CommunitySpace {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string | null;
  icon: string | null;
  course_id: string | null;
  sort_order: number;
  created_at: string;
  post_count?: number;
}

export interface CommunityPost {
  id: string;
  space_id: string;
  user_id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  author_name?: string;
  author_avatar?: string;
  like_count?: number;
  comment_count?: number;
  has_liked?: boolean;
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  author_name?: string;
  author_avatar?: string;
}

// ─── Spaces ───

export const useSpaces = (type?: string) =>
  useQuery({
    queryKey: ["community-spaces", type],
    queryFn: async () => {
      let q = supabase.from("community_spaces" as any).select("*").order("sort_order");
      if (type) q = q.eq("type", type);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CommunitySpace[];
    },
  });

export const useSpace = (slug: string) =>
  useQuery({
    queryKey: ["community-space", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_spaces" as any)
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data as CommunitySpace | null;
    },
  });

// ─── Posts ───

export const usePosts = (spaceId?: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["community-posts", spaceId],
    queryFn: async () => {
      let q = supabase
        .from("community_posts" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (spaceId) q = q.eq("space_id", spaceId);
      const { data: posts, error } = await q;
      if (error) throw error;
      if (!posts || posts.length === 0) return [];

      // Enrich with profiles, likes, comments count
      const userIds = [...new Set((posts as any[]).map((p: any) => p.user_id))];
      const postIds = (posts as any[]).map((p: any) => p.id);

      const [{ data: profiles }, { data: likes }, { data: comments }] = await Promise.all([
        supabase.from("profiles").select("id, name, avatar_url").in("id", userIds),
        supabase.from("post_likes" as any).select("post_id, user_id").in("post_id", postIds),
        supabase.from("post_comments" as any).select("post_id").in("post_id", postIds),
      ]);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const likesByPost = new Map<string, any[]>();
      (likes || []).forEach((l: any) => {
        const arr = likesByPost.get(l.post_id) || [];
        arr.push(l);
        likesByPost.set(l.post_id, arr);
      });
      const commentsByPost = new Map<string, number>();
      (comments || []).forEach((c: any) => {
        commentsByPost.set(c.post_id, (commentsByPost.get(c.post_id) || 0) + 1);
      });

      return (posts as any[]).map((p: any) => {
        const profile = profileMap.get(p.user_id);
        const postLikes = likesByPost.get(p.id) || [];
        return {
          ...p,
          author_name: profile?.name || "Unknown",
          author_avatar: profile?.avatar_url || "",
          like_count: postLikes.length,
          comment_count: commentsByPost.get(p.id) || 0,
          has_liked: user ? postLikes.some((l: any) => l.user_id === user.id) : false,
        } as CommunityPost;
      });
    },
  });
};

export const useCreatePost = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ spaceId, title, body, imageUrl }: { spaceId: string; title: string; body?: string; imageUrl?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("community_posts" as any).insert({
        space_id: spaceId,
        user_id: user.id,
        title,
        body: body || null,
        image_url: imageUrl || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });
};

// ─── Likes ───

export const useToggleLike = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ postId, hasLiked }: { postId: string; hasLiked: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      if (hasLiked) {
        await supabase.from("post_likes" as any).delete().eq("post_id", postId).eq("user_id", user.id);
      } else {
        await supabase.from("post_likes" as any).insert({ post_id: postId, user_id: user.id });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });
};

// ─── Comments ───

export const usePostComments = (postId: string) => {
  return useQuery({
    queryKey: ["post-comments", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data: comments, error } = await supabase
        .from("post_comments" as any)
        .select("*")
        .eq("post_id", postId)
        .order("created_at");
      if (error) throw error;
      if (!comments || comments.length === 0) return [];

      const userIds = [...new Set((comments as any[]).map((c: any) => c.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, name, avatar_url").in("id", userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      return (comments as any[]).map((c: any) => {
        const profile = profileMap.get(c.user_id);
        return {
          ...c,
          author_name: profile?.name || "Unknown",
          author_avatar: profile?.avatar_url || "",
        } as PostComment;
      });
    },
  });
};

export const useCreateComment = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ postId, content, parentId }: { postId: string; content: string; parentId?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("post_comments" as any).insert({
        post_id: postId,
        user_id: user.id,
        content,
        parent_id: parentId || null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["post-comments", vars.postId] });
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });
};
