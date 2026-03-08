import AppShell from "@/components/layout/AppShell";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, X, Eye } from "lucide-react";
import {
  opportunityTypes, locationTypes, durations, skillTaxonomy, typeColors,
  type OpportunityType, type LocationType, type Duration,
} from "@/data/opportunitiesData";

const PostOpportunity = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<OpportunityType | "">("");
  const [description, setDescription] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationType | "">("");
  const [city, setCity] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [startDate, setStartDate] = useState("");
  const [duration, setDuration] = useState<Duration | "">("");
  const [deadline, setDeadline] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);

  const filteredSkills = skillTaxonomy.filter(s => !selectedSkills.includes(s) && s.toLowerCase().includes(skillSearch.toLowerCase()));

  const addSkill = (s: string) => { setSelectedSkills(prev => [...prev, s]); setSkillSearch(""); setShowSkillDropdown(false); };
  const removeSkill = (s: string) => setSelectedSkills(prev => prev.filter(x => x !== s));

  const isValid = title.trim() && type && description.trim() && selectedSkills.length > 0 && location && budgetMin && budgetMax && startDate && duration && deadline;

  const formatBudget = (n: number) => {
    if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
    return `₹${n}`;
  };

  if (submitted) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--success))]/20">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Submitted for Review</h2>
          <p className="text-sm text-muted-foreground mb-6">Your opportunity has been submitted for review. It will be published within 24 hours once approved.</p>
          <button onClick={() => navigate("/opportunities")} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
            Back to Opportunities
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6 lg:px-6">
        <button onClick={() => navigate("/opportunities")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-5">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Opportunities
        </button>

        <h1 className="text-xl font-bold text-foreground mb-1">Post an Opportunity</h1>
        <p className="text-sm text-muted-foreground mb-6">All opportunities go through admin review before publishing.</p>

        {!showPreview ? (
          <div className="space-y-5">
            {/* Title */}
            <Field label="Title" required>
              <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))} placeholder="e.g., Lead Video Editor for Web Series" className="input-field" />
              <p className="mt-1 text-right text-[10px] text-muted-foreground">{title.length}/100</p>
            </Field>

            {/* Type */}
            <Field label="Type" required>
              <div className="flex flex-wrap gap-2">
                {opportunityTypes.map((t) => (
                  <button key={t} onClick={() => setType(t)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${type === t ? "bg-foreground text-background" : "bg-accent text-muted-foreground hover:text-foreground"}`}>{t}</button>
                ))}
              </div>
            </Field>

            {/* Description */}
            <Field label="Description" required>
              <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 2000))} placeholder="Describe the opportunity, requirements, and what you're looking for..." className="input-field min-h-[140px] resize-none" />
              <p className="mt-1 text-right text-[10px] text-muted-foreground">{description.length}/2000</p>
            </Field>

            {/* Skills */}
            <Field label="Skills Required" required>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedSkills.map((s) => (
                  <span key={s} className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-foreground">
                    {s} <button onClick={() => removeSkill(s)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <input
                  value={skillSearch}
                  onChange={(e) => { setSkillSearch(e.target.value); setShowSkillDropdown(true); }}
                  onFocus={() => setShowSkillDropdown(true)}
                  placeholder="Search and add skills..."
                  className="input-field"
                />
                {showSkillDropdown && filteredSkills.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-elevated">
                    {filteredSkills.slice(0, 8).map((s) => (
                      <button key={s} onClick={() => addSkill(s)} className="block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-accent">{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </Field>

            {/* Location */}
            <Field label="Location" required>
              <div className="flex flex-wrap gap-2 mb-2">
                {locationTypes.map((l) => (
                  <button key={l} onClick={() => setLocation(l)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${location === l ? "bg-foreground text-background" : "bg-accent text-muted-foreground hover:text-foreground"}`}>{l}</button>
                ))}
              </div>
              {(location === "On-site" || location === "Hybrid") && (
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City name" className="input-field mt-2" />
              )}
            </Field>

            {/* Budget */}
            <Field label="Budget Range (INR)" required>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="Min (₹)" className="input-field" />
                <input type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="Max (₹)" className="input-field" />
              </div>
            </Field>

            {/* Timeline */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start Date" required>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field" />
              </Field>
              <Field label="Duration" required>
                <select value={duration} onChange={(e) => setDuration(e.target.value as Duration)} className="input-field appearance-none">
                  <option value="">Select...</option>
                  {durations.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
            </div>

            {/* Deadline */}
            <Field label="Application Deadline" required>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="input-field" />
            </Field>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowPreview(true)}
                disabled={!isValid}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-accent transition-colors disabled:opacity-40"
              >
                <Eye className="h-4 w-4" /> Preview
              </button>
              <button
                onClick={() => setSubmitted(true)}
                disabled={!isValid}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                Submit for Review
              </button>
            </div>
          </div>
        ) : (
          /* Preview */
          <div className="space-y-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-foreground">Preview</h2>
              <button onClick={() => setShowPreview(false)} className="text-xs text-muted-foreground hover:text-foreground">← Edit</button>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                {type && <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold text-background ${typeColors[type as OpportunityType]}`}>{type}</span>}
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
                <span>{location}{city ? ` · ${city}` : ""}</span>
                <span>{budgetMin && budgetMax ? `${formatBudget(Number(budgetMin))}–${formatBudget(Number(budgetMax))}` : ""}</span>
                <span>{duration}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {selectedSkills.map((s) => <span key={s} className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>)}
              </div>
              <p className="text-sm text-foreground/90 whitespace-pre-line">{description}</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowPreview(false)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-accent transition-colors">
                ← Edit
              </button>
              <button onClick={() => setSubmitted(true)} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
                Submit for Review
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .input-field {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          color: hsl(var(--foreground));
          outline: none;
        }
        .input-field::placeholder { color: hsl(var(--muted-foreground)); }
        .input-field:focus { border-color: hsl(var(--muted-foreground) / 0.4); }
      `}</style>
    </AppShell>
  );
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">
        {label}{required && <span className="text-[hsl(var(--destructive))] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default PostOpportunity;
