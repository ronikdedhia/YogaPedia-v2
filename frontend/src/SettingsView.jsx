import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { makeAuthFetch } from './api.js';
import {
  getConfidenceThreshold,
  setConfidenceThreshold,
  getTtsEnabled,
  setTtsEnabled,
  getReminderEnabled,
  setReminderEnabled,
  getReminderTime,
  setReminderTime,
  getVoiceId,
  setVoiceId,
  getLanguage,
  setLanguage,
} from './preferences.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
const TTS_SUPPORTED = typeof window !== 'undefined' && 'speechSynthesis' in window;
const NOTIFICATIONS_SUPPORTED = typeof window !== 'undefined' && 'Notification' in window;

// Consolidates preferences that otherwise only live inline inside PoseCheck's controls —
// same localStorage keys (preferences.js), so a change here is picked up the next time
// PoseCheck mounts, and vice versa.
export default function SettingsView() {
  const { getToken } = useAuth();
  const [threshold, setThreshold] = useState(getConfidenceThreshold);
  const [ttsEnabled, setTtsEnabledState] = useState(getTtsEnabled);
  const [reminderEnabled, setReminderEnabledState] = useState(getReminderEnabled);
  const [reminderTime, setReminderTimeState] = useState(getReminderTime);
  const [permissionError, setPermissionError] = useState(null);
  const [voiceId, setVoiceIdState] = useState(getVoiceId);
  const [voices, setVoices] = useState([]);
  const [language, setLanguageState] = useState(getLanguage);
  const [languages, setLanguages] = useState([]);
  const [brevoEnabled, setBrevoEnabled] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/tts-voices`)
      .then((r) => r.json())
      .then(setVoices)
      .catch(() => setVoices([])); // ElevenLabs not configured or server unreachable — just hide the picker
    fetch(`${API_BASE}/api/tts-languages`)
      .then((r) => r.json())
      .then(setLanguages)
      .catch(() => setLanguages([{ code: 'en', label: 'English (default)' }]));
    fetch(`${API_BASE}/api/config-status`)
      .then((r) => r.json())
      .then((data) => setBrevoEnabled(Boolean(data.brevo)))
      .catch(() => setBrevoEnabled(false));
  }, []);

  async function handleSendSummaryNow() {
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const authFetch = makeAuthFetch(getToken);
      const res = await authFetch('/api/email-summary/send-test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server responded ${res.status}`);
      setEmailStatus(`✅ Sent to ${data.sentTo}`);
    } catch (err) {
      console.error('Failed to send weekly summary:', err);
      setEmailStatus('Could not send the summary right now.');
    } finally {
      setSendingEmail(false);
    }
  }

  function handleVoiceChange(value) {
    setVoiceIdState(value);
    setVoiceId(value);
  }

  function handleLanguageChange(value) {
    setLanguageState(value);
    setLanguage(value);
  }

  function handleThresholdChange(value) {
    setThreshold(value);
    setConfidenceThreshold(value);
  }

  function handleTtsChange(value) {
    setTtsEnabledState(value);
    setTtsEnabled(value);
  }

  async function handleReminderToggle(checked) {
    setPermissionError(null);
    if (checked) {
      if (!NOTIFICATIONS_SUPPORTED) return;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPermissionError('Notifications were blocked — enable them for this site in your browser settings to use reminders.');
        return; // don't turn the toggle on if permission wasn't actually granted
      }
    }
    setReminderEnabledState(checked);
    setReminderEnabled(checked);
  }

  function handleReminderTimeChange(value) {
    setReminderTimeState(value);
    setReminderTime(value);
  }

  return (
    <div className="yoga-plan">
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <p className="app__subtitle">
        These apply the next time you open pose-check (during Practice or standalone) — you can also adjust them
        inline there.
      </p>

      <div className="pose-check__threshold" style={{ margin: '1rem 0', maxWidth: 'none' }}>
        <label htmlFor="settings-threshold">
          Confidence threshold: <strong>{threshold}%</strong>
        </label>
        <input
          id="settings-threshold"
          type="range"
          min={30}
          max={95}
          step={5}
          value={threshold}
          onChange={(e) => handleThresholdChange(Number(e.target.value))}
        />
        <p className="pose-check__threshold-hint">
          How sure the model needs to be before a pose counts as recognized/correct.
        </p>
      </div>

      <label className="yoga-plan__flag" style={{ marginBottom: '1rem' }}>
        <input
          type="checkbox"
          checked={ttsEnabled}
          disabled={!TTS_SUPPORTED}
          onChange={(e) => handleTtsChange(e.target.checked)}
        />
        Spoken guidance {TTS_SUPPORTED ? '' : '(not supported in this browser)'}
      </label>

      {ttsEnabled && voices.length > 0 && (
        <div className="pose-check__threshold" style={{ margin: '0 0 1rem', maxWidth: 'none' }}>
          <label htmlFor="voice-picker">Voice</label>
          <select id="voice-picker" value={voiceId} onChange={(e) => handleVoiceChange(e.target.value)}>
            <option value="">Default</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <p className="pose-check__threshold-hint">Only used when ElevenLabs is speaking — browser voice ignores this.</p>
        </div>
      )}

      {ttsEnabled && languages.length > 1 && (
        <div className="pose-check__threshold" style={{ margin: '0 0 1rem', maxWidth: 'none' }}>
          <label htmlFor="language-picker">Spoken guidance language</label>
          <select id="language-picker" value={language} onChange={(e) => handleLanguageChange(e.target.value)}>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="pose-check__threshold-hint">
            Translates spoken corrections only — on-screen text and the rest of the app stay in English.
          </p>
        </div>
      )}

      <div className="yoga-plan__section" style={{ marginTop: 0 }}>
        <h4>Daily practice reminder</h4>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
          Only fires while this app is open in a browser tab — it won't reach you if the tab is closed, since this
          doesn't use a background service worker.
        </p>
        <label className="yoga-plan__flag" style={{ marginBottom: '0.5rem' }}>
          <input
            type="checkbox"
            checked={reminderEnabled}
            disabled={!NOTIFICATIONS_SUPPORTED}
            onChange={(e) => handleReminderToggle(e.target.checked)}
          />
          Remind me to practice {NOTIFICATIONS_SUPPORTED ? '' : '(not supported in this browser)'}
        </label>
        {reminderEnabled && (
          <div>
            <label className="yoga-plan__label" htmlFor="reminder-time">
              At
            </label>
            <input
              id="reminder-time"
              type="time"
              value={reminderTime}
              onChange={(e) => handleReminderTimeChange(e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            />
          </div>
        )}
        {permissionError && <p className="pose-check__error">{permissionError}</p>}
      </div>

      {brevoEnabled && (
        <div className="yoga-plan__section">
          <h4>Weekly email summary</h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
            Sent automatically once a week to your account email. Send yourself one right now to see what it looks like.
          </p>
          <button type="button" className="pose-check__btn" onClick={handleSendSummaryNow} disabled={sendingEmail}>
            📧 {sendingEmail ? 'Sending…' : 'Email me a summary now'}
          </button>
          {emailStatus && <p className="app__subtitle" style={{ marginTop: '0.5rem' }}>{emailStatus}</p>}
        </div>
      )}
    </div>
  );
}
