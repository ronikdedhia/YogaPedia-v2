import { useEffect, useRef, useState } from 'react';
import { getVoiceId } from './preferences.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
export const TTS_SUPPORTED = typeof window !== 'undefined' && 'speechSynthesis' in window;

// Best-effort: sets the locale hint so the OS/browser picks a matching voice if one is
// installed. If no Hindi voice exists on the device, the browser falls back to whatever
// default voice it has — same "voice quality depends on the browser/OS" caveat that
// already applies to English (see ARCHITECTURE.md §8), just more likely to bite for a
// language with less universal OS voice support.
const UTTERANCE_LANGS = { en: 'en-US', hi: 'hi-IN' };

// Shared TTS engine (ElevenLabs with browser speechSynthesis fallback) — extracted out of
// PoseCheck.jsx so Meditation Zone can reuse the exact same voice pipeline (ElevenLabs
// config check, autoplay-unlock trick, speak-one-at-a-time queuing) instead of duplicating
// it. Behavior is unchanged from the original PoseCheck.jsx implementation.
export function useSpeech({ ttsEnabled, language = 'en' }) {
  const [voiceUnlocked, setVoiceUnlocked] = useState(false);
  const [elevenLabsEnabled, setElevenLabsEnabled] = useState(false);

  const audioElRef = useRef(null);
  const ttsEnabledRef = useRef(ttsEnabled);
  const voiceUnlockedRef = useRef(voiceUnlocked);
  const elevenLabsEnabledRef = useRef(elevenLabsEnabled);
  const languageRef = useRef(language);
  const isSpeakingRef = useRef(false);
  const pendingTextRef = useRef(null);
  const lastQueuedRef = useRef('');

  useEffect(() => {
    fetch(`${API_BASE}/api/tts-status`)
      .then((r) => r.json())
      .then((data) => setElevenLabsEnabled(Boolean(data.enabled)))
      .catch(() => setElevenLabsEnabled(false)); // server unreachable/older — just use browser TTS
  }, []);

  useEffect(() => {
    elevenLabsEnabledRef.current = elevenLabsEnabled;
  }, [elevenLabsEnabled]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
    if (!ttsEnabled) stopSpeaking();
  }, [ttsEnabled]);

  useEffect(() => {
    voiceUnlockedRef.current = voiceUnlocked;
  }, [voiceUnlocked]);

  function getAudioEl() {
    if (!audioElRef.current) audioElRef.current = new Audio();
    return audioElRef.current;
  }

  function stopSpeaking() {
    pendingTextRef.current = null;
    isSpeakingRef.current = false;
    lastQueuedRef.current = '';
    if (TTS_SUPPORTED) window.speechSynthesis.cancel();
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.removeAttribute('src');
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

  function speakViaBrowser(text) {
    if (!TTS_SUPPORTED) {
      onSpeechDone();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = UTTERANCE_LANGS[languageRef.current] || 'en-US';
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
      const audio = getAudioEl();
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

  // Speak the current instruction fully before starting the next one. If the source
  // changes mid-sentence, only the LATEST instruction is queued to speak next — stale
  // intermediate ones are dropped rather than read out in a backlog.
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

  // Call from inside a real user-gesture click handler (e.g. a "start"/consent button) —
  // satisfies the browser's audio-gesture requirement for both speechSynthesis and the
  // <audio> element ElevenLabs playback uses, unlocking all later auto-triggered speech
  // for the rest of the session with no further clicks needed.
  function unlockVoice() {
    if (TTS_SUPPORTED) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }
    const audio = getAudioEl();
    audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    audio.play().catch(() => {});
    setVoiceUnlocked(true);
  }

  return { speak, unlockVoice, stopSpeaking, voiceUnlocked, elevenLabsEnabled };
}
