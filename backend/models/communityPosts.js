const { getDb } = require('../db');
const { ObjectId } = require('mongodb');

async function createPost({ communityId, authorUserId, text }) {
  const db = await getDb();
  const doc = { communityId: new ObjectId(communityId), authorUserId, text, createdAt: new Date() };
  const { insertedId } = await db.collection('communityPosts').insertOne(doc);
  return { ...doc, _id: insertedId };
}

async function listPosts(communityId, { limit = 50 } = {}) {
  const db = await getDb();
  return db
    .collection('communityPosts')
    .find({ communityId: new ObjectId(communityId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

module.exports = { createPost, listPosts };
