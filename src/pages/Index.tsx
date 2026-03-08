import AppShell from "@/components/layout/AppShell";
import StreakCard from "@/components/home/StreakCard";
import DailyChallengeCard from "@/components/home/DailyChallengeCard";
import ContinueLearning from "@/components/home/ContinueLearning";
import CommunityHighlights from "@/components/home/CommunityHighlights";
import { userProfile } from "@/data/mockData";

const Index = () => {
  return (
    <AppShell>
      <div className="space-y-5 py-4">
        {/* Greeting */}
        <div className="px-4">
          <p className="text-sm text-muted-foreground">Good morning,</p>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {userProfile.name.split(" ")[0]} 👋
          </h1>
        </div>

        {/* Streak */}
        <div className="px-4">
          <StreakCard />
        </div>

        {/* Daily Challenge */}
        <div className="px-4">
          <DailyChallengeCard />
        </div>

        {/* Continue Learning */}
        <ContinueLearning />

        {/* Community Highlights */}
        <CommunityHighlights />
      </div>
    </AppShell>
  );
};

export default Index;
