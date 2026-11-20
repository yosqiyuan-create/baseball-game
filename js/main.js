// Stage 1: batting practice. Game loop, state machine, camera and HUD.
import * as THREE from 'three';
import {
  VERSION, STAGE_LABEL, ZONE, BALL_R, BASES, FIELDERS, BATTER, DIFFICULTY, PHYS,
  SETTINGS_DEFAULT, grade,
} from './config.js?v=0.1.8';
import { buildField } from './field.js?v=0.1.8';
import { makePlayer, setBatAngle, animateRun } from './characters.js?v=0.1.8';
import { choosePitch, pitchPosition } from './pitching.js?v=0.1.8';
import { SWING, cursorSize, evaluateSwing, simulateBattedBall, resolvePlay } from './hitting.js?v=0.1.8';
import { Input } from './input.js?v=0.1.8';
import { unlockAudio, sfx } from './audio.js?v=0.1.8';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- saved data
const SAVE_KEY = 'baseball-game-stage1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { saved = {}; }
const settings = { ...SETTINGS_DEFAULT, ...(saved.settings || {}) };
const emptyStats = () => ({ pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, so: 0, bb: 0 });
const stats = { ...emptyStats(), ...(saved.stats || {}) };
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ settings, stats })); } catch (e) { /* storage unavailable */ }
}

// ---------------------------------------------------------------- renderer / scene
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fcdf2);
scene.fog = new THREE.Fog(0x8fcdf2, 180, 480);
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 1200);

scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-30, 60, 40);
scene.add(sun);

buildField(scene, renderer);

// ---------------------------------------------------------------- players
const DEF_COLORS = { uniform: 0xc0392b, cap: 0x7b1d14, pants: 0xf0f0f0 };
const BAT_COLORS = { uniform: 0x2e86de, cap: 0x1b3a6b, pants: 0xf0f0f0 };

const fielders = FIELDERS.map((f, i) => {
  const pl = makePlayer(DEF_COLORS, { glove: true });
  scene.add(pl.root);
  return pl;
});
const pitcher = fielders[0];
const catcher = fielders[1];
const CATCHER_GLOVE_HOME = catcher.handL.position.clone();

function resetFielders() {
  fielders.forEach((pl, i) => {
    const f = FIELDERS[i];
    pl.root.position.set(f.x, i === 0 ? 0.25 : 0, f.z);
    pl.root.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
    pl.rig.rotation.set(0, 0, 0);
    pl.rig.scale.set(1, 1, 1);
    pl.armPivot.rotation.set(0, 0, 0);
    animateRun(pl, 0, false);
  });
  catcher.root.rotation.y = Math.PI;
  catcher.rig.scale.set(1, 0.6, 1);
  catcher.handL.position.copy(CATCHER_GLOVE_HOME);
}

const batter = makePlayer(BAT_COLORS, { bat: true });
scene.add(batter.root);
const BAT_PIVOT_HOME = batter.batPivot.position.clone();
const sideSign = () => (settings.side === 'R' ? 1 : -1);
const batterHome = () => ({ x: settings.side === 'R' ? -0.78 : 0.78, z: 0.05 });

function placeBatter() {
  const R = settings.side === 'R';
  const h = batterHome();
  batter.root.position.set(h.x, 0, h.z);
  batter.root.rotation.set(0, R ? Math.PI / 2 : -Math.PI / 2, 0);
  batter.root.scale.set(R ? 1 : -1, 1, 1);
  batter.rig.rotation.set(0, 0, 0);
  batter.batPivot.visible = true;
  batter.batPivot.position.copy(BAT_PIVOT_HOME);
  setBatAngle(batter, -15, 55);
  animateRun(batter, 0, false);
}

// ---------------------------------------------------------------- strike zone, cursor, ball
const overlayMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
const zoneGroup = new THREE.Group();
{
  const w = ZONE.halfW, b = ZONE.bottom, t = ZONE.top;
  const pts = [];
  const seg = (x1, y1, x2, y2) => pts.push(new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x2, y2, 0));
  seg(-w, b, w, b); seg(w, b, w, t); seg(w, t, -w, t); seg(-w, t, -w, b);
  const lm = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false });
  const frame = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lm);
  frame.renderOrder = 10;
  zoneGroup.add(frame);
  const gp = [];
  const gseg = (x1, y1, x2, y2) => gp.push(new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x2, y2, 0));
  for (const f of [1 / 3, 2 / 3]) { gseg(-w + 2 * w * f, b, -w + 2 * w * f, t); gseg(-w, b + (t - b) * f, w, b + (t - b) * f); }
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gp),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthTest: false }));
  grid.renderOrder = 10;
  zoneGroup.add(grid);
}
scene.add(zoneGroup);

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  return s;
}
const cursorGroup = new THREE.Group();
const cursorFill = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.5, 0.5, 0.18)), overlayMat(0xffe14d, 0.3));
const cursorEdge = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(roundedRect(0.5, 0.5, 0.18).getPoints(8).map((p) => new THREE.Vector3(p.x, p.y, 0))),
  new THREE.LineBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95, depthTest: false }));
const cursorCore = new THREE.Mesh(new THREE.CircleGeometry(0.016, 16), overlayMat(0xff3b30, 0.9));
[cursorFill, cursorEdge, cursorCore].forEach((m) => { m.renderOrder = 11; cursorGroup.add(m); });
cursorGroup.position.z = 0.01;
scene.add(cursorGroup);

const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12),
  new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x444444 }));
scene.add(ball);
const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
ballShadow.rotation.x = -Math.PI / 2;
scene.add(ballShadow);
const marker = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.048, 20), overlayMat(0xffffff, 0.95));
marker.renderOrder = 12;
scene.add(marker);
marker.visible = false;
function setBallVisible(v) { ball.visible = v; ballShadow.visible = v; }
function setBallPos(p) {
  ball.position.set(p.x, p.y, p.z);
  // Keep the ball readable when it is far from the camera.
  ball.scale.setScalar(Math.max(1, camera.position.distanceTo(ball.position) / 22));
  ballShadow.position.set(p.x, 0.02, p.z);
  ballShadow.scale.setScalar(clamp(1 - p.y / 40, 0.4, 1) * (1 + p.y * 0.02));
}

// ---------------------------------------------------------------- camera
const BAT_CAM = { pos: new THREE.Vector3(0, 1.45, 3.0), look: new THREE.Vector3(0, 0.74, -18.4) };
const camLook = BAT_CAM.look.clone();
let baseFov = 42;
const BAT_CAM_PORTRAIT = { pos: new THREE.Vector3(0, 1.75, 3.4), look: new THREE.Vector3(0, 0.7, -18.4) };
function resetCamera() {
  const c = camera.aspect < 1 ? BAT_CAM_PORTRAIT : BAT_CAM;
  camera.position.copy(c.pos);
  camLook.copy(c.look);
  camera.fov = baseFov;
  camera.updateProjectionMatrix();
  camera.lookAt(camLook);
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  baseFov = camera.aspect < 1 ? 64 : camera.aspect < 1.45 ? 50 : 42;
  camera.updateProjectionMatrix();
  if (state !== 'play' && state !== 'result') resetCamera();
}

// ---------------------------------------------------------------- HUD
function dots(el, n, max) { el.innerHTML = Array.from({ length: max }, (_, i) => `<span class="${i < n ? 'on' : ''}"></span>`).join(''); }
function updateCountHUD() { dots($('dots-b'), count.b, 3); dots($('dots-s'), count.s, 2); dots($('dots-o'), count.o, 2); }
function avgText(h, ab) { if (!ab) return '.000'; const a = h / ab; return a >= 1 ? '1.000' : '.' + String(Math.round(a * 1000)).padStart(3, '0'); }
function updateStatsHUD() {
  $('stats').innerHTML = `打率 <span class="avg">${avgText(stats.h, stats.ab)}</span><br>`
    + `${stats.pa}打席 ${stats.h}安打 ${stats.hr}本塁打<br>三振 ${stats.so}　四球 ${stats.bb}`;
}
function g(v) { const k = grade(v); return `<span class="g g${k}">${k}</span>`; }
function updateBatterInfo() {
  $('batter-info').innerHTML = `<b>${BATTER.name}</b>（${settings.side === 'R' ? '右打ち' : '左打ち'}）<br>`
    + `弾道 ${BATTER.trajectory}　ミート${g(BATTER.meet)}　パワー${g(BATTER.power)}<br>`
    + `相手：${DIFFICULTY[settings.difficulty].label}`;
}
function updateModeHUD() {
  const m = effMode();
  const el = $('mode-label');
  el.textContent = SWING[m].label + (m === 'bunt' ? '（ボールに当てる）' : '');
  el.className = m;
  $('btn-mode').textContent = swingMode === 'power' ? 'ミート' : '強振';
  $('btn-mode').classList.toggle('on', swingMode === 'power');
  $('btn-bunt').classList.toggle('on', buntOn);
  const { w, h } = cursorSize(m, BATTER.meet);
  cursorGroup.scale.set(w * 2, h * 2, 1);
  cursorCore.scale.set(1 / (w * 2) * 0.12, 1 / (h * 2) * 0.12, 1);
  cursorCore.material.color.set(m === 'bunt' ? 0x00b894 : 0xff3b30);
  cursorFill.material.color.set(m === 'power' ? 0xff7a59 : m === 'bunt' ? 0x55efc4 : 0xffe14d);
  cursorEdge.material.color.copy(cursorFill.material.color);
}
function showPitchInfo(p) {
  $('pitch-info').innerHTML = `${p.name}<span class="spd">${p.speedKmh}km/h</span>`;
  $('pitch-info').classList.add('show');
}
function hidePitchInfo() { $('pitch-info').classList.remove('show'); }
function restartAnim(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function showCall(text, color = '#fff') { const el = $('call'); el.textContent = text; el.style.color = color; restartAnim(el, 'show'); }
function showMessage(text, cls, sub = '') {
  const el = $('message');
  el.className = cls;
  el.innerHTML = text + (sub ? `<span class="sub">${sub}</span>` : '');
  restartAnim(el, 'show');
}
function hideMessage() { $('message').className = ''; }
let toastTimer = 0;
function toast(text) { const el = $('toast'); el.textContent = text; el.classList.add('show'); toastTimer = 2.5; }
function updateGuide() {
  const d = input.lastDevice;
  const guide = $('guide');
  if (d === 'gamepad') guide.innerHTML = '<kbd>Ⓐ</kbd>打つ　<kbd>R1</kbd>ミート/強振　<kbd>Ⓨ</kbd>バント　<kbd>≡</kbd>メニュー<br>左スティック：カーソル';
  else if (d === 'keyboard') guide.innerHTML = '<kbd>Space</kbd>打つ　<kbd>Shift</kbd>ミート/強振　<kbd>B</kbd>バント　<kbd>Esc</kbd>メニュー<br>矢印キー：カーソル';
  else guide.innerHTML = '';
  guide.classList.toggle('hidden', d === 'touch');
  $('touch-controls').classList.toggle('hidden', d !== 'touch' || state === 'title');
}
function updatePadStatus() {
  const pad = input.getPad();
  $('pad-status').textContent = pad
    ? `コントローラー：接続中（${pad.id.slice(0, 40)}）`
    : 'コントローラー：未接続（つないだ後、どれかのボタンを押すと認識します）';
}

// ---------------------------------------------------------------- input
const input = new Input(canvas);
input.onDeviceChange = () => { updateGuide(); };
input.onGamepadConnect = (id, on) => {
  toast(on ? 'コントローラーを接続しました' : 'コントローラーが外れました');
  updatePadStatus();
};
const unlock = () => unlockAudio();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

function bindTouch(id, actions) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    unlockAudio();
    input.setDevice('touch');
    actions.forEach((a) => input.trigger(a));
    el.classList.add('pressed');
  });
  const up = () => el.classList.remove('pressed');
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
}
bindTouch('btn-swing', ['swing', 'confirm']);
bindTouch('btn-mode', ['mode']);
bindTouch('btn-bunt', ['bunt']);
bindTouch('btn-menu', ['menu']);
$('btn-start').addEventListener('click', () => { unlockAudio(); startGame(); });

// ---------------------------------------------------------------- game state
let state = 'title';
let stateBeforeMenu = null;
const count = { b: 0, s: 0, o: 0 };
let swingMode = 'meet';
let buntOn = false;
const effMode = () => (buntOn ? 'bunt' : swingMode);
const cursor = { x: 0, y: (ZONE.bottom + ZONE.top) / 2 };

let pitch = null, pitchT = 0, swing = null, hitLaunched = false, pitchJudged = false, mittPlayed = false;
let readyT = 0, windT = 0, callT = 0, resultT = 0, resultMin = 0, markerT = 0;
let swingAnimT = -1, followT = -1;
let play = null;
let clock = 0;
const WINDUP = 0.95;
const ballPos = new THREE.Vector3();

function startGame() {
  if (state !== 'title') return;
  $('title-screen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  state = 'ready';
  updateGuide();
  nextBatter(true);
  toast(window.innerHeight > window.innerWidth ? '横向きにすると遊びやすくなります' : 'カーソルをボールに合わせて打とう！');
}

function startReady(delay) {
  state = 'ready';
  readyT = delay;
  setBallVisible(false);
  pitcher.armPivot.rotation.set(0, 0, 0);
  pitcher.rig.rotation.set(0, 0, 0);
  catcher.handL.position.copy(CATCHER_GLOVE_HOME);
}

function beginWindup() {
  pitch = choosePitch(settings.difficulty, count.b, count.s);
  state = 'windup';
  windT = 0; swing = null; hitLaunched = false; pitchJudged = false; mittPlayed = false;
  marker.visible = false;
}

function release() {
  state = 'pitch';
  pitchT = 0;
  setBallVisible(true);
  followT = 0;
  sfx.release();
  showPitchInfo(pitch);
}

function doSwing() {
  const mode = swingMode;
  const dt = pitchT - pitch.T;
  const res = evaluateSwing({ mode, cursor: { ...cursor }, ball: pitch.target, dt, batter: BATTER, sideSign: sideSign() });
  swing = { ts: pitchT, res, mode };
  swingAnimT = 0;
  sfx.whoosh();
  if (res.contact && dt >= 0) contact(res);
}

function contact(res) {
  if (hitLaunched) return;
  hitLaunched = true;
  if (res.foulTip) {
    sfx.foulTip();
    if (settings.vibration) input.rumble(0.3, 0.3, 60);
    applyPitchResult('foul');
    return;
  }
  const from = { x: pitch.target.x, y: pitch.target.y, z: 0 };
  const sim = simulateBattedBall(from, res.v0, res.launch, res.spray);
  const out = resolvePlay(sim, BATTER.speed);
  const strength = clamp((res.v0 - 12) / 36, 0, 1);
  sfx.bat(strength);
  if (settings.vibration) input.rumble(0.4 + strength * 0.6, 0.5, 90 + strength * 120);
  hidePitchInfo();
  play = { sim, out, t: 0, msgShown: false, res };
  state = 'play';
  camera.fov = Math.max(baseFov, 50);
  camera.updateProjectionMatrix();
}

function applyPitchResult(kind) {
  if (kind === 'ball') {
    count.b++;
    if (count.b >= 4) { endAtBat('walk'); return; }
    showCall('ボール', '#81ecec');
  } else if (kind === 'strike' || kind === 'swingMiss') {
    count.s++;
    if (count.s >= 3) { endAtBat('strikeout', kind === 'strike' ? '見逃し三振' : '空振り三振'); return; }
    showCall(kind === 'strike' ? 'ストライク' : '空振り', '#ffeaa7');
  } else if (kind === 'foul') {
    if (count.s < 2) count.s++;
    showCall('ファウル', '#ffeaa7');
  }
  updateCountHUD();
  state = 'call';
  callT = 1.1;
}

function endAtBat(kind, label = '', bases = 0) {
  stats.pa++;
  let cls = 'out', text = label, sub = '';
  if (kind === 'walk') { stats.bb++; cls = 'bb'; text = 'フォアボール'; sfx.call(); }
  else if (kind === 'strikeout') { stats.so++; stats.ab++; count.o++; cls = 'k'; text = '三振'; sub = label; sfx.groan(); }
  else if (kind === 'out') { stats.ab++; count.o++; }
  else if (kind === 'hit') { stats.ab++; stats.h++; if (bases === 2) stats.d2++; if (bases === 3) stats.d3++; cls = 'hit'; }
  else if (kind === 'homerun') { stats.ab++; stats.h++; stats.hr++; cls = 'hr'; }
  if (count.o >= 3) sub = (sub ? sub + '　' : '') + 'スリーアウト チェンジ';
  if (kind === 'walk' || kind === 'strikeout') showMessage(text, cls, sub);
  else if (sub) showCall(sub, '#ff7675');
  updateCountHUD();
  updateStatsHUD();
  persist();
  hidePitchInfo();
  state = 'result';
  resultT = kind === 'homerun' ? 1.6 : 1.4;
  resultMin = 0.4;
}

function nextBatter(first = false) {
  hideMessage();
  count.b = 0; count.s = 0;
  if (count.o >= 3) count.o = 0;
  resetFielders();
  placeBatter();
  resetCamera();
  setBallVisible(false);
  marker.visible = false;
  play = null;
  updateCountHUD(); updateStatsHUD(); updateBatterInfo(); updateModeHUD();
  startReady(first ? 1.2 : 0.7);
}

// ---------------------------------------------------------------- menu
let menuIndex = 0;
let debugOn = false;
const menuItems = [
  { label: () => '続ける', act: () => closeMenu() },
  { label: () => `相手の強さ：${DIFFICULTY[settings.difficulty].label}`,
    act: () => { const k = Object.keys(DIFFICULTY); settings.difficulty = k[(k.indexOf(settings.difficulty) + 1) % k.length]; updateBatterInfo(); } },
  { label: () => `打席：${settings.side === 'R' ? '右打ち' : '左打ち'}`,
    act: () => { settings.side = settings.side === 'R' ? 'L' : 'R'; placeBatter(); updateBatterInfo(); } },
  { label: () => `カーソルの速さ：${['おそい', 'ふつう', 'はやい'][settings.cursorSpeed]}`,
    act: () => { settings.cursorSpeed = (settings.cursorSpeed + 1) % 3; } },
  { label: () => `コントローラーの振動：${settings.vibration ? 'オン' : 'オフ'}`,
    act: () => {
      settings.vibration = !settings.vibration;
      if (settings.vibration) {
        const ok = input.rumble(0.8, 0.8, 200);
        toast(ok ? '振動を試しました' : 'このブラウザでは振動が使えないようです');
      }
    } },
  { label: () => `入力テスト：${debugOn ? 'オン' : 'オフ'}`,
    act: () => { debugOn = !debugOn; $('input-debug').classList.toggle('hidden', !debugOn); } },
  { label: () => '記録をリセット',
    act: () => { Object.assign(stats, emptyStats()); count.o = 0; updateStatsHUD(); updateCountHUD(); toast('記録をリセットしました'); } },
];
function renderMenu() {
  const box = $('menu-items');
  box.innerHTML = '';
  menuItems.forEach((it, i) => {
    const b = document.createElement('button');
    b.className = 'menu-item' + (i === menuIndex ? ' focus' : '');
    b.textContent = it.label();
    b.addEventListener('click', () => { menuIndex = i; selectMenu(); });
    box.appendChild(b);
  });
  const d = input.lastDevice;
  $('menu-hint').textContent = d === 'gamepad' ? '十字キー：選ぶ　Ⓐ：決定・切替　Ⓑ：閉じる'
    : d === 'keyboard' ? '↑↓：選ぶ　Enter：決定・切替　Esc：閉じる' : 'タップで決定・切替';
}
function selectMenu() { sfx.ui(); menuItems[menuIndex].act(); persist(); if (state === 'menu') renderMenu(); }
function openMenu() {
  stateBeforeMenu = state;
  state = 'menu';
  menuIndex = 0;
  renderMenu();
  $('menu-screen').classList.remove('hidden');
}
function closeMenu() {
  $('menu-screen').classList.add('hidden');
  state = stateBeforeMenu || 'ready';
  persist();
}

// ---------------------------------------------------------------- per-state updates
function updateCursor(dt) {
  const ax = input.axis();
  const speed = [0.9, 1.35, 1.9][settings.cursorSpeed];
  cursor.x += ax.x * speed * dt;
  cursor.y += ax.y * speed * dt;
  const d = input.takeTouchDelta();
  if (d.x || d.y) $('drag-hint').classList.add('hidden');
  const sens = 0.45 / (0.25 * Math.max(window.innerWidth, 320)) * [0.7, 1, 1.4][settings.cursorSpeed];
  cursor.x += d.x * sens;
  cursor.y -= d.y * sens;
  cursor.x = clamp(cursor.x, -ZONE.halfW - 0.2, ZONE.halfW + 0.2);
  cursor.y = clamp(cursor.y, ZONE.bottom - 0.18, ZONE.top + 0.18);
  cursorGroup.position.x = cursor.x;
  cursorGroup.position.y = cursor.y;
}

function handleModeButtons() {
  let changed = false;
  if (input.pressed('mode')) { buntOn = false; swingMode = swingMode === 'meet' ? 'power' : 'meet'; changed = true; }
  if (input.pressed('bunt')) { buntOn = !buntOn; changed = true; }
  if (changed) { updateModeHUD(); sfx.ui(); }
}

function animateBatter(dt) {
  if (swingAnimT >= 0) {
    swingAnimT += dt;
    const p = clamp(swingAnimT / 0.28, 0, 1);
    const e = 1 - Math.pow(1 - p, 2);
    const phi = -15 + 265 * e;
    const elev = p < 0.4 ? lerp(55, 5, p / 0.4) : lerp(5, 40, (p - 0.4) / 0.6);
    batter.batPivot.position.copy(BAT_PIVOT_HOME);
    setBatAngle(batter, phi, elev);
    batter.rig.rotation.y = Math.sin(Math.PI * p) * 0.5;
    if (swingAnimT > 0.9 && state !== 'play') { swingAnimT = -1; batter.rig.rotation.y = 0; }
    return;
  }
  if (buntOn && state !== 'play') {
    const h = batterHome();
    const reach = (cursor.x - h.x) * sideSign();
    batter.batPivot.position.set(0.28, clamp(cursor.y, 0.35, 1.25), reach - 0.52);
    setBatAngle(batter, 90, 2);
    return;
  }
  if (state === 'play') return;
  batter.batPivot.position.copy(BAT_PIVOT_HOME);
  setBatAngle(batter, -15 + Math.sin(clock * 2.2) * 5, 55 + Math.sin(clock * 1.3) * 3);
}

function animatePitcher(dt) {
  if (state === 'windup') {
    const u = windT / WINDUP;
    const arm = u < 0.6 ? lerp(0, 120, u / 0.6) : lerp(120, 225, (u - 0.6) / 0.4);
    pitcher.armPivot.rotation.x = arm * Math.PI / 180;
    pitcher.rig.rotation.x = u < 0.6 ? lerp(0, -0.18, u / 0.6) : lerp(-0.18, 0.25, (u - 0.6) / 0.4);
    pitcher.rig.position.y = Math.sin(Math.min(u / 0.6, 1) * Math.PI) * 0.12;
  } else if (followT >= 0) {
    followT += dt;
    const p = clamp(followT / 0.3, 0, 1);
    pitcher.armPivot.rotation.x = lerp(225, 330, p) * Math.PI / 180;
    pitcher.rig.rotation.x = lerp(0.25, 0.1, p);
    pitcher.rig.position.y = 0;
    if (followT > 0.9) { followT = -1; pitcher.armPivot.rotation.x = 0; pitcher.rig.rotation.x = 0; }
  }
}

const tmpV = new THREE.Vector3();
function updatePitch(dt) {
  pitchT += dt;
  pitchPosition(pitch, Math.min(pitchT, pitch.T * 1.05), ballPos);
  setBallPos(ballPos);
  if (pitchT >= pitch.T * 1.05 && !mittPlayed && !hitLaunched) { mittPlayed = true; sfx.mitt(); }

  if (!swing && !buntOn && input.pressed('swing')) doSwing();

  if (!hitLaunched && swing && swing.res.contact && pitchT >= pitch.T) contact(swing.res);

  if (buntOn && !swing && pitchT >= pitch.T) {
    const res = evaluateSwing({ mode: 'bunt', cursor: { ...cursor }, ball: pitch.target, dt: 0, batter: BATTER, sideSign: sideSign() });
    swing = { ts: pitchT, res, mode: 'bunt', buntMiss: !res.contact };
    if (res.contact) contact(res);
  }

  if (state === 'pitch' && !hitLaunched && !pitchJudged && pitchT >= pitch.T + 0.17) {
    pitchJudged = true;
    marker.position.set(pitch.target.x, pitch.target.y, 0.02);
    marker.visible = true;
    markerT = 1.2;
    if (swing && !swing.buntMiss) applyPitchResult('swingMiss');
    else applyPitchResult(pitch.strike ? 'strike' : 'ball');
  }
}

// Catcher moves the glove toward the target during the windup.
function updateCatcherGlove(u) {
  tmpV.set(pitch.target.x, pitch.target.y, 0.85);
  catcher.handL.parent.worldToLocal(tmpV);
  catcher.handL.position.lerpVectors(CATCHER_GLOVE_HOME, tmpV, clamp(u * 1.5, 0, 1));
}

const RUN_PATH = () => {
  const h = batterHome();
  return [{ x: h.x, z: h.z }, BASES.first, BASES.second, BASES.third, BASES.home];
};

function runnerAt(t, out) {
  const P = RUN_PATH();
  const slow = out.kind === 'homerun' ? 1.5 : 1;
  const T = [0.35, ...out.runnerTimes.map((x) => x * slow)];
  const maxBase = out.kind === 'homerun' ? 4 : Math.max(1, out.bases);
  let stopT = Infinity;
  if (out.kind === 'out' && !out.ground) stopT = out.catchT + 0.4;
  const tt = Math.min(t, stopT);
  if (tt <= T[0]) return { pos: P[0], moving: false, dir: null };
  for (let k = 0; k < maxBase; k++) {
    if (tt < T[k + 1]) {
      const u = (tt - T[k]) / (T[k + 1] - T[k]);
      return { pos: { x: lerp(P[k].x, P[k + 1].x, u), z: lerp(P[k].z, P[k + 1].z, u) },
        moving: t < stopT, dir: { x: P[k + 1].x - P[k].x, z: P[k + 1].z - P[k].z } };
    }
  }
  return { pos: P[maxBase], moving: false, dir: null };
}

function moveToward(pl, from, to, speed, t0, t) {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  const s = clamp(speed * Math.max(0, t - t0), 0, d);
  pl.root.position.x = from.x + (d ? dx / d * s : 0);
  pl.root.position.z = from.z + (d ? dz / d * s : 0);
  const moving = s > 0 && s < d;
  if (moving) pl.root.rotation.y = Math.atan2(dx, dz);
  animateRun(pl, t, moving);
  return moving;
}

function updatePlay(dt) {
  play.t += dt;
  const t = play.t;
  const { sim, out } = play;
  const P = sim.points;

  // Ball position.
  let bp;
  const catcherIdx = out.fielder;
  if (out.catchT != null && t >= out.catchT) {
    if (!play.caughtSfx) { play.caughtSfx = true; sfx.catchBall(); }
    const fpl = fielders[catcherIdx];
    const hand = { x: fpl.root.position.x, y: 1.0, z: fpl.root.position.z };
    if (out.throwTo && !out.carry) {
      const t0 = out.catchT + (out.ground ? 0.45 : 0.5);
      const dur = Math.max(0.25, (out.throwDur || 1.0) - 0.45);
      if (t < t0) bp = hand;
      else {
        const u = clamp((t - t0) / dur, 0, 1);
        bp = { x: lerp(hand.x, out.throwTo.x, u), y: lerp(hand.y, out.throwTo.y, u) + Math.sin(u * Math.PI) * dur * 2.5,
          z: lerp(hand.z, out.throwTo.z, u) };
        if (u >= 1 && !play.thrownSfx) { play.thrownSfx = true; sfx.catchBall(); }
      }
    } else bp = hand;
  } else {
    const fi = t / PHYS.dt;
    const i = Math.min(Math.floor(fi), P.length - 1);
    const j = Math.min(i + 1, P.length - 1);
    const u = fi - Math.floor(fi);
    bp = { x: lerp(P[i].x, P[j].x, u), y: lerp(P[i].y, P[j].y, u), z: lerp(P[i].z, P[j].z, u) };
    if (out.kind === 'homerun' && i >= P.length - 1) setBallVisible(false);
  }
  setBallPos(bp);

  // Fielders.
  fielders.forEach((pl, i) => {
    const f = FIELDERS[i];
    const home = { x: f.x, z: f.z };
    if (i === catcherIdx && out.catchPos) {
      const moving = moveToward(pl, home, out.catchPos, f.speed, f.react, Math.min(t, out.catchT));
      if (out.carry && t > out.catchT) moveToward(pl, out.catchPos, BASES.first, f.speed, out.catchT, t);
      else if (!moving) pl.root.rotation.y = Math.atan2(bp.x - pl.root.position.x, bp.z - pl.root.position.z);
    } else if (i === 2 && out.ground) {
      moveToward(pl, home, BASES.first, f.speed, 0.3, t);
    } else {
      pl.root.rotation.y = Math.atan2(bp.x - pl.root.position.x, bp.z - pl.root.position.z);
    }
  });

  // Batter runs (not on a foul).
  if (out.kind !== 'foul' && t > 0.3) {
    batter.batPivot.visible = false;
    batter.rig.rotation.y = 0;
    const r = runnerAt(t, out);
    batter.root.position.x = r.pos.x;
    batter.root.position.z = r.pos.z;
    if (r.dir) batter.root.rotation.y = Math.atan2(r.dir.x, r.dir.z);
    animateRun(batter, t, r.moving);
  }

  // Camera follows the ball from behind home plate.
  const r = Math.hypot(bp.x, bp.z);
  const desired = tmpV.set(bp.x * 0.3, 7 + r * 0.14 + bp.y * 0.3, 16 + r * 0.06);
  const k = 1 - Math.exp(-3.2 * dt);
  camera.position.lerp(desired, k);
  camLook.lerp(new THREE.Vector3(bp.x, bp.y * 0.7, bp.z), 1 - Math.exp(-6 * dt));
  camera.lookAt(camLook);

  // Result message.
  if (!play.msgShown && t >= out.decisiveT) {
    play.msgShown = true;
    if (out.kind === 'homerun') { showMessage(out.label, 'hr'); sfx.cheer(3.5, true); if (settings.vibration) input.rumble(1, 1, 400); }
    else if (out.kind === 'hit') { showMessage(out.label, 'hit'); sfx.cheer(2, false); }
    else if (out.kind === 'out') { showMessage(out.label, 'out'); }
    else if (out.kind === 'foul') { showCall('ファウル', '#ffeaa7'); }
  }

  if (t >= out.endT && !play.ended) {
    play.ended = true;
    if (out.kind === 'foul') {
      resetCamera(); placeBatter(); resetFielders(); swingAnimT = -1; setBallVisible(false);
      if (count.s < 2) count.s++;
      updateCountHUD();
      state = 'call'; callT = 0.6;
      return;
    }
    endAtBat(out.kind, out.label, out.bases);
  }
}

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.poll();

  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }
  if (debugOn) {
    const d = input.debug, pad = input.getPad();
    $('input-debug').textContent = d.id
      ? `コントローラー: ${d.id}\nマッピング: ${d.mapping}\n押しているボタン番号: ${d.buttons.join(', ') || 'なし'}\nスティック: ${d.axes.join('  ')}\n振動: ${pad && pad.vibrationActuator ? '対応' : '未対応'}\n最後の入力: ${input.lastDevice}`
      : `コントローラー: 未接続（ボタンを押すと認識します）\n最後の入力: ${input.lastDevice}`;
  }

  if (state === 'title') {
    if (input.pressed('confirm')) { unlockAudio(); startGame(); }
    if (Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) updatePadStatus();
    clock += dt;
    animateBatter(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }

  if (state === 'menu') {
    if (input.pressed('up')) { menuIndex = (menuIndex + menuItems.length - 1) % menuItems.length; renderMenu(); sfx.ui(); }
    if (input.pressed('down')) { menuIndex = (menuIndex + 1) % menuItems.length; renderMenu(); sfx.ui(); }
    if (input.pressed('confirm') && input.lastDevice !== 'touch') selectMenu();
    else if (input.pressed('back') || input.pressed('menu')) closeMenu();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
    return;
  }
  if (input.pressed('menu')) { openMenu(); renderer.render(scene, camera); requestAnimationFrame(frame); return; }

  clock += dt;
  if (markerT > 0) { markerT -= dt; if (markerT <= 0) marker.visible = false; }

  const batting = state === 'ready' || state === 'windup' || state === 'pitch' || state === 'call';
  cursorGroup.visible = batting;
  zoneGroup.visible = batting;
  if (batting) { updateCursor(dt); handleModeButtons(); } else input.takeTouchDelta();

  switch (state) {
    case 'ready':
      readyT -= dt;
      if (readyT <= 0) beginWindup();
      break;
    case 'windup':
      windT += dt;
      updateCatcherGlove(windT / WINDUP);
      if (windT >= WINDUP) release();
      break;
    case 'pitch':
      updatePitch(dt);
      break;
    case 'call':
      callT -= dt;
      if (pitch && !hitLaunched) {
        pitchPosition(pitch, pitch.T * 1.05, ballPos);
        setBallPos(ballPos);
        if (callT < 0.5) setBallVisible(false);
      }
      if (callT <= 0) { hidePitchInfo(); startReady(0.5); }
      break;
    case 'play':
      updatePlay(dt);
      break;
    case 'result':
      resultT -= dt;
      resultMin -= dt;
      if (play) updatePlay(dt * 0.5);
      if (resultT <= 0 || (resultMin <= 0 && input.pressed('confirm'))) nextBatter();
      break;
  }

  animateBatter(dt);
  animatePitcher(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
// If the browser served old cached files, reload once with the latest version in the URL.
(async () => {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const latest = (await res.json()).version;
    const params = new URLSearchParams(location.search);
    if (latest && latest !== VERSION && params.get('v') !== latest) {
      params.set('v', latest);
      location.replace(`${location.pathname}?${params.toString()}`);
    }
  } catch (e) { /* offline: keep the cached version */ }
})();
$('stage-label').textContent = STAGE_LABEL;
$('version').textContent = `v${VERSION}`;
$('title-version').textContent = `v${VERSION}`;
document.title = `ドリームプロ野球 by Urushihara v${VERSION}`;
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();
resetFielders();
placeBatter();
resetCamera();
setBallVisible(false);
updateModeHUD();
updatePadStatus();
updateGuide();
requestAnimationFrame(frame);

// For automated checks.
window.__game = {
  get state() { return state; }, count, stats, cursor, get pitch() { return pitch; }, input, startGame,
  forceHit(v0, launch, spray) { if (state === 'pitch' && !hitLaunched) contact({ contact: true, v0, launch, spray }); },
};
