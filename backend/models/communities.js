const { getDb } = require('../db');
const { ObjectId } = require('mongodb');

async function createCommunity({ name, description, createdByUserId }) {
  const db = await getDb();
  const doc = {
    name,
    description,
    createdByUserId,
    memberUserIds: [createdByUserId],
    createdAt: new Date(),
  };
  const { insertedId } = await db.collection('communities').insertOne(doc);
  return { ...doc, _id: insertedId };
}

async function listCommunities(searchQuery) {
  const db = await getDb();
  const filter = searchQuery ? { name: { $regex: searchQuery, $options: 'i' } } : {};
  return db.collection('communities').find(filter).sort({ createdAt: -1 }).toArray();
}

async function getById(id) {
  const db = await getDb();
  return db.collection('communities').findOne({ _id: new ObjectId(id) });
}

async function isMember(id, userId) {
  const community = await getById(id);
  return Boolean(community?.memberUserIds?.includes(userId));
}

async function joinCommunity(id, userId) {
  const db = await getDb();
  await db.collection('communities').updateOne({ _id: new ObjectId(id) }, { $addToSet: { memberUserIds: userId } });
  return getById(id);
}

async function leaveCommunity(id, userId) {
  const db = await getDb();
  await db.collection('communities').updateOne({ _id: new ObjectId(id) }, { $pull: { memberUserIds: userId } });
  return getById(id);
}

module.exports = { createCommunity, listCommunities, getById, isMember, joinCommunity, leaveCommunity };
