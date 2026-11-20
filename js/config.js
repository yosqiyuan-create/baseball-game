// Game-wide constants. Units: meters, seconds, km/h where noted.

export const VERSION = '0.1.7';
export const STAGE_LABEL = '段階1：打撃練習';

export const FIELD = {
  moundZ: -18.44,
  baseDist: 27.43,
  fenceLine: 92,     // fence distance at the foul poles
  fenceCenter: 118,  // fence distance at center field
  fenceHeight: 3.5,
};

// Fence distance for a direction. theta: radians, 0 = center field, negative = left field.
export function fenceR(theta) {
  return FIELD.fenceLine + (FIELD.fenceCenter - FIELD.fenceLine) * Math.cos(2 * theta);
}

const b = FIELD.baseDist / Math.SQRT2;
export const BASES = {
  home: { x: 0, z: 0 },
  first: { x: b, z: -b },
  second: { x: 0, z: -2 * b },
  third: { x: -b, z: -b },
};

// Strike zone on the plane z = 0 (home plate front edge).
export const ZONE = { halfW: 0.216, bottom: 0.45, top: 1.05 };
export const BALL_R = 0.037;

export const PHYS = { g: 9.8, dragK: 0.0036, dt: 1 / 120 };

// Practice batter (stage 1 uses one fixed batter).
export const BATTER = { name: '練習 太郎', meet: 60, power: 70, trajectory: 2, speed: 60 };

export function grade(v) {
  if (v >= 90) return 'S';
  if (v >= 80) return 'A';
  if (v >= 70) return 'B';
  if (v >= 60) return 'C';
  if (v >= 50) return 'D';
  if (v >= 40) return 'E';
  if (v >= 20) return 'F';
  return 'G';
}

export const DIFFICULTY = {
  easy:   { label: 'やさしい',   speed: [116, 130], zoneRate: 0.75, breakScale: 0.7,
            pitches: ['straight', 'straight', 'curve', 'change'] },
  normal: { label: 'ふつう',     speed: [132, 146], zoneRate: 0.62, breakScale: 1.0,
            pitches: ['straight', 'straight', 'slider', 'curve', 'fork', 'change'] },
  hard:   { label: 'むずかしい', speed: [142, 156], zoneRate: 0.52, breakScale: 1.2,
            pitches: ['straight', 'straight', 'slider', 'fork', 'shoot', 'sinker', 'curve'] },
};

// brk: [x, y] break at the plate in meters (for a right-handed pitcher, +x = first-base side).
export const PITCH_TYPES = {
  straight: { name: 'ストレート',     speedMul: 1.00, brk: [0.00, 0.04],  arc: 0.10, pow: 2.0 },
  slider:   { name: 'スライダー',     speedMul: 0.89, brk: [0.30, -0.06], arc: 0.14, pow: 2.2 },
  curve:    { name: 'カーブ',         speedMul: 0.78, brk: [0.22, -0.38], arc: 0.35, pow: 1.8 },
  fork:     { name: 'フォーク',       speedMul: 0.88, brk: [0.00, -0.42], arc: 0.14, pow: 3.0 },
  change:   { name: 'チェンジアップ', speedMul: 0.82, brk: [-0.05, -0.18], arc: 0.20, pow: 2.2 },
  shoot:    { name: 'シュート',       speedMul: 0.93, brk: [-0.26, -0.06], arc: 0.12, pow: 2.2 },
  sinker:   { name: 'シンカー',       speedMul: 0.88, brk: [-0.22, -0.30], arc: 0.16, pow: 2.4 },
};

// Defensive positions. speed: running speed m/s, react: reaction time s.
export const FIELDERS = [
  { key: 'P',  name: 'ピッチャー', x: 0,     z: -18.0, speed: 6.2, react: 0.35, infield: true },
  { key: 'C',  name: 'キャッチャー', x: 0,   z: 1.25,   speed: 5.8, react: 0.35, infield: true },
  { key: '1B', name: 'ファースト', x: 21,    z: -24,   speed: 6.6, react: 0.25, infield: true },
  { key: '2B', name: 'セカンド',   x: 9.5,   z: -35,   speed: 6.9, react: 0.25, infield: true },
  { key: '3B', name: 'サード',     x: -20,   z: -24,   speed: 6.6, react: 0.25, infield: true },
  { key: 'SS', name: 'ショート',   x: -9.5,  z: -35,   speed: 6.9, react: 0.25, infield: true },
  { key: 'LF', name: 'レフト',     x: -46,   z: -78,   speed: 7.6, react: 0.30, infield: false },
  { key: 'CF', name: 'センター',   x: 0,     z: -94,   speed: 7.8, react: 0.30, infield: false },
  { key: 'RF', name: 'ライト',     x: 46,    z: -78,   speed: 7.6, react: 0.30, infield: false },
];

export const SETTINGS_DEFAULT = {
  difficulty: 'normal',
  side: 'R',          // batter side: 'R' or 'L'
  cursorSpeed: 1,     // 0 slow, 1 normal, 2 fast
  vibration: true,
};
