import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

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
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm flex items-center justify-center gap-2">
      <WifiOff className="h-4 w-4" />
      You're offline. Some features may not work until your connection is restored.
    </div>
  );
};

export default OfflineBanner;
