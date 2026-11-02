import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchOverview, fetchTotals, type OverviewRow } from "./api";

const GROUPS: { tier: OverviewRow["product_tier"]; label: string }[] = [
  { tier: "masterclass", label: "Masterclasses" },
  { tier: "live_cohort", label: "Live cohorts" },
  { tier: "workshop", label: "Workshops" },
];

interface Props {
  onPeople: (courseId: string) => void;
  onSetUp: (row: OverviewRow) => void;
}

export default function CertOverview({ onPeople, onSetUp }: Props) {
  const totals = useQuery({ queryKey: ["admin-cert-totals"], queryFn: fetchTotals });
  const rows = useQuery({ queryKey: ["admin-cert-overview"], queryFn: fetchOverview });

  const tiles = [
    { label: "Issued", value: totals.data?.issued },
    { label: "Email sent", value: totals.data?.emailed },
    { label: "No email on file", value: totals.data?.no_email },
    { label: "Email failed", value: totals.data?.failed },
    { label: "Email waiting", value: totals.data?.waiting },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {tiles.map((t) => (
          <Card key={t.label} className="bg-surface border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{t.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{t.value ?? "–"}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {rows.isLoading && <Skeleton className="h-64 w-full" />}
      {rows.error && <p className="text-sm text-destructive">Couldn't load: {(rows.error as Error).message}</p>}

      {GROUPS.map(({ tier, label }) => {
        const list = (rows.data ?? []).filter((r) => r.product_tier === tier);
        if (list.length === 0) return null;
        return (
          <section key={tier} className="space-y-3">
            <h2 className="text-sm font-semibold">{label}</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Course</th>
                    <th className="text-left font-medium px-3 py-2">Design</th>
                    <th className="text-left font-medium px-3 py-2">Rule</th>
                    <th className="text-right font-medium px-3 py-2">Students</th>
                    <th className="text-right font-medium px-3 py-2">Past {tier === "masterclass" ? "85%" : "pass mark"}</th>
                    <th className="text-right font-medium px-3 py-2">Issued</th>
                    <th className="text-right font-medium px-3 py-2">Emailed</th>
                    <th className="text-right font-medium px-3 py-2">Not claimed</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.course_id} className="border-t border-border">
                      <td className="px-3 py-2 max-w-[280px]">
                        <div className="font-medium truncate">{r.course_title}</div>
                        <div className="text-xs text-muted-foreground">{r.total_lessons} lessons</div>
                      </td>
                      <td className="px-3 py-2">
                        {r.design_id ? (
                          <Badge variant="outline" className="border-success/40 text-success">{r.design_name ?? "Ready"}</Badge>
                        ) : (
                          <Badge variant="outline" className="border-warning/40 text-warning">Not set up</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {r.template_id ? (r.issue_mode === "auto" ? `Auto at ${r.threshold}%` : "Team issues") : "–"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.students}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.eligible}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.issued}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.emailed}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.not_claimed}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {r.design_id ? (
                          <Button size="sm" variant="outline" onClick={() => onPeople(r.course_id)}>People</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => onSetUp(r)}>Set up</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">
        "Not claimed" means past the pass mark with no certificate yet. On Auto courses, anyone who crosses 85% after
        the course was switched on gets it by email automatically; people who were already past it claim it from the
        course page, or you can send it from Find a student.
      </p>
    </div>
  );
}
