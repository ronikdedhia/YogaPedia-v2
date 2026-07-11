// Meditation Zone background sounds — synthesized live via the Web Audio API rather than
// bundled recordings (no licensing risk, no assets to host), same technique as PoseCheck.jsx's
// programmatic pose-correct chime, just longer-running and more varied per preset.

function makeNoiseBuffer(ctx, seconds, pink = false) {
  const bufferSize = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  if (!pink) {
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  // Paul Kellet's refined pink-noise approximation — simple IIR filter over white noise,
  // gives a softer/deeper hiss than raw white noise (closer to rustling leaves/distant surf).
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
  }
  return buffer;
}

function playLoopedNoise(ctx, { pink = false, filterFreq = 1000, filterType = 'lowpass', volume = 0.12 } = {}) {
  const buffer = makeNoiseBuffer(ctx, 4, pink);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
  return () => {
    source.stop();
    [source, filter, gain].forEach((n) => n.disconnect());
  };
}

function playOcean(ctx) {
  const buffer = makeNoiseBuffer(ctx, 4, false);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  const gain = ctx.createGain();
  gain.gain.value = 0.1;
  // Slow LFO on the gain gives the noise a rolling-wave swell instead of a flat hiss.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.15;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.06;
  lfo.connect(lfoGain).connect(gain.gain);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
  lfo.start();
  return () => {
    source.stop();
    lfo.stop();
    [source, filter, gain, lfo, lfoGain].forEach((n) => n.disconnect());
  };
}

function playDrone(ctx) {
  const gain = ctx.createGain();
  gain.gain.value = 0.08;
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 110;
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 110 * 1.005; // slight detune for a gentle beat/shimmer, not a flat tone
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);
  osc1.start();
  osc2.start();
  return () => {
    osc1.stop();
    osc2.stop();
    [osc1, osc2, gain].forEach((n) => n.disconnect());
  };
}

function playChimes(ctx) {
  const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];
  const intervalId = setInterval(() => {
    if (Math.random() > 0.5) return; // sparse, not every tick
    const freq = notes[Math.floor(Math.random() * notes.length)];
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.5);
  }, 1500);
  return () => clearInterval(intervalId);
}

function playBell(ctx) {
  function strike() {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 3);
  }
  strike();
  const intervalId = setInterval(strike, 20000);
  return () => clearInterval(intervalId);
}

function playFocusTone(ctx) {
  const gain = ctx.createGain();
  gain.gain.value = 0.05;
  const oscL = ctx.createOscillator();
  oscL.type = 'sine';
  oscL.frequency.value = 200;
  const oscR = ctx.createOscillator();
  oscR.type = 'sine';
  oscR.frequency.value = 210; // a few Hz apart — steady, focus-friendly beat, not a chord
  const panL = ctx.createStereoPanner();
  panL.pan.value = -1;
  const panR = ctx.createStereoPanner();
  panR.pan.value = 1;
  oscL.connect(panL).connect(gain);
  oscR.connect(panR).connect(gain);
  gain.connect(ctx.destination);
  oscL.start();
  oscR.start();
  return () => {
    oscL.stop();
    oscR.stop();
    [oscL, oscR, panL, panR, gain].forEach((n) => n.disconnect());
  };
}

function playHeartbeat(ctx) {
  function thump() {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 60;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }
  thump();
  const intervalId = setInterval(thump, 1000);
  return () => clearInterval(intervalId);
}

// Each entry's create(ctx) starts the sound and returns a stop() cleanup function.
export const AMBIENT_SOUNDS = [
  { key: 'rain', label: 'Rain', icon: '🌧️', create: (ctx) => playLoopedNoise(ctx, { pink: false, filterFreq: 1000, volume: 0.12 }) },
  { key: 'ocean', label: 'Ocean', icon: '🌊', create: playOcean },
  { key: 'forest', label: 'Forest', icon: '🌲', create: (ctx) => playLoopedNoise(ctx, { pink: true, filterFreq: 2000, volume: 0.18 }) },
  { key: 'drone', label: 'Soft Drone', icon: '🎐', create: playDrone },
  { key: 'chimes', label: 'Wind Chimes', icon: '🎶', create: playChimes },
  { key: 'bell', label: 'Meditation Bell', icon: '🔔', create: playBell },
  { key: 'focus', label: 'Focus Tone', icon: '🎧', create: playFocusTone },
  { key: 'heartbeat', label: 'Heartbeat', icon: '❤️', create: playHeartbeat },
];
