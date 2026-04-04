import { useState } from "react";
import { useDevAuth, DevRole } from "@/contexts/DevAuthContext";
import { Settings, ChevronDown, X } from "lucide-react";

const ROLE_OPTIONS: { value: DevRole; label: string; description: string }[] = [
  { value: "super_admin", label: "Super Admin", description: "Full platform access" },
  { value: "mentor", label: "Mentor / Admin", description: "Course management access" },
  { value: "student_enrolled", label: "Student (Enrolled)", description: "Has purchased courses" },
  { value: "student_free", label: "Student (Free)", description: "No purchased courses" },
];

const DevRoleSwitcher = () => {
  const { currentRole, setRole } = useDevAuth();
  const [open, setOpen] = useState(false);

  const current = ROLE_OPTIONS.find((r) => r.value === currentRole)!;

  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      {open && (
        <div className="mb-2 w-64 rounded-xl border border-border bg-card p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Dev Mode
            </span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1">
            {ROLE_OPTIONS.map((role) => (
              <button
                key={role.value}
                onClick={() => { setRole(role.value); setOpen(false); }}
                className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                  currentRole === role.value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-foreground"
                }`}
              >
                <p className="text-sm font-semibold">{role.label}</p>
                <p className={`text-xs ${currentRole === role.value ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {role.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-lg transition-all hover:shadow-xl"
      >
        <Settings className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">{current.label}</span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
};

export default DevRoleSwitcher;
