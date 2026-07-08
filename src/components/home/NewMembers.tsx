import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import InitialsAvatar from "@/components/InitialsAvatar";

// ── New Members (admin-only) ──
// Read moved to react-query (P6-T1) — cached under `["new-members"]`, gated to
// admins via `enabled` so a non-admin never fetches (RLS restricts the users
// table anyway). Query shape unchanged; pull-to-refresh invalidates the key.
const NewMembers = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { data: members = [] } = useQuery({
    queryKey: ["new-members"],
    enabled: isAdmin,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, bio, member_number, avatar_url")
        .eq("role", "student")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) if (import.meta.env.DEV) console.error("Failed to load new members:", error);
      return data ?? [];
    },
  });

  // Only show for admins; RLS restricts users table reads to own row
  if (!isAdmin) return null;

  // Nothing to show → no section.
  if (!members.length) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">New members</h2>
      <div className="flex gap-4 overflow-x-auto snap-x hide-scrollbar pb-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="min-w-[220px] max-w-[240px] bg-surface border border-border rounded-2xl p-4 card-hover flex-shrink-0 snap-start"
          >
            <div className="flex items-center gap-3">
              <InitialsAvatar name={m.full_name ?? "U"} photoUrl={m.avatar_url} size={48} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{m.full_name}</p>
                <p className="text-xs font-mono text-muted-foreground">#{m.member_number}</p>
              </div>
            </div>
            {m.bio && (
              <p className="text-xs text-muted-foreground mt-3 line-clamp-1">{m.bio}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default NewMembers;
