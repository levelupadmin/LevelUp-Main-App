import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Eye, Play, Search, Plus, RotateCcw } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RefundRow {
  id: string;
  payment_order_id: string;
  razorpay_payment_id: string;
  razorpay_refund_id: string | null;
  amount_inr: number;
  refund_type: string;
  reason: string;
  internal_notes: string | null;
  status: string;
  error_message: string | null;
  completed_at: string | null;
  created_at: string;
  student_name: string;
  student_email: string;
  offering_title: string;
  paid_amount: number;
}

interface PaymentOrderOption {
  id: string;
  total_inr: number;
  razorpay_payment_id: string;
  captured_at: string;
  user_full_name: string;
  user_email: string;
  offering_title: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 50;

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  initiated: {
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    label: "Initiated",
  },
  processing: {
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    label: "Processing",
  },
  completed: {
    className: "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]",
    label: "Completed",
  },
  failed: {
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    label: "Failed",
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const AdminRefunds = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  /* ---- list state ---- */
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  /* ---- new refund dialog ---- */
  const [newOpen, setNewOpen] = useState(false);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrderOption[]>([]);
  const [poLoading, setPoLoading] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PaymentOrderOption | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* ---- process confirm ---- */
  const [processId, setProcessId] = useState<string | null>(null);

  /* ---- view details dialog ---- */
  const [viewRefund, setViewRefund] = useState<RefundRow | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Load refunds list                                                */
  /* ---------------------------------------------------------------- */

  const load = useCallback(async () => {
    setLoading(true);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = (supabase as any)
      .from("refunds")
      .select(
        "id, payment_order_id, razorpay_payment_id, razorpay_refund_id, amount_inr, refund_type, reason, internal_notes, status, error_message, completed_at, created_at, payment_orders(total_inr, users(full_name, email), offerings(title))",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (debouncedSearch.trim()) {
      // Search across razorpay_payment_id or use ilike on joined fields
      // Since we can't ilike on nested joins easily, we'll filter client-side after fetch
      // But we CAN filter on razorpay_payment_id directly
      query = query.or(
        `razorpay_payment_id.ilike.%${debouncedSearch}%,razorpay_refund_id.ilike.%${debouncedSearch}%,reason.ilike.%${debouncedSearch}%`
      );
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("Failed to load refunds:", error);
      setRefunds([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    const rows: RefundRow[] = (data || []).map((r: any) => ({
      id: r.id,
      payment_order_id: r.payment_order_id,
      razorpay_payment_id: r.razorpay_payment_id,
      razorpay_refund_id: r.razorpay_refund_id,
      amount_inr: Number(r.amount_inr),
      refund_type: r.refund_type,
      reason: r.reason,
      internal_notes: r.internal_notes,
      status: r.status,
      error_message: r.error_message,
      completed_at: r.completed_at,
      created_at: r.created_at,
      student_name: r.payment_orders?.users?.full_name || "—",
      student_email: r.payment_orders?.users?.email || "—",
      offering_title: r.payment_orders?.offerings?.title || "—",
      paid_amount: Number(r.payment_orders?.total_inr || 0),
    }));

    setRefunds(rows);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [statusFilter, debouncedSearch]);

  /* ---------------------------------------------------------------- */
  /*  Load captured payment orders for "New Refund" dialog             */
  /* ---------------------------------------------------------------- */

  const loadPaymentOrders = async () => {
    setPoLoading(true);
    const { data, error } = await supabase
      .from("payment_orders")
      .select("id, total_inr, razorpay_payment_id, captured_at, users(full_name, email), offerings(title)")
      .eq("status", "captured")
      .order("captured_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Failed to load payment orders:", error);
      setPaymentOrders([]);
      setPoLoading(false);
      return;
    }

    setPaymentOrders(
      (data || []).map((po: any) => ({
        id: po.id,
        total_inr: Number(po.total_inr),
        razorpay_payment_id: po.razorpay_payment_id || "",
        captured_at: po.captured_at || "",
        user_full_name: po.users?.full_name || "Unknown",
        user_email: po.users?.email || "",
        offering_title: po.offerings?.title || "Unknown",
      }))
    );
    setPoLoading(false);
  };

  const openNewRefund = () => {
    setSelectedPO(null);
    setAmount("");
    setReason("");
    setInternalNotes("");
    loadPaymentOrders();
    setNewOpen(true);
  };

  /* ---------------------------------------------------------------- */
  /*  Submit new refund                                                */
  /* ---------------------------------------------------------------- */

  const handleSubmitRefund = async () => {
    if (!selectedPO) {
      toast({ title: "Select a payment order", variant: "destructive" });
      return;
    }
    const amtNum = parseFloat(amount);
    if (!amtNum || amtNum <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (amtNum > selectedPO.total_inr) {
      toast({ title: "Amount cannot exceed paid amount", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Reason is required", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    const refund_type = amtNum === selectedPO.total_inr ? "full" : "partial";

    // Insert the refund row
    const { data: newRefund, error: insertErr } = await (supabase as any)
      .from("refunds")
      .insert({
        payment_order_id: selectedPO.id,
        razorpay_payment_id: selectedPO.razorpay_payment_id,
        amount_inr: amtNum,
        refund_type,
        reason: reason.trim(),
        internal_notes: internalNotes.trim() || null,
        initiated_by: user?.id,
      })
      .select("id")
      .single();

    if (insertErr) {
      toast({ title: "Error creating refund", description: insertErr.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Call the edge function to process
    const { data: fnData, error: fnErr } = await supabase.functions.invoke("process-refund", {
      body: { refund_id: newRefund.id },
    });

    if (fnErr || fnData?.error) {
      const msg = fnData?.error || fnErr?.message || "Edge function failed";
      toast({ title: "Refund processing failed", description: msg, variant: "destructive" });
      // Refund row still exists with whatever status the edge function set
    } else {
      toast({ title: "Refund processed successfully" });
    }

    setNewOpen(false);
    setSubmitting(false);
    load();
  };

  /* ---------------------------------------------------------------- */
  /*  Process an initiated refund                                      */
  /* ---------------------------------------------------------------- */

  const handleProcess = async () => {
    if (!processId) return;

    // If the refund previously failed, reset its status so the edge function accepts it
    const target = refunds.find((r) => r.id === processId);
    if (target?.status === "failed") {
      await (supabase as any)
        .from("refunds")
        .update({ status: "initiated", error_message: null })
        .eq("id", processId);
    }

    const { data: fnData, error: fnErr } = await supabase.functions.invoke("process-refund", {
      body: { refund_id: processId },
    });

    if (fnErr || fnData?.error) {
      const msg = fnData?.error || fnErr?.message || "Edge function failed";
      toast({ title: "Refund processing failed", description: msg, variant: "destructive" });
    } else {
      toast({ title: "Refund processed successfully" });
    }

    setProcessId(null);
    load();
  };

  /* ---------------------------------------------------------------- */
  /*  Pagination helpers                                               */
  /* ---------------------------------------------------------------- */

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <AdminLayout title="Refunds">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email, offering, Razorpay ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="initiated">Initiated</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={openNewRefund}
          className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-2" /> New Refund
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Student</th>
              <th className="px-5 py-3 font-medium">Offering</th>
              <th className="px-5 py-3 font-medium text-right">Paid</th>
              <th className="px-5 py-3 font-medium text-right">Refund</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : refunds.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                  No refunds found
                </td>
              </tr>
            ) : (
              refunds.map((r) => {
                const badge = STATUS_BADGE[r.status] || STATUS_BADGE.initiated;
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-5 py-3">
                      <div className="font-medium">{r.student_name}</div>
                      <div className="text-xs text-muted-foreground">{r.student_email}</div>
                    </td>
                    <td className="px-5 py-3 max-w-[200px] truncate">{r.offering_title}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs">
                      {"\u20B9"}{r.paid_amount.toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs">
                      {"\u20B9"}{r.amount_inr.toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-mono capitalize">{r.refund_type}</span>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="secondary" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">
                      {new Date(r.created_at).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setViewRefund(r)}
                          className="p-1.5 rounded hover:bg-secondary"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {r.status === "initiated" && (
                          <button
                            onClick={() => setProcessId(r.id)}
                            className="p-1.5 rounded hover:bg-secondary text-blue-600"
                            title="Process refund"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        )}
                        {r.status === "failed" && (
                          <button
                            onClick={() => setProcessId(r.id)}
                            className="p-1.5 rounded hover:bg-secondary text-amber-600"
                            title="Retry refund"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of{" "}
            {totalCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  Process Confirmation AlertDialog                             */}
      {/* ============================================================ */}
      <AlertDialog open={!!processId} onOpenChange={() => setProcessId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Process this refund?</AlertDialogTitle>
            <AlertDialogDescription>
              This will submit the refund to Razorpay. The amount will be returned to the
              student's original payment method. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleProcess}>Process Refund</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============================================================ */}
      {/*  New Refund Dialog                                            */}
      {/* ============================================================ */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Refund</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Payment order selector */}
            <div>
              <label className="block text-sm font-medium mb-1">Payment Order</label>
              {poLoading ? (
                <p className="text-sm text-muted-foreground">Loading payment orders...</p>
              ) : (
                <SearchableSelect
                  options={paymentOrders.map((po) => ({
                    value: po.id,
                    label: `${po.user_full_name} — ${po.offering_title} — \u20B9${po.total_inr.toLocaleString("en-IN")}`,
                  }))}
                  value={selectedPO?.id || ""}
                  onValueChange={(v) => {
                    const po = paymentOrders.find((p) => p.id === v) || null;
                    setSelectedPO(po);
                    if (po) setAmount(po.total_inr.toString());
                  }}
                  placeholder="Select a captured payment..."
                  searchPlaceholder="Search by name, offering..."
                />
              )}
            </div>

            {/* Selected order details */}
            {selectedPO && (
              <div className="bg-secondary/50 rounded-lg p-3 text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Student:</span>{" "}
                  {selectedPO.user_full_name} ({selectedPO.user_email})
                </div>
                <div>
                  <span className="text-muted-foreground">Offering:</span>{" "}
                  {selectedPO.offering_title}
                </div>
                <div>
                  <span className="text-muted-foreground">Paid:</span>{" "}
                  {"\u20B9"}{selectedPO.total_inr.toLocaleString("en-IN")}
                </div>
                <div>
                  <span className="text-muted-foreground">Payment Date:</span>{" "}
                  {selectedPO.captured_at
                    ? new Date(selectedPO.captured_at).toLocaleDateString("en-IN")
                    : "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Razorpay ID:</span>{" "}
                  <span className="font-mono text-xs">{selectedPO.razorpay_payment_id}</span>
                </div>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Refund Amount ({"\u20B9"})
                {selectedPO && amount && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    {parseFloat(amount) === selectedPO.total_inr ? "(Full refund)" : "(Partial refund)"}
                  </span>
                )}
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={selectedPO?.total_inr || undefined}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Reason <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this refund being issued?"
                rows={3}
              />
            </div>

            {/* Internal notes */}
            <div>
              <label className="block text-sm font-medium mb-1">Internal Notes (optional)</label>
              <Textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Notes visible only to admins..."
                rows={2}
              />
            </div>

            {/* Submit with AlertDialog confirmation */}
            <ProcessRefundConfirm
              disabled={submitting || !selectedPO || !reason.trim() || !amount}
              submitting={submitting}
              amount={amount}
              studentName={selectedPO?.user_full_name}
              onConfirm={handleSubmitRefund}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  View Details Dialog                                          */}
      {/* ============================================================ */}
      <Dialog open={!!viewRefund} onOpenChange={() => setViewRefund(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Refund Details</DialogTitle>
          </DialogHeader>
          {viewRefund && (
            <div className="space-y-3 text-sm">
              <DetailRow label="Student" value={`${viewRefund.student_name} (${viewRefund.student_email})`} />
              <DetailRow label="Offering" value={viewRefund.offering_title} />
              <DetailRow label="Paid Amount" value={`\u20B9${viewRefund.paid_amount.toLocaleString("en-IN")}`} />
              <DetailRow label="Refund Amount" value={`\u20B9${viewRefund.amount_inr.toLocaleString("en-IN")}`} />
              <DetailRow label="Type" value={viewRefund.refund_type === "full" ? "Full Refund" : "Partial Refund"} />
              <DetailRow label="Status">
                <Badge
                  variant="secondary"
                  className={STATUS_BADGE[viewRefund.status]?.className || ""}
                >
                  {STATUS_BADGE[viewRefund.status]?.label || viewRefund.status}
                </Badge>
              </DetailRow>
              <DetailRow label="Reason" value={viewRefund.reason} />
              {viewRefund.internal_notes && (
                <DetailRow label="Internal Notes" value={viewRefund.internal_notes} />
              )}
              <DetailRow
                label="Razorpay Payment ID"
                value={viewRefund.razorpay_payment_id}
                mono
              />
              {viewRefund.razorpay_refund_id && (
                <DetailRow
                  label="Razorpay Refund ID"
                  value={viewRefund.razorpay_refund_id}
                  mono
                />
              )}
              {viewRefund.error_message && (
                <DetailRow label="Error" value={viewRefund.error_message} error />
              )}
              <DetailRow
                label="Created"
                value={new Date(viewRefund.created_at).toLocaleString("en-IN")}
              />
              {viewRefund.completed_at && (
                <DetailRow
                  label="Completed"
                  value={new Date(viewRefund.completed_at).toLocaleString("en-IN")}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ProcessRefundConfirm({
  disabled,
  submitting,
  amount,
  studentName,
  onConfirm,
}: {
  disabled: boolean;
  submitting: boolean;
  amount: string;
  studentName?: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        disabled={disabled}
        className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
        onClick={() => setOpen(true)}
      >
        {submitting ? "Processing..." : "Process Refund"}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Refund</AlertDialogTitle>
          <AlertDialogDescription>
            You are about to refund {"\u20B9"}{parseFloat(amount || "0").toLocaleString("en-IN")} to{" "}
            {studentName || "the student"}. This will call Razorpay and cannot be undone. Continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Confirm &amp; Process
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DetailRow({
  label,
  value,
  mono,
  error,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  error?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <span className="text-muted-foreground min-w-[140px] shrink-0">{label}:</span>
      {children || (
        <span
          className={[
            "break-all",
            mono ? "font-mono text-xs" : "",
            error ? "text-destructive" : "",
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

export default AdminRefunds;
