// CPU pitch selection and pitch trajectory.
import { ZONE, BALL_R, DIFFICULTY, PITCH_TYPES, FIELD } from './config.js';

const rand = (a, b) => a + Math.random() * (b - a);

export function isStrike(x, y) {
  return Math.abs(x) <= ZONE.halfW + BALL_R && y >= ZONE.bottom - BALL_R && y <= ZONE.top + BALL_R;
}

export function choosePitch(diffKey, balls, strikes) {
  const d = DIFFICULTY[diffKey] || DIFFICULTY.normal;
  const type = d.pitches[Math.floor(Math.random() * d.pitches.length)];
  const pt = PITCH_TYPES[type];
  const base = rand(d.speed[0], d.speed[1]);
  const speedKmh = Math.round(base * pt.speedMul);

  let zoneRate = d.zoneRate;
  if (balls === 3) zoneRate += 0.2;
  if (strikes === 2 && balls < 2) zoneRate -= 0.15;
  if (type === 'fork') zoneRate -= 0.15;
  const inZone = Math.random() < zoneRate;

  // Final crossing point at the plate.
  let x, y;
  if (inZone) {
    x = rand(-ZONE.halfW + 0.04, ZONE.halfW - 0.04);
    y = rand(ZONE.bottom + 0.05, ZONE.top - 0.05);
    if (type === 'fork' || type === 'sinker') y = rand(ZONE.bottom + 0.03, ZONE.bottom + 0.25);
  } else {
    const off = rand(0.07, 0.22);
    const side = type === 'fork' ? 2 : Math.floor(Math.random() * 4);
    if (side === 0) { x = -ZONE.halfW - off; y = rand(ZONE.bottom, ZONE.top); }
    else if (side === 1) { x = ZONE.halfW + off; y = rand(ZONE.bottom, ZONE.top); }
    else if (side === 2) { x = rand(-ZONE.halfW, ZONE.halfW); y = ZONE.bottom - off; }
    else { x = rand(-ZONE.halfW, ZONE.halfW); y = ZONE.top + off * 0.8; }
  }

  const s = d.breakScale;
  const brk = { x: pt.brk[0] * s, y: pt.brk[1] * s };
  const release = { x: -0.45, y: 1.78, z: FIELD.moundZ + 1.3 };
  const v = speedKmh / 3.6;
  const dist = Math.hypot(release.z, release.y - y, release.x - x);
  const T = dist / (v * 0.95); // slight slowdown on the way

  return {
    type, name: pt.name, speedKmh,
    target: { x, y }, brk, release, T,
    arc: pt.arc, pow: pt.pow,
    strike: isStrike(x, y),
  };
}

// Ball position t seconds after release. Works past the plate (s > 1) for the catcher.
export function pitchPosition(p, t, out) {
  const s = t / p.T;
  const ax = p.target.x - p.brk.x;
  const ay = p.target.y - p.brk.y;
  const sp = Math.pow(Math.max(s, 0), p.pow);
  out.x = p.release.x + (ax - p.release.x) * s + p.brk.x * sp;
  out.y = p.release.y + (ay - p.release.y) * s + p.brk.y * sp + p.arc * 4 * s * (1 - s);
  out.z = p.release.z * (1 - s);
  return out;
}
