import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AdminLayout from "@/components/layout/AdminLayout";
import BuilderSidebar, { BuilderTab } from "@/components/admin/course-builder/BuilderSidebar";
import CurriculumTab from "@/components/admin/course-builder/CurriculumTab";
import InformationTab from "@/components/admin/course-builder/InformationTab";
import DripTab from "@/components/admin/course-builder/DripTab";
import ReviewsTab from "@/components/admin/course-builder/ReviewsTab";
import QnAChatbotTab from "@/components/admin/course-builder/QnAChatbotTab";
import AdminCommentsTab from "@/components/admin/AdminCommentsTab";
import AdminQnATab from "@/components/admin/AdminQnATab";
import AdminReportTab from "@/components/admin/AdminReportTab";
import AdminAssignmentResponsesTab from "@/components/admin/AdminAssignmentResponsesTab";
import StudentCoursePreview from "@/components/admin/StudentCoursePreview";
import { useAdminCourse, useModules, useLessons, statusStyles } from "@/hooks/useCourseAdmin";

const AdminCourseBuilder = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<BuilderTab>("curriculum");
  const [showPreview, setShowPreview] = useState(false);

  const { data: course, isLoading } = useAdminCourse(courseId);
  const { data: modules = [] } = useModules(courseId);
  const { data: lessons = [] } = useLessons(courseId);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!course) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">Course not found</p>
          <Button variant="outline" onClick={() => navigate("/admin/courses")}>
            Back to courses
          </Button>
        </div>
      </AdminLayout>
    );
  }

  // Simplified lesson/module props for tabs that need them
  const lessonProps = lessons.map((l) => ({
    id: l.id, title: l.title, module_id: l.module_id, type: l.type,
  }));
  const moduleProps = modules.map((m) => ({ id: m.id, title: m.title }));

  const renderTab = () => {
    switch (activeTab) {
      case "curriculum":
        return <CurriculumTab courseId={course.id} />;
      case "information":
        return <InformationTab courseId={course.id} />;
      case "drip":
        return <DripTab courseId={course.id} />;
      case "report":
        return <AdminReportTab courseId={course.id} lessons={lessonProps} modules={moduleProps} />;
      case "comments":
        return <AdminCommentsTab courseId={course.id} lessons={lessonProps} modules={moduleProps} />;
      case "qna":
        return <AdminQnATab courseId={course.id} lessons={lessonProps} modules={moduleProps} />;
      case "assignments":
        return <AdminAssignmentResponsesTab courseId={course.id} lessons={lessonProps} />;
      case "reviews":
        return <ReviewsTab />;
      case "chatbot":
        return <QnAChatbotTab />;
      default:
        return null;
    }
  };

  return (
    <AdminLayout>
      {/* Preview Dialog */}
      <StudentCoursePreview
        open={showPreview}
        onOpenChange={setShowPreview}
        course={course}
        modules={modules}
        lessons={lessons}
      />

      {/* Builder Header */}
      <div className="-mx-4 -mt-4 lg:-mx-6 lg:-mt-6 px-4 lg:px-6 py-3 border-b border-border bg-card/50 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => navigate("/admin/courses")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-foreground truncate">{course.title}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className={`text-[10px] ${statusStyles[course.status] || ""}`}>
              {course.status}
            </Badge>
            <span className="text-xs text-muted-foreground">{course.course_type}</span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => setShowPreview(true)}
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </Button>
      </div>

      {/* Builder Body */}
      <div className="-mx-4 lg:-mx-6 flex min-h-[calc(100vh-10rem)]">
        <BuilderSidebar active={activeTab} onChange={setActiveTab} />
        <div className="flex-1 p-6 overflow-y-auto">
          {renderTab()}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminCourseBuilder;
