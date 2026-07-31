import usePageTitle from "@/hooks/usePageTitle";
import { MessageSquare } from "lucide-react";

/**
 * Community is intentionally locked. The real feed lives in CommunityPage.tsx;
 * this placeholder is wired to the /community route in its place so the section
 * is fully sealed (no posts read or written) while still telling students it's
 * on the way. To re-enable, point the route back at CommunityPage.
 */
export default function CommunityComingSoon() {
  usePageTitle("Community");

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full text-center bg-card border border-border rounded-2xl p-10">
        <div className="mx-auto mb-6 h-14 w-14 rounded-full bg-secondary/60 flex items-center justify-center">
          <MessageSquare className="h-7 w-7 text-muted-foreground" />
        </div>
        <span className="inline-block text-xs font-medium tracking-wide uppercase text-muted-foreground border border-border rounded-full px-3 py-1 mb-4">
          Coming soon
        </span>
        <h1 className="text-2xl font-semibold mb-2">Community</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We're building a space for you to share your work, get feedback, and
          learn alongside the rest of the cohort. It isn't open yet — check back
          shortly.
        </p>
      </div>
    </div>
  );
}
