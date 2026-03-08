import AppShell from "@/components/layout/AppShell";
import StreakCard from "@/components/home/StreakCard";
import DailyChallengeCard from "@/components/home/DailyChallengeCard";
import ContinueLearning from "@/components/home/ContinueLearning";
import CommunityHighlights from "@/components/home/CommunityHighlights";
import { userProfile } from "@/data/mockData";

const Index = () => {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6">
        {/* Greeting */}
        <div>
          <p className="text-sm text-muted-foreground">Good morning,</p>
          <h1 className="text-2xl font-bold text-foreground lg:text-3xl">
            {userProfile.name.split(" ")[0]} 👋
          </h1>
        </div>

        {/* Top row: Streak + Challenge */}
        <div className="grid gap-4 lg:grid-cols-2">
          <StreakCard />
          <DailyChallengeCard />
        </div>

        {/* Continue Learning */}
        <ContinueLearning />

        {/* Community */}
        <CommunityHighlights />
      </div>
    </AppShell>
  );
};

export default Index;
