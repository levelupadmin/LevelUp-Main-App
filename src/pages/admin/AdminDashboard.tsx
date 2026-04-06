import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Users, ShoppingCart, Package, IndianRupee } from "lucide-react";

interface Stats {
  total_students: number;
  active_enrolments: number;
  active_offerings: number;
  total_revenue: number;
}

interface RecentEnrolment {
  id: string;
  status: string;
  created_at: string;
  user_name: string;
  user_email: string;
  offering_title: string;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats>({ total_students: 0, active_enrolments: 0, active_offerings: 0, total_revenue: 0 });
  const [recent, setRecent] = useState<RecentEnrolment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Stats
      const [usersRes, enrolRes, offRes, payRes] = await Promise.all([
        supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "student"),
        supabase.from("enrolments").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("offerings").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("payment_orders").select("total_inr").eq("status", "captured"),
      ]);

      const revenue = (payRes.data || []).reduce((sum, r) => sum + Number(r.total_inr || 0), 0);

      setStats({
        total_students: usersRes.count || 0,
        active_enrolments: enrolRes.count || 0,
        active_offerings: offRes.count || 0,
        total_revenue: revenue,
      });

      // Recent enrolments
      const { data: enrolments } = await supabase
        .from("enrolments")
        .select("id, status, created_at, user_id, offering_id")
        .order("created_at", { ascending: false })
        .limit(10);

      if (enrolments && enrolments.length > 0) {
        const userIds = [...new Set(enrolments.map((e) => e.user_id))];
        const offeringIds = [...new Set(enrolments.map((e) => e.offering_id))];

        const [usersData, offeringsData] = await Promise.all([
          supabase.from("users").select("id, full_name, email").in("id", userIds),
          supabase.from("offerings").select("id, title").in("id", offeringIds),
        ]);

        const usersMap = Object.fromEntries((usersData.data || []).map((u) => [u.id, u]));
        const offMap = Object.fromEntries((offeringsData.data || []).map((o) => [o.id, o]));

        setRecent(
          enrolments.map((e) => ({
            id: e.id,
            status: e.status,
            created_at: e.created_at,
            user_name: usersMap[e.user_id]?.full_name || "Unknown",
            user_email: usersMap[e.user_id]?.email || "",
            offering_title: offMap[e.offering_id]?.title || "Unknown",
          }))
        );
      }

      setLoading(false);
    };
    load();
  }, []);

  const statCards = [
    { label: "Total Students", value: stats.total_students, icon: Users, color: "var(--accent-indigo)" },
    { label: "Active Enrolments", value: stats.active_enrolments, icon: ShoppingCart, color: "var(--accent-emerald)" },
    { label: "Active Offerings", value: stats.active_offerings, icon: Package, color: "var(--accent-amber)" },
    { label: "Total Revenue", value: `₹${stats.total_revenue.toLocaleString("en-IN")}`, icon: IndianRupee, color: "var(--accent-crimson)" },
  ];

  return (
    <AdminLayout title="Dashboard">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-[hsl(var(--accent-amber))] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="bg-card border border-border rounded-xl p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center"
                    style={{ background: `hsl(${card.color} / 0.15)` }}
                  >
                    <card.icon className="h-5 w-5" style={{ color: `hsl(${card.color})` }} />
                  </div>
                </div>
                <p className="text-[32px] font-bold leading-tight">{card.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Recent enrolments */}
          <div className="bg-card border border-border rounded-xl">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold">Recent Enrolments</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-left">
                    <th className="px-5 py-3 font-medium">Student</th>
                    <th className="px-5 py-3 font-medium">Offering</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                        No enrolments yet
                      </td>
                    </tr>
                  ) : (
                    recent.map((e) => (
                      <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                        <td className="px-5 py-3">
                          <p className="font-medium">{e.user_name}</p>
                          <p className="text-xs text-muted-foreground">{e.user_email}</p>
                        </td>
                        <td className="px-5 py-3">{e.offering_title}</td>
                        <td className="px-5 py-3 font-mono text-xs">
                          {new Date(e.created_at).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-block text-xs font-mono px-2 py-0.5 rounded ${
                            e.status === "active"
                              ? "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]"
                              : "bg-secondary text-muted-foreground"
                          }`}>
                            {e.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
};

export default AdminDashboard;
