import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CertOverview from "@/components/admin/certificates/CertOverview";
import CertStudent from "@/components/admin/certificates/CertStudent";
import CertIssue from "@/components/admin/certificates/CertIssue";
import CertDesigns from "@/components/admin/certificates/CertDesigns";
import type { OverviewRow } from "@/components/admin/certificates/api";

/**
 * Admin → Certificates. Overview (numbers per course), Find a student (the
 * "I finished but didn't get it" case), Issue (a whole batch at once), and
 * Designs (the library: upload a design, place the name, use it for courses).
 * Every action goes through the `certificates` edge function and is logged.
 */
type Tab = "overview" | "student" | "issue" | "designs";

export default function AdminCertificates() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";
  const courseId = params.get("course");
  const userId = params.get("user");
  const [assignFor, setAssignFor] = useState<OverviewRow | null>(null);

  const go = (next: Tab, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ tab: next, ...extra });
    setParams(p, { replace: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Certificates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Masterclasses go out automatically at 85% of lessons done. Live cohorts are issued by the team. Every certificate is a PDF with its own number and a public check page.
        </p>
      </div>
      <Tabs value={tab} onValueChange={(v) => go(v as Tab)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="student">Find a student</TabsTrigger>
          <TabsTrigger value="issue">Issue to a group</TabsTrigger>
          <TabsTrigger value="designs">Designs</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6">
          <CertOverview
            onPeople={(id) => go("issue", { course: id })}
            onSetUp={(row) => { setAssignFor(row); go("designs"); }}
          />
        </TabsContent>
        <TabsContent value="student" className="mt-6">
          <CertStudent key={userId ?? "none"} initialUserId={userId} />
        </TabsContent>
        <TabsContent value="issue" className="mt-6">
          <CertIssue courseId={courseId} onCourse={(id) => go("issue", { course: id })} onStudent={(id) => go("student", { user: id })} />
        </TabsContent>
        <TabsContent value="designs" className="mt-6">
          <CertDesigns assignFor={assignFor} onAssigned={() => setAssignFor(null)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
