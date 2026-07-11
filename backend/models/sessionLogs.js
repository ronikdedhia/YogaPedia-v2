const { getDb } = require('../db');

async function saveSessionLog({ userId, date, dayOfWeek, poseResults, pranayamaCompleted, walkCompleted, waterCompleted, note }) {
  const db = await getDb();
  const doc = {
    userId,
    date,
    dayOfWeek,
    poseResults,
    pranayamaCompleted: Boolean(pranayamaCompleted),
    walkCompleted: Boolean(walkCompleted),
    waterCompleted: Boolean(waterCompleted),
    note,
    completedAt: new Date(),
  };
  await db.collection('sessionLogs').insertOne(doc);
  return doc;
}

async function getSessionLogsForUser(userId, limit = 50) {
  const db = await getDb();
  return db
    .collection('sessionLogs')
    .find({ userId })
    .sort({ completedAt: -1 })
    .limit(limit)
    .toArray();
}

// Plain aggregation over recent logs (no LLM call) — surfaces poses the user is genuinely
// struggling with, so chains/schedule.js can factor real practice history into the next
// week's plan instead of drafting from onboarding answers alone every time. Only surfaces
// a pose once there's enough data to call it a pattern (>=2 attempts, wrong >=40% of the
// time) — a single bad snapshot shouldn't skew the whole plan.
async function getStruggleSummaryForUser(userId, { sessionsToScan = 20, maxResults = 5 } = {}) {
  const db = await getDb();
  const logs = await db.collection('sessionLogs').find({ userId }).sort({ completedAt: -1 }).limit(sessionsToScan).toArray();

  const stats = new Map(); // asana -> { attempts, incorrect, bodyParts: Map<part, count> }
  for (const log of logs) {
    for (const result of log.poseResults || []) {
      if (!result?.asana) continue;
      const s = stats.get(result.asana) || { attempts: 0, incorrect: 0, bodyParts: new Map() };
      s.attempts += 1;
      if (result.wasCorrect === false) {
        s.incorrect += 1;
        if (result.bodyPartFlagged) {
          s.bodyParts.set(result.bodyPartFlagged, (s.bodyParts.get(result.bodyPartFlagged) || 0) + 1);
        }
      }
      stats.set(result.asana, s);
    }
  }

  const summary = [];
  for (const [asana, s] of stats) {
    const incorrectRate = s.incorrect / s.attempts;
    if (s.attempts < 2 || incorrectRate < 0.4) continue;
    const topBodyPart = [...s.bodyParts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    summary.push({ asana, attempts: s.attempts, incorrect: s.incorrect, topBodyPart });
  }
  return summary.sort((a, b) => b.incorrect / b.attempts - a.incorrect / a.attempts).slice(0, maxResults);
}

module.exports = { saveSessionLog, getSessionLogsForUser, getStruggleSummaryForUser };
