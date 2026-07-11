import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { makeAuthFetch } from './api.js';

const HEATMAP_DAYS = 84; // ~12 weeks

// All computed client-side from GET /api/sessions — no new backend endpoint needed,
// per the "easy win" framing in ROADMAP.md (the data already exists, just unused by any UI).
function computeStats(sessions) {
  const dateSet = new Set(sessions.map((s) => s.date));
  const sortedDates = [...dateSet].sort();

  let currentStreak = 0;
  let cursor = new Date();
  // Count backward from today (or yesterday, if today has no session yet) while
  // consecutive days have a logged session.
  if (!dateSet.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dateSet.has(cursor.toISOString().slice(0, 10))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let longestStreak = 0;
  let run = 0;
  let prevDate = null;
  for (const d of sortedDates) {
    if (prevDate) {
      const diffDays = (new Date(d) - new Date(prevDate)) / 86400000;
      run = diffDays === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    longestStreak = Math.max(longestStreak, run);
    prevDate = d;
  }

  const totalPoseChecks = sessions.reduce((sum, s) => sum + (s.poseResults?.length || 0), 0);

  return { currentStreak, longestStreak, totalSessions: sessions.length, totalPoseChecks, dateSet };
}

// Per-pose accuracy trend ("correct in 8 of your last 10 attempts") — plain client-side
// aggregation over the same GET /api/sessions data, no new backend endpoint. `sessions`
// arrives newest-first (backend sorts by completedAt desc), so appending poseResults in
// that order and taking the first N per pose naturally gives the most recent N attempts.
function computePoseTrends(sessions, { maxAttempts = 10 } = {}) {
  const byPose = new Map();
  for (const s of sessions) {
    for (const p of s.poseResults || []) {
      if (!p?.asana) continue;
      const arr = byPose.get(p.asana) || [];
      if (arr.length < maxAttempts) arr.push(Boolean(p.wasCorrect));
      byPose.set(p.asana, arr);
    }
  }
  const trends = [];
  for (const [asana, results] of byPose) {
    if (results.length < 2) continue; // not enough attempts yet for a meaningful trend
    trends.push({ asana, correctCount: results.filter(Boolean).length, total: results.length });
  }
  // Worst-first — the poses most worth knowing about are the ones still being missed.
  return trends.sort((a, b) => a.correctCount / a.total - b.correctCount / b.total);
}

function computeBadges({ totalSessions, currentStreak, longestStreak }) {
  const badges = [];
  if (totalSessions >= 1) badges.push('🌱 First session');
  if (totalSessions >= 10) badges.push('🌿 10 sessions');
  if (totalSessions >= 50) badges.push('🌳 50 sessions');
  if (currentStreak >= 3 || longestStreak >= 3) badges.push('🔥 3-day streak');
  if (currentStreak >= 7 || longestStreak >= 7) badges.push('🔥 7-day streak');
  if (currentStreak >= 30 || longestStreak >= 30) badges.push('🏆 30-day streak');
  return badges;
}

function Heatmap({ dateSet }) {
  const cells = [];
  const today = new Date();
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ key, active: dateSet.has(key) });
  }
  return (
    <div className="progress-heatmap">
      {cells.map((c) => (
        <div key={c.key} className={`progress-heatmap__cell ${c.active ? 'is-active' : ''}`} title={c.key} />
      ))}
    </div>
  );
}

function formatMinSec(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function SessionRow({ session }) {
  const poseResults = session.poseResults || [];
  const correctCount = poseResults.filter((p) => p.wasCorrect).length;
  // actualHoldSeconds only exists on sessions logged after the hold-duration tracking
  // feature was added — older sessions just won't show a total, not an error.
  const totalHeldSeconds = poseResults.reduce((sum, p) => sum + (p.actualHoldSeconds || 0), 0);

  return (
    <div className="yoga-plan__step">
      <div className="yoga-plan__step-top">
        <span>{session.date}{session.dayOfWeek ? ` (${session.dayOfWeek})` : ''}</span>
        <span className="yoga-plan__step-duration">
          {correctCount}/{poseResults.length} poses correct
        </span>
      </div>
      <p className="yoga-plan__step-why">
        {poseResults.map((p) => p.asana).join(', ') || 'No poses logged'}
      </p>
      {totalHeldSeconds > 0 && (
        <p className="yoga-plan__step-why">⏱ {formatMinSec(totalHeldSeconds)} held in front of the camera</p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
        {session.pranayamaCompleted && <span className="progress-badge">🫁 Breathing</span>}
        {session.walkCompleted && <span className="progress-badge">🚶 Walk</span>}
        {session.waterCompleted && <span className="progress-badge">💧 Water</span>}
      </div>
      {session.note && <p className="yoga-plan__step-why" style={{ fontStyle: 'italic' }}>"{session.note}"</p>}
    </div>
  );
}

export default function ActivityView() {
  const { getToken } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const authFetch = makeAuthFetch(getToken);
        const res = await authFetch('/api/sessions');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Server responded ${res.status}`);
        if (!cancelled) setSessions(data);
      } catch (err) {
        console.error('Failed to load session history:', err);
        if (!cancelled) setError('Could not load your practice history.');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  if (error) return <p className="pose-check__error">{error}</p>;
  if (!sessions) return <p>Loading your activity…</p>;

  if (sessions.length === 0) {
    return (
      <div className="progress-card">
        <h2 style={{ marginTop: 0 }}>Your activity</h2>
        <p className="app__subtitle">No sessions logged yet — complete a practice session to see your progress here.</p>
      </div>
    );
  }

  const stats = computeStats(sessions);
  const badges = computeBadges(stats);
  const poseTrends = computePoseTrends(sessions);

  return (
    <div className="progress-card">
      <h2 style={{ marginTop: 0 }}>Your activity</h2>

      <div className="progress-card__stats">
        <div className="progress-stat">
          <span className="progress-stat__value">🔥 {stats.currentStreak}</span>
          <span className="progress-stat__label">Day streak</span>
        </div>
        <div className="progress-stat">
          <span className="progress-stat__value">{stats.longestStreak}</span>
          <span className="progress-stat__label">Longest streak</span>
        </div>
        <div className="progress-stat">
          <span className="progress-stat__value">{stats.totalSessions}</span>
          <span className="progress-stat__label">Sessions</span>
        </div>
      </div>

      {badges.length > 0 && (
        <div className="progress-badges">
          {badges.map((b) => (
            <span key={b} className="progress-badge">
              {b}
            </span>
          ))}
        </div>
      )}

      <Heatmap dateSet={stats.dateSet} />

      {poseTrends.length > 0 && (
        <>
          <h3 style={{ marginTop: '1.5rem' }}>Per-pose accuracy</h3>
          <p className="app__subtitle" style={{ marginBottom: '0.75rem' }}>
            Correct checks out of your last 10 attempts at each pose — lowest first.
          </p>
          <div className="trend-list">
            {poseTrends.map((t) => (
              <div key={t.asana} className="trend-row">
                <span className="trend-row__label">{t.asana}</span>
                <div className="trend-bar">
                  <div className="trend-bar__fill" style={{ width: `${(t.correctCount / t.total) * 100}%` }} />
                </div>
                <span className="trend-row__count">
                  {t.correctCount}/{t.total}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 style={{ marginTop: '1.5rem' }}>Session history</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {sessions.map((s) => (
          <SessionRow key={s._id || s.completedAt} session={s} />
        ))}
      </div>
    </div>
  );
}
