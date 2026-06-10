import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Calm offline pill. Not an alarm, just a quiet, reassuring note that floats in
 * under the notch and tells the user we're still here when their connection
 * drops. Cream icon on a translucent surface, no red destructive panel.
 */
const OfflineBanner = () => {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-0 right-0 z-[9999] flex justify-center px-4 pointer-events-none"
      style={{ top: "max(env(safe-area-inset-top), 0.5rem)" }}
    >
      <div className="anim-rise pointer-events-auto inline-flex items-center gap-2 rounded-full bg-surface/90 backdrop-blur-md border border-border px-4 py-2 text-sm text-foreground shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]">
        <WifiOff className="h-4 w-4 text-cream flex-shrink-0" strokeWidth={1.5} />
        <span>You're offline, we'll be right here.</span>
      </div>
    </div>
  );
};

export default OfflineBanner;
