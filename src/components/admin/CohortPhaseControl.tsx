import { useEffect, useState } from "react";
import { Archive, Loader2 } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface RoomConfigPhase {
  id: string;
  slug: string;
  phase: "pre_start" | "live" | "wrap" | "alumni";
  batch_id: string | null;
}

interface DbResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

interface SelectQuery<T> extends PromiseLike<DbResult<T>> {
  eq: (column: string, value: string) => SelectQuery<T>;
  order: (column: string, options: { ascending: boolean }) => SelectQuery<T>;
}

interface UpdateQuery extends PromiseLike<DbResult<unknown>> {
  eq: (column: string, value: string) => UpdateQuery;
}

interface PhaseTable {
  select: (columns: string) => SelectQuery<RoomConfigPhase[]>;
  update: (values: Record<string, unknown>) => UpdateQuery;
}

const phaseDb = supabase as unknown as {
  from: (table: "cohort_room_configs") => PhaseTable;
};

const CohortPhaseControl = ({ offeringId }: { offeringId: string }) => {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<RoomConfigPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<RoomConfigPhase | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const { data, error } = await phaseDb
        .from("cohort_room_configs")
        .select("id,slug,phase,batch_id")
        .eq("offering_id", offeringId)
        .order("batch_id", { ascending: true });
      if (!alive) return;
      if (error) {
        toast({ title: "Room phase did not load", description: error.message, variant: "destructive" });
        setConfigs([]);
      } else {
        setConfigs(data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [offeringId, toast]);

  const confirm = async () => {
    if (!target) return;
    setSaving(true);
    const { error } = await phaseDb
      .from("cohort_room_configs")
      .update({ phase: "alumni" })
      .eq("id", target.id);
    setSaving(false);
    if (error) {
      toast({ title: "Alumni flip failed", description: error.message, variant: "destructive" });
      return;
    }
    setConfigs((rows) => rows.map((row) => row.id === target.id ? { ...row, phase: "alumni" } : row));
    setTarget(null);
    toast({ title: "Room moved to alumni", description: "No room content was deleted." });
  };

  return (
    <section className="mb-5 rounded-xl border border-border bg-card p-4" aria-labelledby="room-phase-heading">
      <div className="flex items-start gap-3">
        <Archive className="mt-0.5 h-5 w-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="room-phase-heading" className="text-sm font-medium">Room phase</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Alumni is permanent in the admin UI. It preserves the room and retires live-session mechanics.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading room phase
        </p>
      ) : configs.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">This offering has no cohort room config yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {configs.map((config) => (
            <div key={config.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <div>
                <p className="font-mono text-xs text-foreground">/{config.slug}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {config.batch_id ? "Batch override" : "Offering room"} · {config.phase.replace("_", " ")}
                </p>
              </div>
              {config.phase === "alumni" ? (
                <span className="rounded-full border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Alumni</span>
              ) : (
                <Button variant="outline" size="sm" className="min-h-11" onClick={() => setTarget(config)}>
                  Move to alumni
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move this room to alumni?</AlertDialogTitle>
            <AlertDialogDescription>
              Sessions retire, members become alumni, and the room stays open with its recordings, feed, people, resources and Demo Day gallery. Nothing is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirm()} disabled={saving}>
              {saving ? "Moving…" : "Move to alumni"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default CohortPhaseControl;
