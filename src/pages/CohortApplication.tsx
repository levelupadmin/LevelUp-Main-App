import AppShell from "@/components/layout/AppShell";
import { getCohortById, emptyApplication, type CohortApplication, type ApplicationStatus } from "@/data/cohortData";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, Save, Send, CheckCircle2, Clock, XCircle, AlertCircle, Loader2
} from "lucide-react";

const STEPS = [
  { key: "personal", label: "Personal Info" },
  { key: "background", label: "Creative Background" },
  { key: "portfolio", label: "Portfolio" },
  { key: "sop", label: "Statement of Purpose" },
  { key: "brief", label: "Creative Brief" },
];

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  draft: { label: "Draft", icon: <Save className="h-4 w-4" />, color: "text-muted-foreground", description: "Your application is saved as a draft. Complete and submit when ready." },
  submitted: { label: "Submitted", icon: <Send className="h-4 w-4" />, color: "text-foreground", description: "Your application has been received. We'll review it shortly." },
  under_review: { label: "Under Review", icon: <Loader2 className="h-4 w-4 animate-spin" />, color: "text-[hsl(var(--highlight))]", description: "A mentor is currently reviewing your application. Hang tight!" },
  accepted: { label: "Accepted! 🎉", icon: <CheckCircle2 className="h-4 w-4" />, color: "text-[hsl(var(--success))]", description: "Congratulations! You've been accepted. Complete your enrollment to secure your seat." },
  waitlisted: { label: "Waitlisted", icon: <Clock className="h-4 w-4" />, color: "text-[hsl(var(--highlight))]", description: "You're on the waitlist. We'll notify you if a seat opens up." },
  rejected: { label: "Not Selected", icon: <XCircle className="h-4 w-4" />, color: "text-destructive", description: "Unfortunately, you weren't selected for this cohort. You can apply again for the next batch." },
};

const CohortApplication = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const cohort = getCohortById(slug || "");

  // Simulate existing application or new
  const hasExistingApp = cohort?.userApplicationStatus && cohort.userApplicationStatus !== undefined;
  const initialStatus: ApplicationStatus = hasExistingApp ? (cohort.userApplicationStatus as ApplicationStatus) : "draft";

  const [step, setStep] = useState(0);
  const [appStatus, setAppStatus] = useState<ApplicationStatus>(initialStatus);
  const [app, setApp] = useState<CohortApplication>(() => emptyApplication(slug || ""));
  const [submitted, setSubmitted] = useState(initialStatus !== "draft" && initialStatus !== undefined);

  if (!cohort) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h1 className="text-xl font-bold text-foreground">Cohort not found</h1>
          <Button size="sm" className="mt-4" onClick={() => navigate("/learn")}>Back to Learn</Button>
        </div>
      </AppShell>
    );
  }

  // If already submitted/reviewed — show status
  if (submitted || (appStatus !== "draft")) {
    const config = STATUS_CONFIG[appStatus] || STATUS_CONFIG.submitted;
    return (
      <AppShell>
        <div className="mx-auto max-w-lg space-y-6 p-4 lg:p-6">
          <button onClick={() => navigate(`/learn/cohort/${cohort.id}`)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3 w-3" /> Back to cohort
          </button>

          <div className="rounded-xl border border-border bg-card p-8 text-center space-y-5">
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary ${config.color}`}>
              {config.icon}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{config.label}</h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">{config.description}</p>
            </div>
            <Badge variant="secondary" className="text-xs">{cohort.title}</Badge>

            {/* Status timeline */}
            <div className="flex items-center justify-center gap-2 pt-4">
              {(["submitted", "under_review", "accepted"] as ApplicationStatus[]).map((s, i) => {
                const isCurrent = s === appStatus;
                const isPast = ["submitted", "under_review", "accepted"].indexOf(appStatus) > i;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${isPast || isCurrent ? "bg-foreground" : "bg-secondary"}`} />
                    {i < 2 && <div className={`h-px w-8 ${isPast ? "bg-foreground" : "bg-secondary"}`} />}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-6 text-[10px] text-muted-foreground">
              <span>Submitted</span>
              <span>Under Review</span>
              <span>Decision</span>
            </div>

            {appStatus === "accepted" && (
              <Button onClick={() => navigate(`/learn/cohort/${cohort.id}/dashboard`)} className="mt-4 gap-2">
                Complete Enrollment <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Mock status switcher for demo */}
          <div className="rounded-lg border border-dashed border-border p-4 space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Demo: Change Status</p>
            <div className="flex flex-wrap gap-2">
              {(["submitted", "under_review", "accepted", "waitlisted", "rejected"] as ApplicationStatus[]).map((s) => (
                <Button key={s} variant={appStatus === s ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => setAppStatus(s)}>
                  {s.replace("_", " ")}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const updatePersonal = (field: string, value: string) =>
    setApp((prev) => ({ ...prev, personalInfo: { ...prev.personalInfo, [field]: value } }));
  const updateBackground = (field: string, value: string) =>
    setApp((prev) => ({ ...prev, creativeBackground: { ...prev.creativeBackground, [field]: value } }));
  const updatePortfolio = (field: string, value: string) =>
    setApp((prev) => ({ ...prev, portfolioLinks: { ...prev.portfolioLinks, [field]: value } }));

  const handleSaveDraft = () => {
    toast({ title: "Draft saved", description: "You can come back anytime to complete your application." });
  };

  const handleSubmit = () => {
    setAppStatus("submitted");
    setSubmitted(true);
    toast({ title: "Application submitted!", description: "We'll review your application and get back to you within 5 business days." });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-6">
        <button onClick={() => navigate(`/learn/cohort/${cohort.id}`)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-3 w-3" /> Back to {cohort.title}
        </button>

        <div>
          <h1 className="text-xl font-bold text-foreground">Apply to {cohort.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">Step {step + 1} of {STEPS.length}: {STEPS[step].label}</p>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s.key} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-foreground" : "bg-secondary"}`} />
          ))}
        </div>

        {/* Form steps */}
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-5">
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-foreground">Personal Information</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Full Name</Label>
                  <Input value={app.personalInfo.fullName} onChange={(e) => updatePersonal("fullName", e.target.value)} placeholder="Your full name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={app.personalInfo.email} onChange={(e) => updatePersonal("email", e.target.value)} placeholder="you@email.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input value={app.personalInfo.phone} onChange={(e) => updatePersonal("phone", e.target.value)} placeholder="+91 98765 43210" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">City</Label>
                  <Input value={app.personalInfo.city} onChange={(e) => updatePersonal("city", e.target.value)} placeholder="Mumbai" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Age</Label>
                  <Input value={app.personalInfo.age} onChange={(e) => updatePersonal("age", e.target.value)} placeholder="24" />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-foreground">Creative Background</h2>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Current Role</Label>
                  <Input value={app.creativeBackground.currentRole} onChange={(e) => updateBackground("currentRole", e.target.value)} placeholder="Freelance Videographer" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Years of Experience</Label>
                  <Input value={app.creativeBackground.yearsOfExperience} onChange={(e) => updateBackground("yearsOfExperience", e.target.value)} placeholder="2" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tell us about your creative experience</Label>
                  <Textarea value={app.creativeBackground.experience} onChange={(e) => updateBackground("experience", e.target.value)} placeholder="Share your journey — projects, skills, achievements..." rows={4} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tools & Equipment you use</Label>
                  <Input value={app.creativeBackground.tools.join(", ")} onChange={(e) => updateBackground("tools", e.target.value)} placeholder="Premiere Pro, Canon R6, DaVinci Resolve" />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-foreground">Portfolio Links</h2>
              <p className="text-xs text-muted-foreground">Share links to your work. At least one is recommended.</p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Website / Portfolio</Label>
                  <Input value={app.portfolioLinks.website} onChange={(e) => updatePortfolio("website", e.target.value)} placeholder="https://yoursite.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Instagram</Label>
                  <Input value={app.portfolioLinks.instagram} onChange={(e) => updatePortfolio("instagram", e.target.value)} placeholder="@yourhandle" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">YouTube</Label>
                  <Input value={app.portfolioLinks.youtube} onChange={(e) => updatePortfolio("youtube", e.target.value)} placeholder="Channel name or URL" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Other (Vimeo, Behance, etc.)</Label>
                  <Input value={app.portfolioLinks.other} onChange={(e) => updatePortfolio("other", e.target.value)} placeholder="https://..." />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-foreground">Statement of Purpose</h2>
              <p className="text-xs text-muted-foreground">Why do you want to join this cohort? What do you hope to achieve? (200–500 words)</p>
              <Textarea
                value={app.statementOfPurpose}
                onChange={(e) => setApp((prev) => ({ ...prev, statementOfPurpose: e.target.value }))}
                placeholder="Tell us why this cohort is right for you..."
                rows={8}
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-foreground">Creative Brief Response</h2>
              <div className="rounded-lg bg-secondary/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Prompt:</p>
                <p className="text-xs text-muted-foreground italic">
                  {cohort.category === "Filmmaking"
                    ? "If you could document any story in India, what would it be and why? Describe your approach in 200–300 words."
                    : cohort.category === "Editing"
                    ? "Describe a scene from a film that you think is perfectly edited. What makes it work? How would you approach it differently?"
                    : "Describe a content brand you admire. What makes it successful? How would you build something similar but uniquely yours?"}
                </p>
              </div>
              <Textarea
                value={app.creativeBriefResponse}
                onChange={(e) => setApp((prev) => ({ ...prev, creativeBriefResponse: e.target.value }))}
                placeholder="Your response..."
                rows={8}
              />
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} className="gap-1">
                <ChevronLeft className="h-3 w-3" /> Previous
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleSaveDraft} className="gap-1 text-muted-foreground">
              <Save className="h-3 w-3" /> Save Draft
            </Button>
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep(step + 1)} className="gap-1">
                Next <ChevronRight className="h-3 w-3" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleSubmit} className="gap-1">
                <Send className="h-3 w-3" /> Submit Application
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default CohortApplication;
