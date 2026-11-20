// Original chibi-style players built from simple shapes. Front of a player = local +z.
import * as THREE from 'three';

const geo = {
  head: new THREE.SphereGeometry(0.3, 20, 16),
  capTop: new THREE.SphereGeometry(0.315, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: new THREE.CylinderGeometry(0.17, 0.17, 0.025, 20, 1, false, -Math.PI / 2, Math.PI),
  eye: new THREE.SphereGeometry(0.045, 10, 8),
  body: new THREE.SphereGeometry(0.25, 16, 12),
  leg: new THREE.CylinderGeometry(0.075, 0.085, 0.28, 10),
  shoe: new THREE.SphereGeometry(0.09, 10, 8),
  hand: new THREE.SphereGeometry(0.075, 10, 8),
  glove: new THREE.SphereGeometry(0.11, 10, 8),
  bat: new THREE.CylinderGeometry(0.034, 0.018, 0.86, 10),
};
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

/**
 * colors: { uniform, cap, pants }
 * opts: { glove: bool, bat: bool }
 */
export function makePlayer(colors, opts = {}) {
  const root = new THREE.Group();     // positioned in the world
  const rig = new THREE.Group();      // animated (bob, lean, crouch)
  root.add(rig);

  const skin = 0xffdcb8;
  const body = new THREE.Mesh(geo.body, mat(colors.uniform));
  body.scale.set(1, 1.12, 0.86);
  body.position.y = 0.56;
  rig.add(body);

  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(geo.leg, mat(colors.pants));
    leg.position.set(s * 0.1, 0.22, 0);
    rig.add(leg);
    const shoe = new THREE.Mesh(geo.shoe, mat(0x222222));
    shoe.scale.set(1, 0.6, 1.4);
    shoe.position.set(s * 0.1, 0.05, 0.04);
    rig.add(shoe);
    legs.push(leg, shoe);
  }

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.08;
  rig.add(headGroup);
  headGroup.add(new THREE.Mesh(geo.head, mat(skin)));
  const cap = new THREE.Mesh(geo.capTop, mat(colors.cap));
  cap.position.y = 0.03;
  headGroup.add(cap);
  const brim = new THREE.Mesh(geo.brim, mat(colors.cap));
  brim.position.set(0, 0.07, 0.24);
  headGroup.add(brim);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(geo.eye, mat(0x1a1a1a));
    eye.scale.set(0.65, 1.15, 0.4);
    eye.position.set(s * 0.1, -0.02, 0.275);
    headGroup.add(eye);
  }

  // Hands float beside the body (chibi style).
  const handL = new THREE.Mesh(opts.glove ? geo.glove : geo.hand, mat(opts.glove ? 0x7a4a1e : 0xffffff));
  handL.position.set(0.33, 0.55, 0.05);
  const handR = new THREE.Mesh(geo.hand, mat(0xffffff));
  handR.position.set(-0.33, 0.55, 0.05);

  // Throwing arm pivot (right shoulder).
  const armPivot = new THREE.Group();
  armPivot.position.set(-0.3, 0.72, 0);
  rig.add(armPivot);
  rig.add(handL);
  armPivot.add(handR);
  handR.position.set(0, -0.3, 0.02);

  let batPivot = null;
  if (opts.bat) {
    batPivot = new THREE.Group();
    batPivot.position.set(0, 0.62, 0.14);
    rig.add(batPivot);
    const bat = new THREE.Mesh(geo.bat, mat(0xd9a45b));
    bat.position.y = 0.43;
    batPivot.add(bat);
    // Batter holds the bat with both hands.
    rig.remove(handL);
    armPivot.remove(handR);
    handL.position.set(0, 0.02, 0);
    handR.position.set(0, 0.12, 0);
    batPivot.add(handL, handR);
  }

  return { root, rig, body, headGroup, armPivot, handL, handR, batPivot, legs };
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();

/**
 * Points the bat. phi: 0 = toward the catcher, 90 = across the plate (contact), 180 = toward the pitcher.
 * elev: degrees above horizontal. Expressed in the batter's local frame for a right-handed batter.
 */
export function setBatAngle(player, phiDeg, elevDeg) {
  const p = phiDeg * Math.PI / 180, e = elevDeg * Math.PI / 180;
  tmpDir.set(-Math.cos(p) * Math.cos(e), Math.sin(e), Math.sin(p) * Math.cos(e)).normalize();
  player.batPivot.quaternion.setFromUnitVectors(UP, tmpDir);
}

// Running bob animation.
export function animateRun(player, t, moving) {
  if (moving) {
    player.rig.position.y = Math.abs(Math.sin(t * 14)) * 0.08;
    player.legs.forEach((m, i) => { m.position.z = (i < 2 ? 1 : -1) * Math.sin(t * 14) * 0.08 + (m.geometry === geo.shoe ? 0.04 : 0); });
  } else {
    player.rig.position.y = 0;
    player.legs.forEach((m) => { m.position.z = m.geometry === geo.shoe ? 0.04 : 0; });
  }
}
