import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

export interface Channel {
  id: string;
  space_id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_default: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  author_name?: string;
  author_avatar?: string;
  reply_count?: number;
  reactions?: { emoji: string; count: number; has_reacted: boolean }[];
}

// ─── Channels ───

export const useChannels = (spaceId?: string) =>
  useQuery({
    queryKey: ["community-channels", spaceId],
    enabled: !!spaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_channels" as any)
        .select("*")
        .eq("space_id", spaceId!)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as Channel[];
    },
  });

// ─── Messages ───

export const useChannelMessages = (channelId?: string) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Realtime subscription
  useEffect(() => {
    if (!channelId) return;
    const channel = supabase
      .channel(`chat-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_messages", filter: `channel_id=eq.${channelId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["channel-messages", channelId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [channelId, qc]);

  return useQuery({
    queryKey: ["channel-messages", channelId],
    enabled: !!channelId,
    refetchInterval: 30000,
    queryFn: async () => {
      // Get top-level messages only (not thread replies)
      const { data: messages, error } = await supabase
        .from("channel_messages" as any)
        .select("*")
        .eq("channel_id", channelId!)
        .is("parent_id", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      if (!messages || messages.length === 0) return [];

      const msgIds = (messages as any[]).map((m: any) => m.id);
      const userIds = [...new Set((messages as any[]).map((m: any) => m.user_id))];

      const [{ data: profiles }, { data: replies }, { data: reactions }] = await Promise.all([
        supabase.from("profiles").select("id, name, avatar_url").in("id", userIds),
        supabase.from("channel_messages" as any).select("parent_id").in("parent_id", msgIds),
        supabase.from("message_reactions" as any).select("message_id, emoji, user_id").in("message_id", msgIds),
      ]);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      // Count replies per message
      const replyCount = new Map<string, number>();
      (replies || []).forEach((r: any) => {
        replyCount.set(r.parent_id, (replyCount.get(r.parent_id) || 0) + 1);
      });

      // Group reactions
      const reactionMap = new Map<string, Map<string, { count: number; users: Set<string> }>>();
      (reactions || []).forEach((r: any) => {
        if (!reactionMap.has(r.message_id)) reactionMap.set(r.message_id, new Map());
        const emojiMap = reactionMap.get(r.message_id)!;
        if (!emojiMap.has(r.emoji)) emojiMap.set(r.emoji, { count: 0, users: new Set() });
        const entry = emojiMap.get(r.emoji)!;
        entry.count++;
        entry.users.add(r.user_id);
      });

      return (messages as any[]).map((m: any) => {
        const profile = profileMap.get(m.user_id);
        const emojiMap = reactionMap.get(m.id);
        const reacts = emojiMap
          ? Array.from(emojiMap.entries()).map(([emoji, data]) => ({
              emoji,
              count: data.count,
              has_reacted: user ? data.users.has(user.id) : false,
            }))
          : [];
        return {
          ...m,
          author_name: profile?.name || "Unknown",
          author_avatar: profile?.avatar_url || "",
          reply_count: replyCount.get(m.id) || 0,
          reactions: reacts,
        } as ChatMessage;
      });
    },
  });
};

// ─── Thread Messages ───

export const useThreadMessages = (parentId?: string) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!parentId) return;
    const channel = supabase
      .channel(`thread-${parentId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_messages", filter: `parent_id=eq.${parentId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["thread-messages", parentId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [parentId, qc]);

  return useQuery({
    queryKey: ["thread-messages", parentId],
    enabled: !!parentId,
    queryFn: async () => {
      const { data: messages, error } = await supabase
        .from("channel_messages" as any)
        .select("*")
        .eq("parent_id", parentId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!messages || messages.length === 0) return [];

      const userIds = [...new Set((messages as any[]).map((m: any) => m.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      return (messages as any[]).map((m: any) => {
        const profile = profileMap.get(m.user_id);
        return {
          ...m,
          author_name: profile?.name || "Unknown",
          author_avatar: profile?.avatar_url || "",
          reply_count: 0,
          reactions: [],
        } as ChatMessage;
      });
    },
  });
};

// ─── Send Message ───

export const useSendMessage = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ channelId, content, parentId, imageUrl }: {
      channelId: string;
      content: string;
      parentId?: string;
      imageUrl?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("channel_messages" as any).insert({
        channel_id: channelId,
        user_id: user.id,
        content,
        parent_id: parentId || null,
        image_url: imageUrl || null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["channel-messages"] });
      if (vars.parentId) {
        qc.invalidateQueries({ queryKey: ["thread-messages", vars.parentId] });
      }
    },
  });
};

// ─── Toggle Reaction ───

export const useToggleReaction = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ messageId, emoji, hasReacted }: {
      messageId: string;
      emoji: string;
      hasReacted: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (hasReacted) {
        await supabase
          .from("message_reactions" as any)
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", user.id)
          .eq("emoji", emoji);
      } else {
        await supabase.from("message_reactions" as any).insert({
          message_id: messageId,
          user_id: user.id,
          emoji,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-messages"] });
    },
  });
};

// ─── Delete Message ───

export const useDeleteMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from("channel_messages" as any)
        .delete()
        .eq("id", messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-messages"] });
      qc.invalidateQueries({ queryKey: ["thread-messages"] });
    },
  });
};
