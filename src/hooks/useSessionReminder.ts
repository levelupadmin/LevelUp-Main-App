import { useEffect, useCallback } from "react";

export function useSessionReminder() {
  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    const result = await Notification.requestPermission();
    return result === "granted";
  }, []);

  const scheduleReminder = useCallback(
    (sessionId: string, sessionTitle: string, scheduledAt: string) => {
      const key = `reminder:${sessionId}`;
      localStorage.setItem(key, "true");

      // Calculate ms until 15 minutes before session
      const sessionTime = new Date(scheduledAt).getTime();
      const reminderTime = sessionTime - 15 * 60 * 1000;
      const delay = reminderTime - Date.now();

      if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
        // Only schedule if within 24 hours (setTimeout max reliable range)
        setTimeout(() => {
          if (Notification.permission === "granted") {
            new Notification("Session starting soon", {
              body: `${sessionTitle} starts in 15 minutes`,
              icon: "/favicon.ico",
              tag: sessionId, // prevents duplicate notifications
            });
          }
        }, delay);
      }
    },
    []
  );

  const cancelReminder = useCallback((sessionId: string) => {
    localStorage.removeItem(`reminder:${sessionId}`);
  }, []);

  const isReminderSet = useCallback((sessionId: string) => {
    return localStorage.getItem(`reminder:${sessionId}`) === "true";
  }, []);

  return { requestPermission, scheduleReminder, cancelReminder, isReminderSet };
}
