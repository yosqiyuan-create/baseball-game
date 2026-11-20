// Swing evaluation, batted-ball flight and play resolution.
import { BALL_R, PHYS, FIELD, fenceR, BASES, FIELDERS } from './config.js?v=0.1.8';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const D2R = Math.PI / 180;

export const SWING = {
  meet:  { label: 'ミート', window: 0.13, size: 1.0,  power: 0.86 },
  power: { label: '強振',   window: 0.11, size: 0.78, power: 1.0 },
  bunt:  { label: 'バント', window: 0.30, size: 1.3,  power: 0 },
};

// Half width / half height of the meet cursor in meters.
export function cursorSize(mode, meet) {
  const w = (0.062 + meet * 0.0006) * SWING[mode].size;
  return { w, h: w * 0.72 };
}

/**
 * dt: swing time minus plate-arrival time (negative = early).
 * sideSign: +1 right-handed batter, -1 left-handed.
 */
export function evaluateSwing({ mode, cursor, ball, dt, batter, sideSign }) {
  const cfg = SWING[mode];
  const { w, h } = cursorSize(mode, batter.meet);
  const tn = dt / cfg.window;
  if (Math.abs(tn) > 1) return { contact: false };

  const nx = (ball.x - cursor.x) / (w + BALL_R);
  const ny = (ball.y - cursor.y) / (h + BALL_R);
  const nd = Math.max(Math.abs(nx), Math.abs(ny));
  if (nd > 1.18) return { contact: false };
  if (nd > 1.0) return { contact: true, foulTip: true };

  const q = clamp(1 - Math.hypot(nx, ny * 0.6) / 1.25, 0, 1);
  const tq = 1 - Math.pow(Math.abs(tn), 2.2);

  if (mode === 'bunt') {
    return {
      contact: true, q, tq,
      v0: rand(7, 13) * (0.6 + 0.4 * q),
      launch: clamp(-18 + ny * 22 + rand(-4, 4), -35, 60),
      spray: nx * 22 * sideSign + rand(-14, 14),
      bunt: true,
    };
  }

  const vmax = (35 + batter.power * 0.2) * cfg.power;
  const v0 = vmax * (0.5 + 0.5 * Math.pow(q, 0.7) * tq);
  const trajBase = [0, 5, 11, 16, 21][batter.trajectory] || 11;
  const launch = clamp(trajBase + 3 + ny * 32 + rand(-4, 4), -25, 75);
  const spray = tn * 55 * sideSign + rand(-5, 5);
  return { contact: true, v0, launch, spray, q, tq };
}

const isFair = (p) => p.z <= 0.05 && Math.abs(Math.atan2(p.x, -p.z)) <= Math.PI / 4 + 0.004;

// Integrates the batted ball. Returns sampled points every PHYS.dt seconds.
export function simulateBattedBall(start, v0, launchDeg, sprayDeg) {
  const L = launchDeg * D2R, S = sprayDeg * D2R;
  let x = start.x, y = start.y, z = start.z;
  let vx = v0 * Math.cos(L) * Math.sin(S);
  let vy = v0 * Math.sin(L);
  let vz = -v0 * Math.cos(L) * Math.cos(S);
  const dt = PHYS.dt, k = PHYS.dragK, g = PHYS.g;
  const points = [{ t: 0, x, y, z }];
  let t = 0, firstLand = -1, homeRun = false, hrIndex = -1, maxH = y, landFoul = false;

  while (t < 10) {
    const sp = Math.hypot(vx, vy, vz);
    vx += -k * sp * vx * dt;
    vy += (-g - k * sp * vy) * dt;
    vz += -k * sp * vz * dt;
    x += vx * dt; y += vy * dt; z += vz * dt;
    t += dt;
    maxH = Math.max(maxH, y);

    const r = Math.hypot(x, z);
    const th = Math.atan2(x, -z);
    const fairDir = z < 0 && Math.abs(th) <= Math.PI / 4;

    if (fairDir && r >= fenceR(th)) {
      if (!homeRun && firstLand < 0 && y > FIELD.fenceHeight) {
        homeRun = true; hrIndex = points.length;
      } else if (!homeRun) {
        // Bounce off the wall.
        const nx = x / r, nz = z / r;
        const vr = vx * nx + vz * nz;
        if (vr > 0) { vx -= 1.5 * vr * nx; vz -= 1.5 * vr * nz; vx *= 0.6; vz *= 0.6; }
        const rr = fenceR(th) - 0.1;
        x = nx * rr; z = nz * rr;
      }
    }
    if (homeRun && (y < 0 || r > fenceR(th) + 30)) { points.push({ t, x, y: Math.max(y, 0), z }); break; }

    if (y <= 0 && vy < 0) {
      y = 0;
      if (firstLand < 0) {
        firstLand = points.length;
        landFoul = !isFair({ x, z }) && r > 28;
      }
      if (-vy > 1.5) {
        vy = -vy * 0.4; vx *= 0.8; vz *= 0.8;
      } else {
        vy = 0;
        const gs = Math.hypot(vx, vz);
        const ns = Math.max(0, gs - 4.0 * dt);
        if (gs > 0) { vx *= ns / gs; vz *= ns / gs; }
        if (ns < 0.3) { points.push({ t, x, y, z }); break; }
      }
    }
    points.push({ t, x, y, z });
    if (firstLand >= 0 && landFoul && t - points[firstLand].t > 0.8) break;
    if (firstLand >= 0 && !isFair({ x, z }) && r > 40 && y === 0 && t - points[firstLand].t > 1.2) break;
  }
  return { points, firstLand, homeRun, hrIndex, maxH, launch: launchDeg, v0 };
}

function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function groundSpeed(points, i) {
  const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
  const dt = b.t - a.t || PHYS.dt;
  return Math.hypot(b.x - a.x, b.z - a.z) / dt;
}

/**
 * Decides what happens to a batted ball.
 * Returns { kind, label, bases, fielder, catchIndex, catchT, catchPos, throwTo, throwDur, decisiveT, endT, runnerTimes }
 */
export function resolvePlay(sim, batterSpeed) {
  const P = sim.points;
  const last = P[P.length - 1];
  const t1 = 4.15 + (60 - batterSpeed) * 0.012;
  const runnerTimes = [t1, t1 + 3.7, t1 + 7.4, t1 + 11.1];

  if (sim.homeRun) {
    const hrT = P[sim.hrIndex].t;
    return { kind: 'homerun', label: 'ホームラン！', bases: 4, decisiveT: hrT,
      endT: Math.min(last.t, hrT + 2.2) + 1.4, runnerTimes };
  }

  // Fair or foul.
  let fair;
  if (sim.firstLand < 0) fair = isFair(last);
  else {
    const lp = P[sim.firstLand];
    if (Math.hypot(lp.x, lp.z) >= 28) fair = isFair(lp);
    else {
      const j = P.findIndex((p, i) => i >= sim.firstLand && Math.hypot(p.x, p.z) >= 27.4);
      fair = isFair(j >= 0 ? P[j] : last);
    }
  }

  // Find the earliest point a fielder can reach.
  let best = null;
  for (let i = 1; i < P.length && !best; i++) {
    const p = P[i];
    if (p.y > 2.4) continue;
    const inAir = sim.firstLand < 0 || i < sim.firstLand;
    if (!fair && !inAir) break;
    if (!fair && Math.hypot(p.x, p.z) > 80) continue;
    const gs = inAir ? 0 : groundSpeed(P, i);
    let bestF = null;
    FIELDERS.forEach((f, fi) => {
      const d = dist2(f, p);
      let reach = f.react + d / f.speed;
      if (!inAir && gs > 22 && d > 1.2) reach += (gs - 22) * 0.025 * d; // hard grounders are tough to reach
      if (reach <= p.t && (!bestF || reach < bestF.reach)) bestF = { fi, reach };
    });
    if (bestF) best = { i, fi: bestF.fi, reach: bestF.reach, inAir };
  }

  if (!fair) {
    if (best && best.inAir) {
      const p = P[best.i];
      return { kind: 'out', label: `${FIELDERS[best.fi].name}ファウルフライ`, bases: 0,
        fielder: best.fi, catchIndex: best.i, catchT: p.t, catchPos: { x: p.x, y: p.y, z: p.z },
        decisiveT: p.t, endT: p.t + 1.3, runnerTimes };
    }
    const fl = sim.firstLand >= 0 ? P[sim.firstLand].t : last.t;
    return { kind: 'foul', label: 'ファウル', bases: 0, decisiveT: Math.min(fl, 2.5),
      endT: Math.min(last.t, fl + 1.0) + 0.5, runnerTimes };
  }

  // Nobody reached it before it stopped: nearest fielder picks it up at the end.
  if (!best) {
    let fi = 0, bd = Infinity;
    FIELDERS.forEach((f, k) => { const d = dist2(f, last); if (d < bd) { bd = d; fi = k; } });
    const f = FIELDERS[fi];
    const reach = Math.max(last.t, f.react + bd / f.speed);
    best = { i: P.length - 1, fi, reach, inAir: false, lateT: reach };
  }

  const p = P[best.i];
  const catchT = best.lateT ?? p.t;
  const catchPos = { x: p.x, y: Math.max(p.y, 0.6), z: p.z };
  const f = FIELDERS[best.fi];
  const base = { fielder: best.fi, catchIndex: best.i, catchT, catchPos, runnerTimes };

  if (best.inAir) {
    const liner = sim.maxH < 7 && sim.launch < 20;
    const label = liner ? `${f.name}ライナー` : `${f.name}フライ`;
    return { ...base, kind: 'out', label, bases: 0, decisiveT: catchT, endT: catchT + 1.4 };
  }

  if (f.infield) {
    // Throw to first base.
    let throwDur, carry = false;
    const bag = { x: BASES.first.x, z: BASES.first.z };
    if (f.key === '1B' && dist2(catchPos, bag) < 9) { throwDur = dist2(catchPos, bag) / 6.5; carry = true; }
    else throwDur = 0.5 + dist2(catchPos, bag) / 32;
    const arrive = catchT + throwDur;
    const out = arrive < t1;
    const label = out ? `${f.name}ゴロ` : '内野安打';
    return { ...base, kind: out ? 'out' : 'hit', label, bases: out ? 0 : 1,
      throwTo: { x: bag.x, y: 1.3, z: bag.z }, throwDur, carry,
      decisiveT: Math.max(arrive, out ? arrive : t1), endT: Math.max(arrive, t1) + 1.2, ground: true };
  }

  // Outfield hit: how many bases?
  const toBase = (b) => catchT + 1.0 + dist2(catchPos, b) / 26;
  let bases = 1;
  if (toBase(BASES.second) > runnerTimes[1] - 0.4) bases = 2;
  if (bases === 2 && toBase(BASES.third) > runnerTimes[2] - 0.2) bases = 3;
  const labels = { 1: `${f.name}前ヒット`, 2: 'ツーベースヒット！', 3: 'スリーベースヒット！' };
  if (bases === 1 && Math.hypot(catchPos.x, catchPos.z) > 75) labels[1] = 'ヒット';
  const landT = sim.firstLand >= 0 ? P[sim.firstLand].t : catchT;
  const cutTarget = bases >= 2 ? BASES.third : BASES.second;
  return { ...base, kind: 'hit', label: labels[bases], bases,
    throwTo: { x: cutTarget.x * 0.5, y: 1.4, z: cutTarget.z * 0.6 }, throwDur: 1.2,
    decisiveT: Math.min(landT, catchT), endT: catchT + 2.2 };
}
