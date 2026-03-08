import AppShell from "@/components/layout/AppShell";
import { talentDirectory } from "@/data/mockData";
import { MapPin, Briefcase, Filter } from "lucide-react";

const Opportunities = () => {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground lg:text-3xl">Opportunities</h1>
          <p className="text-sm text-muted-foreground">Discover talent & find your next gig</p>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/30">
            <Filter className="h-3 w-3" /> Filters
          </button>
          {["Editor", "Cinematographer", "Creator", "Sound Designer"].map((role) => (
            <button
              key={role}
              className="rounded-md bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {role}
            </button>
          ))}
        </div>

        {/* Talent Directory */}
        <div>
          <h2 className="mb-4 text-lg font-bold text-foreground">Talent Directory</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {talentDirectory.map((person) => (
              <div key={person.id} className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/30">
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <img src={person.avatar} alt={person.name} className="h-12 w-12 rounded-full object-cover" />
                    {person.available && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card bg-success" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-foreground truncate">{person.name}</h3>
                      <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {person.level}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" /> {person.role}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {person.city}
                      </span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {person.skills.map((skill) => (
                        <span key={skill} className="rounded-sm bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                          {skill}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{person.projectCount} projects</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button className="flex-1 rounded-md border border-border py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary">
                    View Profile
                  </button>
                  <button className="flex-1 rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
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
