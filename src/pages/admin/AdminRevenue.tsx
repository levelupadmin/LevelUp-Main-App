import { useEffect, useState } from "react";
import usePageTitle from "@/hooks/usePageTitle";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  IndianRupee,
  ShoppingCart,
  TrendingUp,
  CalendarDays,
  Download,
  RotateCcw,
  X,
} from "lucide-react";
import SortableHeader, { useSort } from "@/components/admin/SortableHeader";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
  guest_phone: string | null;
  user_id: string | null;
  status: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  refunded_at: string | null;
  offerings: { title: string } | null;
}

interface RefundInfo {
  id: string;
  amount_inr: number;
  status: string;
  created_at: string;
  completed_at: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatINR = (rupees: number) =>
  `₹${Number(rupees).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const PAGE_SIZE = 25;

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  captured:  { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "Captured" },
  refunded:  { bg: "bg-amber-500/15",   text: "text-amber-400",   label: "Refunded" },
  pending:   { bg: "bg-zinc-500/15",    text: "text-zinc-400",    label: "Pending" },
  created:   { bg: "bg-zinc-500/15",    text: "text-zinc-400",    label: "Pending" },
  failed:    { bg: "bg-red-500/15",     text: "text-red-400",     label: "Failed" },
  cancelled: { bg: "bg-red-500/15",     text: "text-red-400",     label: "Cancelled" },
};

function statusBadge(status: string) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span className={`inline-block text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const AdminRevenue = () => {
  usePageTitle("Revenue");
  const { user } = useAuth();
  const { toast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateFilter>("30d");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(0);
  const { sort, toggle: rawToggle, comparator } = useSort<Order>("captured_at");
  const toggle = (field: keyof Order) => { rawToggle(field); setPage(0); };

  const [userMap, setUserMap] = useState<Record<string, { full_name: string | null; email: string | null; phone: string | null }>>({});
  const [refundMap, setRefundMap] = useState<Record<string, RefundInfo>>({});
  const [offeringTiers, setOfferingTiers] = useState<Record<string, string>>({});

  // Sidebar panel for transaction detail
  const [sidebarOrderId, setSidebarOrderId] = useState<string | null>(null);
  // Tier transaction drill-down
  const [tierTransactions, setTierTransactions] = useState<string | null>(null);

  // Inline refund form state
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);

  // Confirmation dialog
  const [confirmRefund, setConfirmRefund] = useState<{ orderId: string; amount: number; customerName: string } | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Load data                                                        */
  /* ---------------------------------------------------------------- */

  const fetchData = async () => {
    setLoading(true);

    // Fetch all payment orders (not just captured — we need refunded/pending/failed too)
    const { data, error } = await supabase
      .from("payment_orders")
      .select("id, offering_id, total_inr, subtotal_inr, discount_inr, gst_inr, captured_at, guest_email, guest_phone, user_id, status, razorpay_order_id, razorpay_payment_id, refunded_at, offerings(title)")
      .in("status", ["captured", "refunded"])
      .order("captured_at", { ascending: false });

    if (error) {
      if (import.meta.env.DEV) console.error(error);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as Order[];
    setOrders(rows);

    // Fetch user info (including phone)
    const userIds = [...new Set(rows.filter(o => o.user_id).map(o => o.user_id!))];
    if (userIds.length) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email, phone")
        .in("id", userIds);
      if (users) {
        const m: typeof userMap = {};
        users.forEach((u: any) => { m[u.id] = { full_name: u.full_name, email: u.email, phone: u.phone }; });
        setUserMap(m);
      }
    }

    // Fetch offering tiers for grouping
    const offeringIds = [...new Set(rows.map(o => o.offering_id))];
    if (offeringIds.length) {
      const { data: offeringData } = await supabase
        .from("offerings")
        .select("id, product_tier")
        .in("id", offeringIds);
      if (offeringData) {
        const tierMap: Record<string, string> = {};
        offeringData.forEach((o: any) => { tierMap[o.id] = o.product_tier || "other"; });
        setOfferingTiers(tierMap);
      }
    }

    // Fetch refund info for all orders that have been refunded
    const orderIds = rows.map(o => o.id);
    if (orderIds.length) {
      const { data: refunds } = await (supabase as any)
        .from("refunds")
        .select("id, payment_order_id, amount_inr, status, created_at, completed_at")
        .in("payment_order_id", orderIds)
        .order("created_at", { ascending: false });
      if (refunds) {
        const rm: Record<string, RefundInfo> = {};
        (refunds as any[]).forEach((r: any) => {
          // Keep the latest refund per order
          if (!rm[r.payment_order_id]) {
            rm[r.payment_order_id] = {
              id: r.id,
              amount_inr: Number(r.amount_inr),
              status: r.status,
              created_at: r.created_at,
              completed_at: r.completed_at,
            };
          }
        });
        setRefundMap(rm);
      }
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  /* ---------------------------------------------------------------- */
  /*  Filtering                                                        */
  /* ---------------------------------------------------------------- */

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
      if (customFrom) {
        const start = new Date(customFrom.getFullYear(), customFrom.getMonth(), customFrom.getDate());
        if (d < start) return false;
      }
      if (customTo) {
        const end = new Date(customTo.getFullYear(), customTo.getMonth(), customTo.getDate() + 1);
        if (d >= end) return false;
      }
      return true;
    }
    return true;
  });

  /* ---------------------------------------------------------------- */
  /*  CSV export                                                       */
  /* ---------------------------------------------------------------- */

  const exportCSV = () => {
    const esc = (v: string) => {
      let s = v.replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s}"`;
    };
    const header = "Date,Customer,Email,Phone,Offering,Subtotal,Discount,GST,Total,Status,Refund Status,Refund Amount,Refund Date";
    const rows = filtered.map(o => {
      const u = o.user_id ? userMap[o.user_id] : null;
      const name = u?.full_name || o.guest_email || "";
      const email = u?.email || o.guest_email || "";
      const phone = u?.phone || o.guest_phone || "";
      const offering = o.offerings?.title || "";
      const date = new Date(o.captured_at).toLocaleDateString("en-IN");
      const refund = refundMap[o.id];
      const refundStatus = refund?.status || "";
      const refundAmt = refund ? String(refund.amount_inr) : "";
      const refundDate = refund?.completed_at ? new Date(refund.completed_at).toLocaleDateString("en-IN") : "";

      const displayStatus = o.status === "refunded" ? "refunded" : o.status;

      return `${esc(date)},${esc(name)},${esc(email)},${esc(phone)},${esc(offering)},${o.subtotal_inr},${o.discount_inr},${o.gst_inr},${o.total_inr},${esc(displayStatus)},${esc(refundStatus)},${refundAmt},${esc(refundDate)}`;
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

  /* ---------------------------------------------------------------- */
  /*  Summary metrics                                                  */
  /* ---------------------------------------------------------------- */

  const totalRevenue = filtered.reduce((s, o) => s + Number(o.total_inr), 0);
  const todayRevenue = orders.filter(o => new Date(o.captured_at) >= startOfToday).reduce((s, o) => s + Number(o.total_inr), 0);
  const monthRevenue = orders.filter(o => new Date(o.captured_at) >= startOfMonth).reduce((s, o) => s + Number(o.total_inr), 0);

  // By tier (grouped)
  const TIER_LABELS: Record<string, string> = {
    live_cohort: "Live Cohort",
    masterclass: "Masterclass",
    advanced_program: "Advanced Program",
    workshop: "Workshop",
    other: "Other",
  };
  const byTier: Record<string, { label: string; count: number; revenue: number; offerings: Record<string, { title: string; count: number; revenue: number }> }> = {};
  filtered.forEach(o => {
    const tier = offeringTiers[o.offering_id] || "other";
    if (!byTier[tier]) byTier[tier] = { label: TIER_LABELS[tier] || tier, count: 0, revenue: 0, offerings: {} };
    byTier[tier].count++;
    byTier[tier].revenue += Number(o.total_inr);
    const offKey = o.offering_id;
    if (!byTier[tier].offerings[offKey]) byTier[tier].offerings[offKey] = { title: o.offerings?.title ?? "Unknown", count: 0, revenue: 0 };
    byTier[tier].offerings[offKey].count++;
    byTier[tier].offerings[offKey].revenue += Number(o.total_inr);
  });
  const tierList = Object.entries(byTier).sort((a, b) => b[1].revenue - a[1].revenue);

  const sorted = [...filtered].sort(comparator);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  /* ---------------------------------------------------------------- */
  /*  Refund flow                                                      */
  /* ---------------------------------------------------------------- */

  const openRefundForm = (order: Order) => {
    setRefundingId(order.id);
    setRefundAmount(String(order.total_inr));
    setRefundReason("");
    setRefundNotes("");
  };

  const cancelRefundForm = () => {
    setRefundingId(null);
    setRefundAmount("");
    setRefundReason("");
    setRefundNotes("");
  };

  const handleConfirmRefund = async () => {
    if (!confirmRefund) return;
    const order = orders.find(o => o.id === confirmRefund.orderId);
    if (!order) return;

    setRefundSubmitting(true);

    const amtNum = parseFloat(refundAmount);
    const refund_type = amtNum === Number(order.total_inr) ? "full" : "partial";

    // 1. Insert refund record
    const { data: newRefund, error: insertErr } = await (supabase as any)
      .from("refunds")
      .insert({
        payment_order_id: order.id,
        razorpay_payment_id: order.razorpay_payment_id,
        amount_inr: amtNum,
        refund_type,
        reason: refundReason.trim(),
        internal_notes: refundNotes.trim() || null,
        initiated_by: user?.id,
      })
      .select("id")
      .single();

    if (insertErr) {
      toast({ title: "Error creating refund", description: insertErr.message, variant: "destructive" });
      setRefundSubmitting(false);
      setConfirmRefund(null);
      return;
    }

    // 2. Invoke the edge function
    const { data: fnData, error: fnErr } = await supabase.functions.invoke("process-refund", {
      body: { refund_id: newRefund.id },
    });

    if (fnErr || fnData?.error) {
      const msg = fnData?.error || fnErr?.message || "Edge function failed";
      toast({ title: "Refund processing failed", description: msg, variant: "destructive" });
    } else {
      toast({ title: "Refund processed successfully" });
    }

    setRefundSubmitting(false);
    setConfirmRefund(null);
    cancelRefundForm();

    // Refresh data
    await fetchData();
  };

  const trySubmitRefund = (order: Order) => {
    const amtNum = parseFloat(refundAmount);
    if (!amtNum || amtNum <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (amtNum > Number(order.total_inr)) {
      toast({ title: "Amount cannot exceed paid amount", variant: "destructive" });
      return;
    }
    if (!refundReason.trim()) {
      toast({ title: "Reason is required", variant: "destructive" });
      return;
    }
    const u = order.user_id ? userMap[order.user_id] : null;
    const customerName = u?.full_name || order.guest_email || "the student";
    setConfirmRefund({ orderId: order.id, amount: amtNum, customerName });
  };

  /* ---------------------------------------------------------------- */
  /*  Render helpers                                                   */
  /* ---------------------------------------------------------------- */

  const filters: { label: string; value: DateFilter }[] = [
    { label: "Today", value: "today" },
    { label: "7 Days", value: "7d" },
    { label: "30 Days", value: "30d" },
    { label: "All Time", value: "all" },
    { label: "Custom", value: "custom" },
  ];

  const getDisplayStatus = (order: Order) => {
    if (order.status === "refunded" || order.refunded_at) return "refunded";
    // Check if there's an active/completed refund
    const refund = refundMap[order.id];
    if (refund && refund.status === "completed") return "refunded";
    return order.status;
  };

  const canRefund = (order: Order) => {
    const displayStatus = getDisplayStatus(order);
    if (displayStatus !== "captured") return false;
    // Check no pending/initiated refund exists
    const refund = refundMap[order.id];
    if (refund && (refund.status === "initiated" || refund.status === "processing" || refund.status === "completed")) return false;
    return true;
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <>
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
          <DateRangePicker
            from={customFrom}
            to={customTo}
            onChange={({ from, to }) => { setCustomFrom(from); setCustomTo(to); setPage(0); }}
          />
        )}
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
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

          {/* Revenue by Product Tier */}
          <h3 className="text-sm font-semibold mb-3">Revenue by Product Tier</h3>
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium text-right">Orders</th>
                  <th className="px-4 py-3 font-medium text-right">Revenue</th>
                  <th className="px-4 py-3 font-medium text-right w-40"></th>
                </tr>
              </thead>
              <tbody>
                {tierList.map(([tier, data]) => (
                  <tr key={tier} className="border-b border-border last:border-0 hover:bg-secondary/20">
                    <td className="px-4 py-3 font-semibold text-sm">{data.label}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{data.count}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold">{formatINR(data.revenue)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setTierTransactions(tierTransactions === tier ? null : tier)}
                        className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {tierTransactions === tier ? "Hide" : "View Transactions"}
                      </button>
                    </td>
                  </tr>
                ))}
                {tierList.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No transactions</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tier-specific transaction list */}
          {tierTransactions && byTier[tierTransactions] && (() => {
            const tierData = byTier[tierTransactions];
            const tierOrders = filtered
              .filter(o => (offeringTiers[o.offering_id] || "other") === tierTransactions)
              .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
            return (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">{tierData.label} — Transactions ({tierOrders.length})</h3>
                  <button onClick={() => setTierTransactions(null)} className="text-xs text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Customer</th>
                        <th className="px-4 py-3 font-medium">Offering</th>
                        <th className="px-4 py-3 font-medium text-right">Amount</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tierOrders.map(o => {
                        const u = o.user_id ? userMap[o.user_id] : null;
                        return (
                          <tr
                            key={o.id}
                            className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer"
                            onClick={() => setSidebarOrderId(o.id)}
                          >
                            <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                              {new Date(o.captured_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </td>
                            <td className="px-4 py-3 truncate max-w-[180px]">{u?.full_name || o.guest_email || "\u2014"}</td>
                            <td className="px-4 py-3 truncate max-w-[200px]">{o.offerings?.title ?? "\u2014"}</td>
                            <td className="px-4 py-3 text-right font-mono">{formatINR(Number(o.total_inr))}</td>
                            <td className="px-4 py-3">{statusBadge(getDisplayStatus(o))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Transaction list */}
          <h3 className="text-sm font-semibold mb-3">Transactions</h3>
          <div className="bg-card border border-border rounded-xl overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <SortableHeader label="Date" field="captured_at" current={sort} onSort={toggle} className="px-4 py-3" />
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Offering</th>
                  <SortableHeader label="Amount" field="total_inr" current={sort} onSort={toggle} className="px-4 py-3 text-right" />
                  <th className="px-4 py-3 font-medium text-right">Discount</th>
                  <th className="px-4 py-3 font-medium text-right">GST</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium w-8"></th>
                </tr>
              </thead>
              <tbody>
                {paged.map(o => {
                  const u = o.user_id ? userMap[o.user_id] : null;
                  const customerName = u?.full_name || o.guest_email || "\u2014";
                  const customerEmail = u?.email || o.guest_email || "";
                  const customerPhone = u?.phone || o.guest_phone || "";
                  const displayStatus = getDisplayStatus(o);
                  const isSelected = sidebarOrderId === o.id;

                  return (
                    <tr
                      key={o.id}
                      className={`border-b border-border last:border-0 cursor-pointer hover:bg-secondary/30 transition-colors ${isSelected ? "bg-secondary/20" : ""}`}
                      onClick={() => { setSidebarOrderId(isSelected ? null : o.id); if (refundingId && !isSelected) cancelRefundForm(); }}
                    >
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                        {new Date(o.captured_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate max-w-[180px]">{customerName}</p>
                        {customerEmail && customerName !== customerEmail && (
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{customerEmail}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {customerPhone || "\u2014"}
                      </td>
                      <td className="px-4 py-3 truncate max-w-[200px]">{o.offerings?.title ?? "\u2014"}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatINR(Number(o.total_inr))}</td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {Number(o.discount_inr) > 0 ? formatINR(Number(o.discount_inr)) : "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {Number(o.gst_inr) > 0 ? formatINR(Number(o.gst_inr)) : "\u2014"}
                      </td>
                      <td className="px-4 py-3">
                        {statusBadge(displayStatus)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">&rarr;</span>
                      </td>
                    </tr>
                  );
                })}
                {paged.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">No transactions found</td></tr>
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

      {/* Transaction Detail Sidebar */}
      {sidebarOrderId && (() => {
        const o = orders.find(x => x.id === sidebarOrderId);
        if (!o) return null;
        const u = o.user_id ? userMap[o.user_id] : null;
        const customerName = u?.full_name || o.guest_email || "\u2014";
        const customerEmail = u?.email || o.guest_email || "";
        const customerPhone = u?.phone || o.guest_phone || "";
        const displayStatus = getDisplayStatus(o);
        const refund = refundMap[o.id];
        const isRefunding = refundingId === o.id;

        return (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { setSidebarOrderId(null); cancelRefundForm(); }} />
            {/* Sidebar */}
            <div className="fixed top-0 right-0 h-full w-full max-w-md bg-card border-l border-border z-50 overflow-y-auto shadow-2xl">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">Transaction Details</h3>
                  <button
                    onClick={() => { setSidebarOrderId(null); cancelRefundForm(); }}
                    className="p-2 rounded-md hover:bg-secondary"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4 text-sm">
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Customer</h4>
                    <DetailRow label="Name" value={customerName} />
                    <DetailRow label="Email" value={customerEmail || "\u2014"} />
                    <DetailRow label="Phone" value={customerPhone || "\u2014"} />
                  </div>

                  <div className="border-t border-border pt-4 space-y-3">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Order</h4>
                    <DetailRow label="Offering" value={o.offerings?.title ?? "\u2014"} />
                    <DetailRow label="Date" value={new Date(o.captured_at).toLocaleString("en-IN")} />
                    <DetailRow label="Subtotal" value={formatINR(Number(o.subtotal_inr))} />
                    <DetailRow label="Discount" value={Number(o.discount_inr) > 0 ? formatINR(Number(o.discount_inr)) : "\u2014"} />
                    <DetailRow label="GST" value={Number(o.gst_inr) > 0 ? formatINR(Number(o.gst_inr)) : "\u2014"} />
                    <DetailRow label="Total" value={formatINR(Number(o.total_inr))} bold />
                  </div>

                  <div className="border-t border-border pt-4 space-y-3">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Payment</h4>
                    <DetailRow label="Status">{statusBadge(displayStatus)}</DetailRow>
                    <DetailRow label="Razorpay Order" value={o.razorpay_order_id || "\u2014"} mono />
                    <DetailRow label="Razorpay Payment" value={o.razorpay_payment_id || "\u2014"} mono />
                  </div>

                  {refund && (
                    <div className="border-t border-border pt-4 space-y-3">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Refund</h4>
                      <DetailRow label="Amount" value={formatINR(refund.amount_inr)} />
                      <DetailRow label="Status">
                        <Badge variant="secondary" className={
                          refund.status === "completed" ? "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]" :
                          refund.status === "failed" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
                          "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                        }>
                          {refund.status.charAt(0).toUpperCase() + refund.status.slice(1)}
                        </Badge>
                      </DetailRow>
                      <DetailRow label="Date" value={refund.completed_at ? new Date(refund.completed_at).toLocaleString("en-IN") : "Pending"} />
                    </div>
                  )}

                  {/* Refund actions */}
                  <div className="border-t border-border pt-4">
                    {canRefund(o) && !isRefunding && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRefundForm(o)}
                        className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" /> Issue Refund
                      </Button>
                    )}

                    {isRefunding && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold">Issue Refund</h4>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Refund Amount ({"\u20B9"})
                            {refundAmount && (
                              <span className="ml-2 text-muted-foreground font-normal">
                                {parseFloat(refundAmount) === Number(o.total_inr) ? "(Full)" : "(Partial)"}
                              </span>
                            )}
                          </label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={Number(o.total_inr)}
                            value={refundAmount}
                            onChange={(e) => setRefundAmount(e.target.value)}
                            placeholder="0.00"
                            className="h-9"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Reason <span className="text-destructive">*</span>
                          </label>
                          <Textarea
                            value={refundReason}
                            onChange={(e) => setRefundReason(e.target.value)}
                            placeholder="Why is this refund being issued?"
                            rows={2}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Internal Notes (optional)</label>
                          <Textarea
                            value={refundNotes}
                            onChange={(e) => setRefundNotes(e.target.value)}
                            placeholder="Notes visible only to admins..."
                            rows={2}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={refundSubmitting || !refundReason.trim() || !refundAmount}
                            onClick={() => trySubmitRefund(o)}
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            {refundSubmitting ? "Processing..." : "Confirm Refund"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelRefundForm} disabled={refundSubmitting}>
                            <X className="h-3 w-3 mr-1" /> Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {refund && refund.status === "failed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await (supabase as any)
                            .from("refunds")
                            .update({ status: "initiated", error_message: null })
                            .eq("id", refund.id);
                          const { data: fnData, error: fnErr } = await supabase.functions.invoke("process-refund", {
                            body: { refund_id: refund.id },
                          });
                          if (fnErr || fnData?.error) {
                            const msg = fnData?.error || fnErr?.message || "Edge function failed";
                            toast({ title: "Retry failed", description: msg, variant: "destructive" });
                          } else {
                            toast({ title: "Refund processed successfully" });
                          }
                          await fetchData();
                        }}
                        className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 mt-3"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" /> Retry Refund
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* Refund confirmation dialog */}
      <AlertDialog open={!!confirmRefund} onOpenChange={() => setConfirmRefund(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Refund</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to refund {"\u20B9"}{confirmRefund ? confirmRefund.amount.toLocaleString("en-IN") : "0"} to{" "}
              {confirmRefund?.customerName || "the student"}. This will call Razorpay and cannot be undone. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refundSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRefund} disabled={refundSubmitting}>
              {refundSubmitting ? "Processing..." : "Confirm & Process"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function DetailRow({
  label,
  value,
  mono,
  bold,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  bold?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground min-w-[120px] shrink-0 text-xs">{label}:</span>
      {children || (
        <span
          className={[
            "text-xs break-all",
            mono ? "font-mono" : "",
            bold ? "font-semibold" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {value}
        </span>
      )}
    </div>
  );
}

export default AdminRevenue;
