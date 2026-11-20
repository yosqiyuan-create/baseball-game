// Synthesized sound effects (no audio files needed).
let ctx = null, master = null, noiseBuf = null;

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { /* audio unavailable */ }
}

function ready() { return ctx && ctx.state === 'running'; }

function noise(dur, type, freq, q, gain, attack = 0.002) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
  return { f, g, t };
}

function tone(freq, dur, gain, type = 'sine', endFreq = null) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  bat(strength) { // 0..1
    if (!ready()) return;
    noise(0.12 + strength * 0.15, 'bandpass', 2200 + strength * 1200, 1.2, 0.9);
    tone(900 + strength * 500, 0.08, 0.35, 'triangle', 300);
  },
  foulTip() { if (ready()) noise(0.07, 'highpass', 3000, 0.7, 0.5); },
  whoosh() { if (ready()) noise(0.22, 'bandpass', 600, 0.8, 0.35, 0.08); },
  release() { if (ready()) noise(0.12, 'bandpass', 900, 1.0, 0.2, 0.03); },
  mitt() {
    if (!ready()) return;
    noise(0.09, 'lowpass', 1400, 0.8, 0.9);
    tone(140, 0.12, 0.5, 'sine', 70);
  },
  catchBall() { if (ready()) { noise(0.06, 'lowpass', 1100, 0.7, 0.5); } },
  cheer(dur = 3, big = true) {
    if (!ready()) return;
    const n = noise(dur, 'bandpass', 1100, 0.6, big ? 0.55 : 0.3, 0.4);
    n.g.gain.setValueAtTime(big ? 0.55 : 0.3, n.t + 0.4);
    n.g.gain.exponentialRampToValueAtTime(0.0001, n.t + dur);
  },
  groan() { if (ready()) noise(1.2, 'lowpass', 500, 0.5, 0.25, 0.2); },
  ui() { if (ready()) tone(880, 0.06, 0.15, 'square'); },
  call() { if (ready()) tone(520, 0.15, 0.12, 'triangle', 480); },
};
