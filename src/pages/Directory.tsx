import AppShell from "@/components/layout/AppShell";
import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, Filter, ExternalLink, X, ChevronDown } from "lucide-react";
import { directoryCreators, directoryFilters, type DirectoryCreator } from "@/data/communityData";

const Directory = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string>(searchParams.get("city") || "");
  const [selectedSkill, setSelectedSkill] = useState<string>(searchParams.get("skill") || "");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [selectedExp, setSelectedExp] = useState<string>("");
  const [selectedAvail, setSelectedAvail] = useState<string>("");

  const hasFilters = selectedCity || selectedSkill || selectedRole || selectedExp || selectedAvail;

  const filtered = useMemo(() => {
    return directoryCreators.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.role.toLowerCase().includes(search.toLowerCase()) && !c.skills.some((s) => s.toLowerCase().includes(search.toLowerCase()))) return false;
      if (selectedCity && c.city !== selectedCity) return false;
      if (selectedSkill && !c.skills.some((s) => s.toLowerCase().includes(selectedSkill.toLowerCase()))) return false;
      if (selectedRole && c.role !== selectedRole) return false;
      if (selectedExp && c.experienceLevel !== selectedExp) return false;
      if (selectedAvail === "Available" && !c.available) return false;
      if (selectedAvail === "Not Available" && c.available) return false;
      return true;
    });
  }, [search, selectedCity, selectedSkill, selectedRole, selectedExp, selectedAvail]);

  const clearFilters = () => {
    setSelectedCity("");
    setSelectedSkill("");
    setSelectedRole("");
    setSelectedExp("");
    setSelectedAvail("");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-foreground">Creator Directory</h1>
          <p className="text-sm text-muted-foreground">Discover creators by skill, city, and availability</p>
        </div>

        {/* Search + Filter toggle */}
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, role, or skill..."
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
            {hasFilters && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground">{[selectedCity, selectedSkill, selectedRole, selectedExp, selectedAvail].filter(Boolean).length}</span>}
          </button>
        </div>

        {/* Filters panel */}
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FilterSelect label="City" value={selectedCity} onChange={setSelectedCity} options={directoryFilters.cities} />
              <FilterSelect label="Skill" value={selectedSkill} onChange={setSelectedSkill} options={directoryFilters.skills} />
              <FilterSelect label="Role" value={selectedRole} onChange={setSelectedRole} options={directoryFilters.roles} />
              <FilterSelect label="Experience" value={selectedExp} onChange={setSelectedExp} options={[...directoryFilters.experienceLevels]} />
              <FilterSelect label="Availability" value={selectedAvail} onChange={setSelectedAvail} options={[...directoryFilters.availability]} />
            </div>
          </div>
        )}

        {/* Results */}
        <p className="mb-3 text-xs text-muted-foreground">{filtered.length} creator{filtered.length !== 1 ? "s" : ""} found</p>

        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((creator) => (
            <CreatorCard key={creator.id} creator={creator} navigate={navigate} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card py-12 text-center">
            <p className="text-sm text-muted-foreground">No creators match your filters</p>
            <button onClick={clearFilters} className="mt-2 text-xs font-semibold text-foreground hover:underline">Clear filters</button>
          </div>
        )}
      </div>
    </AppShell>
  );
};

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground outline-none focus:border-muted-foreground/40"
        >
          <option value="">All</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

function CreatorCard({ creator, navigate }: { creator: DirectoryCreator; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-muted-foreground/30">
      <div className="flex items-start gap-3 mb-3">
        <img src={creator.avatar} alt={creator.name} className="h-11 w-11 rounded-full object-cover" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{creator.name}</p>
          <p className="text-xs text-muted-foreground">{creator.role} · {creator.city}</p>
          <p className="text-xs text-muted-foreground">{creator.experience}</p>
        </div>
        {creator.available ? (
          <span className="shrink-0 rounded-full bg-[hsl(var(--success))] px-2 py-0.5 text-[10px] font-semibold text-background">Available</span>
        ) : (
          <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Unavailable</span>
        )}
      </div>

      <p className="text-xs text-secondary-foreground leading-relaxed line-clamp-2 mb-2">{creator.description}</p>

      {creator.notableWork && (
        <p className="text-[10px] font-medium text-[hsl(var(--highlight))] mb-2">🏆 {creator.notableWork}</p>
      )}

      <div className="flex flex-wrap gap-1 mb-3">
        {creator.skills.slice(0, 4).map((s) => (
          <span key={s} className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>
        ))}
      </div>

      {creator.portfolioUrl && (
        <button
          onClick={() => window.open(creator.portfolioUrl, "_blank")}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <ExternalLink className="h-3 w-3" /> View Portfolio
        </button>
      )}
    </div>
  );
}

export default Directory;
