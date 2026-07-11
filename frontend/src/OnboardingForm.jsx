import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { makeAuthFetch } from './api.js';

const GOAL_TAGS = ['flexibility', 'stress relief', 'better sleep', 'weight management', 'back/joint health', 'general fitness'];
const SAFETY_FLAGS = [
  { key: 'pregnant', label: 'Pregnant' },
  { key: 'recentInjury', label: 'Recent injury or surgery' },
  { key: 'highBloodPressure', label: 'High blood pressure' },
  { key: 'glaucoma', label: 'Glaucoma' },
];

// Health problems are a removable list, not one free-text blob — lets someone add a new
// issue later and remove one once they've recovered, without retyping/editing prose.
// `initialValues.problems` may still be a plain string from a schedule saved before this
// change; normalized to a single-item array so old data keeps working.
function normalizeProblems(initial) {
  if (Array.isArray(initial)) return initial;
  if (typeof initial === 'string' && initial.trim()) return [initial.trim()];
  return [];
}

// initialValues: optional — when provided (from an existing schedule's `onboarding`
// object), the form is pre-filled and behaves as an edit rather than first-time setup.
// Submitting always calls POST /api/schedule, which upserts by userId either way — an
// "edit" here means regenerating the whole plan from updated answers, not editing
// individual days/poses in place. See ARCHITECTURE.md for that scope decision.
export default function OnboardingForm({ onDone, initialValues, onCancel }) {
  const { getToken } = useAuth();
  const isEdit = Boolean(initialValues);
  const [problems, setProblems] = useState(() => normalizeProblems(initialValues?.problems));
  const [newIssue, setNewIssue] = useState('');
  const [diet, setDiet] = useState(initialValues?.diet || '');
  const [goalTags, setGoalTags] = useState(initialValues?.goalTags || []);
  const [experienceLevel, setExperienceLevel] = useState(initialValues?.experienceLevel || 'beginner');
  const [daysPerWeek, setDaysPerWeek] = useState(initialValues?.daysPerWeek || 5);
  const [minutesPerSession, setMinutesPerSession] = useState(initialValues?.minutesPerSession || 20);
  const [flags, setFlags] = useState(initialValues?.flags || {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function addIssue() {
    const trimmed = newIssue.trim();
    if (!trimmed || problems.includes(trimmed)) {
      setNewIssue('');
      return;
    }
    setProblems((prev) => [...prev, trimmed]);
    setNewIssue('');
  }

  function removeIssue(issue) {
    setProblems((prev) => prev.filter((p) => p !== issue));
  }

  function toggleGoalTag(tag) {
    setGoalTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function toggleFlag(key) {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (problems.length === 0) {
      setError('Add at least one health concern or goal.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const authFetch = makeAuthFetch(getToken);
      const res = await authFetch('/api/schedule', {
        method: 'POST',
        body: JSON.stringify({ problems, diet, goalTags, experienceLevel, daysPerWeek, minutesPerSession, flags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server responded ${res.status}`);
      onDone(data);
    } catch (err) {
      console.error('Schedule generation failed:', err);
      setError('Could not generate your schedule right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="yoga-plan">
      <h2>{isEdit ? 'Update your practice plan' : "Let's build your practice plan"}</h2>
      <form onSubmit={handleSubmit} className="yoga-plan__form">
        <label className="yoga-plan__label">Health problems / goals</label>

        {problems.length > 0 && (
          <div className="issue-chip-list">
            {problems.map((issue) => (
              <span key={issue} className="issue-chip">
                {issue}
                <button
                  type="button"
                  className="issue-chip__remove"
                  onClick={() => removeIssue(issue)}
                  aria-label={`Remove "${issue}" — mark as recovered/resolved`}
                  title="Remove — recovered from this?"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="pose-check__controls" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
          <input
            type="text"
            className="yoga-plan__textarea"
            style={{ resize: 'none' }}
            placeholder="e.g. lower back pain"
            value={newIssue}
            onChange={(e) => setNewIssue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addIssue();
              }
            }}
          />
          <button type="button" className="pose-check__btn" onClick={addIssue}>
            + Add
          </button>
        </div>

        <label className="yoga-plan__label">Days per week you can practice</label>
        <select value={daysPerWeek} onChange={(e) => setDaysPerWeek(Number(e.target.value))}>
          {[3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n} days/week
            </option>
          ))}
        </select>

        <label className="yoga-plan__label">Minutes per session</label>
        <select value={minutesPerSession} onChange={(e) => setMinutesPerSession(Number(e.target.value))}>
          {[10, 20, 30, 45].map((n) => (
            <option key={n} value={n}>
              {n} minutes
            </option>
          ))}
        </select>

        <label className="yoga-plan__label" htmlFor="onb-diet">
          Diet (optional)
        </label>
        <textarea
          id="onb-diet"
          className="yoga-plan__textarea"
          rows={2}
          placeholder="e.g. mostly vegetarian, trying to lose weight..."
          value={diet}
          onChange={(e) => setDiet(e.target.value)}
        />

        <label className="yoga-plan__label">Goals (optional)</label>
        <div className="yoga-plan__flags">
          {GOAL_TAGS.map((tag) => (
            <label key={tag} className="yoga-plan__flag">
              <input type="checkbox" checked={goalTags.includes(tag)} onChange={() => toggleGoalTag(tag)} />
              {tag}
            </label>
          ))}
        </div>

        <label className="yoga-plan__label">Experience level</label>
        <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>

        <label className="yoga-plan__label">Safety flags (optional)</label>
        <div className="yoga-plan__flags">
          {SAFETY_FLAGS.map((f) => (
            <label key={f.key} className="yoga-plan__flag">
              <input type="checkbox" checked={!!flags[f.key]} onChange={() => toggleFlag(f.key)} />
              {f.label}
            </label>
          ))}
        </div>

        <div className="pose-check__controls" style={{ justifyContent: 'flex-start', marginTop: '0.5rem' }}>
          <button type="submit" className="yoga-plan__submit" disabled={loading}>
            {loading ? 'Building your plan…' : isEdit ? 'Regenerate my plan' : 'Create my schedule'}
          </button>
          {isEdit && onCancel && (
            <button type="button" className="pose-check__btn" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {error && <p className="pose-check__error">{error}</p>}
    </div>
  );
}
