import { useEffect } from 'react';
import { getReminderEnabled, getReminderTime, getReminderLastFired, setReminderLastFired } from './preferences.js';

const CHECK_INTERVAL_MS = 30000;

// Fires a browser Notification once per day at the configured time, while the app is
// open — mounted once at the AuthedApp level (not inside SettingsView) so it keeps
// checking no matter which tab is currently active.
export function usePracticeReminder() {
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!getReminderEnabled()) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const today = now.toISOString().slice(0, 10);
      if (hhmm === getReminderTime() && getReminderLastFired() !== today) {
        new Notification('YogaPedia', { body: "Time for today's practice!" });
        setReminderLastFired(today);
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);
}
