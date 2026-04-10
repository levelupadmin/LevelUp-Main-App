import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import usePageTitle from "@/hooks/usePageTitle";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IndianRupee, ShoppingCart, TrendingUp, CalendarDays, Download } from "lucide-react";
import SortableHeader, { useSort } from "@/components/admin/SortableHeader";

type DateFilter = "today" | "7d" | "30d" | "all" | "custom";

interface Order {
  id: string;
  offering_id: string;
  total_inr: number;
  subtotal_inr: number;
  discount_inr: number;
  gst_inr: number;
  captured_at: string;
  guest_email: string | null;
  user_id: string | null;
  offerings: { title: string } | null;
}

const formatINR = (rupees: number) => `₹${Number(rupees).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const PAGE_SIZE = 25;

const AdminRevenue = () => {
  usePageTitle("Revenue");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateFilter>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(0);
  const { sort, toggle: rawToggle, comparator } = useSort<Order>("captured_at");
  const toggle = (field: keyof Order) => { rawToggle(field); setPage(0); };
  const [userMap, setUserMap] = useState<Record<string, { full_name: string | null; email: string | null }>>({});

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("payment_orders")
        .select("id, offering_id, total_inr, subtotal_inr, discount_inr, gst_inr, captured_at, guest_email, user_id, offerings(title)")
        .eq("status", "captured")
        .order("captured_at", { ascending: false });

      if (error) { if (import.meta.env.DEV) console.error(error); setLoading(false); return; }

      const rows = (data ?? []) as unknown as Order[];
      setOrders(rows);

      // Fetch user info for non-guest orders
      const userIds = [...new Set(rows.filter(o => o.user_id).map(o => o.user_id!))];
      if (userIds.length) {
        const { data: users } = await supabase
          .from("users")
          .select("id, full_name, email")
          .in("id", userIds);
        if (users) {
          const m: typeof userMap = {};
          users.forEach(u => { m[u.id] = { full_name: u.full_name, email: u.email }; });
          setUserMap(m);
        }
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filtered = orders.filter(o => {
    if (dateRange === "all") return true;
    const d = new Date(o.captured_at);
    if (dateRange === "today") return d >= startOfToday;
    if (dateRange === "7d") return d >= new Date(now.getTime() - 7 * 86400000);
    if (dateRange === "30d") return d >= new Date(now.getTime() - 30 * 86400000);
    if (dateRange === "custom") {
      if (customFrom && d < new Date(customFrom)) return false;
      if (customTo) {
        const end = new Date(customTo);
        end.setDate(end.getDate() + 1);
        if (d >= end) return false;
      }
      return true;
    }
    return true;
  });

  const exportCSV = () => {
    // Escape CSV fields: wrap in quotes, escape internal quotes, neutralize formula injection
    const esc = (v: string) => {
      let s = v.replace(/"/g, '""');
      // Neutralize formula injection (=, +, -, @, tab, CR)
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s}"`;
    };
    const header = "Date,Customer,Email,Offering,Subtotal,Discount,GST,Total";
    const rows = filtered.map(o => {
      const u = o.user_id ? userMap[o.user_id] : null;
      const name = u?.full_name || o.guest_email || "";
      const email = u?.email || o.guest_email || "";
      const offering = o.offerings?.title || "";
      const date = new Date(o.captured_at).toLocaleDateString("en-IN");
      return `${esc(date)},${esc(name)},${esc(email)},${esc(offering)},${o.subtotal_inr},${o.discount_inr},${o.gst_inr},${o.total_inr}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `levelup-revenue-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalRevenue = filtered.reduce((s, o) => s + Number(o.total_inr), 0);
  const todayRevenue = orders.filter(o => new Date(o.captured_at) >= startOfToday).reduce((s, o) => s + Number(o.total_inr), 0);
  const monthRevenue = orders.filter(o => new Date(o.captured_at) >= startOfMonth).reduce((s, o) => s + Number(o.total_inr), 0);

  // By offering
  const byOffering: Record<string, { title: string; count: number; revenue: number }> = {};
  filtered.forEach(o => {
    const key = o.offering_id;
    if (!byOffering[key]) byOffering[key] = { title: o.offerings?.title ?? "Unknown", count: 0, revenue: 0 };
    byOffering[key].count++;
    byOffering[key].revenue += Number(o.total_inr);
  });
  const offeringList = Object.values(byOffering).sort((a, b) => b.revenue - a.revenue);

  const sorted = [...filtered].sort(comparator);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const filters: { label: string; value: DateFilter }[] = [
    { label: "Today", value: "today" },
    { label: "7 Days", value: "7d" },
    { label: "30 Days", value: "30d" },
    { label: "All Time", value: "all" },
    { label: "Custom", value: "custom" },
  ];

  return (
    <AdminLayout title="Revenue">
      {/* Date filters + export */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => { setDateRange(f.value); setPage(0); }}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              dateRange === f.value
                ? "bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))] border-[hsl(var(--accent-amber)/0.3)]"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        {dateRange === "custom" && (
          <>
            <Input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(0); }} className="w-36 h-9 text-sm" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPage(0); }} className="w-36 h-9 text-sm" />
          </>
        )}
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Filtered Revenue", value: formatINR(totalRevenue), icon: IndianRupee },
              { label: "Today", value: formatINR(todayRevenue), icon: TrendingUp },
              { label: "This Month", value: formatINR(monthRevenue), icon: CalendarDays },
              { label: "Total Orders", value: String(filtered.length), icon: ShoppingCart },
            ].map(c => (
              <Card key={c.label} className="p-4 bg-card border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[hsl(var(--accent-amber)/0.1)] flex items-center justify-center">
                    <c.icon className="h-4 w-4 text-[hsl(var(--accent-amber))]" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-mono uppercase">{c.label}</p>
                    <p className="text-lg font-semibold">{c.value}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Revenue by offering */}
          <h3 className="text-sm font-semibold mb-3">Revenue by Offering</h3>
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Offering</th>
                  <th className="px-4 py-3 font-medium text-right">Orders</th>
                  <th className="px-4 py-3 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {offeringList.map((o, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{o.title}</td>
                    <td className="px-4 py-3 text-right font-mono">{o.count}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatINR(o.revenue)}</td>
                  </tr>
                ))}
                {offeringList.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No transactions</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Transaction list */}
          <h3 className="text-sm font-semibold mb-3">Transactions</h3>
          <div className="bg-card border border-border rounded-xl overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <SortableHeader label="Date" field="captured_at" current={sort} onSort={toggle} className="px-4 py-3" />
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Offering</th>
                  <SortableHeader label="Amount" field="total_inr" current={sort} onSort={toggle} className="px-4 py-3 text-right" />
                  <th className="px-4 py-3 font-medium text-right">Discount</th>
                  <th className="px-4 py-3 font-medium text-right">GST</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(o => {
                  const u = o.user_id ? userMap[o.user_id] : null;
                  const customerName = u?.full_name || o.guest_email || "—";
                  const customerEmail = u?.email || o.guest_email || "";
                  return (
                    <tr key={o.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                        {new Date(o.captured_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate max-w-[180px]">{customerName}</p>
                        {customerEmail && customerName !== customerEmail && (
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{customerEmail}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 truncate max-w-[200px]">{o.offerings?.title ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatINR(Number(o.total_inr))}</td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {Number(o.discount_inr) > 0 ? formatINR(Number(o.discount_inr)) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {Number(o.gst_inr) > 0 ? formatINR(Number(o.gst_inr)) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                          Captured
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {paged.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No transactions found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages} · {filtered.length} orders
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-secondary transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-secondary transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
};

export default AdminRevenue;
