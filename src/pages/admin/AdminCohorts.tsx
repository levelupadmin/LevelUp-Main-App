import AdminLayout from "@/components/layout/AdminLayout";
import { mockApplications, cohorts, type ApplicationStatus } from "@/data/cohortData";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Users, ChevronLeft, CheckCircle2, XCircle, Clock, AlertCircle,
  ExternalLink, Globe, Instagram, Youtube
} from "lucide-react";

const statusBadge: Record<ApplicationStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-secondary text-muted-foreground" },
  submitted: { label: "Submitted", className: "bg-foreground/10 text-foreground" },
  under_review: { label: "Under Review", className: "bg-[hsl(var(--highlight))]/15 text-[hsl(var(--highlight))]" },
  accepted: { label: "Accepted", className: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" },
  waitlisted: { label: "Waitlisted", className: "bg-[hsl(var(--highlight))]/15 text-[hsl(var(--highlight))]" },
  rejected: { label: "Rejected", className: "bg-destructive/15 text-destructive" },
};

const AdminCohorts = () => {
  const { toast } = useToast();
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [filterCohort, setFilterCohort] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [reviewNote, setReviewNote] = useState("");
  const [appStatuses, setAppStatuses] = useState<Record<string, ApplicationStatus>>(
    Object.fromEntries(mockApplications.map((a) => [a.id, a.status]))
  );

  const filteredApps = mockApplications.filter((a) => {
    if (filterCohort !== "all" && a.cohortId !== filterCohort) return false;
    if (filterStatus !== "all" && appStatuses[a.id] !== filterStatus) return false;
    return true;
  });

  const selected = mockApplications.find((a) => a.id === selectedApp);

  const handleAction = (appId: string, action: ApplicationStatus) => {
    setAppStatuses((prev) => ({ ...prev, [appId]: action }));
    toast({ title: `Application ${action}`, description: `Note: ${reviewNote || "No notes added"}` });
    setReviewNote("");
  };

  // Detail view
  if (selected) {
    const currentStatus = appStatuses[selected.id];
    const cohort = cohorts.find((c) => c.id === selected.cohortId);
    return (
      <AdminLayout>
        <div className="space-y-6">
          <button onClick={() => setSelectedApp(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3 w-3" /> Back to applications
          </button>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">{selected.personalInfo.fullName}</h1>
              <p className="text-xs text-muted-foreground">{selected.personalInfo.email} · {selected.personalInfo.city}</p>
              <p className="text-xs text-muted-foreground mt-1">Applied to: {cohort?.title}</p>
            </div>
            <Badge className={`text-xs ${statusBadge[currentStatus].className}`}>{statusBadge[currentStatus].label}</Badge>
          </div>

          {/* Sections */}
          <div className="space-y-4">
            <Section title="Personal Info">
              <InfoRow label="Name" value={selected.personalInfo.fullName} />
              <InfoRow label="Email" value={selected.personalInfo.email} />
              <InfoRow label="Phone" value={selected.personalInfo.phone} />
              <InfoRow label="City" value={selected.personalInfo.city} />
              <InfoRow label="Age" value={selected.personalInfo.age} />
            </Section>

            <Section title="Creative Background">
              <InfoRow label="Current Role" value={selected.creativeBackground.currentRole} />
              <InfoRow label="Experience" value={selected.creativeBackground.yearsOfExperience + " years"} />
              <p className="text-xs text-muted-foreground mt-2">{selected.creativeBackground.experience}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selected.creativeBackground.tools.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            </Section>

            <Section title="Portfolio">
              <div className="space-y-2">
                {selected.portfolioLinks.website && (
                  <PortfolioLink icon={<Globe className="h-3.5 w-3.5" />} label="Website" value={selected.portfolioLinks.website} />
                )}
                {selected.portfolioLinks.instagram && (
                  <PortfolioLink icon={<Instagram className="h-3.5 w-3.5" />} label="Instagram" value={selected.portfolioLinks.instagram} />
                )}
                {selected.portfolioLinks.youtube && (
                  <PortfolioLink icon={<Youtube className="h-3.5 w-3.5" />} label="YouTube" value={selected.portfolioLinks.youtube} />
                )}
                {selected.portfolioLinks.other && (
                  <PortfolioLink icon={<ExternalLink className="h-3.5 w-3.5" />} label="Other" value={selected.portfolioLinks.other} />
                )}
              </div>
            </Section>

            <Section title="Statement of Purpose">
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{selected.statementOfPurpose}</p>
            </Section>

            <Section title="Creative Brief Response">
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{selected.creativeBriefResponse}</p>
            </Section>
          </div>

          {/* Actions */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-bold text-foreground">Review Action</h3>
            <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Add review notes..." rows={3} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => handleAction(selected.id, "accepted")} className="gap-1 text-xs bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90">
                <CheckCircle2 className="h-3 w-3" /> Accept
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleAction(selected.id, "waitlisted")} className="gap-1 text-xs">
                <Clock className="h-3 w-3" /> Waitlist
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleAction(selected.id, "rejected")} className="gap-1 text-xs">
                <XCircle className="h-3 w-3" /> Reject
              </Button>
            </div>
            {selected.reviewNotes && (
              <div className="rounded-md bg-secondary/30 p-2.5 mt-2">
                <p className="text-[10px] font-semibold text-foreground">Previous Notes</p>
                <p className="text-xs text-muted-foreground">{selected.reviewNotes}</p>
              </div>
            )}
          </div>
        </div>
      </AdminLayout>
    );
  }

  // List view
  return (
    <AdminLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-foreground">Cohort Applications</h1>
          <p className="text-sm text-muted-foreground">Review and manage cohort applications</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={filterCohort} onValueChange={setFilterCohort}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Cohorts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cohorts</SelectItem>
              {cohorts.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="waitlisted">Waitlisted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: mockApplications.length, icon: <Users className="h-4 w-4" /> },
            { label: "Pending", value: Object.values(appStatuses).filter((s) => s === "submitted" || s === "under_review").length, icon: <Clock className="h-4 w-4" /> },
            { label: "Accepted", value: Object.values(appStatuses).filter((s) => s === "accepted").length, icon: <CheckCircle2 className="h-4 w-4" /> },
            { label: "Rejected", value: Object.values(appStatuses).filter((s) => s === "rejected").length, icon: <XCircle className="h-4 w-4" /> },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-3 text-center">
              <div className="flex justify-center mb-1 text-muted-foreground">{stat.icon}</div>
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Applications list */}
        <div className="space-y-2">
          {filteredApps.map((app) => {
            const cohort = cohorts.find((c) => c.id === app.cohortId);
            const status = appStatuses[app.id];
            return (
              <div
                key={app.id}
                onClick={() => setSelectedApp(app.id)}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 cursor-pointer hover:border-foreground/20 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-foreground">
                  {app.personalInfo.fullName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{app.personalInfo.fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">{app.personalInfo.email} · {cohort?.title}</p>
                  {app.submittedAt && (
                    <p className="text-[10px] text-muted-foreground">Submitted {new Date(app.submittedAt).toLocaleDateString()}</p>
                  )}
                </div>
                <Badge className={`text-[10px] shrink-0 ${statusBadge[status].className}`}>{statusBadge[status].label}</Badge>
              </div>
            );
          })}
          {filteredApps.length === 0 && (
            <div className="text-center py-12">
              <AlertCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-foreground font-medium">No applications found</p>
              <p className="text-xs text-muted-foreground">Try adjusting your filters</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-lg border border-border bg-card p-4 space-y-2">
    <h3 className="text-sm font-bold text-foreground">{title}</h3>
    {children}
  </div>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-foreground font-medium">{value}</span>
  </div>
);

const PortfolioLink = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-center gap-2 text-xs">
    <span className="text-muted-foreground">{icon}</span>
    <span className="text-muted-foreground">{label}:</span>
    <span className="text-foreground font-medium">{value}</span>
  </div>
);

export default AdminCohorts;
