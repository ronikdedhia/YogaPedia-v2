// Weekly email summary (ROADMAP.md) — Brevo transactional email, no SDK needed (plain
// REST call via the same global fetch already used for ElevenLabs). Same guard pattern as
// every other optional integration in this backend (Groq/ElevenLabs/Mongo/Clerk): missing
// key means the feature is silently disabled, nothing crashes.
const hasBrevoKey = Boolean(process.env.BREVO_API_KEY && process.env.BREVO_FROM_EMAIL);
if (process.env.BREVO_API_KEY && !hasBrevoKey) {
  console.warn('BREVO_API_KEY is set but BREVO_FROM_EMAIL is missing — weekly email summaries stay disabled until both are set.');
}

const { getSessionLogsForUser, getStruggleSummaryForUser } = require('./models/sessionLogs');

async function sendBrevoEmail({ to, toName, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_FROM_EMAIL, name: process.env.BREVO_FROM_NAME || 'YogaPedia' },
      to: [{ email: to, name: toName || to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo request failed: ${res.status} ${body}`);
  }
}

// Clerk only stores identity — this is the one place this backend reads a user's actual
// email address, rather than duplicating it into MongoDB (see ARCHITECTURE.md §9.1).
async function getUserEmail(userId) {
  const { clerkClient } = require('@clerk/express');
  const user = await clerkClient.users.getUser(userId);
  const email = user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress || user.emailAddresses?.[0]?.emailAddress;
  return email ? { email, name: user.firstName || undefined } : null;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Plain-code aggregation over the same sessionLogs data ActivityView.jsx already
// summarizes client-side — no new data source, just a server-side recap of the last 7
// days instead of a live dashboard.
function summarizeWeek(sessions) {
  const cutoff = Date.now() - ONE_WEEK_MS;
  const recent = sessions.filter((s) => new Date(s.completedAt).getTime() >= cutoff);
  const dateSet = new Set(recent.map((s) => s.date));
  const allPoses = recent.flatMap((s) => s.poseResults || []);
  const correctCount = allPoses.filter((p) => p.wasCorrect).length;
  return {
    sessionsThisWeek: recent.length,
    daysPracticedThisWeek: dateSet.size,
    posesChecked: allPoses.length,
    correctCount,
    pranayamaCount: recent.filter((s) => s.pranayamaCompleted).length,
    walkCount: recent.filter((s) => s.walkCompleted).length,
    waterCount: recent.filter((s) => s.waterCompleted).length,
  };
}

function buildWeeklySummaryHtml({ week, struggleSummary }) {
  const accuracyLine =
    week.posesChecked > 0
      ? `<p>You checked <strong>${week.posesChecked}</strong> poses this week and got <strong>${week.correctCount}</strong> of them right.</p>`
      : '<p>No pose checks logged this week — even a short session counts, jump back in when you can.</p>';

  const struggleHtml = struggleSummary.length
    ? `<p><strong>Poses worth extra attention:</strong></p><ul>${struggleSummary
        .map((s) => `<li>${s.asana}${s.topBodyPart ? ` — watch your ${s.topBodyPart}` : ''}</li>`)
        .join('')}</ul>`
    : '';

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Your week on YogaPedia</h2>
      <p>Sessions logged: <strong>${week.sessionsThisWeek}</strong> across <strong>${week.daysPracticedThisWeek}</strong> day(s).</p>
      ${accuracyLine}
      <p>Breathing done <strong>${week.pranayamaCount}x</strong>, walks <strong>${week.walkCount}x</strong>, water target hit <strong>${week.waterCount}x</strong>.</p>
      ${struggleHtml}
      <p style="color: #888; font-size: 0.85em;">This is an automated weekly recap of your own logged practice — not medical advice.</p>
    </div>
  `.trim();
}

// `overrideEmail` is a fallback, not a shortcut — the real Clerk lookup is always tried
// first (that's the actual pipeline this is meant to exercise/use), it's only a safety net
// if that lookup fails, e.g. while testing before a real Clerk email is confirmed reachable.
async function sendWeeklySummaryForUser(userId, { overrideEmail } = {}) {
  if (!hasBrevoKey) throw new Error('Brevo is not configured.');

  const [sessions, struggleSummary, clerkUser] = await Promise.all([
    getSessionLogsForUser(userId, 100),
    getStruggleSummaryForUser(userId),
    getUserEmail(userId).catch((err) => {
      console.error(`Clerk email lookup failed for user ${userId}:`, err.message || err);
      return null;
    }),
  ]);

  const recipient = clerkUser || (overrideEmail ? { email: overrideEmail } : null);
  if (!recipient) throw new Error(`No email found for user ${userId} (Clerk lookup failed and no override given).`);

  const week = summarizeWeek(sessions);
  const html = buildWeeklySummaryHtml({ week, struggleSummary });
  await sendBrevoEmail({ to: recipient.email, toName: recipient.name, subject: 'Your week on YogaPedia', html });
  return { sentTo: recipient.email, week };
}

module.exports = { hasBrevoKey, sendWeeklySummaryForUser, summarizeWeek, buildWeeklySummaryHtml };
