// Stadium: ground texture, fences, stands, bases, foul poles.
import * as THREE from 'three';
import { FIELD, fenceR, BASES } from './config.js?v=0.1.8';

// Ground plane covers x: -160..160, z: -230..90 (meters).
const G = { x0: -160, z0: -230, size: 320 };

function makeGroundTexture(maxAniso) {
  const N = 2048;
  const S = N / G.size;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const P = (x, z) => [(x - G.x0) * S, (z - G.z0) * S];

  // Grass with mowing stripes.
  g.fillStyle = '#3d8b37';
  g.fillRect(0, 0, N, N);
  for (let i = -40; i < 40; i++) {
    if (i % 2 === 0) continue;
    g.save();
    g.translate(...P(0, 0));
    g.rotate(Math.PI / 4);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(i * 8 * S, -300 * S, 8 * S, 600 * S);
    g.restore();
  }
  g.save();
  g.translate(...P(0, 0));
  g.rotate(-Math.PI / 4);
  for (let i = -40; i < 40; i += 2) {
    g.fillStyle = 'rgba(0,0,0,0.04)';
    g.fillRect(i * 8 * S, -300 * S, 8 * S, 600 * S);
  }
  g.restore();

  const dirt = '#b9885a';
  // Warning track.
  g.beginPath();
  for (let a = -50; a <= 50; a += 1) {
    const th = a * Math.PI / 180, r = fenceR(Math.max(-Math.PI / 4, Math.min(Math.PI / 4, th))) + 1;
    const [px, py] = P(r * Math.sin(th), -r * Math.cos(th));
    a === -50 ? g.moveTo(px, py) : g.lineTo(px, py);
  }
  for (let a = 50; a >= -50; a -= 1) {
    const th = a * Math.PI / 180, r = fenceR(Math.max(-Math.PI / 4, Math.min(Math.PI / 4, th))) - 4.5;
    const [px, py] = P(r * Math.sin(th), -r * Math.cos(th));
    g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = dirt;
  g.fill();

  // Infield dirt: arc around the mound plus the wedge from home.
  g.beginPath();
  g.moveTo(...P(0, 3));
  g.lineTo(...P(24, -21));
  const [mx, my] = P(0, FIELD.moundZ);
  g.arc(mx, my, 29 * S, -Math.PI / 4 + 0.08, -3 * Math.PI / 4 - 0.08, true);
  g.lineTo(...P(-24, -21));
  g.closePath();
  g.fillStyle = dirt;
  g.fill();

  // Infield grass diamond.
  const inset = 1.6;
  g.beginPath();
  g.moveTo(...P(0, -inset * 1.4));
  g.lineTo(...P(BASES.first.x - inset, BASES.first.z));
  g.lineTo(...P(0, BASES.second.z + inset * 1.4));
  g.lineTo(...P(BASES.third.x + inset, BASES.third.z));
  g.closePath();
  g.fillStyle = '#459a3e';
  g.fill();

  const circle = (x, z, r, col) => {
    g.beginPath();
    const [px, py] = P(x, z);
    g.arc(px, py, r * S, 0, Math.PI * 2);
    g.fillStyle = col;
    g.fill();
  };
  circle(0, 0, 4.2, dirt);
  circle(0, FIELD.moundZ, 2.8, '#c39565');
  circle(BASES.first.x, BASES.first.z, 2.6, dirt);
  circle(BASES.second.x, BASES.second.z, 2.6, dirt);
  circle(BASES.third.x, BASES.third.z, 2.6, dirt);

  // Foul lines.
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  for (const s of [-1, 1]) {
    const r = FIELD.fenceLine;
    g.beginPath();
    g.moveTo(...P(0, 0));
    g.lineTo(...P(s * r * Math.SQRT1_2, -r * Math.SQRT1_2));
    g.stroke();
  }
  // Batter's boxes.
  g.lineWidth = 2;
  for (const s of [-1, 1]) {
    const [px, py] = P(s * 0.95 - 0.6, -0.9);
    g.strokeRect(px, py, 1.2 * S, 1.8 * S);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function makeCrowdTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#34495e';
  g.fillRect(0, 0, 512, 256);
  const cols = ['#e74c3c', '#ecf0f1', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c'];
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    g.globalAlpha = 0.5 + Math.random() * 0.5;
    g.fillRect(Math.random() * 512, Math.random() * 256, 3, 3);
  }
  g.globalAlpha = 1;
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, y, 512, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 3);
  return tex;
}

// Outline of the playing field wall: fair arc plus foul-territory walls and backstop.
function perimeter() {
  const pts = [];
  for (let a = -45; a <= 45; a += 1.5) {
    const th = a * Math.PI / 180, r = fenceR(th);
    pts.push({ x: r * Math.sin(th), z: -r * Math.cos(th), h: FIELD.fenceHeight });
  }
  const pole = FIELD.fenceLine * Math.SQRT1_2;
  const off = 14 * Math.SQRT1_2;
  const right = [
    { x: pole + off, z: -pole + off }, { x: 30, z: 4 }, { x: 14, z: 16 },
    { x: 0, z: 19 }, { x: -14, z: 16 }, { x: -30, z: 4 }, { x: -pole - off, z: -pole + off },
  ];
  right.forEach((p) => pts.push({ ...p, h: 2.4 }));
  pts.push({ ...pts[0] });
  return pts;
}

export function buildField(scene, renderer) {
  const group = new THREE.Group();
  const aniso = renderer.capabilities.getMaxAnisotropy();

  // Ground.
  const groundMat = new THREE.MeshLambertMaterial({ map: makeGroundTexture(aniso) });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(G.size, G.size), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(G.x0 + G.size / 2, 0, G.z0 + G.size / 2);
  group.add(ground);

  // Outer ground (beyond the plane) so the horizon is not empty.
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: 0x2f6b2b }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.05;
  group.add(outer);

  // Wall and stands.
  const pts = perimeter();
  const center = { x: 0, z: -45 };
  const wallPos = [], standPos = [], standUv = [];
  let u = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    wallPos.push(a.x, 0, a.z, b.x, 0, b.z, b.x, b.h, b.z, a.x, 0, a.z, b.x, b.h, b.z, a.x, a.h, a.z);
    const out = (p) => { const dx = p.x - center.x, dz = p.z - center.z, l = Math.hypot(dx, dz); return { x: dx / l, z: dz / l }; };
    const na = out(a), nb = out(b);
    const D = 42, H = 26;
    const a0 = [a.x + na.x * 0.5, a.h + 0.5, a.z + na.z * 0.5], b0 = [b.x + nb.x * 0.5, b.h + 0.5, b.z + nb.z * 0.5];
    const a1 = [a.x + na.x * D, H, a.z + na.z * D], b1 = [b.x + nb.x * D, H, b.z + nb.z * D];
    const seg = Math.hypot(b.x - a.x, b.z - a.z) / 40;
    standPos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
    standUv.push(u, 0, u + seg, 0, u + seg, 1, u, 0, u + seg, 1, u, 1);
    u += seg;
  }
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  wallGeo.computeVertexNormals();
  group.add(new THREE.Mesh(wallGeo, new THREE.MeshLambertMaterial({ color: 0x1f5e3a, side: THREE.DoubleSide })));

  // Yellow line on top of the fair fence.
  const lineGeo = new THREE.BufferGeometry().setFromPoints(
    pts.slice(0, 61).map((p) => new THREE.Vector3(p.x, p.h, p.z)));
  group.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf1c40f })));

  const standGeo = new THREE.BufferGeometry();
  standGeo.setAttribute('position', new THREE.Float32BufferAttribute(standPos, 3));
  standGeo.setAttribute('uv', new THREE.Float32BufferAttribute(standUv, 2));
  standGeo.computeVertexNormals();
  group.add(new THREE.Mesh(standGeo, new THREE.MeshLambertMaterial({ map: makeCrowdTexture(), side: THREE.DoubleSide })));

  // Foul poles.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
  for (const s of [-1, 1]) {
    const r = FIELD.fenceLine + 0.3;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 22, 8), poleMat);
    pole.position.set(s * r * Math.SQRT1_2, 11, -r * Math.SQRT1_2);
    group.add(pole);
  }

  // Scoreboard behind center field.
  const board = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 2), new THREE.MeshLambertMaterial({ color: 0x15202b }));
  board.position.set(0, 30, -FIELD.fenceCenter - 40);
  group.add(board);
  const boardFace = new THREE.Mesh(new THREE.PlaneGeometry(36, 10), new THREE.MeshBasicMaterial({ color: 0x0b3d2e }));
  boardFace.position.set(0, 30, -FIELD.fenceCenter - 38.9);
  group.add(boardFace);

  // Bases and home plate.
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (const k of ['first', 'second', 'third']) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), white);
    base.position.set(BASES[k].x, 0.04, BASES[k].z);
    base.rotation.y = Math.PI / 4;
    group.add(base);
  }
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-0.216, 0); plateShape.lineTo(0.216, 0); plateShape.lineTo(0.216, 0.216);
  plateShape.lineTo(0, 0.432); plateShape.lineTo(-0.216, 0.216); plateShape.closePath();
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape), white);
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = 0.012;
  group.add(plate);

  // Batter's box lines near the camera (sharper than the ground texture).
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (const s of [-1, 1]) {
    const cx = s * 0.95;
    const segs = [[cx - 0.6, cx + 0.6, -0.9, -0.9], [cx - 0.6, cx + 0.6, 0.9, 0.9], [cx - 0.6, cx - 0.6, -0.9, 0.9], [cx + 0.6, cx + 0.6, -0.9, 0.9]];
    for (const [x1, x2, z1, z2] of segs) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 === x2 ? 0.05 : len, x1 === x2 ? len : 0.05), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x1 + x2) / 2, 0.011, (z1 + z2) / 2);
      group.add(m);
    }
  }

  // Pitcher's mound bump.
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 0.25, 24), new THREE.MeshLambertMaterial({ color: 0xc39565 }));
  mound.position.set(0, 0.125, FIELD.moundZ);
  group.add(mound);
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.15), white);
  rubber.position.set(0, 0.26, FIELD.moundZ);
  group.add(rubber);

  scene.add(group);
  return group;
}
