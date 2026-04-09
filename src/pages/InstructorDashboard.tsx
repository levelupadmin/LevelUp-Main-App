import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/layout/StudentLayout";
import { Card } from "@/components/ui/card";
import { BookOpen, Users, Star, TrendingUp } from "lucide-react";

interface MyCourse {
  id: string;
  title: string;
  status: string;
  enrolled_count: number;
  avg_completion: number;
}

const InstructorDashboard = () => {
  const { profile } = useAuth();
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0);

  useEffect(() => {
    if (!profile) return;

    const load = async () => {
      setLoading(true);

      // Get courses where this user is the instructor
      const { data: myCourses } = await supabase
        .from("courses")
        .select("id, title, status, instructor_id")
        .eq("instructor_id", profile.id);

      if (!myCourses || myCourses.length === 0) {
        setLoading(false);
        return;
      }

      const courseList: MyCourse[] = [];
      let total = 0;

      for (const course of myCourses) {
        // Find offerings that include this course
        const { data: ocs } = await supabase
          .from("offering_courses")
          .select("offering_id")
          .eq("course_id", course.id);

        const offeringIds = (ocs || []).map((oc) => oc.offering_id);
        let enrolledCount = 0;

        if (offeringIds.length > 0) {
          const { count } = await supabase
            .from("enrolments")
            .select("id", { count: "exact", head: true })
            .in("offering_id", offeringIds)
            .eq("status", "active");
          enrolledCount = count ?? 0;
        }

        // Chapter count
        const { count: chapterCount } = await supabase
          .from("chapters")
          .select("id, sections!inner(course_id)", { count: "exact", head: true })
          .eq("sections.course_id", course.id);

        // Average progress
        let avgCompletion = 0;
        if (enrolledCount > 0 && chapterCount && chapterCount > 0) {
          const { count: completedChapters } = await supabase
            .from("chapter_progress")
            .select("id", { count: "exact", head: true })
            .eq("course_id", course.id)
            .eq("is_completed", true);
          avgCompletion = Math.round(((completedChapters ?? 0) / (enrolledCount * chapterCount)) * 100);
        }

        total += enrolledCount;
        courseList.push({
          id: course.id,
          title: course.title,
          status: course.status,
          enrolled_count: enrolledCount,
          avg_completion: avgCompletion,
        });
      }

      setTotalStudents(total);
      setCourses(courseList.sort((a, b) => b.enrolled_count - a.enrolled_count));
      setLoading(false);
    };

    load();
  }, [profile]);

  return (
    <StudentLayout>
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-2">Instructor Dashboard</h1>
        <p className="text-muted-foreground mb-8">Overview of your courses and student engagement.</p>

        {loading ? (
          <div className="py-20 text-center text-muted-foreground">Loading...</div>
        ) : courses.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>You don't have any courses assigned yet.</p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">My Courses</p>
                    <p className="text-2xl font-semibold">{courses.length}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Students</p>
                    <p className="text-2xl font-semibold">{totalStudents}</p>
                  </div>
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <h3 className="font-medium mb-4">My Courses</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Course</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium text-right">Students</th>
                      <th className="pb-2 font-medium">Avg Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((c) => (
                      <tr key={c.id} className="border-b border-border/50 last:border-0">
                        <td className="py-3 font-medium">{c.title}</td>
                        <td className="py-3">
                          <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                            c.status === "published"
                              ? "bg-green-500/15 text-green-400"
                              : "bg-yellow-500/15 text-yellow-400"
                          }`}>{c.status}</span>
                        </td>
                        <td className="py-3 text-right font-mono text-xs">{c.enrolled_count}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-secondary rounded-full h-2 max-w-[100px]">
                              <div
                                className="bg-[hsl(var(--cream))] h-2 rounded-full"
                                style={{ width: `${Math.min(c.avg_completion, 100)}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs w-10 text-right">{c.avg_completion}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </StudentLayout>
  );
};

export default InstructorDashboard;
