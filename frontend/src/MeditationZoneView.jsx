import { useEffect, useRef, useState } from 'react';
import { getLanguage } from './preferences.js';
import { useSpeech } from './useSpeech.js';
import { AMBIENT_SOUNDS } from './lib/ambientSounds.js';
import { getRandomMotivationalPhrase } from './motivationalPhrases.js';

const DURATION_OPTIONS = [5, 10, 15, 20];
const PHRASE_INTERVAL_MS = 75_000; // roughly every 60-90s

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MeditationZoneView() {
  const [language] = useState(getLanguage);
  const [durationMinutes, setDurationMinutes] = useState(DURATION_OPTIONS[0]);
  const [selectedSound, setSelectedSound] = useState(AMBIENT_SOUNDS[0].key);
  const [running, setRunning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const { speak, unlockVoice, stopSpeaking } = useSpeech({ ttsEnabled: true, language });
  const audioCtxRef = useRef(null);
  const stopSoundRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const phraseIntervalRef = useRef(null);

  function endSession() {
    setRunning(false);
    clearInterval(countdownIntervalRef.current);
    clearInterval(phraseIntervalRef.current);
    stopSoundRef.current?.();
    stopSoundRef.current = null;
    stopSpeaking();
  }

  // Stop everything if the user navigates away mid-session.
  useEffect(() => () => endSession(), []);

  function startSession() {
    unlockVoice(); // this click is the real user gesture — unlocks audio autoplay for the session
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = audioCtxRef.current || (audioCtxRef.current = new Ctx());
    if (ctx.state === 'suspended') ctx.resume();

    const preset = AMBIENT_SOUNDS.find((s) => s.key === selectedSound) || AMBIENT_SOUNDS[0];
    stopSoundRef.current = preset.create(ctx);

    setRemainingSeconds(durationMinutes * 60);
    setRunning(true);
    speak(getRandomMotivationalPhrase(language));

    countdownIntervalRef.current = setInterval(() => {
      setRemainingSeconds((s) => {
        if (s <= 1) {
          endSession();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    phraseIntervalRef.current = setInterval(() => {
      speak(getRandomMotivationalPhrase(language));
    }, PHRASE_INTERVAL_MS);
  }

  return (
    <div className="yoga-plan">
      <h2 style={{ marginTop: 0 }}>Meditation Zone</h2>
      <p className="app__subtitle">Pick a duration and a soothing background sound — spoken guidance plays alongside it.</p>

      {!running && (
        <>
          <div className="pose-check__picker">
            <label>Duration</label>
            <div className="pose-check__controls">
              {DURATION_OPTIONS.map((min) => (
                <button
                  key={min}
                  type="button"
                  className={`pose-check__btn ${durationMinutes === min ? 'is-active' : ''}`}
                  onClick={() => setDurationMinutes(min)}
                >
                  {min} min
                </button>
              ))}
            </div>
          </div>

          <div className="pose-check__picker" style={{ marginTop: '1rem' }}>
            <label>Background sound</label>
            <div className="library-grid">
              {AMBIENT_SOUNDS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`library-card ${selectedSound === s.key ? 'is-active' : ''}`}
                  style={{ cursor: 'pointer', textAlign: 'center', border: selectedSound === s.key ? '2px solid var(--accent, #4a9)' : undefined }}
                  onClick={() => setSelectedSound(s.key)}
                >
                  <div style={{ fontSize: '2rem' }}>{s.icon}</div>
                  <div>{s.label}</div>
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="yoga-plan__submit" style={{ marginTop: '1.5rem' }} onClick={startSession}>
            Start
          </button>
        </>
      )}

      {running && (
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <div className={`pose-check__timer`} style={{ fontSize: '2.5rem', margin: '1rem 0' }}>
            {formatClock(remainingSeconds)}
          </div>
          <p className="app__subtitle">{AMBIENT_SOUNDS.find((s) => s.key === selectedSound)?.label} playing…</p>
          <button type="button" className="pose-check__btn" onClick={endSession}>
            End session
          </button>
        </div>
      )}
    </div>
  );
}
