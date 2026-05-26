import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronLeft, Check, Users, Calendar } from "lucide-react";
import usePageTitle from "@/hooks/usePageTitle";

interface Week {
  id: string;
  week_number: number;
  theme: string;
  starts_on: string;
  status: string;
}

interface Member {
  user_id: string;
  full_name: string | null;
  email: string;
  enrolment_id: string;
}

interface AttendanceCell {
  week_id: string;
  user_id: string;
  attended: boolean;
  id: string | null;
}

export default function AdminCohortAttendance() {
  const { batchId } = useParams<{ batchId: string }>();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  usePageTitle("Cohort Attendance");

  const [batchName, setBatchName] = useState<string>("");
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [cells, setCells] = useState<Map<string, AttendanceCell>>(new Map());
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const cellKey = (weekId: string, userId: string) => `${weekId}:${userId}`;

  useEffect(() => {
    if (!batchId) return;
    (async () => {
      setLoading(true);
      const { data: batch } = await supabase
        .from("cohort_batches")
        .select("name")
        .eq("id", batchId)
        .single();
      setBatchName(batch?.name || "");

      const { data: w } = await supabase
        .from("cohort_weeks")
        .select("id, week_number, theme, starts_on, status")
        .eq("cohort_batch_id", batchId)
        .order("week_number");
      setWeeks((w as Week[]) || []);

      // Get all batch members + their user info
      const { data: m } = await supabase
        .from("cohort_batch_members")
        .select("enrolment_id, enrolments:enrolment_id (id, user_id, users:user_id (full_name, email))")
        .eq("batch_id", batchId);
      const memberList: Member[] = (m || [])
        .map((row: any) => ({
          enrolment_id: row.enrolment_id,
          user_id: row.enrolments?.user_id,
          full_name: row.enrolments?.users?.full_name ?? null,
          email: row.enrolments?.users?.email ?? "",
        }))
        .filter((x: Member) => x.user_id);
      setMembers(memberList);

      // Existing attendance cells
      const weekIds = (w || []).map((x) => x.id);
      if (weekIds.length > 0) {
        const { data: att } = await supabase
          .from("cohort_week_attendance")
          .select("id, cohort_week_id, user_id, attended")
          .in("cohort_week_id", weekIds);
        const map = new Map<string, AttendanceCell>();
        (att || []).forEach((c: any) => {
          map.set(cellKey(c.cohort_week_id, c.user_id), {
            week_id: c.cohort_week_id,
            user_id: c.user_id,
            attended: c.attended,
            id: c.id,
          });
        });
        setCells(map);
      }
      setLoading(false);
    })();
  }, [batchId]);

  const toggle = async (weekId: string, userId: string) => {
    const key = cellKey(weekId, userId);
    const existing = cells.get(key);
    const newAttended = !(existing?.attended ?? false);
    setSavingKey(key);

    let row: AttendanceCell;
    if (existing?.id) {
      const { error } = await supabase
        .from("cohort_week_attendance")
        .update({
          attended: newAttended,
          marked_by: currentUser?.id,
          marked_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSavingKey(null);
        return;
      }
      row = { ...existing, attended: newAttended };
    } else {
      const { data, error } = await supabase
        .from("cohort_week_attendance")
        .insert({
          cohort_week_id: weekId,
          user_id: userId,
          attended: newAttended,
          marked_by: currentUser?.id,
          marked_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSavingKey(null);
        return;
      }
      row = { week_id: weekId, user_id: userId, attended: newAttended, id: data.id };
    }

    setCells((prev) => {
      const next = new Map(prev);
      next.set(key, row);
      return next;
    });
    setSavingKey(null);
  };

  const markWeekAll = async (weekId: string) => {
    if (!confirm("Mark every student as attended for this week?")) return;
    for (const m of members) {
      await toggle(weekId, m.user_id);
      // Skip already-attended
    }
  };

  const userAttendancePct = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      const total = weeks.filter((w) => w.status !== "upcoming").length || 1;
      let attended = 0;
      for (const w of weeks) {
        if (w.status === "upcoming") continue;
        if (cells.get(cellKey(w.id, m.user_id))?.attended) attended++;
      }
      map.set(m.user_id, Math.round((attended / total) * 100));
    }
    return map;
  }, [cells, members, weeks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-6 px-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link to="/admin" className="hover:text-foreground">Admin</Link>
        <span>/</span>
        <Link to="/admin/cohorts" className="hover:text-foreground">Cohorts</Link>
        <span>/</span>
        <span className="text-foreground">{batchName}</span>
        <span>/</span>
        <span className="text-foreground">Attendance</span>
      </div>

      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <button onClick={() => navigate(-1)} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
          <h1 className="text-3xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <Users className="inline h-3.5 w-3.5 mr-1" /> {members.length} members
            <span className="opacity-50"> · </span>
            <Calendar className="inline h-3.5 w-3.5 mr-1" /> {weeks.length} weeks
          </p>
        </div>
      </div>

      {weeks.length === 0 || members.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center bg-surface">
          <p className="text-sm text-muted-foreground">
            {weeks.length === 0 ? "No weeks configured yet." : "No members in this batch yet."}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-surface overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-canvas/50">
              <tr>
                <th className="text-left p-3 text-xs font-mono uppercase tracking-wider text-muted-foreground sticky left-0 bg-canvas/50 z-10 min-w-[200px]">
                  Member
                </th>
                <th className="p-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">%</th>
                {weeks.map((w) => (
                  <th key={w.id} className="p-2 text-center min-w-[60px]">
                    <button
                      onClick={() => markWeekAll(w.id)}
                      title={`Mark all attended for Week ${w.week_number}`}
                      className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      W{w.week_number}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t border-border hover:bg-canvas/30">
                  <td className="p-3 sticky left-0 bg-surface z-10">
                    <p className="text-sm font-medium truncate max-w-[200px]">{m.full_name || m.email}</p>
                    {m.full_name && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{m.email}</p>}
                  </td>
                  <td className="p-2 text-center">
                    <span className={`text-xs font-mono ${
                      (userAttendancePct.get(m.user_id) ?? 0) >= 85
                        ? "text-green-300"
                        : (userAttendancePct.get(m.user_id) ?? 0) >= 60
                        ? "text-amber-300"
                        : "text-muted-foreground"
                    }`}>
                      {userAttendancePct.get(m.user_id) ?? 0}%
                    </span>
                  </td>
                  {weeks.map((w) => {
                    const key = cellKey(w.id, m.user_id);
                    const cell = cells.get(key);
                    const attended = cell?.attended ?? false;
                    const isSaving = savingKey === key;
                    return (
                      <td key={w.id} className="p-2 text-center">
                        <button
                          onClick={() => toggle(w.id, m.user_id)}
                          disabled={isSaving}
                          className={`w-7 h-7 rounded-md border transition-colors inline-flex items-center justify-center ${
                            attended
                              ? "bg-cream border-cream text-cream-text"
                              : "bg-transparent border-border hover:border-cream/40 text-transparent hover:text-muted-foreground"
                          }`}
                        >
                          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : attended ? <Check className="h-4 w-4" /> : <Check className="h-3 w-3" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
