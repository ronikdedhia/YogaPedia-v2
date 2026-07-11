import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { makeAuthFetch } from './api.js';
import PracticeSession from './PracticeSession.jsx';

export default function TodayView() {
  const { getToken } = useAuth();
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logged, setLogged] = useState(false);
  const [practicing, setPracticing] = useState(false);

  const loadToday = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authFetch = makeAuthFetch(getToken);
      const res = await authFetch('/api/schedule/today');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server responded ${res.status}`);
      setToday(data);
    } catch (err) {
      console.error('Failed to load today\'s schedule:', err);
      setError('Could not load today\'s schedule.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  async function handleFinish(payload) {
    setPracticing(false);
    try {
      const authFetch = makeAuthFetch(getToken);
      const res = await authFetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      setLogged(true);
    } catch (err) {
      console.error('Failed to log session:', err);
      setError('Could not save your session log — your practice still counts, just not recorded this time.');
    }
  }

  if (loading) return <p>Loading today's practice…</p>;
  if (error && !today) return <p className="pose-check__error">{error}</p>;
  if (!today) return null;

  if (practicing) {
    return <PracticeSession today={today} onBack={() => setPracticing(false)} onFinish={handleFinish} />;
  }

  return (
    <div>
      <h1>Today's practice</h1>

      <div className="yoga-plan__result">
        <ol className="yoga-plan__routine">
          {(today.poses || []).map((step) => (
            <li key={step.order} className="yoga-plan__step">
              <div className="yoga-plan__step-top">
                <span className="yoga-plan__step-asana">{step.asana}</span>
                <span className="yoga-plan__step-duration">{step.duration_minutes} min</span>
              </div>
              <p className="yoga-plan__step-why">{step.why}</p>
            </li>
          ))}
        </ol>

        {today.pranayama && (
          <div className="yoga-plan__section">
            <h4>Breathing — {today.pranayama.technique} ({today.pranayama.duration_minutes} min)</h4>
            <p>{today.pranayama.why}</p>
          </div>
        )}

        {today.walk && (
          <div className="yoga-plan__section">
            <h4>Walk — {today.walk.duration_minutes} min</h4>
            <p>{today.walk.why}</p>
          </div>
        )}

        {today.waterTargetLiters && (
          <div className="yoga-plan__section">
            <h4>Water target</h4>
            <p>{today.waterTargetLiters}L today</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        {logged ? (
          <p>✅ Today's session logged. Nice work!</p>
        ) : (
          <button type="button" className="yoga-plan__submit" onClick={() => setPracticing(true)}>
            ▶ Practice now
          </button>
        )}
      </div>

      {error && <p className="pose-check__error">{error}</p>}
    </div>
  );
}
