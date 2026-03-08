import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { mockAdminOpportunities, OpportunityReviewStatus } from "@/data/adminData";
import { Briefcase, ArrowLeft, CheckCircle2, XCircle, Clock, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const statusStyles: Record<OpportunityReviewStatus, string> = {
  pending: "bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const AdminOpportunities = () => {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<Record<string, OpportunityReviewStatus>>(
    Object.fromEntries(mockAdminOpportunities.map((o) => [o.id, o.status]))
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const selected = selectedId ? mockAdminOpportunities.find((o) => o.id === selectedId) : null;

  const handleAction = (id: string, action: OpportunityReviewStatus) => {
    setStatuses((s) => ({ ...s, [id]: action }));
    toast({ title: `Opportunity ${action}` });
    setSelectedId(null);
    setRejectReason("");
  };

  if (selected) {
    return (
      <AdminLayout>
        <div className="space-y-5">
          <button onClick={() => { setSelectedId(null); setRejectReason(""); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to list
          </button>

          <div className="rounded-lg border border-border bg-card p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">{selected.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">by {selected.poster} • {selected.type}</p>
              </div>
              <Badge variant="outline" className={statusStyles[statuses[selected.id]]}>
                {statuses[selected.id]}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="text-sm font-medium text-foreground">{selected.budget}</p>
              </div>
              <div className="rounded-md bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="text-sm font-medium text-foreground">{selected.location}</p>
              </div>
              <div className="rounded-md bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="text-sm font-medium text-foreground">{selected.submittedAt}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Description</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{selected.description}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Required Skills</h3>
              <div className="flex flex-wrap gap-2">
                {selected.skills.map((s) => (
                  <Badge key={s} variant="outline" className="bg-secondary text-muted-foreground">{s}</Badge>
                ))}
              </div>
            </div>

            {statuses[selected.id] === "pending" && (
              <div className="space-y-3 pt-3 border-t border-border">
                <Textarea
                  placeholder="Rejection reason (optional)..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="min-h-[80px]"
                />
                <div className="flex gap-3">
                  <Button onClick={() => handleAction(selected.id, "approved")} className="bg-green-600 hover:bg-green-700 text-white">
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button variant="destructive" onClick={() => handleAction(selected.id, "rejected")}>
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button variant="outline">
                    <MessageSquare className="h-4 w-4 mr-1" /> Request Changes
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Opportunity Review</h1>
          <p className="text-sm text-muted-foreground">Review and approve submitted opportunities</p>
        </div>

        <div className="flex gap-3">
          {(["pending", "approved", "rejected"] as OpportunityReviewStatus[]).map((s) => {
            const count = Object.values(statuses).filter((st) => st === s).length;
            return (
              <div key={s} className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5">
                <span className="text-lg font-bold text-foreground">{count}</span>
                <span className="text-xs text-muted-foreground capitalize">{s}</span>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Poster</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {mockAdminOpportunities.map((opp) => (
                  <tr
                    key={opp.id}
                    onClick={() => setSelectedId(opp.id)}
                    className="border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">{opp.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{opp.type}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{opp.poster}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={statusStyles[statuses[opp.id]]}>{statuses[opp.id]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{opp.submittedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminOpportunities;
