import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminUser, UserRole, UserStatus } from "@/data/adminData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, X, Loader2, GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole: UserRole;
  userStatus: UserStatus;
  roleStyles: Record<UserRole, string>;
  statusStyles: Record<UserStatus, string>;
  roleLabel: Record<UserRole, string>;
}

type Course = Tables<"courses">;
type Enrollment = Tables<"enrollments">;

const UserDetailSheet = ({ user, open, onOpenChange, userRole, userStatus, roleStyles, statusStyles, roleLabel }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assignCourseId, setAssignCourseId] = useState<string>("");
  const [showAssign, setShowAssign] = useState(false);

  const isValidUUID = user ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) : false;

  // Fetch user's enrollments with course data
  const { data: enrollments = [], isLoading: loadingEnrollments } = useQuery({
    queryKey: ["admin-user-enrollments", user?.id],
    enabled: !!user && isValidUUID,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("*, courses!enrollments_course_id_fkey(*)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch all published courses for the assign dropdown
  const { data: allCourses = [] } = useQuery({
    queryKey: ["admin-all-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, title, course_type, slug").order("title");
      if (error) throw error;
      return data;
    },
  });

  // Courses the user is NOT enrolled in
  const enrolledCourseIds = new Set(enrollments.map((e) => e.course_id));
  const availableCourses = allCourses.filter((c) => !enrolledCourseIds.has(c.id));

  // Assign course mutation
  const assignCourse = useMutation({
    mutationFn: async (courseId: string) => {
      const { error } = await supabase.from("enrollments").insert({
        user_id: user!.id,
        course_id: courseId,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-enrollments", user?.id] });
      toast({ title: "Course assigned", description: "The user has been enrolled successfully." });
      setAssignCourseId("");
      setShowAssign(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to assign course", description: err.message, variant: "destructive" });
    },
  });

  // Remove enrollment mutation
  const removeEnrollment = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-enrollments", user?.id] });
      toast({ title: "Enrollment removed" });
    },
  });

  if (!user) return null;

  const statusColor: Record<string, string> = {
    active: "text-green-400",
    completed: "text-blue-400",
    cancelled: "text-muted-foreground",
    expired: "text-muted-foreground",
  };

  const typeLabel: Record<string, string> = {
    masterclass: "Masterclass",
    workshop: "Workshop",
    cohort: "Cohort",
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-xl">{user.name}</SheetTitle>
          <SheetDescription>{user.email}</SheetDescription>
        </SheetHeader>

        {/* User info grid */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-secondary p-3">
              <p className="text-xs text-muted-foreground">City</p>
              <p className="text-sm font-medium text-foreground">{user.city}</p>
            </div>
            <div className="rounded-md bg-secondary p-3">
              <p className="text-xs text-muted-foreground">Level</p>
              <p className="text-sm font-medium text-foreground">{user.level}</p>
            </div>
            <div className="rounded-md bg-secondary p-3">
              <p className="text-xs text-muted-foreground">Last Active</p>
              <p className="text-sm font-medium text-foreground">{user.lastActive}</p>
            </div>
            <div className="rounded-md bg-secondary p-3">
              <p className="text-xs text-muted-foreground">Joined</p>
              <p className="text-sm font-medium text-foreground">{user.joined}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Role:</span>
              <Badge variant="outline" className={roleStyles[userRole]}>{roleLabel[userRole]}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge variant="outline" className={statusStyles[userStatus]}>{userStatus}</Badge>
            </div>
          </div>

          {/* Enrolled Courses */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                Enrolled Courses ({enrollments.length})
              </h3>
              <Button size="sm" variant="outline" onClick={() => setShowAssign(!showAssign)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Assign Course
              </Button>
            </div>

            {/* Assign course UI */}
            {showAssign && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-secondary/50 border border-border">
                <Select value={assignCourseId} onValueChange={setAssignCourseId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a course..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCourses.length === 0 ? (
                      <SelectItem value="__none" disabled>No courses available</SelectItem>
                    ) : (
                      availableCourses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span>{c.title}</span>
                          <span className="ml-2 text-xs text-muted-foreground">({typeLabel[c.course_type] || c.course_type})</span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!assignCourseId || assignCourse.isPending}
                  onClick={() => assignCourse.mutate(assignCourseId)}
                >
                  {assignCourse.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowAssign(false); setAssignCourseId(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Enrollment list */}
            {loadingEnrollments ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : enrollments.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No courses enrolled yet
              </div>
            ) : (
              <div className="space-y-2">
                {enrollments.map((enrollment) => (
                  <div key={enrollment.id} className="flex items-center gap-3 p-3 rounded-md bg-secondary/30 border border-border group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {enrollment.courses?.title || "Unknown Course"}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {typeLabel[enrollment.courses?.course_type || ""] || "Course"}
                        </span>
                        <span className={`text-xs font-medium ${statusColor[enrollment.status] || "text-muted-foreground"}`}>
                          • {enrollment.status}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Enrolled {new Date(enrollment.enrolled_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={() => removeEnrollment.mutate(enrollment.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default UserDetailSheet;
