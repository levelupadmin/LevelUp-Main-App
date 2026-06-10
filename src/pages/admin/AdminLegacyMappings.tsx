/**
 * AdminLegacyMappings
 * ────────────────────────────────────────────────────────────────────
 * Admin UI for resolving the `legacy_program_mapping` backlog.
 *
 * When a TagMango CSV is ingested via scripts/import-tagmango-enrolments.sh,
 * every distinct program name auto-seeds a row in legacy_program_mapping
 * with decision_status='pending'. This page lets Rahul (or any admin)
 * go through that list and decide per program:
 *
 *   - Map: pick an existing offering on the new app → trigger fires,
 *          all pending legacy_enrolments rows for this program get
 *          offering_id filled in, all users with matching phones/emails
 *          who already signed in get retroactively granted the
 *          enrolment, and future signins claim normally.
 *
 *   - Skip: mark the program as ignored (e.g. refunded users, test
 *           data). No enrolments are ever granted from these rows.
 *
 * Counts come from the `legacy_program_mapping_overview` view which
 * does the join + count work in SQL.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Archive, Check, Loader2, Search, Users } from "lucide-react";

interface MappingRow {
  id: string;
  source: string;
  legacy_program_name: string;
  offering_id: string | null;
  offering_title: string | null;
  offering_slug: string | null;
  offering_status: string | null;
  decision_status: "pending" | "mapped" | "skipped";
  notes: string | null;
  total_enrolments: number;
  pending_enrolments: number;
  created_at: string;
}

interface OfferingRow {
  id: string;
  title: string;
  slug: string;
  status: string;
}

const AdminLegacyMappings = () => {
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [offerings, setOfferings] = useState<OfferingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "mapped" | "skipped">("pending");
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const [mappingRes, offRes] = await Promise.all([
      supabase
        .from("legacy_program_mapping_overview")
        .select("*")
        .order("total_enrolments", { ascending: false }),
      supabase
        .from("offerings")
        .select("id, title, slug, status")
        .in("status", ["active", "archived"])
        .order("title"),
    ]);

    if (mappingRes.error) {
      toast({
        title: "Failed to load mappings",
        description: mappingRes.error.message,
        variant: "destructive",
      });
    } else {
      setRows((mappingRes.data ?? []) as MappingRow[]);
    }
    setOfferings(((offRes.data ?? []) as any[]) as OfferingRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const mapToOffering = async (row: MappingRow, offeringId: string) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from("legacy_program_mapping")
      .update({
        offering_id: offeringId,
        decision_status: "mapped",
      })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Mapped",
      description: `${row.total_enrolments} user${row.total_enrolments === 1 ? "" : "s"} will get this entitlement on next sign-in (already-signed-in users were claimed immediately).`,
    });
    load();
  };

  const skipProgram = async (row: MappingRow) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from("legacy_program_mapping")
      .update({ decision_status: "skipped", offering_id: null })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Skipped", description: "This program will not grant any enrolments." });
    load();
  };

  const undoSkip = async (row: MappingRow) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from("legacy_program_mapping")
      .update({ decision_status: "pending" })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  // ── Derived counts for the summary strip
  const counts = useMemo(() => {
    const c = { pending: 0, mapped: 0, skipped: 0, pendingUsers: 0, mappedUsers: 0 };
    for (const r of rows) {
      if (r.decision_status === "pending") {
        c.pending++;
        c.pendingUsers += r.total_enrolments || 0;
      } else if (r.decision_status === "mapped") {
        c.mapped++;
        c.mappedUsers += r.total_enrolments || 0;
      } else {
        c.skipped++;
      }
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.decision_status !== filter) return false;
      if (q && !r.legacy_program_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, filter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Legacy programme mapping</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Decide how each TagMango programme maps to an offering on the new app. Mapped programmes
          auto-grant enrolments to past buyers; skipped ones are ignored.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Pending</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{counts.pending}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {counts.pendingUsers} user{counts.pendingUsers === 1 ? "" : "s"} blocked
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Mapped</div>
          <div className="text-2xl font-bold mt-1 tabular-nums text-[hsl(var(--accent-emerald))]">{counts.mapped}</div>
          <div className="text-xs text-muted-foreground mt-1">{counts.mappedUsers} grants ready</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Skipped</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{counts.skipped}</div>
          <div className="text-xs text-muted-foreground mt-1">Intentionally ignored</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Offerings available</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{offerings.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Active + archived</div>
        </Card>
      </div>

      {/* Filter + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-border p-1 bg-card/40">
          {(["pending", "mapped", "skipped", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search programme name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "No legacy programmes have been ingested yet. Run the import script to seed them."
            : "Nothing matches the current filter."}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <MappingRowCard
              key={row.id}
              row={row}
              offerings={offerings}
              saving={savingId === row.id}
              onMap={(offeringId) => mapToOffering(row, offeringId)}
              onSkip={() => skipProgram(row)}
              onUndoSkip={() => undoSkip(row)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface MappingRowCardProps {
  row: MappingRow;
  offerings: OfferingRow[];
  saving: boolean;
  onMap: (offeringId: string) => void;
  onSkip: () => void;
  onUndoSkip: () => void;
}

function MappingRowCard({ row, offerings, saving, onMap, onSkip, onUndoSkip }: MappingRowCardProps) {
  const [selected, setSelected] = useState<string>(row.offering_id ?? "");

  useEffect(() => {
    setSelected(row.offering_id ?? "");
  }, [row.offering_id]);

  const statusBadge = () => {
    if (row.decision_status === "mapped") {
      return (
        <Badge className="bg-[hsl(var(--accent-emerald))]/15 text-[hsl(var(--accent-emerald))] border-0">
          <Check className="h-3 w-3 mr-1" />
          Mapped
        </Badge>
      );
    }
    if (row.decision_status === "skipped") {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <Archive className="h-3 w-3 mr-1" />
          Skipped
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-[hsl(var(--cream))]/40 text-[hsl(var(--cream))]">
        Pending
      </Badge>
    );
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {statusBadge()}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {row.total_enrolments} buyer{row.total_enrolments === 1 ? "" : "s"}
            </span>
            {row.pending_enrolments > 0 && row.decision_status === "mapped" && (
              <span className="text-xs text-muted-foreground">
                ({row.pending_enrolments} not yet signed in)
              </span>
            )}
          </div>
          <h3 className="font-medium text-base leading-snug break-words">{row.legacy_program_name}</h3>
          {row.offering_title && row.decision_status === "mapped" && (
            <p className="text-xs text-muted-foreground mt-1">
              → <span className="font-mono">{row.offering_slug}</span>  &middot;  {row.offering_title}
            </p>
          )}
        </div>
      </div>

      {row.decision_status !== "skipped" && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={saving}
            className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Pick an offering...</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} {o.status === "archived" ? "(archived)" : ""}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button
              onClick={() => selected && onMap(selected)}
              disabled={!selected || saving || selected === row.offering_id}
              size="sm"
              className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : row.decision_status === "mapped" ? "Re-map" : "Map"}
            </Button>
            <Button variant="outline" size="sm" onClick={onSkip} disabled={saving}>
              Skip
            </Button>
          </div>
        </div>
      )}

      {row.decision_status === "skipped" && (
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            Marked as skipped. No enrolments will be granted from this programme.
          </p>
          <Button variant="ghost" size="sm" onClick={onUndoSkip} disabled={saving}>
            Undo skip
          </Button>
        </div>
      )}
    </Card>
  );
}

export default AdminLegacyMappings;
