// Telegram broadcast — same "plain fetch, no SDK" convention as ElevenLabs/Brevo/Zoom
// elsewhere in this backend. Missing keys means the feature stays disabled, nothing crashes.
const hasTelegramKeys = Boolean(process.env.TELEGRAM_ACCESS_TOKEN && process.env.TELEGRAM_CHANNEL_ID);

async function sendTelegramMessage(text) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_ACCESS_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHANNEL_ID, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
}

module.exports = { hasTelegramKeys, sendTelegramMessage };
