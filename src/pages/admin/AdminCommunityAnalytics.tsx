import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, MessageSquare, Heart, Hash, FileText, Activity } from "lucide-react";

interface StatsData {
  totalSpaces: number;
  totalPosts: number;
  totalComments: number;
  totalMessages: number;
  totalLikes: number;
  activeContributors: number;
}

interface Contributor {
  user_id: string;
  full_name: string;
  posts: number;
  comments: number;
  messages: number;
  total: number;
}

interface SpaceRow {
  id: string;
  name: string;
  post_count: number;
  member_count: number;
}

interface RecentPost {
  id: string;
  title: string;
  space_name: string;
  author_name: string;
  created_at: string;
}

const AdminCommunityAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatsData>({
    totalSpaces: 0,
    totalPosts: 0,
    totalComments: 0,
    totalMessages: 0,
    totalLikes: 0,
    activeContributors: 0,
  });
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    // Stats queries in parallel
    const [spacesRes, postsRes, commentsRes, messagesRes, likesRes] = await Promise.all([
      (supabase as any).from("community_spaces").select("id", { count: "exact", head: true }),
      (supabase as any).from("community_posts").select("id", { count: "exact", head: true }),
      (supabase as any).from("community_comments").select("id", { count: "exact", head: true }),
      (supabase as any).from("community_messages").select("id", { count: "exact", head: true }),
      (supabase as any).from("community_likes").select("id", { count: "exact", head: true }),
    ]);

    // Active contributors in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: recentPostUsers } = await (supabase as any)
      .from("community_posts")
      .select("user_id")
      .gte("created_at", thirtyDaysAgo);
    const { data: recentCommentUsers } = await (supabase as any)
      .from("community_comments")
      .select("user_id")
      .gte("created_at", thirtyDaysAgo);
    const { data: recentMsgUsers } = await (supabase as any)
      .from("community_messages")
      .select("user_id")
      .gte("created_at", thirtyDaysAgo);

    const activeUserIds = new Set<string>();
    (recentPostUsers || []).forEach((r: any) => activeUserIds.add(r.user_id));
    (recentCommentUsers || []).forEach((r: any) => activeUserIds.add(r.user_id));
    (recentMsgUsers || []).forEach((r: any) => activeUserIds.add(r.user_id));

    setStats({
      totalSpaces: spacesRes.count ?? 0,
      totalPosts: postsRes.count ?? 0,
      totalComments: commentsRes.count ?? 0,
      totalMessages: messagesRes.count ?? 0,
      totalLikes: likesRes.count ?? 0,
      activeContributors: activeUserIds.size,
    });

    // Top 10 contributors (aggregate posts + comments + messages)
    const { data: allPosts } = await (supabase as any)
      .from("community_posts")
      .select("user_id");
    const { data: allComments } = await (supabase as any)
      .from("community_comments")
      .select("user_id");
    const { data: allMessages } = await (supabase as any)
      .from("community_messages")
      .select("user_id");

    const userAgg: Record<string, { posts: number; comments: number; messages: number }> = {};
    (allPosts || []).forEach((r: any) => {
      if (!userAgg[r.user_id]) userAgg[r.user_id] = { posts: 0, comments: 0, messages: 0 };
      userAgg[r.user_id].posts++;
    });
    (allComments || []).forEach((r: any) => {
      if (!userAgg[r.user_id]) userAgg[r.user_id] = { posts: 0, comments: 0, messages: 0 };
      userAgg[r.user_id].comments++;
    });
    (allMessages || []).forEach((r: any) => {
      if (!userAgg[r.user_id]) userAgg[r.user_id] = { posts: 0, comments: 0, messages: 0 };
      userAgg[r.user_id].messages++;
    });

    const sorted = Object.entries(userAgg)
      .map(([uid, v]) => ({
        user_id: uid,
        ...v,
        total: v.posts + v.comments + v.messages,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Get names for top contributors
    if (sorted.length > 0) {
      const { data: userNames } = await supabase
        .from("users")
        .select("id, full_name")
        .in("id", sorted.map((s) => s.user_id));
      const nameMap: Record<string, string> = {};
      (userNames || []).forEach((u) => {
        nameMap[u.id] = u.full_name || "Anonymous";
      });
      setContributors(
        sorted.map((s) => ({ ...s, full_name: nameMap[s.user_id] || "Anonymous" }))
      );
    } else {
      setContributors([]);
    }

    // Spaces breakdown
    const { data: spacesData } = await (supabase as any)
      .from("community_spaces")
      .select("id, name");

    if (spacesData && spacesData.length > 0) {
      const spaceIds = spacesData.map((s: any) => s.id);
      const { data: spacePosts } = await (supabase as any)
        .from("community_posts")
        .select("space_id")
        .in("space_id", spaceIds);

      const { data: spaceMembers } = await (supabase as any)
        .from("community_space_members")
        .select("space_id")
        .in("space_id", spaceIds);

      const postCountMap: Record<string, number> = {};
      (spacePosts || []).forEach((p: any) => {
        postCountMap[p.space_id] = (postCountMap[p.space_id] || 0) + 1;
      });
      const memberCountMap: Record<string, number> = {};
      (spaceMembers || []).forEach((m: any) => {
        memberCountMap[m.space_id] = (memberCountMap[m.space_id] || 0) + 1;
      });

      setSpaces(
        spacesData.map((s: any) => ({
          id: s.id,
          name: s.name,
          post_count: postCountMap[s.id] || 0,
          member_count: memberCountMap[s.id] || 0,
        }))
      );
    } else {
      setSpaces([]);
    }

    // Recent posts (last 20)
    const { data: rpData } = await (supabase as any)
      .from("community_posts")
      .select("id, title, space_id, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (rpData && rpData.length > 0) {
      const rpUserIds = [...new Set((rpData as any[]).map((p) => p.user_id))];
      const rpSpaceIds = [...new Set((rpData as any[]).map((p) => p.space_id))];

      const [rpUsersRes, rpSpacesRes] = await Promise.all([
        supabase.from("users").select("id, full_name").in("id", rpUserIds as string[]),
        (supabase as any).from("community_spaces").select("id, name").in("id", rpSpaceIds),
      ]);

      const rpNameMap: Record<string, string> = {};
      (rpUsersRes.data || []).forEach((u) => {
        rpNameMap[u.id] = u.full_name || "Anonymous";
      });
      const rpSpaceMap: Record<string, string> = {};
      (rpSpacesRes.data || []).forEach((s: any) => {
        rpSpaceMap[s.id] = s.name;
      });

      setRecentPosts(
        (rpData as any[]).map((p) => ({
          id: p.id,
          title: p.title || "Untitled",
          space_name: rpSpaceMap[p.space_id] || "Unknown",
          author_name: rpNameMap[p.user_id] || "Anonymous",
          created_at: p.created_at,
        }))
      );
    } else {
      setRecentPosts([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <AdminLayout title="Community Analytics">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  const statCards = [
    { label: "Total Spaces", value: stats.totalSpaces, icon: Hash, color: "text-[hsl(var(--accent-indigo))]" },
    { label: "Posts", value: stats.totalPosts, icon: FileText, color: "text-[hsl(var(--accent-amber))]" },
    { label: "Comments", value: stats.totalComments, icon: MessageSquare, color: "text-[hsl(var(--accent-emerald))]" },
    { label: "Messages", value: stats.totalMessages, icon: MessageSquare, color: "text-blue-400" },
    { label: "Likes", value: stats.totalLikes, icon: Heart, color: "text-rose-400" },
    { label: "Active (30d)", value: stats.activeContributors, icon: Activity, color: "text-purple-400" },
  ];

  return (
    <AdminLayout title="Community Analytics">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <p className="text-2xl font-bold">{card.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Top contributors */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-[hsl(var(--accent-amber))]" />
            <h3 className="text-lg font-semibold">Top 10 Contributors</h3>
          </div>
          {contributors.length === 0 ? (
            <p className="text-sm text-muted-foreground/60">No community activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium text-right">Posts</th>
                    <th className="pb-2 font-medium text-right">Comments</th>
                    <th className="pb-2 font-medium text-right">Messages</th>
                    <th className="pb-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {contributors.map((c, i) => (
                    <tr key={c.user_id} className="border-b border-border last:border-0">
                      <td className="py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                      <td className="py-2 font-medium">{c.full_name}</td>
                      <td className="py-2 text-right font-mono text-xs">{c.posts}</td>
                      <td className="py-2 text-right font-mono text-xs">{c.comments}</td>
                      <td className="py-2 text-right font-mono text-xs">{c.messages}</td>
                      <td className="py-2 text-right font-mono text-xs font-semibold">{c.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Spaces breakdown */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Hash className="h-5 w-5 text-[hsl(var(--accent-indigo))]" />
            <h3 className="text-lg font-semibold">Spaces Breakdown</h3>
          </div>
          {spaces.length === 0 ? (
            <p className="text-sm text-muted-foreground/60">No spaces created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Space</th>
                    <th className="pb-2 font-medium text-right">Members</th>
                    <th className="pb-2 font-medium text-right">Posts</th>
                  </tr>
                </thead>
                <tbody>
                  {spaces.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="py-2 font-medium">{s.name}</td>
                      <td className="py-2 text-right font-mono text-xs">{s.member_count}</td>
                      <td className="py-2 text-right font-mono text-xs">{s.post_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Recent activity feed */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-[hsl(var(--accent-emerald))]" />
          <h3 className="text-lg font-semibold">Recent Posts</h3>
        </div>
        {recentPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground/60">No posts yet.</p>
        ) : (
          <div className="space-y-3">
            {recentPosts.map((p) => (
              <div key={p.id} className="flex items-center gap-4 py-2 border-b border-border last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.author_name} in <span className="font-medium">{p.space_name}</span>
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(p.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminCommunityAnalytics;
