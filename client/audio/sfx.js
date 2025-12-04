// Stack: Tiny Web Audio helper for jump/hit feedback beeps without external assets.
const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
let ctx = null;

function ensureContext() {
  if (ctx) {
    return ctx;
  }
  if (!AudioContextClass) {
    return null;
  }
  ctx = new AudioContextClass();
  return ctx;
}

async function playTone({ startFreq, endFreq, duration = 0.18, type = 'sine', gain = 0.15 }) {
  const audioCtx = ensureContext();
  if (!audioCtx) {
    return;
  }
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
  amp.gain.setValueAtTime(gain, audioCtx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(amp).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

export function playJump() {
  playTone({ startFreq: 320, endFreq: 540, duration: 0.2, type: 'triangle', gain: 0.12 });
}

export function playAttack() {
  playTone({ startFreq: 520, endFreq: 220, duration: 0.15, type: 'sawtooth', gain: 0.18 });
}

export function playDamage() {
  playTone({ startFreq: 180, endFreq: 90, duration: 0.25, type: 'square', gain: 0.2 });
}
