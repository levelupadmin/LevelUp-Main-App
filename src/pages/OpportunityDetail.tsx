import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  ArrowLeft, MapPin, IndianRupee, Clock, Calendar, Timer, ExternalLink, X,
} from "lucide-react";
import {
  getOpportunityById, mockOpportunities, typeColors, verificationLabel,
} from "@/data/opportunitiesData";

const OpportunityDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const opp = getOpportunityById(id || "");
  const [showInterestModal, setShowInterestModal] = useState(false);
  const [coverNote, setCoverNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!opp) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-24">
          <p className="text-lg font-semibold text-foreground mb-2">Opportunity not found</p>
          <button onClick={() => navigate("/opportunities")} className="text-sm text-muted-foreground hover:text-foreground">← Back to Opportunities</button>
        </div>
      </AppShell>
    );
  }

  const vInfo = verificationLabel[opp.poster.verification];
  const otherListings = mockOpportunities.filter(o => o.poster.name === opp.poster.name && o.id !== opp.id);

  const formatBudget = (n: number) => {
    if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
    return `₹${n}`;
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6 lg:px-6">
        {/* Back */}
        <button onClick={() => navigate("/opportunities")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-5">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Opportunities
        </button>

        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold text-background ${typeColors[opp.type]}`}>{opp.type}</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" /> Closes in {opp.daysLeft} days</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">{opp.title}</h1>
        </div>

        {/* Poster card */}
        <div className="rounded-xl border border-border bg-card p-4 mb-6">
          <div className="flex items-center gap-3">
            <img src={opp.poster.avatar} alt={opp.poster.name} className="h-11 w-11 rounded-full object-cover" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{opp.poster.name}</p>
                {vInfo.icon && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                    opp.poster.verification === "Admin" ? "bg-primary text-primary-foreground" : "bg-accent text-foreground"
                  }`}>{vInfo.icon} {vInfo.label}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Posted {opp.postedAgo}</p>
            </div>
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Location</p>
            <p className="text-sm font-medium text-foreground flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{opp.location}{opp.city ? ` · ${opp.city}` : ""}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Budget</p>
            <p className="text-sm font-medium text-foreground flex items-center gap-1"><IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />{formatBudget(opp.budgetMin)}–{formatBudget(opp.budgetMax)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Start Date</p>
            <p className="text-sm font-medium text-foreground flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-muted-foreground" />{new Date(opp.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Duration</p>
            <p className="text-sm font-medium text-foreground flex items-center gap-1"><Timer className="h-3.5 w-3.5 text-muted-foreground" />{opp.duration}</p>
          </div>
        </div>

        {/* Skills */}
        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Skills Required</p>
          <div className="flex flex-wrap gap-1.5">
            {opp.skills.map((s) => (
              <span key={s} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-muted-foreground">{s}</span>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Description</p>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
              {opp.description}
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="mb-8">
          {opp.applicationStatus ? (
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Your application status</p>
              <p className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                opp.applicationStatus === "Shortlisted" ? "bg-[hsl(var(--highlight))]/20 text-[hsl(var(--highlight))]" :
                opp.applicationStatus === "Selected" ? "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]" :
                opp.applicationStatus === "Applied" ? "bg-accent text-foreground" :
                "bg-accent text-muted-foreground"
              }`}>{opp.applicationStatus}</p>
            </div>
          ) : (
            <button
              onClick={() => setShowInterestModal(true)}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Express Interest
            </button>
          )}
        </div>

        {/* Other listings */}
        {otherListings.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">More from {opp.poster.name}</p>
            <div className="space-y-2">
              {otherListings.map((o) => (
                <button
                  key={o.id}
                  onClick={() => navigate(`/opportunities/${o.id}`)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-3 text-left hover:border-muted-foreground/30 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{o.title}</p>
                    <p className="text-xs text-muted-foreground">{o.type} · {o.location}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatBudget(o.budgetMin)}–{formatBudget(o.budgetMax)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Express Interest Modal */}
      {showInterestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => !submitted && setShowInterestModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-elevated">
            {!submitted ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground">Express Interest</h3>
                  <button onClick={() => setShowInterestModal(false)} className="rounded-lg p-1 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                </div>

                {/* Profile preview */}
                <div className="rounded-lg border border-border bg-background p-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-accent" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Arjun Mehta</p>
                      <p className="text-xs text-muted-foreground">Filmmaker · Mumbai · Level 6</p>
                    </div>
                  </div>
                </div>

                {/* Cover note */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-foreground">Cover Note</label>
                  <textarea
                    value={coverNote}
                    onChange={(e) => setCoverNote(e.target.value.slice(0, 500))}
                    placeholder="Why are you interested in this opportunity? Highlight relevant experience..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-muted-foreground/40 min-h-[100px] resize-none"
                  />
                  <p className="mt-1 text-right text-[10px] text-muted-foreground">{coverNote.length}/500</p>
                </div>

                <button
                  onClick={() => setSubmitted(true)}
                  disabled={!coverNote.trim()}
                  className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
                >
                  Submit
                </button>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--success))]/20">
                  <span className="text-xl">✓</span>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">Interest Submitted!</h3>
                <p className="text-sm text-muted-foreground mb-4">The poster will review your profile and get back to you.</p>
                <button
                  onClick={() => { setShowInterestModal(false); setSubmitted(false); }}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/80 transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default OpportunityDetail;
