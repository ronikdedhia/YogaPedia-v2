import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

const FLAGS = [
  { key: 'pregnant', label: 'Pregnant' },
  { key: 'recentInjury', label: 'Recent injury or surgery' },
  { key: 'highBloodPressure', label: 'High blood pressure' },
  { key: 'glaucoma', label: 'Glaucoma' },
];

export default function YogaPlan() {
  const [problems, setProblems] = useState('');
  const [diet, setDiet] = useState('');
  const [flags, setFlags] = useState({});
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function toggleFlag(key) {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!problems.trim() && !diet.trim()) {
      setError('Describe at least one health concern or your diet.');
      return;
    }
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch(`${API_BASE}/api/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problems, diet, flags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server responded ${res.status}`);
      setPlan(data);
    } catch (err) {
      console.error('Recommend request failed:', err);
      setError('Could not generate a plan right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="yoga-plan">
      <form onSubmit={handleSubmit} className="yoga-plan__form">
        <label className="yoga-plan__label" htmlFor="problems">
          Health problems / what you're dealing with
        </label>
        <textarea
          id="problems"
          className="yoga-plan__textarea"
          rows={3}
          placeholder="e.g. lower back pain, stress, trouble sleeping..."
          value={problems}
          onChange={(e) => setProblems(e.target.value)}
        />

        <label className="yoga-plan__label" htmlFor="diet">
          Your diet
        </label>
        <textarea
          id="diet"
          className="yoga-plan__textarea"
          rows={2}
          placeholder="e.g. mostly vegetarian, trying to lose weight..."
          value={diet}
          onChange={(e) => setDiet(e.target.value)}
        />

        <div className="yoga-plan__flags">
          {FLAGS.map((f) => (
            <label key={f.key} className="yoga-plan__flag">
              <input type="checkbox" checked={!!flags[f.key]} onChange={() => toggleFlag(f.key)} />
              {f.label}
            </label>
          ))}
        </div>

        <button type="submit" className="yoga-plan__submit" disabled={loading}>
          {loading ? 'Drafting your plan…' : 'Draft my yoga plan'}
        </button>
      </form>

      {error && <p className="pose-check__error">{error}</p>}

      {plan && (
        <div className="yoga-plan__result">
          <h3 className="yoga-plan__title">{plan.planTitle}</h3>

          <ol className="yoga-plan__routine">
            {plan.routine?.map((step) => (
              <li key={step.order} className="yoga-plan__step">
                <div className="yoga-plan__step-top">
                  <span className="yoga-plan__step-asana">{step.asana}</span>
                  <span className="yoga-plan__step-duration">{step.duration_minutes} min</span>
                </div>
                <p className="yoga-plan__step-why">{step.why}</p>
              </li>
            ))}
          </ol>

          {plan.dietTips?.length > 0 && (
            <div className="yoga-plan__section">
              <h4>Diet tips</h4>
              <ul>
                {plan.dietTips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.cautions?.length > 0 && (
            <div className="yoga-plan__section yoga-plan__section--caution">
              <h4>Cautions</h4>
              <ul>
                {plan.cautions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="yoga-plan__disclaimer">{plan.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
