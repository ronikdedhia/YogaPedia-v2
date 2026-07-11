import { useEffect, useState } from 'react';
import { getAsanaGif } from './asanaGifs.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// Browsable reference of all 12 pose-check poses, independent of any day's schedule —
// demo images otherwise only ever surface during an active practice session.
export default function LibraryView() {
  const [asanas, setAsanas] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/asanas/library`)
      .then((r) => r.json())
      .then(setAsanas)
      .catch((err) => {
        console.error('Failed to load asana library:', err);
        setError('Could not load the pose library.');
      });
  }, []);

  if (error) return <p className="pose-check__error">{error}</p>;
  if (!asanas) return <p>Loading library…</p>;

  return (
    <div className="yoga-plan">
      <h2 style={{ marginTop: 0 }}>Pose library</h2>
      <p className="app__subtitle">All poses the app currently supports for pose-check and scheduling.</p>

      <div className="library-grid">
        {asanas.map((a) => {
          const gif = getAsanaGif(a.asana);
          return (
            <div key={a.asana} className="library-card">
              <div className="pose-check__gif-panel" style={{ aspectRatio: '1 / 1' }}>
                {gif ? (
                  <img src={gif.src} alt={`${a.asana} demo`} className="pose-check__gif-img" />
                ) : (
                  <div className="pose-check__gif-placeholder">No demo image yet</div>
                )}
              </div>
              <h3 style={{ margin: '0.6rem 0 0.3rem' }}>{a.asana}</h3>
              <p className="yoga-plan__step-why">{a.benefits}</p>
              {gif?.note && <p className="pose-check__gif-note" style={{ color: 'var(--muted)' }}>{gif.note}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
