import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Download, Trash2, Plus, Search } from "lucide-react";
import SortableHeader, { useSort } from "@/components/admin/SortableHeader";
import { generateAndSaveCertificate, type VariablePosition } from "@/lib/certificate-generator";
import { useDebounce } from "@/hooks/useDebounce";

interface CertificateRow {
  id: string;
  user_id: string;
  course_id: string;
  certificate_number: string;
  image_url: string;
  generated_by: string;
  created_at: string;
  user_name: string;
  user_email: string;
  course_title: string;
}

interface CourseOption {
  id: string;
  title: string;
}

interface UserOption {
  id: string;
  full_name: string;
  email: string;
}

interface CourseWithTemplate {
  id: string;
  title: string;
  template_id: string;
  template_image_url: string;
  variable_positions: VariablePosition[];
}

const PAGE_SIZE = 25;

const AdminCertificates = () => {
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [courseFilter, setCourseFilter] = useState("all");
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Generate dialog state
  const [generateOpen, setGenerateOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const debouncedUserSearch = useDebounce(userSearch, 300);
  const [userResults, setUserResults] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [coursesWithTemplates, setCoursesWithTemplates] = useState<CourseWithTemplate[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [generating, setGenerating] = useState(false);

  const { sort, toggle, comparator } = useSort<CertificateRow>("created_at");

  // Load courses for filter dropdown
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("courses").select("id, title").order("title");
      setCourses(data || []);
    })();
  }, []);

  // Load certificates
  const load = async (p = page) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Get total count
    let countQuery = (supabase as any).from("certificates").select("id", { count: "exact", head: true });
    if (courseFilter !== "all") countQuery = countQuery.eq("course_id", courseFilter);
    const { count } = await countQuery;
    setTotalCount(count ?? 0);

    // Fetch certificates
    const { data: certs } = await (supabase as any)
      .from("certificates")
      .select("id, user_id, course_id, certificate_number, image_url, generated_by, created_at")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!certs || certs.length === 0) {
      setCertificates([]);
      setLoading(false);
      return;
    }

    // Fetch related user & course info
    const userIds = [...new Set(certs.map((c: any) => c.user_id))] as string[];
    const courseIds = [...new Set(certs.map((c: any) => c.course_id))] as string[];

    const [{ data: users }, { data: coursesData }] = await Promise.all([
      supabase.from("users").select("id, full_name, email").in("id", userIds),
      supabase.from("courses").select("id, title").in("id", courseIds),
    ]);

    const userMap: Record<string, { full_name: string; email: string }> = {};
    (users || []).forEach((u: any) => { userMap[u.id] = u; });

    const courseMap: Record<string, string> = {};
    (coursesData || []).forEach((c: any) => { courseMap[c.id] = c.title; });

    setCertificates(
      certs.map((c: any) => ({
        ...c,
        user_name: userMap[c.user_id]?.full_name || "Unknown",
        user_email: userMap[c.user_id]?.email || "",
        course_title: courseMap[c.course_id] || "Unknown",
      }))
    );
    setLoading(false);
  };

  useEffect(() => { setPage(0); load(0); }, [courseFilter]);
  useEffect(() => { load(); }, [page]);

  // Client-side search + sort
  const filtered = certificates
    .filter((c) => {
      if (!debouncedSearch) return true;
      const q = debouncedSearch.toLowerCase();
      return (
        c.user_name.toLowerCase().includes(q) ||
        c.user_email.toLowerCase().includes(q)
      );
    })
    .sort(comparator);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Delete handler
  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await (supabase as any).from("certificates").delete().eq("id", deleteId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Certificate deleted");
      load();
    }
    setDeleteId(null);
  };

  // Search users for generate dialog
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

  // Load courses with certificate templates when generate dialog opens
  const openGenerateDialog = async () => {
    setSelectedUser(null);
    setUserSearch("");
    setUserResults([]);
    setSelectedCourseId("");

    // Fetch courses that have certificate templates
    const { data: templates } = await (supabase as any)
      .from("certificate_templates")
      .select("id, course_id, template_image_url, variable_positions");

    if (templates && templates.length > 0) {
      const courseIds = templates.map((t: any) => t.course_id);
      const { data: courseData } = await supabase
        .from("courses")
        .select("id, title")
        .in("id", courseIds);

      const courseDataMap: Record<string, string> = {};
      (courseData || []).forEach((c: any) => { courseDataMap[c.id] = c.title; });

      setCoursesWithTemplates(
        templates.map((t: any) => ({
          id: t.course_id,
          title: courseDataMap[t.course_id] || "Unknown",
          template_id: t.id,
          template_image_url: t.template_image_url,
          variable_positions: t.variable_positions || [],
        }))
      );
    } else {
      setCoursesWithTemplates([]);
    }

    setGenerateOpen(true);
  };

  const handleGenerate = async () => {
    if (!selectedUser || !selectedCourseId) {
      toast.error("Please select a student and a course");
      return;
    }

    const course = coursesWithTemplates.find((c) => c.id === selectedCourseId);
    if (!course) return;

    setGenerating(true);
    try {
      const result = await generateAndSaveCertificate({
        templateId: course.template_id,
        templateImageUrl: course.template_image_url,
        variablePositions: course.variable_positions,
        variableValues: {
          student_name: selectedUser.full_name,
          member_id: "",
          batch_number: "",
          course_name: course.title,
          completion_date: new Date().toLocaleDateString("en-IN"),
          certificate_number: "", // will be generated
        },
        userId: selectedUser.id,
        courseId: course.id,
        generatedBy: "admin_manual",
      });

      if (result) {
        toast.success(`Certificate generated: ${result.certificateNumber}`);
        setGenerateOpen(false);
        load();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate certificate");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AdminLayout title="Certificates">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by student name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={openGenerateDialog}
          className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-2" /> Generate Certificate
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Student Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Course</th>
              <SortableHeader
                label="Certificate #"
                field="certificate_number"
                current={sort}
                onSort={toggle}
                className="px-5 py-3"
              />
              <SortableHeader
                label="Generated"
                field="created_at"
                current={sort}
                onSort={toggle}
                className="px-5 py-3"
              />
              <th className="px-5 py-3 font-medium">By</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                  No certificates found
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                  <td className="px-5 py-3 font-medium">{c.user_name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.user_email}</td>
                  <td className="px-5 py-3">{c.course_title}</td>
                  <td className="px-5 py-3 font-mono text-xs">{c.certificate_number}</td>
                  <td className="px-5 py-3 font-mono text-xs">
                    {new Date(c.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs font-mono px-2 py-0.5 rounded ${
                        c.generated_by === "auto"
                          ? "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {c.generated_by === "auto" ? "auto" : "manual"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => window.open(c.image_url, "_blank")}
                        className="p-1.5 rounded hover:bg-secondary"
                        title="Download certificate"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(c.id)}
                        className="p-1.5 rounded hover:bg-secondary text-destructive"
                        title="Delete certificate"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages} ({totalCount} total)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete certificate?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this certificate record. The student will no longer be able to access it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Generate Certificate Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Certificate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Student search */}
            <div>
              <label className="block text-sm font-medium mb-1">Student</label>
              {selectedUser ? (
                <Card className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{selectedUser.full_name}</p>
                    <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
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
                          <span className="text-muted-foreground ml-2">{u.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Course selection */}
            <div>
              <label className="block text-sm font-medium mb-1">Course</label>
              {coursesWithTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No courses with certificate templates found.
                </p>
              ) : (
                <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a course" />
                  </SelectTrigger>
                  <SelectContent>
                    {coursesWithTemplates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generating || !selectedUser || !selectedCourseId}
              className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
            >
              {generating ? "Generating..." : "Generate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCertificates;
