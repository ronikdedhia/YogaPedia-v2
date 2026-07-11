require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const ASANAS = require('./asanas');
const CURATED_ASANAS = require('./curatedAsanas');
const CURATED_VOICES = require('./curatedVoices');
// retrieval.js (289-asana corpus) is deferred, not deleted — see ARCHITECTURE.md.
// Recommendations are restricted to the 12 curated poses for now, so every
// recommended asana also has a working pose-check + demo image.
// const { getTopMatches } = require('./retrieval');

const { hasApiKey } = require('./llm');
const { checkPose, SUPPORTED_LANGUAGES } = require('./chains/checkPose');
const { draftPlan } = require('./chains/recommend');
const { draftSchedule } = require('./chains/schedule');
const { hasMongoUri } = require('./db');
const { getScheduleForUser, saveScheduleForUser, resetScheduleRotation } = require('./models/schedules');
const { hasBrevoKey, sendWeeklySummaryForUser } = require('./email');
const { startWeeklySummaryScheduler } = require('./weeklySummaryScheduler');
const { saveSessionLog, getSessionLogsForUser, getStruggleSummaryForUser } = require('./models/sessionLogs');
const { computeFlagHistory, computeIntensityTier, clampPlanIntensity } = require('./safetyTapering');
const { hasClerkKeys, attachClerk, requireAuthOrNotConfigured, getUserId } = require('./auth');
const { hasZoomKeys, createZoomMeeting } = require('./zoom');
const CommunitiesModel = require('./models/communities');
const CommunityPostsModel = require('./models/communityPosts');
const GroupSessionsModel = require('./models/groupSessions');
const { hasTelegramKeys, sendTelegramMessage } = require('./telegram');
const { draftYogaFact } = require('./chains/yogaFact');
const { startDailyFactScheduler } = require('./dailyFactScheduler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(attachClerk());

if (!hasApiKey) {
  console.warn('GROQ_API_KEY is not set — /api/check-pose, /api/recommend, /api/schedule will return 500 until it is.');
}

// Optional — if ELEVENLABS_API_KEY isn't set, /api/tts-status reports disabled and the
// frontend falls back to the browser's built-in speechSynthesis. This lets whoever runs
// the server control ElevenLabs usage just by adding/removing the key from .env, since
// their free tier is a real monthly quota (not unlimited).
const hasElevenLabsKey = Boolean(process.env.ELEVENLABS_API_KEY);
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';

// Per-IP throttling for the endpoints that spend real Groq/ElevenLabs quota — a runaway
// frontend bug or anyone else hitting these directly shouldn't be able to burn through the
// free-tier limits faster than a single well-behaved client would (ROADMAP.md §1). This is
// on top of, not instead of, the client-side pacing already in PoseCheck.jsx.
function makeLimiter(max) {
  return rateLimit({
    windowMs: 60_000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'Too many requests — please slow down and try again shortly.' }),
  });
}
const visionLimiter = makeLimiter(20); // client paces itself at ~8.5/min; this bounds the endpoint directly, not just well-behaved clients
const llmLimiter = makeLimiter(10); // /api/recommend + POST /api/schedule — both a single user-triggered action, not polled
const ttsLimiter = makeLimiter(20); // spoken guidance only fires when the message changes, well under this

app.post('/api/check-pose', visionLimiter, async (req, res) => {
  if (!hasApiKey) {
    return res.status(500).json({ error: 'Server is missing GROQ_API_KEY — set it in backend/.env.' });
  }
  const { image, poses, language } = req.body;
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing "image" (base64 data URL) in request body.' });
  }
  if (language !== undefined && !SUPPORTED_LANGUAGES.includes(language)) {
    return res.status(400).json({ error: `"language" must be one of: ${SUPPORTED_LANGUAGES.join(', ')}.` });
  }
  // Optional restricted candidate list (e.g. just today's scheduled poses) — smaller
  // candidate set, likely better vision-model accuracy. Defaults to the full 12.
  // Guardrail: must be a real subset of the known 12, not arbitrary client-supplied
  // strings — an unbounded/unchecked list here would inflate the vision prompt sent to
  // Groq on every request (ROADMAP.md §1).
  if (poses !== undefined) {
    if (!Array.isArray(poses) || poses.length === 0 || poses.length > ASANAS.length) {
      return res.status(400).json({ error: `"poses" must be a non-empty array of at most ${ASANAS.length} known asana names.` });
    }
    if (!poses.every((p) => typeof p === 'string' && ASANAS.includes(p))) {
      return res.status(400).json({ error: 'One or more entries in "poses" is not a recognized asana name.' });
    }
  }
  const poseNames = Array.isArray(poses) && poses.length > 0 ? poses : ASANAS;

  try {
    const result = await checkPose(image, poseNames, language || 'en');
    return res.json(result);
  } catch (err) {
    console.error('checkPose failed:', err);
    // Groq's SDK error carries `.status` (see groq-sdk/core/error.js APIError) — LangChain
    // passes it through rather than wrapping it, but check a couple of shapes defensively.
    const status = err?.status ?? err?.response?.status ?? err?.cause?.status;
    if (status === 429) {
      return res.status(429).json({ error: 'Vision model rate limit hit — checks will resume automatically in a moment.' });
    }
    return res.status(502).json({ error: 'Vision model request failed.' });
  }
});

app.post('/api/recommend', llmLimiter, async (req, res) => {
  if (!hasApiKey) {
    return res.status(500).json({ error: 'Server is missing GROQ_API_KEY — set it in backend/.env.' });
  }
  const { problems = '', diet = '', flags = {} } = req.body || {};
  if (!String(problems).trim() && !String(diet).trim()) {
    return res.status(400).json({ error: 'Describe at least one health concern or your diet.' });
  }

  try {
    const plan = await draftPlan({ problems, diet, flags, candidates: CURATED_ASANAS });
    return res.json(plan);
  } catch (err) {
    console.error('draftPlan failed:', err);
    return res.status(502).json({ error: 'Recommendation request failed.' });
  }
});

// --- Schedule (requires Groq + Mongo + Clerk) ---

app.post('/api/schedule', llmLimiter, requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasApiKey) {
    return res.status(500).json({ error: 'Server is missing GROQ_API_KEY — set it in backend/.env.' });
  }
  if (!hasMongoUri) {
    return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  }
  const userId = getUserId(req);
  const {
    problems: rawProblems,
    diet = '',
    goalTags = [],
    experienceLevel = 'beginner',
    flags = {},
    daysPerWeek,
    minutesPerSession,
  } = req.body || {};

  // problems is a removable list of individual issues (frontend lets the user add/remove
  // one at a time — e.g. remove one once recovered), not one free-text blob. Still accept
  // a plain string here for backward compatibility with any schedule saved before this.
  const problemsList = Array.isArray(rawProblems)
    ? rawProblems.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim())
    : typeof rawProblems === 'string' && rawProblems.trim()
      ? [rawProblems.trim()]
      : [];

  if (problemsList.length === 0) {
    return res.status(400).json({ error: 'Add at least one health concern or goal.' });
  }
  // Bounds check — flagged as a real gap in ROADMAP.md: an unchecked daysPerWeek could
  // ask the LLM to generate e.g. 999 day entries in one prompt.
  if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) {
    return res.status(400).json({ error: 'daysPerWeek must be an integer between 1 and 7.' });
  }
  if (!Number.isInteger(minutesPerSession) || minutesPerSession < 5 || minutesPerSession > 120) {
    return res.status(400).json({ error: 'minutesPerSession must be an integer between 5 and 120.' });
  }

  try {
    const problems = problemsList.join('; '); // joined string for the LLM prompt
    // Adaptive re-planning: feed which poses the user has actually been struggling with
    // (per stored sessionLogs) into this week's draft — a no-op the very first time (no
    // logs yet), see backend/models/sessionLogs.js's getStruggleSummaryForUser.
    const struggleSummary = await getStruggleSummaryForUser(userId);
    // Injury-aware auto-adjustment: how long has each currently-checked safety flag stayed
    // active across regenerations, and what intensity cap does that imply — computed here in
    // code (backend/safetyTapering.js), not left to the LLM to remember on its own.
    const previousSchedule = await getScheduleForUser(userId);
    const safetyFlagHistory = computeFlagHistory(previousSchedule?.safetyFlagHistory, flags);
    const intensityTier = computeIntensityTier(safetyFlagHistory);
    const plan = await draftSchedule({ problems, diet, goalTags, experienceLevel, flags, daysPerWeek, minutesPerSession, struggleSummary, intensityTier });
    clampPlanIntensity(plan, intensityTier); // enforced regardless of whether the LLM actually followed the instruction
    const saved = await saveScheduleForUser(userId, {
      ...plan,
      safetyFlagHistory,
      // Store the raw list (not the joined string) so re-opening the form shows
      // individually removable issues again, not one blob to hand-edit.
      onboarding: { problems: problemsList, diet, goalTags, experienceLevel, daysPerWeek, minutesPerSession, flags },
    });
    return res.json(saved);
  } catch (err) {
    console.error('draftSchedule failed:', err);
    return res.status(502).json({ error: 'Schedule generation failed.' });
  }
});

app.get('/api/schedule', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) {
    return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  }
  const userId = getUserId(req);
  try {
    const schedule = await getScheduleForUser(userId);
    if (!schedule) {
      return res.status(404).json({ error: 'No schedule yet — complete onboarding first.' });
    }
    return res.json(schedule);
  } catch (err) {
    console.error('Failed to fetch schedule:', err);
    return res.status(502).json({ error: 'Could not fetch schedule.' });
  }
});

// "Repeat this week" — restarts the rotation from day1, no LLM call (see resetScheduleRotation).
app.post('/api/schedule/repeat', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) {
    return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  }
  const userId = getUserId(req);
  try {
    const schedule = await resetScheduleRotation(userId);
    if (!schedule) {
      return res.status(404).json({ error: 'No schedule yet — complete onboarding first.' });
    }
    return res.json(schedule);
  } catch (err) {
    console.error('Failed to repeat schedule:', err);
    return res.status(502).json({ error: 'Could not repeat this week.' });
  }
});

app.get('/api/schedule/today', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) {
    return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  }
  const userId = getUserId(req);
  try {
    const schedule = await getScheduleForUser(userId);
    if (!schedule) {
      return res.status(404).json({ error: 'No schedule yet — complete onboarding first.' });
    }
    // Simple rotation: cycles through day1..dayN based on calendar days since the
    // schedule was created. Not mapped to specific weekdays (onboarding only collects a
    // COUNT of days per week, not which ones) — a real "did you practice yesterday"
    // aware scheduler is a future improvement, see ARCHITECTURE.md §9.9.
    const daysPerWeek = schedule.onboarding?.daysPerWeek || Object.keys(schedule.days || {}).length || 1;
    const daysSinceCreated = Math.floor((Date.now() - new Date(schedule.createdAt).getTime()) / 86400000);
    const dayKey = `day${(daysSinceCreated % daysPerWeek) + 1}`;
    return res.json({ dayKey, waterTargetLiters: schedule.waterTargetLiters, ...schedule.days?.[dayKey] });
  } catch (err) {
    console.error('Failed to fetch schedule:', err);
    return res.status(502).json({ error: 'Could not fetch today\'s schedule.' });
  }
});

// --- Session logs (requires Mongo + Clerk) ---

app.post('/api/sessions', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) {
    return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  }
  const userId = getUserId(req);
  const {
    poseResults = [],
    pranayamaCompleted,
    pranayamaSkipReason,
    walkCompleted,
    walkSkipReason,
    waterCompleted,
    waterSkipReason,
    note,
  } = req.body || {};
  if (!Array.isArray(poseResults) || poseResults.length === 0) {
    return res.status(400).json({ error: 'poseResults must be a non-empty array.' });
  }

  try {
    const now = new Date();
    const saved = await saveSessionLog({
      userId,
      date: now.toISOString().slice(0, 10),
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
      poseResults,
      // Self-reported — pranayama/walk/water aren't camera-checkable, so these are
      // just what the user says they did, not verified. Skip reasons are likewise
      // self-reported, only kept when the item wasn't completed.
      pranayamaCompleted: Boolean(pranayamaCompleted),
      pranayamaSkipReason: typeof pranayamaSkipReason === 'string' ? pranayamaSkipReason.slice(0, 300) : undefined,
      walkCompleted: Boolean(walkCompleted),
      walkSkipReason: typeof walkSkipReason === 'string' ? walkSkipReason.slice(0, 300) : undefined,
      waterCompleted: Boolean(waterCompleted),
      waterSkipReason: typeof waterSkipReason === 'string' ? waterSkipReason.slice(0, 300) : undefined,
      note: typeof note === 'string' ? note.slice(0, 500) : undefined,
    });
    return res.json(saved);
  } catch (err) {
    console.error('Failed to save session log:', err);
    return res.status(502).json({ error: 'Could not save session.' });
  }
});

app.get('/api/sessions', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) {
    return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  }
  const userId = getUserId(req);
  try {
    const logs = await getSessionLogsForUser(userId);
    return res.json(logs);
  } catch (err) {
    console.error('Failed to fetch session logs:', err);
    return res.status(502).json({ error: 'Could not fetch session history.' });
  }
});

// --- Communities (requires Mongo + Clerk; sessions additionally require Zoom) ---

app.post('/api/communities', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  const { name, description = '' } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Community "name" is required.' });
  }
  try {
    const community = await CommunitiesModel.createCommunity({ name: name.trim(), description, createdByUserId: getUserId(req) });
    return res.json(community);
  } catch (err) {
    console.error('Failed to create community:', err);
    return res.status(502).json({ error: 'Could not create community.' });
  }
});

app.get('/api/communities', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  const userId = getUserId(req);
  try {
    const communities = await CommunitiesModel.listCommunities(typeof req.query.q === 'string' ? req.query.q : undefined);
    return res.json(
      communities.map((c) => ({
        _id: c._id,
        name: c.name,
        description: c.description,
        memberCount: c.memberUserIds.length,
        isMember: c.memberUserIds.includes(userId),
      })),
    );
  } catch (err) {
    console.error('Failed to list communities:', err);
    return res.status(502).json({ error: 'Could not fetch communities.' });
  }
});

app.post('/api/communities/:id/join', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  try {
    const community = await CommunitiesModel.joinCommunity(req.params.id, getUserId(req));
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    return res.json({ joined: true });
  } catch (err) {
    console.error('Failed to join community:', err);
    return res.status(502).json({ error: 'Could not join community.' });
  }
});

app.post('/api/communities/:id/leave', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  try {
    await CommunitiesModel.leaveCommunity(req.params.id, getUserId(req));
    return res.json({ left: true });
  } catch (err) {
    console.error('Failed to leave community:', err);
    return res.status(502).json({ error: 'Could not leave community.' });
  }
});

app.get('/api/communities/:id/posts', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  const userId = getUserId(req);
  try {
    if (!(await CommunitiesModel.isMember(req.params.id, userId))) {
      return res.status(403).json({ error: 'Join this community to see its posts.' });
    }
    const posts = await CommunityPostsModel.listPosts(req.params.id);
    return res.json(posts);
  } catch (err) {
    console.error('Failed to list community posts:', err);
    return res.status(502).json({ error: 'Could not fetch posts.' });
  }
});

app.post('/api/communities/:id/posts', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  const userId = getUserId(req);
  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Post "text" is required.' });
  }
  try {
    if (!(await CommunitiesModel.isMember(req.params.id, userId))) {
      return res.status(403).json({ error: 'Join this community to post.' });
    }
    const post = await CommunityPostsModel.createPost({ communityId: req.params.id, authorUserId: userId, text: text.trim().slice(0, 2000) });
    return res.json(post);
  } catch (err) {
    console.error('Failed to create community post:', err);
    return res.status(502).json({ error: 'Could not post message.' });
  }
});

app.get('/api/communities/:id/sessions', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  const userId = getUserId(req);
  try {
    if (!(await CommunitiesModel.isMember(req.params.id, userId))) {
      return res.status(403).json({ error: 'Join this community to see its sessions.' });
    }
    const sessions = await GroupSessionsModel.listUpcomingForCommunity(req.params.id);
    // Only the teacher and joined attendees get the real Zoom link — everyone else just
    // sees the session exists, so they can decide whether to join first.
    return res.json(
      sessions.map((s) => {
        const isTeacher = s.teacherUserId === userId;
        const isAttendee = s.attendeeUserIds.includes(userId);
        return {
          _id: s._id,
          title: s.title,
          focusArea: s.focusArea,
          scheduledAt: s.scheduledAt,
          durationMinutes: s.durationMinutes,
          capacity: s.capacity,
          seatsLeft: s.capacity - s.attendeeUserIds.length,
          isTeacher,
          isAttendee,
          joinUrl: isTeacher || isAttendee ? s.zoom?.joinUrl : undefined,
        };
      }),
    );
  } catch (err) {
    console.error('Failed to list group sessions:', err);
    return res.status(502).json({ error: 'Could not fetch sessions.' });
  }
});

app.post('/api/communities/:id/sessions', llmLimiter, requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  if (!hasZoomKeys) return res.status(501).json({ error: 'Zoom is not configured — set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in backend/.env.' });
  const userId = getUserId(req);
  const { title, focusArea = '', scheduledAt, durationMinutes, capacity } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Session "title" is required.' });
  }
  if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
    return res.status(400).json({ error: '"scheduledAt" must be a valid date/time.' });
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 180) {
    return res.status(400).json({ error: 'durationMinutes must be an integer between 5 and 180.' });
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
    return res.status(400).json({ error: 'capacity must be an integer between 1 and 500.' });
  }
  try {
    if (!(await CommunitiesModel.isMember(req.params.id, userId))) {
      return res.status(403).json({ error: 'Join this community to host a session in it.' });
    }
    const zoom = await createZoomMeeting({ topic: title.trim(), startTime: new Date(scheduledAt).toISOString(), durationMinutes });
    const session = await GroupSessionsModel.createSession({
      communityId: req.params.id,
      teacherUserId: userId,
      title: title.trim(),
      focusArea,
      scheduledAt: new Date(scheduledAt),
      durationMinutes,
      capacity,
      zoom,
    });
    return res.json(session);
  } catch (err) {
    console.error('Failed to create group session:', err);
    return res.status(502).json({ error: 'Could not create session — check server logs.' });
  }
});

app.post('/api/communities/:id/sessions/:sessionId/join', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  const userId = getUserId(req);
  try {
    if (!(await CommunitiesModel.isMember(req.params.id, userId))) {
      return res.status(403).json({ error: 'Join this community to join its sessions.' });
    }
    const session = await GroupSessionsModel.joinSession(req.params.sessionId, userId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    return res.json({ joined: true, joinUrl: session.zoom?.joinUrl });
  } catch (err) {
    console.error('Failed to join session:', err);
    return res.status(409).json({ error: err.message || 'Could not join session.' });
  }
});

app.post('/api/communities/:id/sessions/:sessionId/leave', requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasMongoUri) return res.status(501).json({ error: 'MongoDB is not configured — set MONGODB_URI in backend/.env.' });
  try {
    await GroupSessionsModel.leaveSession(req.params.sessionId, getUserId(req));
    return res.json({ left: true });
  } catch (err) {
    console.error('Failed to leave session:', err);
    return res.status(502).json({ error: 'Could not leave session.' });
  }
});

// --- TTS (optional — ElevenLabs if configured, else browser speechSynthesis on the frontend) ---

app.get('/api/tts-status', (_req, res) => res.json({ enabled: hasElevenLabsKey }));

// Curated, not the full ElevenLabs catalog — same reasoning as CURATED_ASANAS: a short,
// deliberately-picked menu rather than every raw option. Empty array (not an error) when
// ElevenLabs isn't configured, so the frontend can just hide the picker.
app.get('/api/tts-voices', (_req, res) => res.json(hasElevenLabsKey ? CURATED_VOICES : []));

// Spoken-guidance language options — deliberately just these two (per the "few options"
// pattern used for the voice picker too), not full UI localization. Available regardless
// of ElevenLabs config since the browser speechSynthesis fallback also uses it.
app.get('/api/tts-languages', (_req, res) =>
  res.json(
    SUPPORTED_LANGUAGES.map((code) => ({ code, label: code === 'en' ? 'English (default)' : { hi: 'Hindi' }[code] || code })),
  ));

app.post('/api/tts', ttsLimiter, async (req, res) => {
  if (!hasElevenLabsKey) {
    return res.status(503).json({ error: 'ElevenLabs not configured — set ELEVENLABS_API_KEY in backend/.env.' });
  }
  const { text, voiceId } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing "text" in request body.' });
  }
  // Whitelist against the curated list — never forward an arbitrary client-supplied
  // voiceId straight into the ElevenLabs URL.
  const resolvedVoiceId = voiceId && CURATED_VOICES.some((v) => v.id === voiceId) ? voiceId : ELEVENLABS_VOICE_ID;

  try {
    const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }), // cheapest — 0.5x credits/char vs standard models
    });

    if (!elevenRes.ok) {
      const errBody = await elevenRes.text();
      console.error('ElevenLabs request failed:', elevenRes.status, errBody);
      return res.status(502).json({ error: 'ElevenLabs request failed.' });
    }

    const audioBuffer = Buffer.from(await elevenRes.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    return res.send(audioBuffer);
  } catch (err) {
    console.error('ElevenLabs request failed:', err);
    return res.status(502).json({ error: 'ElevenLabs request failed.' });
  }
});

app.get('/api/asanas', (_req, res) => res.json(ASANAS));

// Full curated asana details (name + benefits) for the frontend's browsable Library tab —
// public, no auth needed, same trust level as the plain name list above.
app.get('/api/asanas/library', (_req, res) => res.json(CURATED_ASANAS));

app.get('/api/config-status', (_req, res) =>
  res.json({
    groq: hasApiKey,
    elevenLabs: hasElevenLabsKey,
    mongo: hasMongoUri,
    clerk: hasClerkKeys,
    brevo: hasBrevoKey,
    zoom: hasZoomKeys,
    telegram: hasTelegramKeys,
  }),
);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Manual "send me a summary right now" — lets the signed-in user verify the whole pipeline
// (Mongo data -> Clerk email lookup -> Brevo send) without waiting for the real weekly
// schedule in weeklySummaryScheduler.js. Deliberately does NOT call markWeeklySummarySent,
// so testing this doesn't disturb the real once-a-week cadence.
app.post('/api/email-summary/send-test', llmLimiter, requireAuthOrNotConfigured(), async (req, res) => {
  if (!hasBrevoKey) {
    return res.status(501).json({ error: 'Brevo is not configured — set BREVO_API_KEY and BREVO_FROM_EMAIL in backend/.env.' });
  }
  const userId = getUserId(req);
  try {
    const result = await sendWeeklySummaryForUser(userId, { overrideEmail: process.env.WEEKLY_SUMMARY_TEST_EMAIL || undefined });
    return res.json({ sent: true, ...result });
  } catch (err) {
    console.error('Test weekly summary failed:', err.message || err);
    return res.status(502).json({ error: 'Could not send the summary email — check server logs.' });
  }
});

// Manual "send a yoga fact right now" — verifies the Groq -> Telegram pipeline without
// waiting for the real daily send window in dailyFactScheduler.js. Rate-limited like the
// other manual test/LLM-triggering endpoints; no auth needed since it doesn't touch any
// per-user data, just broadcasts to the shared channel.
app.post('/api/telegram/send-now', llmLimiter, async (_req, res) => {
  if (!hasTelegramKeys) {
    return res.status(501).json({ error: 'Telegram is not configured — set TELEGRAM_ACCESS_TOKEN and TELEGRAM_CHANNEL_ID in backend/.env.' });
  }
  if (!hasApiKey) {
    return res.status(500).json({ error: 'Server is missing GROQ_API_KEY — set it in backend/.env.' });
  }
  try {
    const fact = await draftYogaFact();
    await sendTelegramMessage(fact);
    return res.json({ sent: true, fact });
  } catch (err) {
    console.error('Manual Telegram fact send failed:', err.message || err);
    return res.status(502).json({ error: 'Could not send the fact — check server logs.' });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`YogaPedia v2 API proxy listening on http://localhost:${PORT}`);
  startWeeklySummaryScheduler();
  startDailyFactScheduler();
});
