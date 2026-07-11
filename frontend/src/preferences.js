// Shared localStorage-backed preferences — used by both PoseCheck.jsx (the inline
// controls, adjustable while actively checking a pose) and SettingsView.jsx (a
// dedicated place to set them ahead of time). Same keys, same source of truth.
export const DEFAULT_CONFIDENCE_THRESHOLD = 75;
const CONFIDENCE_THRESHOLD_KEY = 'yogapedia.confidenceThreshold';
const TTS_ENABLED_KEY = 'yogapedia.ttsEnabled';

export function getConfidenceThreshold() {
  if (typeof window === 'undefined') return DEFAULT_CONFIDENCE_THRESHOLD;
  const stored = Number(window.localStorage.getItem(CONFIDENCE_THRESHOLD_KEY));
  return Number.isFinite(stored) && stored >= 30 && stored <= 95 ? stored : DEFAULT_CONFIDENCE_THRESHOLD;
}

export function setConfidenceThreshold(value) {
  window.localStorage.setItem(CONFIDENCE_THRESHOLD_KEY, String(value));
}

export function getTtsEnabled() {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem(TTS_ENABLED_KEY);
  return stored === null ? true : stored === 'true'; // default on if never set
}

export function setTtsEnabled(value) {
  window.localStorage.setItem(TTS_ENABLED_KEY, String(value));
}

// Empty string = use the server's default voice (ELEVENLABS_VOICE_ID) — only meaningful
// when ElevenLabs is configured; ignored entirely by the browser speechSynthesis fallback.
const VOICE_ID_KEY = 'yogapedia.voiceId';

export function getVoiceId() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(VOICE_ID_KEY) || '';
}

export function setVoiceId(value) {
  window.localStorage.setItem(VOICE_ID_KEY, value || '');
}

// Spoken-guidance language — affects TTS text only (backend/chains/checkPose.js's
// localized fields, plus a small fixed-phrase table for the strings that never come from
// the model). On-screen text stays English regardless; this isn't full UI localization.
const LANGUAGE_KEY = 'yogapedia.language';

export function getLanguage() {
  if (typeof window === 'undefined') return 'en';
  return window.localStorage.getItem(LANGUAGE_KEY) || 'en';
}

export function setLanguage(value) {
  window.localStorage.setItem(LANGUAGE_KEY, value || 'en');
}

// Practice reminder — fully client-side (browser Notification API). Only fires while
// this tab/app is open in a browser (no service worker), so it won't reach you if the
// tab is closed — a known limitation of a client-only implementation, not a bug.
const REMINDER_ENABLED_KEY = 'yogapedia.reminderEnabled';
const REMINDER_TIME_KEY = 'yogapedia.reminderTime'; // "HH:MM", 24h
const REMINDER_LAST_FIRED_KEY = 'yogapedia.reminderLastFired'; // "YYYY-MM-DD"

export function getReminderEnabled() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(REMINDER_ENABLED_KEY) === 'true';
}

export function setReminderEnabled(value) {
  window.localStorage.setItem(REMINDER_ENABLED_KEY, String(value));
}

export function getReminderTime() {
  if (typeof window === 'undefined') return '18:00';
  return window.localStorage.getItem(REMINDER_TIME_KEY) || '18:00';
}

export function setReminderTime(value) {
  window.localStorage.setItem(REMINDER_TIME_KEY, value);
}

export function getReminderLastFired() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(REMINDER_LAST_FIRED_KEY) || '';
}

export function setReminderLastFired(dateStr) {
  window.localStorage.setItem(REMINDER_LAST_FIRED_KEY, dateStr);
}
