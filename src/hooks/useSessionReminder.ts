import { useEffect, useCallback, useRef } from "react";

export function useSessionReminder() {
  const timerMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

      // Clear any existing timer for this session
      const existing = timerMapRef.current.get(sessionId);
      if (existing) clearTimeout(existing);

      // Calculate ms until 15 minutes before session
      const sessionTime = new Date(scheduledAt).getTime();
      const reminderTime = sessionTime - 15 * 60 * 1000;
      const delay = reminderTime - Date.now();

      if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
        // Only schedule if within 24 hours (setTimeout max reliable range)
        const timerId = setTimeout(() => {
          timerMapRef.current.delete(sessionId);
          if (Notification.permission === "granted") {
            new Notification("Session starting soon", {
              body: `${sessionTitle} starts in 15 minutes`,
              icon: "/favicon.ico",
              tag: sessionId, // prevents duplicate notifications
            });
          }
        }, delay);
        timerMapRef.current.set(sessionId, timerId);
      }
    },
    []
  );

  const cancelReminder = useCallback((sessionId: string) => {
    localStorage.removeItem(`reminder:${sessionId}`);
    const timerId = timerMapRef.current.get(sessionId);
    if (timerId) {
      clearTimeout(timerId);
      timerMapRef.current.delete(sessionId);
    }
  }, []);

  const isReminderSet = useCallback((sessionId: string) => {
    return localStorage.getItem(`reminder:${sessionId}`) === "true";
  }, []);

  // Clean up all timers on unmount
  const cleanup = useCallback(() => {
    timerMapRef.current.forEach((timerId) => clearTimeout(timerId));
    timerMapRef.current.clear();
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { requestPermission, scheduleReminder, cancelReminder, isReminderSet, cleanup };
}
