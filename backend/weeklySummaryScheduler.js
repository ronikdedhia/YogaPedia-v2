// Self-scheduling weekly email, same "poll while the process is running" pattern already
// used client-side by frontend/src/usePracticeReminder.js — this app has no deployment or
// external cron yet (ROADMAP.md), but the backend IS a long-running process while `npm run
// dev`/`npm start` is up, so it can just check its own clock instead of waiting on
// infrastructure that doesn't exist yet. If this ever moves to a real host with a cron/
// scheduled-function primitive, that's a straightforward swap-in replacement for this file.
const { hasBrevoKey, sendWeeklySummaryForUser } = require('./email');
const { hasMongoUri } = require('./db');
const { hasClerkKeys } = require('./auth');
const { getAllUserIdsWithSchedule, getScheduleForUser, markWeeklySummarySent } = require('./models/schedules');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min — matches the send-time window below, so no user is checked twice in one window
const SEND_WINDOW_MINUTES = 5;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isWithinSendWindow(sendTime) {
  const [hh, mm] = (sendTime || '').split(':').map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return false;
  const now = new Date();
  const diffMinutes = Math.abs(now.getHours() * 60 + now.getMinutes() - (hh * 60 + mm));
  return diffMinutes <= SEND_WINDOW_MINUTES;
}

async function runOnce() {
  const sendTime = process.env.WEEKLY_SUMMARY_SEND_TIME;
  if (!sendTime || !isWithinSendWindow(sendTime)) return;

  const userIds = await getAllUserIdsWithSchedule();
  for (const userId of userIds) {
    try {
      const schedule = await getScheduleForUser(userId);
      const lastSent = schedule?.lastWeeklySummarySentAt ? new Date(schedule.lastWeeklySummarySentAt).getTime() : 0;
      if (Date.now() - lastSent < SEVEN_DAYS_MS) continue; // already sent this user's summary within the last week
      await sendWeeklySummaryForUser(userId);
      await markWeeklySummarySent(userId);
      console.log(`Weekly summary sent to user ${userId}`);
    } catch (err) {
      console.error(`Weekly summary failed for user ${userId}:`, err.message || err);
    }
  }
}

function startWeeklySummaryScheduler() {
  if (!hasBrevoKey || !hasMongoUri || !hasClerkKeys) {
    if (hasBrevoKey) {
      console.warn('BREVO_API_KEY is set, but Mongo and/or Clerk are not configured — weekly email summaries need all three, staying disabled.');
    }
    return;
  }
  if (!process.env.WEEKLY_SUMMARY_SEND_TIME) {
    console.warn('BREVO configured but WEEKLY_SUMMARY_SEND_TIME is not set — weekly email summaries staying disabled until it is (e.g. "06:30").');
    return;
  }
  setInterval(() => runOnce().catch((err) => console.error('Weekly summary scheduler tick failed:', err)), CHECK_INTERVAL_MS);
  console.log(`Weekly email summaries enabled — checking every 5 min for the ${process.env.WEEKLY_SUMMARY_SEND_TIME} send window.`);
}

module.exports = { startWeeklySummaryScheduler };
