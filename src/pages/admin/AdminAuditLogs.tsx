import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Shield, UserCheck, CreditCard } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";

type LogTab = "admin" | "enrolment";

interface AdminLog {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface EnrolmentLog {
  id: string;
  enrolment_id: string;
  action: string;
  actor_user_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const PAGE_SIZE = 50;

const AdminAuditLogs = () => {
  const [tab, setTab] = useState<LogTab>("admin");
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [enrolmentLogs, setEnrolmentLogs] = useState<EnrolmentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [userMap, setUserMap] = useState<Record<string, { full_name: string; email: string }>>({});

  const loadAdminLogs = async (p: number) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { count } = await supabase
      .from("admin_audit_logs")
      .select("id", { count: "exact", head: true });
    setTotalCount(count ?? 0);

    const { data } = await supabase
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data) {
      setAdminLogs(data);
      await resolveUsers(data.map((l) => l.actor_user_id).filter(Boolean) as string[]);
    }
    setLoading(false);
  };

  const loadEnrolmentLogs = async (p: number) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { count } = await supabase
      .from("enrolment_audit_log")
      .select("id", { count: "exact", head: true });
    setTotalCount(count ?? 0);

    const { data } = await supabase
      .from("enrolment_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data) {
      setEnrolmentLogs(data);
      await resolveUsers(data.map((l) => l.actor_user_id).filter(Boolean) as string[]);
    }
    setLoading(false);
  };

  const resolveUsers = async (ids: string[]) => {
    const missing = ids.filter((id) => !userMap[id]);
    if (missing.length === 0) return;
    const { data } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", [...new Set(missing)]);
    if (data) {
      setUserMap((prev) => {
        const next = { ...prev };
        data.forEach((u) => { next[u.id] = { full_name: u.full_name || "", email: u.email || "" }; });
        return next;
      });
    }
  };

  useEffect(() => {
    setPage(0);
  }, [tab]);

  useEffect(() => {
    if (tab === "admin") loadAdminLogs(page);
    else loadEnrolmentLogs(page);
  }, [tab, page]);

  const actorName = (id: string | null) => {
    if (!id) return "System";
    const u = userMap[id];
    return u ? (u.full_name || u.email) : id.slice(0, 8);
  };

  const actionBadge = (action: string) => {
    const colors: Record<string, string> = {
      granted: "bg-green-500/15 text-green-400",
      revoked: "bg-red-500/15 text-red-400",
      expired: "bg-yellow-500/15 text-yellow-400",
      restored: "bg-blue-500/15 text-blue-400",
      extended: "bg-purple-500/15 text-purple-400",
    };
    return (
      <span className={`text-xs font-mono px-2 py-0.5 rounded ${colors[action] || "bg-secondary text-muted-foreground"}`}>
        {action}
      </span>
    );
  };

  const filteredAdmin = adminLogs.filter((l) =>
    l.action.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    actorName(l.actor_user_id).toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (l.target_table || "").toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const filteredEnrolment = enrolmentLogs.filter((l) =>
    l.action.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    actorName(l.actor_user_id).toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (l.reason || "").toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  return (
    <AdminLayout title="Audit Logs">
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          <button
            onClick={() => setTab("admin")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "admin" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Shield className="inline h-4 w-4 mr-1.5 -mt-0.5" />Admin Actions
          </button>
          <button
            onClick={() => setTab("enrolment")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "enrolment" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserCheck className="inline h-4 w-4 mr-1.5 -mt-0.5" />Enrolment History
          </button>
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Filter logs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        {tab === "admin" ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Actor</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Target</th>
                <th className="px-5 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>
              ) : filteredAdmin.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">No logs found</td></tr>
              ) : filteredAdmin.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-5 py-3 text-sm">{actorName(l.actor_user_id)}</td>
                  <td className="px-5 py-3">{actionBadge(l.action)}</td>
                  <td className="px-5 py-3 font-mono text-xs">
                    {l.target_table && <span className="text-muted-foreground">{l.target_table}</span>}
                    {l.target_id && <span className="ml-1 text-muted-foreground/60">{l.target_id.slice(0, 8)}</span>}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground max-w-xs truncate">
                    {l.metadata && Object.keys(l.metadata).length > 0 ? JSON.stringify(l.metadata) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Actor</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Reason</th>
                <th className="px-5 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>
              ) : filteredEnrolment.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">No logs found</td></tr>
              ) : filteredEnrolment.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-5 py-3 text-sm">{actorName(l.actor_user_id)}</td>
                  <td className="px-5 py-3">{actionBadge(l.action)}</td>
                  <td className="px-5 py-3 text-sm">{l.reason || "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground max-w-xs truncate">
                    {l.metadata && Object.keys(l.metadata).length > 0 ? JSON.stringify(l.metadata) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminAuditLogs;
