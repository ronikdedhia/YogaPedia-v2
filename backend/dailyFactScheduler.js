// Self-scheduling daily Telegram broadcast — same "poll while the process is running"
// pattern as weeklySummaryScheduler.js (see that file's comment for why: no deployment/
// cron infra yet, but the backend is a long-running process while the server is up).
const { hasTelegramKeys, sendTelegramMessage } = require('./telegram');
const { hasApiKey } = require('./llm');
const { draftYogaFact } = require('./chains/yogaFact');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min — matches the send-time window below
const SEND_WINDOW_MINUTES = 5;

// In-memory only — a rare process restart could double-send once in the same day, which
// is an acceptable simplification for a broadcast fact (low stakes, not worth a Mongo
// collection just for one timestamp per the app's "least moving parts" philosophy).
let lastSentDate = null;

function isWithinSendWindow(sendTime) {
  const [hh, mm] = (sendTime || '').split(':').map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return false;
  const now = new Date();
  const diffMinutes = Math.abs(now.getHours() * 60 + now.getMinutes() - (hh * 60 + mm));
  return diffMinutes <= SEND_WINDOW_MINUTES;
}

async function runOnce() {
  const sendTime = process.env.DAILY_FACT_SEND_TIME;
  if (!sendTime || !isWithinSendWindow(sendTime)) return;

  const today = new Date().toISOString().slice(0, 10);
  if (lastSentDate === today) return; // already sent today

  try {
    const fact = await draftYogaFact();
    await sendTelegramMessage(fact);
    lastSentDate = today;
    console.log('Daily yoga fact sent to Telegram channel.');
  } catch (err) {
    console.error('Daily yoga fact send failed:', err.message || err);
  }
}

function startDailyFactScheduler() {
  if (!hasTelegramKeys || !hasApiKey) {
    if (hasTelegramKeys) {
      console.warn('Telegram is configured, but GROQ_API_KEY is not — daily yoga facts need both, staying disabled.');
    }
    return;
  }
  if (!process.env.DAILY_FACT_SEND_TIME) {
    console.warn('Telegram configured but DAILY_FACT_SEND_TIME is not set — daily yoga facts staying disabled until it is (e.g. "08:00").');
    return;
  }
  setInterval(() => runOnce().catch((err) => console.error('Daily fact scheduler tick failed:', err)), CHECK_INTERVAL_MS);
  console.log(`Daily yoga facts enabled — checking every 5 min for the ${process.env.DAILY_FACT_SEND_TIME} send window.`);
}

module.exports = { startDailyFactScheduler };
