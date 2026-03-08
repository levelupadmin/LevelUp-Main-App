import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Play } from "lucide-react";
import { useParams } from "react-router-dom";

const LessonDetail = () => {
  const { lessonId } = useParams();
  return (
    <AppShell>
      <PlaceholderPage
        icon={Play}
        title={`Lesson ${lessonId}`}
        subtitle="Video player, lesson content, micro-activity prompt, and progress tracking."
        badge="Lesson"
      />
    </AppShell>
  );
};

export default LessonDetail;
