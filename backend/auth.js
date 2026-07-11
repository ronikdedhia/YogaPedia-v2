const hasClerkKeys = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);
if (!hasClerkKeys) {
  console.warn('CLERK_SECRET_KEY/CLERK_PUBLISHABLE_KEY not set — auth-protected routes will return 501 until configured.');
}

// Only require()/invoke the Clerk SDK when keys are actually present — mirrors the
// guard pattern used for Groq/ElevenLabs/Mongo elsewhere in this backend, so the
// server always boots cleanly regardless of which optional integrations are configured.
let clerkMiddleware;
let getAuthFromRequest;
if (hasClerkKeys) {
  ({ clerkMiddleware, getAuth: getAuthFromRequest } = require('@clerk/express'));
}

function attachClerk() {
  if (hasClerkKeys) return clerkMiddleware();
  return (_req, _res, next) => next(); // nothing to attach without keys
}

// Deliberately NOT using @clerk/express's requireAuth() here — verified live that it
// defaults to redirecting unauthenticated requests (HTTP redirect to a sign-in page),
// which is right for a traditional server-rendered app but breaks a JSON API (a
// frontend fetch() call can't sensibly follow a redirect). It's also deprecated in the
// installed version in favor of exactly this pattern: clerkMiddleware() + getAuth().
function requireAuthOrNotConfigured() {
  if (!hasClerkKeys) {
    return (_req, res) =>
      res.status(501).json({ error: 'Clerk is not configured — set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY in backend/.env.' });
  }
  return (req, res, next) => {
    if (!getAuthFromRequest(req)?.userId) {
      return res.status(401).json({ error: 'Sign in required.' });
    }
    next();
  };
}

function getUserId(req) {
  if (!hasClerkKeys) return null;
  return getAuthFromRequest(req)?.userId || null;
}

module.exports = { hasClerkKeys, attachClerk, requireAuthOrNotConfigured, getUserId };
