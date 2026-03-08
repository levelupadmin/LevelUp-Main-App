import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { mockAdminCourses, ContentStatus } from "@/data/adminData";
import { FileText, Search, Plus, MoreHorizontal, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

const statusStyles: Record<ContentStatus, string> = {
  published: "bg-green-500/10 text-green-400 border-green-500/20",
  draft: "bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20",
  archived: "bg-muted text-muted-foreground border-border",
};

const AdminContent = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role === "super_admin";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [statuses, setStatuses] = useState<Record<string, ContentStatus>>(
    Object.fromEntries(mockAdminCourses.map((c) => [c.id, c.status]))
  );

  const courses = mockAdminCourses
    .filter((c) => !isSuperAdmin ? c.instructorId === "u2" : true) // mock: mentors see assigned
    .filter((c) => search === "" || c.title.toLowerCase().includes(search.toLowerCase()))
    .filter((c) => statusFilter === "all" || statuses[c.id] === statusFilter);

  const handleAction = (id: string, action: string) => {
    if (action === "publish") setStatuses((s) => ({ ...s, [id]: "published" }));
    if (action === "unpublish") setStatuses((s) => ({ ...s, [id]: "draft" }));
    if (action === "archive") setStatuses((s) => ({ ...s, [id]: "archived" }));
    if (action === "delete") setStatuses((s) => ({ ...s, [id]: "archived" }));
    toast({ title: `Course ${action}ed`, description: `Action completed successfully.` });
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Content Management</h1>
            <p className="text-sm text-muted-foreground">
              {isSuperAdmin ? "Manage all courses and learning content" : "Your assigned courses"}
            </p>
          </div>
          {isSuperAdmin && (
            <Button size="sm" className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90">
              <Plus className="h-4 w-4 mr-1" /> Create Course
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search courses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Instructor</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Students</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Rating</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground truncate max-w-[200px]">{course.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{course.instructor}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{course.category}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={statusStyles[statuses[course.id]]}>
                        {statuses[course.id]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">{course.students}</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      {course.rating > 0 ? (
                        <span className="flex items-center justify-end gap-1 text-muted-foreground">
                          <Star className="h-3 w-3 fill-[hsl(var(--highlight))] text-[hsl(var(--highlight))]" />
                          {course.rating}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="rounded-md p-1.5 hover:bg-secondary transition-colors">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Edit</DropdownMenuItem>
                          {statuses[course.id] === "published" ? (
                            <DropdownMenuItem onClick={() => handleAction(course.id, "unpublish")}>Unpublish</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleAction(course.id, "publish")}>Publish</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleAction(course.id, "archive")}>Archive</DropdownMenuItem>
                          {isSuperAdmin && (
                            <DropdownMenuItem onClick={() => handleAction(course.id, "delete")} className="text-destructive">
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {courses.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No courses found.</div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminContent;
