import { useEffect, useRef, useState } from 'react';
import { getAsanaGif } from './asanaGifs.js';
import { getConfidenceThreshold, setConfidenceThreshold as persistConfidenceThreshold, getTtsEnabled, setTtsEnabled as persistTtsEnabled, getVoiceId, getLanguage } from './preferences.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
// Groq's free-tier vision model caps at 30,000 tokens/min; each check costs ~2,700-3,000
// tokens (image + prompt). At 2.5s this needed ~24 req/min (~70k tokens/min) — over 2x the
// cap, guaranteeing a 429 within ~15-20s of continuous use. 7s keeps it under with margin
// even at the higher end of that per-request token range (~8.5 req/min x 3,000 ≈ 25.7k).
const CHECK_INTERVAL_MS = 7000;
const TTS_SUPPORTED = typeof window !== 'undefined' && 'speechSynthesis' in window;

// Fixed instructional phrases never come from the vision model, so they need their own
// translation — a language picker that left these three in English would feel half-done.
// Kept to just the two languages the backend supports (chains/checkPose.js's
// SUPPORTED_LANGUAGES), not a general-purpose i18n table.
const FIXED_PHRASES = {
  en: { needsBody: 'Make sure your full body is visible.', good: 'Good, hold the pose.', adjust: 'Adjust your posture.' },
  hi: { needsBody: 'सुनिश्चित करें कि आपका पूरा शरीर दिखाई दे रहा है।', good: 'बहुत बढ़िया, इस मुद्रा को बनाए रखें।', adjust: 'अपनी मुद्रा ठीक करें।' },
};

// Deliberately no asana name here — spoken guidance should read like a live instructor
// correcting your body, not a label announcement. body_part/correction come back from the
// backend already translated (chains/checkPose.js's *_localized fields) when language !=
// 'en' — this only chooses which field to read, no translation happens client-side.
function buildSpokenText(data, confidenceThreshold, language = 'en') {
  const phrases = FIXED_PHRASES[language] || FIXED_PHRASES.en;
  const confident = data.confidence >= confidenceThreshold && data.pose !== 'Unrecognized';
  if (!confident) return phrases.needsBody;
  if (data.is_correct) return phrases.good;
  const bodyPart = (language !== 'en' && data.body_part_localized) || data.body_part;
  const correction = (language !== 'en' && data.correction_localized) || data.correction;
  if (bodyPart && correction) return `${bodyPart}. ${correction}`;
  return correction || phrases.adjust;
}

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// posesOverride: optional array of pose names to restrict practice to (e.g. today's
// scheduled poses) instead of the full 12 — also sent to /api/check-pose as a smaller
// vision-model candidate list, per ARCHITECTURE.md §9.6.
// onPoseResult: optional callback(data) fired after every successful check, so a parent
// (e.g. TodayView/PracticeSession) can accumulate results for session logging.
// targetDurationMinutes: optional — when set, shows a running timer (starts counting the
// moment the camera turns on) against this target, e.g. today's assigned duration for
// whichever single pose is currently being practiced. Doesn't force-stop at the target,
// just visually flags when it's been reached.
// onElapsedChange: optional callback(seconds) fired on every timer tick (and on reset to
// 0) so a parent like PracticeSession can capture actual hold duration per pose.
export default function PoseCheck({ posesOverride, onPoseResult, targetDurationMinutes, onElapsedChange } = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | starting | live | error
  const [cameraOn, setCameraOn] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(getTtsEnabled);
  // No inline control for this in PoseCheck itself (only in Settings, a separate mount),
  // so a plain read at mount is enough — unlike confidenceThreshold there's nothing that
  // changes it while this component stays mounted.
  const [language] = useState(getLanguage);
  const [voiceUnlocked, setVoiceUnlocked] = useState(false);
  const [elevenLabsEnabled, setElevenLabsEnabled] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [asanaList, setAsanaList] = useState(posesOverride || []);
  const [selectedAsana, setSelectedAsana] = useState(posesOverride?.[0] || '');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [confidenceThreshold, setConfidenceThreshold] = useState(getConfidenceThreshold);
  const inFlightRef = useRef(false);
  const confidenceThresholdRef = useRef(confidenceThreshold);
  const wasGoodRef = useRef(false); // tracks the previous check's correctness, so the chime plays once on the transition into "correct", not every 2.5s while held
  const audioCtxRef = useRef(null);
  // PracticeSession keeps the same PoseCheck instance mounted across poses (camera stays
  // on between "Next pose" clicks) and just passes a new posesOverride each time — the
  // capture loop below is only re-created when cameraOn changes, so without this ref it
  // would keep checking against whichever pose was active when the camera first turned on.
  const posesOverrideRef = useRef(posesOverride);

  function playChime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = audioCtxRef.current || (audioCtxRef.current = new Ctx());
      const now = ctx.currentTime;
      [523.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.3);
      });
    } catch (err) {
      console.error('Chime playback failed (non-critical):', err);
    }
  }

  useEffect(() => {
    if (!posesOverride || posesOverride.length === 0) {
      fetch(`${API_BASE}/api/asanas`)
        .then((r) => r.json())
        .then((list) => {
          setAsanaList(list);
          setSelectedAsana((current) => current || list[0] || '');
        })
        .catch((err) => console.error('Failed to load asana list:', err));
    }

    fetch(`${API_BASE}/api/tts-status`)
      .then((r) => r.json())
      .then((data) => setElevenLabsEnabled(Boolean(data.enabled)))
      .catch(() => setElevenLabsEnabled(false)); // server unreachable/older — just use browser TTS
  }, []);

  // Keep the demo GIF and vision-check candidate list in sync when a parent (e.g.
  // PracticeSession moving to the next pose) passes a new posesOverride, even though this
  // component instance stays mounted the whole time. Keyed on the pose name itself, not the
  // array reference, since posesOverride={[currentPose.asana]} is a new array every render.
  useEffect(() => {
    posesOverrideRef.current = posesOverride;
    if (posesOverride && posesOverride.length > 0) {
      setAsanaList(posesOverride);
      setSelectedAsana(posesOverride[0]);
    }
  }, [posesOverride?.[0]]);

  const ttsEnabledRef = useRef(ttsEnabled);
  const voiceUnlockedRef = useRef(voiceUnlocked);
  const elevenLabsEnabledRef = useRef(elevenLabsEnabled);
  const isSpeakingRef = useRef(false);
  const pendingTextRef = useRef(null);
  const lastQueuedRef = useRef('');

  useEffect(() => {
    elevenLabsEnabledRef.current = elevenLabsEnabled;
  }, [elevenLabsEnabled]);

  useEffect(() => {
    confidenceThresholdRef.current = confidenceThreshold;
    persistConfidenceThreshold(confidenceThreshold);
  }, [confidenceThreshold]);

  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
    persistTtsEnabled(ttsEnabled);
    if (!ttsEnabled) stopSpeaking();
  }, [ttsEnabled]);

  useEffect(() => {
    voiceUnlockedRef.current = voiceUnlocked;
  }, [voiceUnlocked]);

  function stopSpeaking() {
    pendingTextRef.current = null;
    isSpeakingRef.current = false;
    if (TTS_SUPPORTED) window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
    }
  }

  function onSpeechDone() {
    isSpeakingRef.current = false;
    if (pendingTextRef.current) {
      const next = pendingTextRef.current;
      pendingTextRef.current = null;
      speakNow(next);
    }
  }

  // Best-effort: sets the locale hint so the OS/browser picks a matching voice if one is
  // installed. If no Hindi voice exists on the device, the browser falls back to whatever
  // default voice it has — same "voice quality depends on the browser/OS" caveat that
  // already applies to English (see ARCHITECTURE.md §8), just more likely to bite for a
  // language with less universal OS voice support.
  const UTTERANCE_LANGS = { en: 'en-US', hi: 'hi-IN' };
  function speakViaBrowser(text) {
    if (!TTS_SUPPORTED) {
      onSpeechDone();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = UTTERANCE_LANGS[language] || 'en-US';
    utterance.onend = utterance.onerror = onSpeechDone;
    window.speechSynthesis.speak(utterance);
  }

  async function speakViaElevenLabs(text) {
    try {
      const voiceId = getVoiceId();
      const res = await fetch(`${API_BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voiceId ? { text, voiceId } : { text }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = audioRef.current;
      audio.src = url;
      audio.onended = audio.onerror = () => {
        URL.revokeObjectURL(url);
        onSpeechDone();
      };
      await audio.play();
    } catch (err) {
      console.error('ElevenLabs playback failed, falling back to browser voice:', err);
      speakViaBrowser(text); // don't go silent just because the quota ran out or a request failed
    }
  }

  function speakNow(text) {
    isSpeakingRef.current = true;
    if (elevenLabsEnabledRef.current) {
      speakViaElevenLabs(text);
    } else {
      speakViaBrowser(text);
    }
  }

  // Speak the current instruction fully before starting the next one. If the pose check
  // result changes mid-sentence, only the LATEST instruction is queued to speak next —
  // stale intermediate ones are dropped rather than read out in a backlog.
  function speak(text) {
    if (!ttsEnabledRef.current || !voiceUnlockedRef.current) return;
    if (!elevenLabsEnabledRef.current && !TTS_SUPPORTED) return;
    if (!text || text === lastQueuedRef.current) return;
    lastQueuedRef.current = text;
    if (isSpeakingRef.current) {
      pendingTextRef.current = text;
    } else {
      speakNow(text);
    }
  }

  function unlockVoice() {
    if (TTS_SUPPORTED) {
      // Speaking inside this click handler satisfies the browser's user-gesture
      // requirement for audio, unlocking all later auto-triggered speech for the
      // rest of the session — no further clicks needed.
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }
    // Same trick for the <audio> element the ElevenLabs path uses — a silent clip
    // played inside this click satisfies the browser's autoplay-gesture requirement
    // for it too, so later auto-triggered playback isn't blocked.
    if (audioRef.current) {
      audioRef.current.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
      audioRef.current.play().catch(() => {});
    }
    setVoiceUnlocked(true);
  }

  useEffect(() => {
    if (!cameraOn) {
      setStatus('idle');
      setResult(null);
      stopSpeaking();
      lastQueuedRef.current = '';
      wasGoodRef.current = false;
      return;
    }

    let stream;
    let intervalId;
    let cancelled = false;

    async function start() {
      setStatus('starting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('live');
        intervalId = setInterval(captureAndCheck, CHECK_INTERVAL_MS);
      } catch (err) {
        console.error('Webcam access failed:', err);
        setError('Could not access your webcam. Check browser permissions and try again.');
        setStatus('error');
      }
    }

    async function captureAndCheck() {
      if (inFlightRef.current) return; // skip if previous check still in flight
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      // Mirror the capture to match the mirrored <video> the user is looking at (CSS
      // scaleX(-1) below) — otherwise "left"/"right" in the correction text would refer
      // to the raw camera frame, not what's actually on screen, and confuse the user.
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL('image/jpeg', 0.7);

      inFlightRef.current = true;
      try {
        const currentPoses = posesOverrideRef.current;
        const requestBody = { image };
        if (currentPoses && currentPoses.length > 0) requestBody.poses = currentPoses;
        if (language !== 'en') requestBody.language = language;
        const res = await fetch(`${API_BASE}/api/check-pose`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
        if (res.status === 429) {
          if (cancelled) return;
          setError('Checks are running a little hot right now — slowing down automatically, still watching.');
          return;
        }
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        const data = await res.json();
        if (cancelled) return; // camera was turned off while this request was in flight
        setResult(data);
        setError(null);

        const nowGood = data.confidence >= confidenceThresholdRef.current && data.pose !== 'Unrecognized' && data.is_correct;
        if (nowGood && !wasGoodRef.current) playChime(); // only on the transition into "correct", not every check while held
        wasGoodRef.current = nowGood;
        speak(buildSpokenText(data, confidenceThresholdRef.current, language));
        onPoseResult?.(data);
      } catch (err) {
        console.error('Pose check failed:', err);
        setError('Pose check failed — will retry on the next snapshot.');
      } finally {
        inFlightRef.current = false;
      }
    }

    start();
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      stream?.getTracks().forEach((t) => t.stop());
      stopSpeaking();
    };
  }, [cameraOn]);

  // Timer: starts the moment the camera turns on, resets if the target duration changes
  // (i.e. a parent like PracticeSession switched to the next pose while keeping the
  // camera running). Doesn't force-stop at the target, just keeps counting.
  useEffect(() => {
    setElapsedSeconds(0);
    if (!cameraOn || !targetDurationMinutes) return;
    const intervalId = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(intervalId);
  }, [cameraOn, targetDurationMinutes]);

  useEffect(() => {
    onElapsedChange?.(elapsedSeconds);
  }, [elapsedSeconds, onElapsedChange]);

  const isConfident = result && result.confidence >= confidenceThreshold && result.pose !== 'Unrecognized';
  const isGoodPose = isConfident && result.is_correct;

  function handleCameraButtonClick() {
    if (cameraOn) {
      setCameraOn(false);
    } else {
      setShowConsent(true); // always ask again — turning camera off should mean the app can't see you until you explicitly say so again
    }
  }

  return (
    <div className="pose-check">
      <audio ref={audioRef} style={{ display: 'none' }} />
      {showConsent && (
        <div className="consent-modal__backdrop" role="dialog" aria-modal="true">
          <div className="consent-modal">
            <h3>Turn on your camera?</h3>
            <p>
              While the camera is on, a snapshot is sent roughly every 2.5 seconds to Groq's cloud AI
              service to check your pose in real time. Specifically:
            </p>
            <ul>
              <li>It is <strong>not used to train any model</strong> — not by this app, and not by Groq (per Groq's published data-usage policy).</li>
              <li>This app does not store or log any snapshot anywhere.</li>
              <li>
                Groq does not retain request data by default; their policy allows a temporary
                error/abuse-monitoring log kept for up to 30 days, after which it's gone.
              </li>
              <li>Turning the camera off (any time) stops all of this immediately.</li>
            </ul>
            <div className="consent-modal__actions">
              <button type="button" className="pose-check__btn" onClick={() => setShowConsent(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="pose-check__btn is-active"
                onClick={() => {
                  setCameraOn(true);
                  setShowConsent(false);
                }}
              >
                Yes, turn on camera
              </button>
            </div>
          </div>
        </div>
      )}

      {!voiceUnlocked && TTS_SUPPORTED && (
        <button type="button" className="pose-check__unlock-banner" onClick={unlockVoice}>
          🔊 Tap once to enable spoken guidance — no need to press again after this
        </button>
      )}

      <div className="pose-check__controls">
        <button type="button" onClick={handleCameraButtonClick} className="pose-check__btn">
          {cameraOn ? '📷 Turn camera off' : '📷 Turn camera on'}
        </button>
        <button
          type="button"
          onClick={() => setTtsEnabled((v) => !v)}
          className={`pose-check__btn ${ttsEnabled ? 'is-active' : ''}`}
          disabled={!TTS_SUPPORTED}
          title={TTS_SUPPORTED ? '' : 'Speech synthesis not supported in this browser'}
        >
          {ttsEnabled ? '🔊 Voice on' : '🔇 Voice off'}
        </button>
      </div>

      <div className="pose-check__threshold">
        <label htmlFor="confidence-threshold">
          Confidence threshold: <strong>{confidenceThreshold}%</strong>
        </label>
        <input
          id="confidence-threshold"
          type="range"
          min={30}
          max={95}
          step={5}
          value={confidenceThreshold}
          onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
        />
        <p className="pose-check__threshold-hint">
          How sure the model needs to be before a pose counts as recognized/correct. Lower it if it keeps saying
          "unclear" on poses you know you're doing right; raise it if it's too easily satisfied.
        </p>
      </div>

      {asanaList.length > 0 && (
        <div className="pose-check__picker">
          <label htmlFor="practice-select">Practice along with:</label>
          <select
            id="practice-select"
            value={selectedAsana}
            onChange={(e) => setSelectedAsana(e.target.value)}
          >
            {asanaList.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="pose-check__practice-area">
        {(() => {
          const gif = getAsanaGif(selectedAsana);
          return (
            <div className="pose-check__gif-panel">
              {gif ? (
                <>
                  <img src={gif.src} alt={`${selectedAsana} demo`} className="pose-check__gif-img" />
                  {gif.note && <p className="pose-check__gif-note">{gif.note}</p>}
                </>
              ) : (
                <div className="pose-check__gif-placeholder">No demo GIF available yet for this pose</div>
              )}
            </div>
          );
        })()}

        <div className="pose-check__video-wrap">
          {cameraOn ? (
            <>
              <video ref={videoRef} muted playsInline className="pose-check__video" />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              {status === 'starting' && <div className="pose-check__overlay">Requesting webcam access…</div>}
              {status === 'live' && targetDurationMinutes && (
                <div className={`pose-check__timer ${elapsedSeconds >= targetDurationMinutes * 60 ? 'is-complete' : ''}`}>
                  {formatClock(elapsedSeconds)} / {formatClock(targetDurationMinutes * 60)}
                </div>
              )}
            </>
          ) : (
            <div className="pose-check__overlay pose-check__overlay--static">Camera is off</div>
          )}
        </div>
      </div>

      {error && <p className="pose-check__error">{error}</p>}

      {result && (
        <div className={`pose-check__result ${isGoodPose ? 'is-good' : 'is-bad'}`}>
          <div className="pose-check__result-top">
            <span className={`pose-check__badge ${isGoodPose ? 'is-good' : 'is-bad'}`}>
              {isGoodPose ? 'Correct' : 'Needs adjustment'}
            </span>
            <span className="pose-check__confidence">{result.confidence}% confidence</span>
          </div>
          <div className="pose-check__pose-name">
            {isConfident ? result.pose : 'Pose unclear — not confidently recognized'}
          </div>
          {!isGoodPose && result.correction && (
            <div className="pose-check__correction">
              {result.body_part && <strong>{result.body_part}: </strong>}
              {result.correction}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
