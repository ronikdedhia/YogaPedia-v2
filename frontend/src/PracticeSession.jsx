import { useRef, useState } from 'react';
import PoseCheck from './PoseCheck.jsx';

// today: the object from GET /api/schedule/today — { poses, pranayama, walk, waterTargetLiters }
// onBack: return to the Today overview without logging anything
// onFinish(payload): called once the user completes the wrap-up screen — payload is
// { poseResults, pranayamaCompleted, walkCompleted, waterCompleted, note }
export default function PracticeSession({ today, onBack, onFinish }) {
  const poses = today.poses || [];
  const [poseIndex, setPoseIndex] = useState(0);
  const [poseResults, setPoseResults] = useState([]);
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [pranayamaCompleted, setPranayamaCompleted] = useState(false);
  const [walkCompleted, setWalkCompleted] = useState(false);
  const [waterCompleted, setWaterCompleted] = useState(false);
  const [note, setNote] = useState('');

  // Track only the LATEST check result + elapsed timer value for whichever pose is
  // currently active — PoseCheck fires onPoseResult every ~2.5s and onElapsedChange every
  // second, but we only want one combined record per pose (captured when moving on), not
  // one row per snapshot.
  const latestResultRef = useRef(null);
  const latestElapsedRef = useRef(0);

  const currentPose = poses[poseIndex];

  function handlePoseResult(data) {
    latestResultRef.current = data;
  }

  function handleElapsedChange(seconds) {
    latestElapsedRef.current = seconds;
  }

  function recordCurrentPose() {
    const latest = latestResultRef.current;
    setPoseResults((prev) => [
      ...prev,
      {
        asana: currentPose.asana,
        targetDurationSeconds: currentPose.duration_minutes * 60,
        actualHoldSeconds: latestElapsedRef.current,
        finalConfidence: latest?.confidence,
        wasCorrect: latest?.is_correct,
        bodyPartFlagged: latest?.body_part,
      },
    ]);
    latestResultRef.current = null;
    latestElapsedRef.current = 0;
  }

  function goToNextPose() {
    recordCurrentPose();
    if (poseIndex < poses.length - 1) {
      setPoseIndex((i) => i + 1);
    } else {
      setShowWrapUp(true);
    }
  }

  function goToPrevPose() {
    setPoseIndex((i) => Math.max(0, i - 1));
  }

  function handleFinish() {
    onFinish({ poseResults, pranayamaCompleted, walkCompleted, waterCompleted, note: note.trim() || undefined });
  }

  if (showWrapUp) {
    return (
      <div className="yoga-plan">
        <h2 style={{ marginTop: 0 }}>Nice work! Anything else you completed today?</h2>
        <p className="app__subtitle" style={{ marginBottom: '1rem' }}>
          Poses are tracked automatically from your practice — these ones can't be checked by camera, so mark them yourself.
        </p>

        {today.pranayama && (
          <label className="yoga-plan__flag" style={{ marginBottom: '1rem', display: 'flex' }}>
            <input type="checkbox" checked={pranayamaCompleted} onChange={(e) => setPranayamaCompleted(e.target.checked)} />
            Breathing — {today.pranayama.technique} ({today.pranayama.duration_minutes} min)
          </label>
        )}

        {(today.walk || today.waterTargetLiters) && (
          <div className="wellness-card">
            <h4>Did you hit today's targets?</h4>
            {today.walk && (
              <div className="wellness-card__item">
                <span className="wellness-card__info">
                  <span className="wellness-card__icon">🚶</span>
                  Walk — {today.walk.duration_minutes} min
                </span>
                <button
                  type="button"
                  className={`wellness-card__toggle ${walkCompleted ? 'is-done' : ''}`}
                  onClick={() => setWalkCompleted((v) => !v)}
                >
                  {walkCompleted ? '✓ Done' : 'Not yet'}
                </button>
              </div>
            )}
            {today.waterTargetLiters && (
              <div className="wellness-card__item">
                <span className="wellness-card__info">
                  <span className="wellness-card__icon">💧</span>
                  Water — {today.waterTargetLiters}L today
                </span>
                <button
                  type="button"
                  className={`wellness-card__toggle ${waterCompleted ? 'is-done' : ''}`}
                  onClick={() => setWaterCompleted((v) => !v)}
                >
                  {waterCompleted ? '✓ Done' : 'Not yet'}
                </button>
              </div>
            )}
          </div>
        )}

        <label className="yoga-plan__label" htmlFor="session-note">
          Notes (optional)
        </label>
        <textarea
          id="session-note"
          className="yoga-plan__textarea"
          rows={2}
          placeholder="How did it feel today?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <button type="button" className="yoga-plan__submit" style={{ marginTop: '1rem' }} onClick={handleFinish}>
          Finish session
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="pose-check__controls" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="pose-check__btn" onClick={onBack}>
          ← Back to overview
        </button>
        <span style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
          Pose {poseIndex + 1} of {poses.length}
        </span>
      </div>

      <h2>{currentPose.asana}</h2>
      <p className="app__subtitle">{currentPose.why}</p>

      <PoseCheck
        posesOverride={[currentPose.asana]}
        onPoseResult={handlePoseResult}
        onElapsedChange={handleElapsedChange}
        targetDurationMinutes={currentPose.duration_minutes}
      />

      <div className="pose-check__controls">
        <button type="button" className="pose-check__btn" onClick={goToPrevPose} disabled={poseIndex === 0}>
          ← Previous pose
        </button>
        <button type="button" className="pose-check__btn is-active" onClick={goToNextPose}>
          {poseIndex < poses.length - 1 ? 'Next pose →' : 'Finish poses →'}
        </button>
      </div>
    </div>
  );
}
