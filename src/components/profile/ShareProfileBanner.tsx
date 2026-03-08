import { useState } from "react";
import { Link2, Check, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ShareProfileBannerProps {
  /** The user's handle or ID used to construct the public URL */
  handle: string;
  name?: string;
}

const ShareProfileBanner = ({ handle, name }: ShareProfileBannerProps) => {
  const [copied, setCopied] = useState(false);
  const publicUrl = `${window.location.origin}/profile/${handle}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast({ title: "Link copied to clipboard ✓", description: "Share it with recruiters or collaborators." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  return (
    <div className="rounded-xl border border-highlight/20 bg-gradient-to-r from-highlight/5 via-card to-highlight/5 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-highlight/15">
          <Link2 className="h-5 w-5 text-highlight" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Share your profile & portfolio</p>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            One link for recruiters to see your work, skills & badges
          </p>
        </div>
        <button
          onClick={copyLink}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
            copied
              ? "bg-success/15 text-success border border-success/30"
              : "bg-highlight text-highlight-foreground hover:bg-highlight/90"
          }`}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied!
            </>
          ) : (
            <>
              <Link2 className="h-3.5 w-3.5" /> Copy Link
            </>
          )}
        </button>
      </div>

      {/* URL preview */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-background/50 px-3 py-2">
        <code className="flex-1 text-xs text-muted-foreground truncate font-mono">{publicUrl}</code>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-highlight hover:text-highlight/80 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
};

export default ShareProfileBanner;
