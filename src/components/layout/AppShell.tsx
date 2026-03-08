import { ReactNode } from "react";
import TopBar from "./TopBar";
import BottomTabs from "./BottomTabs";

const AppShell = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="mx-auto max-w-lg pb-20 pt-16">
        {children}
      </main>
      <BottomTabs />
    </div>
  );
};

export default AppShell;
