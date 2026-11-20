// Unified input: touch, keyboard and gamepad (Backbone Pro uses the standard gamepad mapping).
//
// Actions (edge-triggered, read once per frame with pressed()):
//   swing, mode, bunt, menu, confirm, back, up, down, left, right
// Cursor movement (continuous): axis() -> {x, y} in -1..1, plus touchDelta() in pixels.

const PAD = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7, VIEW: 8, MENU: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DEADZONE = 0.18;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.frame = new Set();   // actions triggered this frame
    this.queue = new Set();   // actions queued by events since last poll
    this.prevButtons = [];
    this.lastDevice = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
    this.padId = null;
    this.drag = { id: null, x: 0, y: 0, dx: 0, dy: 0 };
    this.onDeviceChange = null;
    this.onGamepadConnect = null;
    this.debug = { buttons: [], axes: [] };

    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => {
      if (this.drag.id !== null) return;
      this.drag.id = e.pointerId; this.drag.x = e.clientX; this.drag.y = e.clientY;
      if (e.pointerType === 'touch') this.setDevice('touch');
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.drag.id) return;
      this.drag.dx += e.clientX - this.drag.x; this.drag.dy += e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    });
    const end = (e) => { if (e.pointerId === this.drag.id) this.drag.id = null; };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    window.addEventListener('gamepadconnected', (e) => {
      this.padId = e.gamepad.id;
      this.setDevice('gamepad');
      if (this.onGamepadConnect) this.onGamepadConnect(e.gamepad.id, true);
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.onGamepadConnect) this.onGamepadConnect(e.gamepad.id, false);
      this.padId = null;
    });
  }

  setDevice(d) {
    if (this.lastDevice !== d) {
      this.lastDevice = d;
      if (this.onDeviceChange) this.onDeviceChange(d);
    }
  }

  keyDown(e) {
    const map = {
      Space: ['swing', 'confirm'], Enter: ['confirm'], NumpadEnter: ['confirm'],
      ShiftLeft: ['mode'], ShiftRight: ['mode'], KeyB: ['bunt'],
      Escape: ['menu', 'back'], KeyP: ['menu'], Backspace: ['back'],
      ArrowUp: ['up'], ArrowDown: ['down'], ArrowLeft: ['left'], ArrowRight: ['right'],
    };
    if (map[e.code] || e.code.startsWith('Arrow')) e.preventDefault();
    this.setDevice('keyboard');
    this.keys.add(e.code);
    if (e.repeat) return;
    (map[e.code] || []).forEach((a) => this.queue.add(a));
  }

  // Called by on-screen buttons.
  trigger(action) { this.queue.add(action); }

  getPad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // Call once per frame before reading actions.
  poll() {
    this.frame = this.queue;
    this.queue = new Set();
    this.padAxis = { x: 0, y: 0 };
    const pad = this.getPad();
    if (!pad) { this.debug = { id: null, buttons: [], axes: [] }; return; }
    if (this.padId !== pad.id) {
      this.padId = pad.id;
      if (this.onGamepadConnect) this.onGamepadConnect(pad.id, true);
    }
    const now = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    const edge = (i) => now[i] && !this.prevButtons[i];
    let any = false;
    const add = (i, ...acts) => { if (edge(i)) { acts.forEach((a) => this.frame.add(a)); any = true; } };
    add(PAD.A, 'swing', 'confirm');
    add(PAD.B, 'back');
    add(PAD.Y, 'bunt');
    add(PAD.R1, 'mode');
    add(PAD.MENU, 'menu');
    add(PAD.VIEW, 'menu');
    add(PAD.UP, 'up'); add(PAD.DOWN, 'down'); add(PAD.LEFT, 'left'); add(PAD.RIGHT, 'right');

    let ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    if (Math.hypot(ax, ay) < DEADZONE) { ax = 0; ay = 0; }
    if (now[PAD.LEFT]) ax = -1;
    if (now[PAD.RIGHT]) ax = 1;
    if (now[PAD.UP]) ay = -1;
    if (now[PAD.DOWN]) ay = 1;
    this.padAxis = { x: ax, y: -ay };

    // Stick flicks also navigate menus.
    const prevAx = this.prevStick || { x: 0, y: 0 };
    const sx = pad.axes[0] || 0, sy = pad.axes[1] || 0;
    if (sy < -0.6 && prevAx.y >= -0.6) this.frame.add('up');
    if (sy > 0.6 && prevAx.y <= 0.6) this.frame.add('down');
    this.prevStick = { x: sx, y: sy };

    if (any || ax !== 0 || ay !== 0) this.setDevice('gamepad');
    this.prevButtons = now;
    this.debug = {
      id: pad.id, mapping: pad.mapping || '(none)',
      buttons: now.map((v, i) => (v ? i : null)).filter((v) => v !== null),
      axes: pad.axes.map((v) => v.toFixed(2)),
    };
  }

  pressed(action) { return this.frame.has(action); }

  // Continuous cursor direction from keyboard or stick. y: +1 = up.
  axis() {
    let x = this.padAxis ? this.padAxis.x : 0, y = this.padAxis ? this.padAxis.y : 0;
    if (this.keys.has('ArrowLeft')) x = -1;
    if (this.keys.has('ArrowRight')) x = 1;
    if (this.keys.has('ArrowUp')) y = 1;
    if (this.keys.has('ArrowDown')) y = -1;
    return { x, y };
  }

  takeTouchDelta() {
    const d = { x: this.drag.dx, y: this.drag.dy };
    this.drag.dx = 0; this.drag.dy = 0;
    return d;
  }

  rumble(strong, weak, ms) {
    const pad = this.getPad();
    try {
      const act = pad && pad.vibrationActuator;
      if (act && act.playEffect) {
        act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
        return true;
      }
    } catch (e) { /* not supported */ }
    return false;
  }
}
