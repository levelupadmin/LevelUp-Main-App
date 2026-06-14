import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown to anyone who isn't an active live-cohort member, on the Studio hub and
// any tool inside it.
export default function StudioLocked() {
  return (
    <div className="max-w-xl mx-auto text-center py-16">
      <div className="h-14 w-14 rounded-2xl grid place-items-center mx-auto bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]">
        <Lock className="h-7 w-7" />
      </div>
      <h1 className="heading-1 mt-5">Studio is for cohort members</h1>
      <p className="text-[hsl(var(--muted-foreground))] mt-2">
        Studio is your creative workspace, with tools to keep getting better at your craft, like a private
        swipe file that transcribes the reels you love and lets your own AI learn from them. It unlocks
        when you join a live cohort.
      </p>
      <Link to="/home"><Button className="mt-6">Browse live cohorts</Button></Link>
    </div>
  );
}
