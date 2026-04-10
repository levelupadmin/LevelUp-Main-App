import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ChevronDown, ChevronRight, ArrowRightLeft } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */

interface Offering {
  id: string;
  title: string;
}

interface Batch {
  id: string;
  name: string;
  max_students: number | null;
  created_at: string;
  member_count: number;
}

interface Member {
  membership_id: string;
  enrolment_id: string;
  user_name: string;
  user_email: string;
  enrolled_at: string;
}

interface UnassignedStudent {
  enrolment_id: string;
  user_name: string;
  user_email: string;
  enrolled_at: string;
}

/* ── Component ─────────────────────────────────────────────── */

const AdminCohorts = () => {
  const { toast } = useToast();

  // Offering picker
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedOfferingId, setSelectedOfferingId] = useState("");

  // Batches for selected offering
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Expanded batch
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Unassigned count
  const [unassignedCount, setUnassignedCount] = useState(0);

  // New batch dialog
  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [newBatchName, setNewBatchName] = useState("");
  const [newBatchMax, setNewBatchMax] = useState("");
  const [saving, setSaving] = useState(false);

  // Add students dialog
  const [addStudentsOpen, setAddStudentsOpen] = useState(false);
  const [unassignedStudents, setUnassignedStudents] = useState<UnassignedStudent[]>([]);
  const [selectedEnrolmentIds, setSelectedEnrolmentIds] = useState<Set<string>>(new Set());
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);

  // Move dialog
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveMembershipId, setMoveMembershipId] = useState("");
  const [moveTargetBatchId, setMoveTargetBatchId] = useState("");

  // Delete batch
  const [deleteBatchId, setDeleteBatchId] = useState<string | null>(null);

  /* ── Load offerings ─────────────────────────────────────── */

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("offerings")
        .select("id, title")
        .eq("status", "active")
        .order("title");
      setOfferings(data ?? []);
    })();
  }, []);

  /* ── Load batches for offering ──────────────────────────── */

  const loadBatches = useCallback(async (offeringId: string) => {
    if (!offeringId) {
      setBatches([]);
      return;
    }
    setLoadingBatches(true);

    const { data: batchRows } = await (supabase as any)
      .from("cohort_batches")
      .select("id, name, max_students, created_at")
      .eq("offering_id", offeringId)
      .order("created_at", { ascending: true });

    if (!batchRows) {
      setBatches([]);
      setLoadingBatches(false);
      return;
    }

    // Get member counts
    const batchIds = batchRows.map((b: any) => b.id);
    let countMap: Record<string, number> = {};
    if (batchIds.length > 0) {
      const { data: memberRows } = await (supabase as any)
        .from("cohort_batch_members")
        .select("batch_id")
        .in("batch_id", batchIds);
      if (memberRows) {
        for (const m of memberRows) {
          countMap[m.batch_id] = (countMap[m.batch_id] || 0) + 1;
        }
      }
    }

    setBatches(
      batchRows.map((b: any) => ({
        id: b.id,
        name: b.name,
        max_students: b.max_students,
        created_at: b.created_at,
        member_count: countMap[b.id] || 0,
      }))
    );
    setLoadingBatches(false);
  }, []);

  const loadUnassignedCount = useCallback(async (offeringId: string) => {
    if (!offeringId) {
      setUnassignedCount(0);
      return;
    }

    // All active enrolments for this offering
    const { data: enrolments } = await supabase
      .from("enrolments")
      .select("id")
      .eq("offering_id", offeringId)
      .eq("status", "active");

    if (!enrolments || enrolments.length === 0) {
      setUnassignedCount(0);
      return;
    }

    const enrolmentIds = enrolments.map((e) => e.id);

    // Enrolments already in a batch for this offering
    const { data: batchRows } = await (supabase as any)
      .from("cohort_batches")
      .select("id")
      .eq("offering_id", offeringId);
    const batchIds = (batchRows ?? []).map((b: any) => b.id);

    if (batchIds.length === 0) {
      setUnassignedCount(enrolmentIds.length);
      return;
    }

    const { data: assigned } = await (supabase as any)
      .from("cohort_batch_members")
      .select("enrolment_id")
      .in("batch_id", batchIds);

    const assignedSet = new Set((assigned ?? []).map((a: any) => a.enrolment_id));
    setUnassignedCount(enrolmentIds.filter((id) => !assignedSet.has(id)).length);
  }, []);

  useEffect(() => {
    if (selectedOfferingId) {
      setExpandedBatchId(null);
      setMembers([]);
      loadBatches(selectedOfferingId);
      loadUnassignedCount(selectedOfferingId);
    } else {
      setBatches([]);
      setUnassignedCount(0);
    }
  }, [selectedOfferingId, loadBatches, loadUnassignedCount]);

  /* ── Load members for a batch ───────────────────────────── */

  const loadMembers = useCallback(async (batchId: string) => {
    setLoadingMembers(true);

    const { data: memberRows } = await (supabase as any)
      .from("cohort_batch_members")
      .select("id, enrolment_id, added_at")
      .eq("batch_id", batchId);

    if (!memberRows || memberRows.length === 0) {
      setMembers([]);
      setLoadingMembers(false);
      return;
    }

    const enrolmentIds = memberRows.map((m: any) => m.enrolment_id);
    const { data: enrolments } = await supabase
      .from("enrolments")
      .select("id, user_id, created_at")
      .in("id", enrolmentIds);

    const userIds = [...new Set((enrolments ?? []).map((e) => e.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", userIds);

    const userMap = Object.fromEntries((users ?? []).map((u) => [u.id, u]));
    const enrolMap = Object.fromEntries((enrolments ?? []).map((e) => [e.id, e]));

    setMembers(
      memberRows.map((m: any) => {
        const enrolment = enrolMap[m.enrolment_id];
        const user = enrolment ? userMap[enrolment.user_id] : null;
        return {
          membership_id: m.id,
          enrolment_id: m.enrolment_id,
          user_name: user?.full_name || "Unknown",
          user_email: user?.email || "",
          enrolled_at: enrolment?.created_at || m.added_at,
        };
      })
    );
    setLoadingMembers(false);
  }, []);

  const toggleBatch = (batchId: string) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      setMembers([]);
    } else {
      setExpandedBatchId(batchId);
      loadMembers(batchId);
    }
  };

  /* ── Create batch ───────────────────────────────────────── */

  const handleCreateBatch = async () => {
    if (!newBatchName.trim()) {
      toast({ title: "Batch name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      offering_id: selectedOfferingId,
      name: newBatchName.trim(),
    };
    if (newBatchMax.trim()) {
      payload.max_students = parseInt(newBatchMax, 10);
    }

    const { error } = await (supabase as any).from("cohort_batches").insert(payload);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Batch created" });
      setNewBatchOpen(false);
      setNewBatchName("");
      setNewBatchMax("");
      loadBatches(selectedOfferingId);
      loadUnassignedCount(selectedOfferingId);
    }
    setSaving(false);
  };

  /* ── Add students dialog ────────────────────────────────── */

  const openAddStudents = async () => {
    if (!expandedBatchId || !selectedOfferingId) return;
    setLoadingUnassigned(true);
    setSelectedEnrolmentIds(new Set());
    setAddStudentsOpen(true);

    // Active enrolments for this offering
    const { data: enrolments } = await supabase
      .from("enrolments")
      .select("id, user_id, created_at")
      .eq("offering_id", selectedOfferingId)
      .eq("status", "active");

    if (!enrolments || enrolments.length === 0) {
      setUnassignedStudents([]);
      setLoadingUnassigned(false);
      return;
    }

    // Find which enrolments are already in ANY batch for this offering
    const { data: batchRows } = await (supabase as any)
      .from("cohort_batches")
      .select("id")
      .eq("offering_id", selectedOfferingId);
    const batchIds = (batchRows ?? []).map((b: any) => b.id);

    let assignedSet = new Set<string>();
    if (batchIds.length > 0) {
      const { data: assigned } = await (supabase as any)
        .from("cohort_batch_members")
        .select("enrolment_id")
        .in("batch_id", batchIds);
      assignedSet = new Set((assigned ?? []).map((a: any) => a.enrolment_id));
    }

    const unassigned = enrolments.filter((e) => !assignedSet.has(e.id));

    if (unassigned.length === 0) {
      setUnassignedStudents([]);
      setLoadingUnassigned(false);
      return;
    }

    const userIds = [...new Set(unassigned.map((e) => e.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", userIds);
    const userMap = Object.fromEntries((users ?? []).map((u) => [u.id, u]));

    setUnassignedStudents(
      unassigned.map((e) => ({
        enrolment_id: e.id,
        user_name: userMap[e.user_id]?.full_name || "Unknown",
        user_email: userMap[e.user_id]?.email || "",
        enrolled_at: e.created_at,
      }))
    );
    setLoadingUnassigned(false);
  };

  const handleAddStudents = async () => {
    if (selectedEnrolmentIds.size === 0 || !expandedBatchId) return;

    // Fix 28: Check batch capacity before adding
    const currentBatch = batches.find((b) => b.id === expandedBatchId);
    if (currentBatch && currentBatch.max_students) {
      const newTotal = currentBatch.member_count + selectedEnrolmentIds.size;
      if (newTotal > currentBatch.max_students) {
        toast({
          title: "Batch at capacity",
          description: `This batch allows ${currentBatch.max_students} students and already has ${currentBatch.member_count}. You are trying to add ${selectedEnrolmentIds.size}, which would exceed the limit.`,
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);

    const rows = [...selectedEnrolmentIds].map((enrolment_id) => ({
      batch_id: expandedBatchId,
      enrolment_id,
    }));

    const { error } = await (supabase as any).from("cohort_batch_members").insert(rows);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${rows.length} student(s) added to batch` });
      setAddStudentsOpen(false);
      loadMembers(expandedBatchId);
      loadBatches(selectedOfferingId);
      loadUnassignedCount(selectedOfferingId);
    }
    setSaving(false);
  };

  /* ── Remove member ──────────────────────────────────────── */

  const handleRemoveMember = async (membershipId: string) => {
    const { error } = await (supabase as any)
      .from("cohort_batch_members")
      .delete()
      .eq("id", membershipId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Removed from batch" });
      if (expandedBatchId) loadMembers(expandedBatchId);
      loadBatches(selectedOfferingId);
      loadUnassignedCount(selectedOfferingId);
    }
  };

  /* ── Move member ────────────────────────────────────────── */

  const openMoveDialog = (membershipId: string) => {
    setMoveMembershipId(membershipId);
    setMoveTargetBatchId("");
    setMoveOpen(true);
  };

  const handleMoveMember = async () => {
    if (!moveTargetBatchId || !moveMembershipId) return;

    // Fix 28: Check target batch capacity before moving
    const targetBatch = batches.find((b) => b.id === moveTargetBatchId);
    if (targetBatch && targetBatch.max_students) {
      if (targetBatch.member_count + 1 > targetBatch.max_students) {
        toast({
          title: "Target batch at capacity",
          description: `"${targetBatch.name}" already has ${targetBatch.member_count}/${targetBatch.max_students} students.`,
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);

    const { error } = await (supabase as any)
      .from("cohort_batch_members")
      .update({ batch_id: moveTargetBatchId })
      .eq("id", moveMembershipId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Moved to new batch" });
      setMoveOpen(false);
      if (expandedBatchId) loadMembers(expandedBatchId);
      loadBatches(selectedOfferingId);
      loadUnassignedCount(selectedOfferingId);
    }
    setSaving(false);
  };

  /* ── Delete batch ────────────────────────────────────────── */

  const handleDeleteBatch = async () => {
    if (!deleteBatchId) return;
    const { error } = await (supabase as any)
      .from("cohort_batches")
      .delete()
      .eq("id", deleteBatchId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Batch deleted" });
      if (expandedBatchId === deleteBatchId) {
        setExpandedBatchId(null);
        setMembers([]);
      }
      loadBatches(selectedOfferingId);
      loadUnassignedCount(selectedOfferingId);
    }
    setDeleteBatchId(null);
  };

  /* ── Toggle selection helpers ───────────────────────────── */

  const toggleEnrolment = (id: string) => {
    setSelectedEnrolmentIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAllUnassigned = () => {
    if (selectedEnrolmentIds.size === unassignedStudents.length) {
      setSelectedEnrolmentIds(new Set());
    } else {
      setSelectedEnrolmentIds(new Set(unassignedStudents.map((s) => s.enrolment_id)));
    }
  };

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <AdminLayout title="Cohorts">
      {/* Offering picker */}
      <div className="mb-6 max-w-md">
        <label className="block text-sm font-medium mb-1">Select Offering</label>
        <SearchableSelect
          options={offerings.map((o) => ({ value: o.id, label: o.title }))}
          value={selectedOfferingId}
          onValueChange={setSelectedOfferingId}
          placeholder="Pick an offering..."
          searchPlaceholder="Search offerings..."
        />
      </div>

      {selectedOfferingId && (
        <>
          {/* Unassigned count */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-mono text-xs">{unassignedCount}</span> enrolled student(s) not assigned to any batch
            </p>
            <Button
              onClick={() => {
                setNewBatchName("");
                setNewBatchMax("");
                setNewBatchOpen(true);
              }}
              className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
            >
              <Plus className="h-4 w-4 mr-2" /> New Batch
            </Button>
          </div>

          {/* Batches list */}
          {loadingBatches ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading batches...</p>
          ) : batches.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
              No batches yet. Create one to start grouping students.
            </div>
          ) : (
            <div className="space-y-3">
              {batches.map((batch) => (
                <div key={batch.id} className="bg-card border border-border rounded-xl">
                  {/* Batch header */}
                  <button
                    onClick={() => toggleBatch(batch.id)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-secondary/30 transition-colors rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      {expandedBatchId === batch.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">{batch.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-xs text-muted-foreground">
                        {batch.member_count}{batch.max_students ? ` / ${batch.max_students}` : ""} students
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Date(batch.created_at).toLocaleDateString("en-IN")}
                      </span>
                      {batch.member_count === 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteBatchId(batch.id);
                          }}
                          className="p-1 rounded hover:bg-secondary text-destructive"
                          title="Delete empty batch"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </button>

                  {/* Batch detail (expanded) */}
                  {expandedBatchId === batch.id && (
                    <div className="border-t border-border px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium">Members</p>
                        <Button
                          size="sm"
                          onClick={openAddStudents}
                          className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add Students
                        </Button>
                      </div>

                      {loadingMembers ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
                      ) : members.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">No members in this batch yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border text-left text-muted-foreground">
                                <th className="px-3 py-2 font-medium">Name</th>
                                <th className="px-3 py-2 font-medium">Email</th>
                                <th className="px-3 py-2 font-medium">Enrolled</th>
                                <th className="px-3 py-2 font-medium text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {members.map((m) => (
                                <tr key={m.membership_id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                                  <td className="px-3 py-2 font-medium">{m.user_name}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{m.user_email}</td>
                                  <td className="px-3 py-2 font-mono text-xs">
                                    {new Date(m.enrolled_at).toLocaleDateString("en-IN")}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => openMoveDialog(m.membership_id)}
                                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                        title="Move to another batch"
                                      >
                                        <ArrowRightLeft className="h-3 w-3" /> Move
                                      </button>
                                      <button
                                        onClick={() => handleRemoveMember(m.membership_id)}
                                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                                        title="Remove from batch"
                                      >
                                        <Trash2 className="h-3 w-3" /> Remove
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── New Batch Dialog ──────────────────────────────── */}
      <Dialog open={newBatchOpen} onOpenChange={setNewBatchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Batch Name</label>
              <Input
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
                placeholder="e.g. Batch A — Morning"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Students (optional)</label>
              <Input
                type="number"
                value={newBatchMax}
                onChange={(e) => setNewBatchMax(e.target.value)}
                placeholder="Leave empty for no limit"
              />
            </div>
            <Button
              onClick={handleCreateBatch}
              disabled={saving}
              className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
            >
              {saving ? "Creating..." : "Create Batch"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Students Dialog ───────────────────────────── */}
      <Dialog open={addStudentsOpen} onOpenChange={setAddStudentsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Unassigned Students</DialogTitle>
          </DialogHeader>
          {loadingUnassigned ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
          ) : unassignedStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              All enrolled students are already assigned to a batch.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Checkbox
                  checked={
                    unassignedStudents.length > 0 &&
                    selectedEnrolmentIds.size === unassignedStudents.length
                  }
                  onCheckedChange={toggleSelectAllUnassigned}
                />
                <span className="text-sm text-muted-foreground">
                  Select all ({unassignedStudents.length})
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                {unassignedStudents.map((s) => (
                  <label
                    key={s.enrolment_id}
                    className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary/30 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedEnrolmentIds.has(s.enrolment_id)}
                      onCheckedChange={() => toggleEnrolment(s.enrolment_id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.user_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.user_email}</p>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      {new Date(s.enrolled_at).toLocaleDateString("en-IN")}
                    </span>
                  </label>
                ))}
              </div>
              <Button
                onClick={handleAddStudents}
                disabled={saving || selectedEnrolmentIds.size === 0}
                className="w-full mt-3 bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
              >
                {saving
                  ? "Adding..."
                  : `Add ${selectedEnrolmentIds.size} Student(s) to Batch`}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Batch Confirmation ────────────────────── */}
      <AlertDialog open={!!deleteBatchId} onOpenChange={() => setDeleteBatchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this batch. Only empty batches (with no members) can be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBatch}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Move to Batch Dialog ──────────────────────────── */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move to Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={moveTargetBatchId} onValueChange={setMoveTargetBatchId}>
              <SelectTrigger>
                <SelectValue placeholder="Select target batch" />
              </SelectTrigger>
              <SelectContent>
                {batches
                  .filter((b) => b.id !== expandedBatchId)
                  .map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleMoveMember}
              disabled={saving || !moveTargetBatchId}
              className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
            >
              {saving ? "Moving..." : "Move"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCohorts;
