import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Pencil,
  ChevronDown,
  ChevronUp,
  Download,
  Award,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { generateAndSaveCertificate, type VariablePosition } from "@/lib/certificate-generator";
import { useDebounce } from "@/hooks/useDebounce";

interface TemplateRow {
  id: string;
  course_id: string;
  course_title: string;
  is_active: boolean;
  completion_threshold: number;
  auto_generate: boolean;
  background_image_url: string;
  preview_url: string;
  variable_positions: VariablePosition[];
  total_issued: number;
  auto_count: number;
  manual_count: number;
}

interface CertificateDetail {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  certificate_number: string;
  image_url: string;
  generated_by: string;
  created_at: string;
}

interface UserOption {
  id: string;
  full_name: string;
  email: string;
}

const AdminCertificates = () => {
  const navigate = useNavigate();

  // Template list state
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Expanded template detail
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCerts, setDetailCerts] = useState<CertificateDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Issue certificate dialog
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueTemplate, setIssueTemplate] = useState<TemplateRow | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const debouncedUserSearch = useDebounce(userSearch, 300);
  const [userResults, setUserResults] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [issuing, setIssuing] = useState(false);

  // Load all templates with certificate counts
  const loadTemplates = async () => {
    setLoading(true);
    try {
      // Fetch all certificate templates
      const { data: tmplData, error: tmplErr } = await (supabase as any)
        .from("certificate_templates")
        .select("id, course_id, is_active, completion_threshold, auto_generate, background_image_url, variable_positions, preview_url");

      if (tmplErr) throw tmplErr;
      if (!tmplData || tmplData.length === 0) {
        setTemplates([]);
        setLoading(false);
        return;
      }

      // Fetch course titles
      const courseIds = tmplData.map((t: any) => t.course_id);
      const { data: courses } = await supabase
        .from("courses")
        .select("id, title")
        .in("id", courseIds);

      const courseMap: Record<string, string> = {};
      (courses || []).forEach((c: any) => {
        courseMap[c.id] = c.title;
      });

      // Fetch certificate counts per course (total, auto, manual)
      const { data: certCounts } = await (supabase as any)
        .from("certificates")
        .select("course_id, generated_by")
        .in("course_id", courseIds);

      // Aggregate counts
      const countMap: Record<string, { total: number; auto: number; manual: number }> = {};
      (certCounts || []).forEach((c: any) => {
        if (!countMap[c.course_id]) {
          countMap[c.course_id] = { total: 0, auto: 0, manual: 0 };
        }
        countMap[c.course_id].total += 1;
        if (c.generated_by === "auto") {
          countMap[c.course_id].auto += 1;
        } else {
          countMap[c.course_id].manual += 1;
        }
      });

      const rows: TemplateRow[] = tmplData.map((t: any) => ({
        id: t.id,
        course_id: t.course_id,
        course_title: courseMap[t.course_id] || "Unknown Course",
        is_active: t.is_active ?? true,
        completion_threshold: t.completion_threshold ?? 100,
        auto_generate: t.auto_generate ?? false,
        background_image_url: t.background_image_url || "",
        preview_url: t.preview_url || "",
        variable_positions: t.variable_positions || [],
        total_issued: countMap[t.course_id]?.total ?? 0,
        auto_count: countMap[t.course_id]?.auto ?? 0,
        manual_count: countMap[t.course_id]?.manual ?? 0,
      }));

      // Sort by course title
      rows.sort((a, b) => a.course_title.localeCompare(b.course_title));
      setTemplates(rows);
    } catch (err: any) {
      console.error("Failed to load templates", err);
      toast.error("Failed to load certificate templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // Filter templates by search
  const filtered = templates.filter((t) => {
    if (!debouncedSearch) return true;
    return t.course_title.toLowerCase().includes(debouncedSearch.toLowerCase());
  });

  // Load issued certificates for an expanded template
  const loadCertificateDetails = async (template: TemplateRow) => {
    setDetailLoading(true);
    setDetailCerts([]);
    try {
      const { data: certs } = await (supabase as any)
        .from("certificates")
        .select("id, user_id, certificate_number, image_url, generated_by, created_at")
        .eq("course_id", template.course_id)
        .order("created_at", { ascending: false });

      if (!certs || certs.length === 0) {
        setDetailCerts([]);
        setDetailLoading(false);
        return;
      }

      const userIds = [...new Set(certs.map((c: any) => c.user_id))] as string[];
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", userIds);

      const userMap: Record<string, { full_name: string; email: string }> = {};
      (users || []).forEach((u: any) => {
        userMap[u.id] = u;
      });

      setDetailCerts(
        certs.map((c: any) => ({
          ...c,
          user_name: userMap[c.user_id]?.full_name || "Unknown",
          user_email: userMap[c.user_id]?.email || "",
        }))
      );
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load certificate details");
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleExpand = (template: TemplateRow) => {
    if (expandedId === template.id) {
      setExpandedId(null);
      setDetailCerts([]);
    } else {
      setExpandedId(template.id);
      loadCertificateDetails(template);
    }
  };

  // User search for issue dialog
  useEffect(() => {
    if (!debouncedUserSearch || debouncedUserSearch.length < 2) {
      setUserResults([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("id, full_name, email")
        .or(`full_name.ilike.%${debouncedUserSearch}%,email.ilike.%${debouncedUserSearch}%`)
        .limit(10);
      setUserResults(data || []);
    })();
  }, [debouncedUserSearch]);

  const openIssueDialog = (template: TemplateRow) => {
    setIssueTemplate(template);
    setSelectedUser(null);
    setUserSearch("");
    setUserResults([]);
    setIssueDialogOpen(true);
  };

  const handleIssueCertificate = async () => {
    if (!selectedUser || !issueTemplate) {
      toast.error("Please select a student");
      return;
    }

    if (!issueTemplate.background_image_url) {
      toast.error("This template has no background image. Please configure the template first.");
      return;
    }

    setIssuing(true);
    try {
      const result = await generateAndSaveCertificate({
        templateId: issueTemplate.id,
        templateImageUrl: issueTemplate.background_image_url,
        variablePositions: issueTemplate.variable_positions,
        variableValues: {
          student_name: selectedUser.full_name,
          member_id: "",
          batch_number: "",
          course_name: issueTemplate.course_title,
          completion_date: new Date().toLocaleDateString("en-IN"),
          certificate_number: "",
        },
        userId: selectedUser.id,
        courseId: issueTemplate.course_id,
        generatedBy: "admin_manual",
      });

      if (result) {
        toast.success(`Certificate issued: ${result.certificateNumber}`);
        setIssueDialogOpen(false);
        // Refresh data
        loadTemplates();
        if (expandedId === issueTemplate.id) {
          loadCertificateDetails(issueTemplate);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to issue certificate");
    } finally {
      setIssuing(false);
    }
  };

  return (
    <AdminLayout title="Certificates">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates by course name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => navigate("/admin/courses")}
          className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-2" /> Create Template
        </Button>
      </div>

      {/* Templates list */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading templates...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Award className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">
            {debouncedSearch
              ? "No templates match your search."
              : "No certificate templates created yet."}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Go to a course's settings to create a certificate template.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const isExpanded = expandedId === t.id;
            return (
              <div
                key={t.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Template summary row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Thumbnail preview */}
                  <div className="shrink-0 w-24 h-[68px] rounded-md overflow-hidden bg-secondary border border-border">
                    {t.preview_url ? (
                      <img
                        src={t.preview_url}
                        alt={`${t.course_title} certificate`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Award className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Course name + status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm truncate">
                        {t.course_title}
                      </h3>
                      <span
                        className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          t.is_active
                            ? "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {t.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>Threshold: {t.completion_threshold}%</span>
                      <span className="flex items-center gap-1">
                        {t.auto_generate ? (
                          <ToggleRight className="h-3.5 w-3.5 text-[hsl(var(--accent-emerald))]" />
                        ) : (
                          <ToggleLeft className="h-3.5 w-3.5" />
                        )}
                        Auto-generate: {t.auto_generate ? "On" : "Off"}
                      </span>
                    </div>
                  </div>

                  {/* Counts */}
                  <div className="shrink-0 text-right mr-2">
                    <p className="text-sm font-semibold">{t.total_issued}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {t.auto_count} auto / {t.manual_count} manual
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openIssueDialog(t)}
                      title="Manually issue certificate"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Issue
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate(`/admin/courses/${t.course_id}/certificate`)
                      }
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Template
                    </Button>
                    <button
                      onClick={() => toggleExpand(t)}
                      className="p-2 rounded-md hover:bg-secondary text-muted-foreground"
                      title={isExpanded ? "Collapse" : "View issued certificates"}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded: issued certificates */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {detailLoading ? (
                      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                        Loading certificates...
                      </div>
                    ) : detailCerts.length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                        No certificates issued for this course yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left text-muted-foreground">
                              <th className="px-5 py-2.5 font-medium">Student</th>
                              <th className="px-5 py-2.5 font-medium">Email</th>
                              <th className="px-5 py-2.5 font-medium">Certificate #</th>
                              <th className="px-5 py-2.5 font-medium">Date Issued</th>
                              <th className="px-5 py-2.5 font-medium">Generated By</th>
                              <th className="px-5 py-2.5 font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailCerts.map((cert) => (
                              <tr
                                key={cert.id}
                                className="border-b border-border last:border-0 hover:bg-secondary/30"
                              >
                                <td className="px-5 py-2.5 font-medium">
                                  {cert.user_name}
                                </td>
                                <td className="px-5 py-2.5 text-muted-foreground">
                                  {cert.user_email}
                                </td>
                                <td className="px-5 py-2.5 font-mono text-xs">
                                  {cert.certificate_number}
                                </td>
                                <td className="px-5 py-2.5 font-mono text-xs">
                                  {new Date(cert.created_at).toLocaleDateString("en-IN")}
                                </td>
                                <td className="px-5 py-2.5">
                                  <span
                                    className={`text-xs font-mono px-2 py-0.5 rounded ${
                                      cert.generated_by === "auto"
                                        ? "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]"
                                        : "bg-secondary text-muted-foreground"
                                    }`}
                                  >
                                    {cert.generated_by === "auto" ? "auto" : "manual"}
                                  </span>
                                </td>
                                <td className="px-5 py-2.5">
                                  {cert.image_url && (
                                    <button
                                      onClick={() => window.open(cert.image_url, "_blank")}
                                      className="p-1.5 rounded hover:bg-secondary"
                                      title="Download certificate"
                                    >
                                      <Download className="h-4 w-4" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Issue Certificate Dialog */}
      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Issue Certificate</DialogTitle>
          </DialogHeader>
          {issueTemplate && (
            <div className="space-y-4">
              <div className="rounded-md bg-secondary/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">Course</p>
                <p className="text-sm font-medium">{issueTemplate.course_title}</p>
              </div>

              {/* Student search */}
              <div>
                <label className="block text-sm font-medium mb-1">Student</label>
                {selectedUser ? (
                  <Card className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{selectedUser.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedUser.email}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(null);
                        setUserSearch("");
                      }}
                    >
                      Change
                    </Button>
                  </Card>
                ) : (
                  <>
                    <Input
                      placeholder="Search by name or email..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                    {userResults.length > 0 && (
                      <div className="border border-border rounded-md mt-1 max-h-40 overflow-y-auto">
                        {userResults.map((u) => (
                          <button
                            key={u.id}
                            className="w-full text-left px-3 py-2 hover:bg-secondary/50 text-sm"
                            onClick={() => {
                              setSelectedUser(u);
                              setUserResults([]);
                            }}
                          >
                            <span className="font-medium">{u.full_name}</span>
                            <span className="text-muted-foreground ml-2">
                              {u.email}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <Button
                onClick={handleIssueCertificate}
                disabled={issuing || !selectedUser}
                className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
              >
                {issuing ? "Issuing..." : "Issue Certificate"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCertificates;
