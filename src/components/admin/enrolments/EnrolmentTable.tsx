import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Award } from "lucide-react";
import type { EnrolmentRow } from "./types";

interface Props {
  rows: EnrolmentRow[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onStatusChange: (id: string, status: string) => void;
  onGenerateCertificate: (e: EnrolmentRow) => void;
  generatingCertFor: string | null;
}

/** The enrolments table (select / student / offering / status / actions).
 *  Verbatim extraction from AdminEnrolments; parent owns state + handlers. */
export default function EnrolmentTable({
  rows,
  loading,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onStatusChange,
  onGenerateCertificate,
  generatingCertFor,
}: Props) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-3 py-3 w-10">
              <Checkbox
                checked={rows.length > 0 && selectedIds.size === rows.length}
                onCheckedChange={onToggleSelectAll}
              />
            </th>
            <th className="px-5 py-3 font-medium">Student</th>
            <th className="px-5 py-3 font-medium">Offering</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Enrolled</th>
            <th className="px-5 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">No enrolments found</td></tr>
          ) : rows.map((e) => (
            <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
              <td className="px-3 py-3">
                <Checkbox
                  checked={selectedIds.has(e.id)}
                  onCheckedChange={() => onToggleSelect(e.id)}
                />
              </td>
              <td className="px-5 py-3">
                <p className="font-medium">{e.user_name}</p>
                <p className="text-xs text-muted-foreground">{e.user_email}</p>
              </td>
              <td className="px-5 py-3">{e.offering_title}</td>
              <td className="px-5 py-3">
                <Select value={e.status} onValueChange={(v) => onStatusChange(e.id, v)}>
                  <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </td>
              <td className="px-5 py-3 font-mono text-xs">{new Date(e.created_at).toLocaleDateString("en-IN")}</td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{e.payment_order_id ? "Paid" : "Manual"}</span>
                  {e.status === "active" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      disabled={generatingCertFor === e.id}
                      onClick={() => onGenerateCertificate(e)}
                      title="Generate Certificate"
                    >
                      <Award className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
