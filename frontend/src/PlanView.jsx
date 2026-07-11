import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { makeAuthFetch } from './api.js';
import OnboardingForm from './OnboardingForm.jsx';

// Plain text, not PDF — no new dependency needed (a PDF library would be the only
// reason to add one for this feature), and a downloadable .txt is just as portable/
// shareable for a personal practice plan.
function formatScheduleAsText(schedule) {
  const lines = [schedule.planTitle, '='.repeat(schedule.planTitle.length), ''];
  if (schedule.waterTargetLiters) lines.push(`Water target: ${schedule.waterTargetLiters}L/day`, '');

  const dayKeys = Object.keys(schedule.days || {}).sort((a, b) => Number(a.replace('day', '')) - Number(b.replace('day', '')));
  for (const dayKey of dayKeys) {
    const day = schedule.days[dayKey];
    lines.push(dayKey.replace('day', 'Day '), '-'.repeat(20));
    for (const step of day.poses || []) {
      lines.push(`- ${step.asana} (${step.duration_minutes} min): ${step.why}`);
    }
    if (day.pranayama) lines.push(`- Breathing: ${day.pranayama.technique} (${day.pranayama.duration_minutes} min)`);
    if (day.walk) lines.push(`- Walk: ${day.walk.duration_minutes} min`);
    lines.push('');
  }

  if (schedule.meals?.length) lines.push('Meals:', ...schedule.meals.map((m) => `- [${m.type}] ${m.meal}: ${m.why}`), '');
  if (schedule.cautions?.length) lines.push('Cautions:', ...schedule.cautions.map((c) => `- ${c}`), '');
  if (schedule.disclaimer) lines.push(schedule.disclaimer);

  return lines.join('\n');
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PlanView() {
  const { getToken } = useAuth();
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [repeatMessage, setRepeatMessage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authFetch = makeAuthFetch(getToken);
      const res = await authFetch('/api/schedule');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server responded ${res.status}`);
      setSchedule(data);
    } catch (err) {
      console.error('Failed to load plan:', err);
      setError('Could not load your plan.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRepeat() {
    setRepeating(true);
    setRepeatMessage(null);
    try {
      const authFetch = makeAuthFetch(getToken);
      const res = await authFetch('/api/schedule/repeat', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server responded ${res.status}`);
      setSchedule(data);
      setRepeatMessage('✅ Restarted this week from Day 1 — no new plan generated, same routine.');
    } catch (err) {
      console.error('Failed to repeat schedule:', err);
      setRepeatMessage('Could not repeat this week right now.');
    } finally {
      setRepeating(false);
    }
  }

  if (loading) return <p>Loading your plan…</p>;

  if (editing) {
    return (
      <OnboardingForm
        initialValues={schedule?.onboarding}
        onDone={(updated) => {
          setSchedule(updated);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  if (error || !schedule) {
    return <p className="pose-check__error">{error || 'No plan yet.'}</p>;
  }

  const dayKeys = Object.keys(schedule.days || {}).sort((a, b) => Number(a.replace('day', '')) - Number(b.replace('day', '')));

  return (
    <div className="yoga-plan">
      <div className="pose-check__controls" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{schedule.planTitle}</h2>
        <div className="pose-check__controls" style={{ marginBottom: 0 }}>
          <button type="button" className="pose-check__btn" onClick={handleRepeat} disabled={repeating}>
            🔁 {repeating ? 'Repeating…' : 'Repeat this week'}
          </button>
          <button type="button" className="pose-check__btn is-active" onClick={() => setEditing(true)}>
            ✏️ Edit plan
          </button>
          <button
            type="button"
            className="pose-check__btn"
            onClick={() => downloadTextFile(`${schedule.planTitle.replace(/\s+/g, '-').toLowerCase()}.txt`, formatScheduleAsText(schedule))}
          >
            ⬇️ Export as text
          </button>
        </div>
      </div>

      {repeatMessage && <p className="app__subtitle">{repeatMessage}</p>}

      {schedule.waterTargetLiters && (
        <p className="app__subtitle">💧 {schedule.waterTargetLiters}L water target/day</p>
      )}

      {dayKeys.map((dayKey) => {
        const day = schedule.days[dayKey];
        return (
          <div key={dayKey} className="yoga-plan__step" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0, textTransform: 'capitalize' }}>{dayKey.replace('day', 'Day ')}</h3>
            <ol className="yoga-plan__routine">
              {(day.poses || []).map((step) => (
                <li key={step.order} className="yoga-plan__step">
                  <div className="yoga-plan__step-top">
                    <span>{step.asana}</span>
                    <span className="yoga-plan__step-duration">{step.duration_minutes} min</span>
                  </div>
                  <p className="yoga-plan__step-why">{step.why}</p>
                </li>
              ))}
            </ol>
            {day.pranayama && (
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                Breathing: {day.pranayama.technique} ({day.pranayama.duration_minutes} min)
              </p>
            )}
            {day.walk && (
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Walk: {day.walk.duration_minutes} min</p>
            )}
          </div>
        );
      })}

      {schedule.meals?.length > 0 && (
        <div className="yoga-plan__section">
          <h4>Meals</h4>
          <ul>
            {schedule.meals.map((m, i) => (
              <li key={i}>
                <strong style={{ textTransform: 'capitalize' }}>{m.type}:</strong> {m.meal} — {m.why}
              </li>
            ))}
          </ul>
        </div>
      )}

      {schedule.cautions?.length > 0 && (
        <div className="yoga-plan__section yoga-plan__section--caution">
          <h4>Cautions</h4>
          <ul>
            {schedule.cautions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {schedule.disclaimer && <p className="yoga-plan__disclaimer">{schedule.disclaimer}</p>}
    </div>
  );
}
