const { getDb } = require('../db');

async function getScheduleForUser(userId) {
  const db = await getDb();
  return db.collection('schedules').findOne({ userId });
}

async function saveScheduleForUser(userId, planData) {
  const db = await getDb();
  await db.collection('schedules').updateOne(
    { userId },
    {
      $set: { userId, ...planData, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
  return getScheduleForUser(userId);
}

// "Repeat this week" — restarts the day1..dayN rotation from day1 today, without
// regenerating the plan (no LLM call). The rotation in /api/schedule/today is just
// (days elapsed since createdAt) % daysPerWeek, so resetting createdAt to now is
// sufficient to restart the cycle.
async function resetScheduleRotation(userId) {
  const db = await getDb();
  await db.collection('schedules').updateOne({ userId }, { $set: { createdAt: new Date() } });
  return getScheduleForUser(userId);
}

// Every schedule doc doubles as the one place-per-user to track when their last weekly
// email summary went out — avoids a separate collection for one timestamp.
async function getAllUserIdsWithSchedule() {
  const db = await getDb();
  const docs = await db.collection('schedules').find({}, { projection: { userId: 1 } }).toArray();
  return docs.map((d) => d.userId);
}

async function markWeeklySummarySent(userId) {
  const db = await getDb();
  await db.collection('schedules').updateOne({ userId }, { $set: { lastWeeklySummarySentAt: new Date() } });
}

module.exports = {
  getScheduleForUser,
  saveScheduleForUser,
  resetScheduleRotation,
  getAllUserIdsWithSchedule,
  markWeeklySummarySent,
};
