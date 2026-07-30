import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Users } from "lucide-react";

interface Props {
  offeringId: string;
}

interface Row {
  id: string;
  user_id: string;
  status: string;
  source: string;
  created_at: string;
  expires_at: string | null;
  total_paid_inr: number | null;
  user_email: string | null;
  user_phone: string | null;
  user_full_name: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  checkout: "Bought in app",
  purchase: "Bought in app",
  admin_grant: "Granted by admin",
  admin_manual: "Granted by admin",
  manual: "Granted by admin",
  migration: "Migrated",
  legacy: "Legacy purchase",
  import: "Imported",
  free: "Free",
};

/** "Students" tab for the offering editor: everyone holding an enrolment on
 *  this offering. Read-only — granting and revoking stay in /admin/enrolments
 *  so there is one write path, not two. */
export default function StudentsTab({ offeringId }: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!offeringId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("enrolments_unified")
        .select(
          "id, user_id, status, source, created_at, expires_at, total_paid_inr, user_email, user_phone, user_full_name"
        )
        .eq("offering_id", offeringId)
        // enrolments_unified UNIONs real enrolments with legacy_enrolments.
        // Only 'live' rows are actual enrolments; without this filter an
        // offering with legacy history lists tens of thousands of people who
        // have never signed in. Unclaimed legacy purchases belong on the
        // Access tab, not here.
        .eq("enrolment_kind", "live")
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setRows(((data || []) as unknown) as Row[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offeringId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.user_full_name, r.user_email, r.user_phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [rows, q]);

  const activeCount = rows.filter((r) => r.status === "active").length;

  const exportCsv = () => {
    const cols = [
      "name",
      "email",
      "phone",
      "status",
      "source",
      "enrolled_on",
      "expires_on",
      "paid_inr",
    ];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      cols.join(","),
      ...filtered.map((r) =>
        [
          r.user_full_name,
          r.user_email,
          r.user_phone,
          r.status,
          r.source,
          r.created_at?.slice(0, 10),
          r.expires_at?.slice(0, 10) ?? "",
          r.total_paid_inr ?? "",
        ]
          .map(esc)
          .join(",")
      ),
    ];
    const blob = new Blob(["﻿" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offering-${offeringId}-students.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading students…
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            <strong>{activeCount}</strong> with access
            {rows.length !== activeCount && (
              <span className="text-muted-foreground">
                {" "}
                · {rows.length - activeCount} inactive
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or phone…"
            className="w-64"
          />
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={!filtered.length}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      {!rows.length ? (
        <p className="text-sm text-muted-foreground py-6">
          Nobody is enrolled in this offering yet. Grant access from{" "}
          <button
            className="underline"
            onClick={() => navigate("/admin/enrolments")}
          >
            Enrolments
          </button>
          .
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-4 font-medium">Student</th>
                <th className="py-2 pr-4 font-medium">Contact</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">How</th>
                <th className="py-2 pr-4 font-medium">Enrolled</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() =>
                    navigate(
                      `/admin/users?q=${encodeURIComponent(r.user_email || r.user_phone || "")}`
                    )
                  }
                  className="border-b border-border/50 hover:bg-secondary/40 cursor-pointer"
                  title="Open this student in Users"
                >
                  <td className="py-2 pr-4">
                    {r.user_full_name || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <div>{r.user_email}</div>
                    <div className="text-muted-foreground text-xs">
                      {r.user_phone}
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        r.status === "active"
                          ? "text-emerald-500"
                          : "text-muted-foreground"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {SOURCE_LABEL[r.source] || r.source}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {r.created_at?.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="text-sm text-muted-foreground py-4">
              No student matches “{q}”.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
