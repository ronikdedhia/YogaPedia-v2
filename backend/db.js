const { MongoClient } = require('mongodb');

const hasMongoUri = Boolean(process.env.MONGODB_URI);
if (!hasMongoUri) {
  console.warn('MONGODB_URI not set — /api/schedule and /api/sessions routes will return 501 until configured.');
}

let dbPromise = null;

// Lazily connects once, reuses the same connection for every call — standard pattern
// for a long-lived Node process (not a new connection per request).
function getDb() {
  if (!hasMongoUri) return null;
  if (!dbPromise) {
    const client = new MongoClient(process.env.MONGODB_URI);
    dbPromise = client.connect().then(() => client.db(process.env.MONGODB_DB_NAME || 'yogapedia'));
  }
  return dbPromise;
}

module.exports = { hasMongoUri, getDb };
