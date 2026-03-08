import AppShell from "@/components/layout/AppShell";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Filter, MapPin, Clock, IndianRupee, X, ChevronDown, Plus, Lock,
} from "lucide-react";
import {
  mockOpportunities, opportunityTypes, locationTypes, typeColors, verificationLabel,
  type Opportunity, type OpportunityType, type LocationType,
} from "@/data/opportunitiesData";
import { skillTaxonomy } from "@/data/opportunitiesData";

const MOCK_USER_LEVEL = 6; // simulate user level

const Opportunities = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<string>("");
  const [filterLocation, setFilterLocation] = useState<string>("");
  const [filterSkill, setFilterSkill] = useState<string>("");
  const [budgetMax, setBudgetMax] = useState<number>(200000);

  const hasFilters = filterType || filterLocation || filterSkill || budgetMax < 200000;

  const filtered = useMemo(() => {
    return mockOpportunities.filter((o) => {
      if (search) {
        const q = search.toLowerCase();
        if (!o.title.toLowerCase().includes(q) && !o.skills.some(s => s.toLowerCase().includes(q)) && !o.poster.name.toLowerCase().includes(q)) return false;
      }
      if (filterType && o.type !== filterType) return false;
      if (filterLocation && o.location !== filterLocation) return false;
      if (filterSkill && !o.skills.some(s => s.toLowerCase().includes(filterSkill.toLowerCase()))) return false;
      if (o.budgetMin > budgetMax) return false;
      return true;
    });
  }, [search, filterType, filterLocation, filterSkill, budgetMax]);

  const clearFilters = () => {
    setFilterType(""); setFilterLocation(""); setFilterSkill(""); setBudgetMax(200000);
  };

  const formatBudget = (n: number) => {
    if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
    return `₹${n}`;
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 lg:px-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Opportunities</h1>
            <p className="text-sm text-muted-foreground">Find gigs, jobs, and collaborations in the creator space</p>
          </div>
          {MOCK_USER_LEVEL >= 5 ? (
            <button
              onClick={() => navigate("/opportunities/new")}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" /> Post
            </button>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Reach Level 5 to post
            </div>
          )}
        </div>

        {/* Search + Filter */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search opportunities..."
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-muted-foreground/40"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2.5 text-sm font-medium transition-colors ${
              showFilters || hasFilters ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {hasFilters && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground">{[filterType, filterLocation, filterSkill, budgetMax < 200000 ? "b" : ""].filter(Boolean).length}</span>}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mb-5 rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Filters</p>
              {hasFilters && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" /> Clear all
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SelectFilter label="Type" value={filterType} onChange={setFilterType} options={[...opportunityTypes]} />
              <SelectFilter label="Location" value={filterLocation} onChange={setFilterLocation} options={[...locationTypes]} />
              <SelectFilter label="Skill" value={filterSkill} onChange={setFilterSkill} options={skillTaxonomy} />
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Max Budget: {formatBudget(budgetMax)}</label>
                <input
                  type="range" min={5000} max={200000} step={5000} value={budgetMax}
                  onChange={(e) => setBudgetMax(Number(e.target.value))}
                  className="w-full accent-foreground"
                />
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        <p className="mb-3 text-xs text-muted-foreground">{filtered.length} opportunit{filtered.length !== 1 ? "ies" : "y"} found</p>

        <div className="space-y-3">
          {filtered.map((opp) => (
            <OpportunityCard key={opp.id} opportunity={opp} navigate={navigate} formatBudget={formatBudget} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card py-12 text-center">
            <p className="text-sm text-muted-foreground">No opportunities match your search</p>
            <button onClick={clearFilters} className="mt-2 text-xs font-semibold text-foreground hover:underline">Clear filters</button>
          </div>
        )}
      </div>
    </AppShell>
  );
};

function OpportunityCard({ opportunity: opp, navigate, formatBudget }: { opportunity: Opportunity; navigate: ReturnType<typeof useNavigate>; formatBudget: (n: number) => string }) {
  const vInfo = verificationLabel[opp.poster.verification];
  return (
    <div
      onClick={() => navigate(`/opportunities/${opp.id}`)}
      className="rounded-xl border border-border bg-card p-4 sm:p-5 transition-colors hover:border-muted-foreground/30 cursor-pointer"
    >
      {/* Top row: type pill + deadline */}
      <div className="flex items-center justify-between mb-3">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold text-background ${typeColors[opp.type]}`}>
          {opp.type}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" /> Closes in {opp.daysLeft} days
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm sm:text-base font-semibold text-foreground leading-snug mb-2">{opp.title}</h3>

      {/* Poster */}
      <div className="flex items-center gap-2 mb-3">
        <img src={opp.poster.avatar} alt={opp.poster.name} className="h-6 w-6 rounded-full object-cover" />
        <span className="text-xs text-muted-foreground">{opp.poster.name}</span>
        {vInfo.icon && (
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
            opp.poster.verification === "Admin" ? "bg-primary text-primary-foreground" : "bg-accent text-foreground"
          }`}>
            {vInfo.icon} {vInfo.label}
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {opp.location}{opp.city ? ` · ${opp.city}` : ""}
        </span>
        <span className="flex items-center gap-1">
          <IndianRupee className="h-3 w-3" /> {formatBudget(opp.budgetMin)}–{formatBudget(opp.budgetMax)}
        </span>
      </div>

      {/* Skills */}
      <div className="flex flex-wrap gap-1 mb-3">
        {opp.skills.slice(0, 4).map((s) => (
          <span key={s} className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>
        ))}
        {opp.skills.length > 4 && (
          <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">+{opp.skills.length - 4}</span>
        )}
      </div>

      {/* Application status */}
      {opp.applicationStatus && (
        <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
          opp.applicationStatus === "Shortlisted" ? "bg-[hsl(var(--highlight))]/20 text-[hsl(var(--highlight))]" :
          opp.applicationStatus === "Selected" ? "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]" :
          opp.applicationStatus === "Applied" ? "bg-accent text-foreground" :
          "bg-accent text-muted-foreground"
        }`}>
          {opp.applicationStatus}
        </div>
      )}

      {/* View Details */}
      <div className="mt-3 flex justify-end">
        <span className="text-xs font-semibold text-foreground hover:underline">View Details →</span>
      </div>
    </div>
  );
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground outline-none focus:border-muted-foreground/40">
          <option value="">All</option>
          {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

export default Opportunities;
