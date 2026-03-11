import { Info } from "lucide-react";

const DripTab = () => (
  <div className="space-y-6 max-w-2xl">
    <div>
      <h2 className="text-lg font-semibold text-foreground">Drip Settings</h2>
      <p className="text-sm text-muted-foreground">Control when content becomes available to students</p>
    </div>
    <div className="rounded-xl border border-dashed border-border py-16 text-center">
      <Info className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-muted-foreground text-sm">Drip configuration coming soon</p>
      <p className="text-xs text-muted-foreground mt-1">Set enrollment-based or date-based content release schedules</p>
    </div>
  </div>
);

export default DripTab;
