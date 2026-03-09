import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, FileText, HelpCircle } from "lucide-react";
import LessonCommentsThread from "./LessonCommentsThread";
import LessonResourcesList from "./LessonResourcesList";
import LessonQnAThread from "./LessonQnAThread";
import AssignmentSubmission from "./AssignmentSubmission";
import type { Lesson, Course } from "@/hooks/useCourseData";

interface Props {
  lesson: Lesson;
  course: Course;
}

const LessonBelowContent = ({ lesson, course }: Props) => {
  const showComments = !course.disable_comments;
  const showQnA = !course.disable_qna;
  const isAssignment = lesson.type === "assignment";

  return (
    <div className="px-4 py-4 lg:px-6 space-y-4">
      {/* Assignment submission for assignment-type lessons */}
      {isAssignment && (
        <AssignmentSubmission lessonId={lesson.id} courseId={lesson.course_id} />
      )}

      {/* Tabs: Description / Resources / QnA */}
      <Tabs defaultValue={showComments ? "comments" : "resources"}>
        <TabsList className="bg-muted border border-border w-auto justify-start">
          {showComments && (
            <TabsTrigger value="comments" className="gap-1.5 text-xs">
              <MessageCircle className="h-3.5 w-3.5" /> Comments
            </TabsTrigger>
          )}
          <TabsTrigger value="resources" className="gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" /> Resources
          </TabsTrigger>
          {showQnA && (
            <TabsTrigger value="qna" className="gap-1.5 text-xs">
              <HelpCircle className="h-3.5 w-3.5" /> Q&A
            </TabsTrigger>
          )}
        </TabsList>

        {showComments && (
          <TabsContent value="comments" className="mt-4">
            <LessonCommentsThread lessonId={lesson.id} courseId={lesson.course_id} />
          </TabsContent>
        )}

        <TabsContent value="resources" className="mt-4">
          <LessonResourcesList lessonId={lesson.id} courseId={lesson.course_id} />
        </TabsContent>

        {showQnA && (
          <TabsContent value="qna" className="mt-4">
            <LessonQnAThread lessonId={lesson.id} courseId={lesson.course_id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default LessonBelowContent;
