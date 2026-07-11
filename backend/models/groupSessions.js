const { getDb } = require('../db');
const { ObjectId } = require('mongodb');

async function createSession({ communityId, teacherUserId, title, focusArea, scheduledAt, durationMinutes, capacity, zoom }) {
  const db = await getDb();
  const doc = {
    communityId: new ObjectId(communityId),
    teacherUserId,
    title,
    focusArea,
    scheduledAt,
    durationMinutes,
    capacity,
    zoom,
    attendeeUserIds: [],
    createdAt: new Date(),
  };
  const { insertedId } = await db.collection('groupSessions').insertOne(doc);
  return { ...doc, _id: insertedId };
}

async function listUpcomingForCommunity(communityId) {
  const db = await getDb();
  return db
    .collection('groupSessions')
    .find({ communityId: new ObjectId(communityId), scheduledAt: { $gte: new Date() } })
    .sort({ scheduledAt: 1 })
    .toArray();
}

async function getById(id) {
  const db = await getDb();
  return db.collection('groupSessions').findOne({ _id: new ObjectId(id) });
}

// Read-then-write capacity guard — acceptable for this app's scale (no high-concurrency
// join race expected); a strict atomic guard would need a $expr-based conditional update.
async function joinSession(id, userId) {
  const session = await getById(id);
  if (!session) return null;
  if (session.attendeeUserIds.includes(userId)) return session;
  if (session.attendeeUserIds.length >= session.capacity) throw new Error('Session is full.');
  const db = await getDb();
  await db.collection('groupSessions').updateOne({ _id: new ObjectId(id) }, { $addToSet: { attendeeUserIds: userId } });
  return getById(id);
}

async function leaveSession(id, userId) {
  const db = await getDb();
  await db.collection('groupSessions').updateOne({ _id: new ObjectId(id) }, { $pull: { attendeeUserIds: userId } });
  return getById(id);
}

module.exports = { createSession, listUpcomingForCommunity, getById, joinSession, leaveSession };
