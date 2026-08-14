/**
 * The build stamp — the prototype telling you which commit it actually is.
 *
 * 🔴 WHY THIS EXISTS (2026-08-14). The branch alias sat on a hand-aliased CLI
 * deployment. A green push later, the dashboard said READY and the URL still
 * served week-old code. From the screen it was indistinguishable from the new
 * build — the founder would have reviewed the wrong thing and reported bugs
 * already fixed. There was no way to tell without pulling the shipped JS.
 *
 * Now the answer is on screen. Read the SHA, compare it to the commit you were
 * handed. They disagree → the alias is stale, re-point it; do not debug the app.
 * Copies to the clipboard on click so it can be pasted straight back into chat.
 */
import { useState } from "react";

/**
 * A greppable marker, not just a value. Minifiers rename the variable holding
 * the SHA, and a bare 7-hex string is indistinguishable from the dozens of
 * chunk hashes in a bundle — the verify script matched the wrong one on its
 * first run. A template literal over a `define` constant is folded by esbuild
 * into ONE literal, so the shipped JS contains `cs-build:89feae5` verbatim and
 * `_scripts/verify_preview_deploy.sh` can read the truth off the wire.
 */
export const BUILD_MARKER = `cs-build:${__BUILD_SHA__}`;

function stampTime(): string {
  try {
    return new Date(__BUILD_TIME__).toLocaleString("en-IN", {
      day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return "";
  }
}

export default function BuildStamp({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const sha = BUILD_MARKER.slice("cs-build:".length);
  const when = stampTime();

  const copy = () => {
    // Best-effort: clipboard is unavailable on insecure origins and in jsdom.
    void navigator.clipboard?.writeText(sha).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1400); },
      () => {},
    );
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="The commit this build came from. Click to copy. If it doesn't match the commit you were given, the deployment alias is stale."
      aria-label={`Build ${sha}. Click to copy the commit.`}
      className={`font-mono text-[10px] tracking-tight text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))] ${className}`}
    >
      {copied ? "commit copied" : `build ${sha}${when ? ` · ${when}` : ""}`}
    </button>
  );
}
