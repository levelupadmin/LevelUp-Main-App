import AppShell from "@/components/layout/AppShell";
import { talentDirectory } from "@/data/mockData";
import { MapPin, Briefcase, Filter } from "lucide-react";

const Opportunities = () => {
  return (
    <AppShell>
      <div className="space-y-5 py-4">
        <div className="px-4">
          <h1 className="font-display text-2xl font-bold text-foreground">Opportunities</h1>
          <p className="text-sm text-muted-foreground">Discover talent & find your next gig</p>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 px-4">
          <button className="flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground">
            <Filter className="h-3 w-3" /> Filters
          </button>
          {["Editor", "Cinematographer", "Creator"].map((role) => (
            <button
              key={role}
              className="whitespace-nowrap rounded-full bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {role}
            </button>
          ))}
        </div>

        {/* Talent Directory */}
        <div className="px-4">
          <h2 className="mb-3 font-display text-lg font-bold text-foreground">Talent Directory</h2>
          <div className="space-y-3">
            {talentDirectory.map((person) => (
              <div key={person.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <img src={person.avatar} alt={person.name} className="h-14 w-14 rounded-full object-cover" />
                    {person.available && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-card bg-success" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display font-bold text-foreground">{person.name}</h3>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                        {person.level}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" /> {person.role}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {person.city}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {person.skills.map((skill) => (
                        <span key={skill} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                          {skill}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{person.projectCount} projects</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary">
                    View Profile
                  </button>
                  <button className="flex-1 rounded-lg gradient-primary py-2 text-xs font-bold text-primary-foreground shadow-glow">
                    Connect
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default Opportunities;
