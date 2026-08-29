/**
 * Scene-graph invariants.
 *
 * These assert the properties the spec calls the deliverable — node names, pivot origins,
 * instancing, a separate collider, UV channels, explode data — not pixels. A screenshot test
 * would assert the display mode, which the spec explicitly says is not the asset.
 *
 * Run: npm test
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTank } from '../src/tank/buildTank.js';
import { DIM, wheelLayout } from '../src/tank/dimensions.js';
import { buildMkcx } from '../src/mkcx/buildMkcx.js';
import { CXDIM } from '../src/mkcx/dimensions.js';
import { buildHeptat } from '../src/heptat/buildHeptat.js';
import { HTDIM, rng } from '../src/heptat/dimensions.js';
import { buildHeptapod, updateHeptapodStance } from '../src/heptapod/buildHeptapod.js';
import { HPDIM, legSolve, legLayout, footSpan } from '../src/heptapod/dimensions.js';
import { buildHeadless, updateHeadlessStance } from '../src/headless/buildHeadless.js';
import { buildMotopod, updateMotopodRide } from '../src/motopod/buildMotopod.js';
import { MPDIM, overallHeight, overallLength, overallWidth, rideLift, treadRadius } from '../src/motopod/dimensions.js';
import { BHDIM, crownHeight, crownPoint, stand } from '../src/headless/dimensions.js';
import { buildHowitzer } from '../src/howitzer/buildHowitzer.js';
import { HDIM, trailLayout } from '../src/howitzer/dimensions.js';
import { applyExplode, collectExplodable } from '../src/lib/parts.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (err) { failures.push({ name, err }); console.log(`  FAIL ${name}\n       ${err.message}`); }
}

const tank = buildTank();
const mkcx = buildMkcx();
const heptat = buildHeptat();
const heptapod = buildHeptapod();
const headless = buildHeadless();
const motopod = buildMotopod();
const howitzer = buildHowitzer();
const byName = (n) => tank.getObjectByName(n);

/**
 * The shared asset contract: what every subject must have for this viewer to render it and this
 * pipeline to export it. Any invariant a new subject breaks is a real incompatibility rather
 * than a stylistic difference.
 *
 * `instancedGear` is a flag rather than an assumption because the MK-CX broke the original
 * version of this list, which required `Wheels_Instanced` of everything. It hovers; it has no
 * wheels. The choice was to make the contract conditional or to bolt decorative running gear
 * onto a hovering vehicle so a checklist stayed green — and a contract that forces geometry to
 * exist for the test's benefit has stopped describing the thing it tests.
 *
 * It was called `wheels` until the MotoPod, which made the name undeniably wrong: that subject
 * is mostly wheels and instances none of them, because each of its four rotating rings carries
 * a different articulated transform and instance matrices cannot inherit a parent's. The flag
 * had never meant "has wheels" — the walker set it false with eight legs and the exoframe with
 * two — it meant "the running gear is one InstancedMesh". Now it says so.
 *
 * `armed` is the same shape of flag, added by BP-Headless01 — an unarmed exoframe with hands
 * instead of a gun. Worth noting what it cost, because it was almost nothing: unlike wheels,
 * "vehicles are armed" had never leaked into the shared contract, only into each subject's own
 * `required` list. The flag exists to check the *negative* case, which is the one that rots: a
 * frame that still carries a turret ring or a breech after the weapon was cut looks like the
 * edit was abandoned halfway, exactly as leftover running gear does on the MK-CX.
 */
const MODELS = [
  {
    name: 'tank', root: tank, rootName: 'Tank_Root', collision: 'Hull_Collision', instancedGear: true, armed: true,
    required: ['Hull_Mesh', 'Hull_Collision', 'Turret_Pivot', 'Turret_Mesh',
               'Barrel_Pivot', 'Barrel_Mesh', 'Wheels_Instanced', 'Details_Group'],
    pivots: ['Turret_Pivot', 'Barrel_Pivot'],
  },
  {
    name: 'mkcx', root: mkcx, rootName: 'MKCX_Root', collision: 'Hull_Collision', instancedGear: false, armed: true,
    required: ['Hull_Mesh', 'Hull_Collision', 'Turret_Pivot', 'Turret_Mesh',
               'Barrel_Pivot', 'Barrel_Mesh', 'Details_Group', 'Hover_Gear',
               'Nacelle_L', 'Nacelle_R', 'Secondary_Turrets',
               'Secondary_L_Pivot', 'Secondary_R_Pivot',
               'Secondary_L_Gun_Pivot', 'Secondary_R_Gun_Pivot'],
    pivots: ['Turret_Pivot', 'Barrel_Pivot',
             'Secondary_L_Pivot', 'Secondary_R_Pivot',
             'Secondary_L_Gun_Pivot', 'Secondary_R_Gun_Pivot'],
  },
  {
    name: 'heptat', root: heptat, rootName: 'HeptaT_Root', collision: 'Chassis_Collision', instancedGear: true, armed: true,
    required: ['Chassis_Mesh', 'Chassis_Collision', 'Cab_Mesh', 'CargoBay_Mesh',
               'Ramp_Pivot', 'Ramp_Mesh', 'Turret_Pivot', 'Turret_Mesh',
               'Barrel_Pivot', 'Barrel_Mesh', 'Wheels_Instanced', 'Details_Group'],
    pivots: ['Turret_Pivot', 'Barrel_Pivot', 'Ramp_Pivot', 'Steer_Wheel_1L', 'Steer_Wheel_1R'],
  },
  {
    // A walker: no wheels, and its ride height is leg state rather than a dimension. The
    // required list therefore names the leg chain, because "the legs exist and are articulated"
    // is this subject's equivalent of "the running gear is instanced".
    name: 'heptapod', root: heptapod, rootName: 'Heptapod_Root', collision: 'Hull_Collision', instancedGear: false, armed: true,
    required: ['Body_Group', 'Hull_Mesh', 'Hull_Collision', 'Turret_Pivot', 'Turret_Mesh',
               'Barrel_Pivot', 'Barrel_Mesh', 'Details_Group', 'Reactor_Mesh',
               'Sensor_Suite_Mesh', 'Lidar_Array', 'Leg_1L_Mount', 'Leg_4R_Tibia',
               'FootPad_1L', 'Arm_Shoulder_Pivot', 'Arm_Elbow_Pivot'],
    pivots: ['Turret_Pivot', 'Barrel_Pivot', 'Leg_1L_Hip', 'Leg_1L_Coxa', 'Leg_3R_Femur',
             'Leg_4L_Tibia', 'Foot_2R_Ankle', 'Arm_Shoulder_Pivot', 'Arm_Elbow_Pivot'],
  },
  {
    // A biped, and the first unarmed subject. Its required list names the leg chain for the same
    // reason the walker's does, and the hands because five driven digits a side are the machine's
    // whole purpose — a frame that lost its fingers in a refactor is not this subject any more.
    name: 'headless', root: headless, rootName: 'Headless_Root', collision: 'Torso_Collision',
    instancedGear: false, armed: false,
    required: ['Body_Group', 'Thorax_Mesh', 'Torso_Collision', 'Pelvis_Mesh', 'Details_Group',
               'Waist_Yaw', 'Waist_Pitch', 'Chest_Hex', 'Core_Lens', 'Sensor_Band',
               'Leg_L_Mount', 'Leg_R_Ankle', 'Foot_L_Sole', 'Foot_R_Sole',
               'Shoulder_L_Pivot', 'Elbow_R_Pivot', 'Palm_L_Mesh', 'Thumb_R_Dist'],
    pivots: ['Waist_Yaw', 'Waist_Pitch', 'Leg_L_Hip', 'Leg_R_Knee', 'Leg_L_Ankle',
             'Shoulder_R_Pivot', 'Elbow_L_Pivot', 'Finger_L1_Prox', 'Thumb_R_Prox'],
  },
  {
    // A two-wheeler. Nothing is instanced (each rotating ring is on a different articulated
    // parent) and nothing is armed, so both flags are false on a vehicle that is mostly wheel.
    // The required list names the ride/lean chain, because "it stands up" is this subject's
    // equivalent of "the running gear is instanced".
    name: 'motopod', root: motopod, rootName: 'MotoPod_Root', collision: 'Chassis_Collision',
    instancedGear: false, armed: false,
    required: ['Ride_Height', 'Lean_Pivot', 'Chassis_Group', 'Fairing_Mesh', 'Chassis_Collision',
               'Details_Group', 'Canopy_Pivot', 'Canopy_Mesh', 'HUD_Panel', 'Steer_Pivot',
               'Wheel_F_Spin', 'Wheel_R_Spin', 'Wheel_F_Fixed', 'Tyre_F', 'Tyre_R',
               'Stator_F', 'Rotor_R', 'Motor_F', 'Thruster_Pivot', 'Thruster_Nozzle'],
    pivots: ['Ride_Height', 'Lean_Pivot', 'Steer_Pivot', 'Canopy_Pivot',
             'Wheel_F_Spin', 'Wheel_R_Spin', 'Thruster_Pivot'],
  },
  {
    name: 'howitzer', root: howitzer, rootName: 'Howitzer_Root', collision: 'Chassis_Collision', instancedGear: true, armed: true,
    required: ['Chassis_Mesh', 'Chassis_Collision', 'Traverse_Pivot', 'TopCarriage_Mesh',
               'Elevation_Pivot', 'Barrel_Mesh', 'Wheels_Instanced', 'Details_Group'],
    pivots: ['Traverse_Pivot', 'Elevation_Pivot', 'Trail_Front_L', 'Trail_Rear_R'],
  },
];

console.log('\nscene graph — engine-portable naming');

for (const m of MODELS) {
  test(`[${m.name}] root is ${m.rootName}`, () => {
    assert.equal(m.root.name, m.rootName);
  });

  test(`[${m.name}] every node named in the hierarchy contract exists`, () => {
    for (const n of m.required) assert.ok(m.root.getObjectByName(n), `missing node: ${n}`);
  });

  test(`[${m.name}] no node is unnamed — an unnamed node cannot be rigged after export`, () => {
    const unnamed = [];
    m.root.traverse((o) => { if (!o.name) unnamed.push(o.type); });
    assert.deepEqual(unnamed, [], `unnamed nodes: ${unnamed.join(', ')}`);
  });

  test(`[${m.name}] names are unique — GLTF import collides otherwise`, () => {
    const seen = new Set(), dupes = new Set();
    m.root.traverse((o) => { if (seen.has(o.name)) dupes.add(o.name); seen.add(o.name); });
    assert.deepEqual([...dupes], []);
  });

  test(`[${m.name}] pivots are empty Object3Ds, not meshes`, () => {
    for (const n of m.pivots) {
      const p = m.root.getObjectByName(n);
      assert.ok(p, `missing pivot: ${n}`);
      assert.equal(p.isMesh, undefined, `${n} must carry no geometry of its own`);
    }
  });

  test(`[${m.name}] collision proxy is separate, hidden and carries no partId`, () => {
    const proxy = m.root.getObjectByName(m.collision);
    assert.equal(proxy.visible, false);
    assert.equal(proxy.userData.isCollision, true);
    assert.equal(proxy.geometry.getAttribute('partId'), undefined);
    assert.ok(proxy.geometry.getAttribute('position').count <= 48, 'proxy should be a simple box');
    const renderGeoms = new Set();
    m.root.traverse((o) => { if (o.isMesh && !o.userData.isCollision) renderGeoms.add(o.geometry); });
    assert.ok(!renderGeoms.has(proxy.geometry), 'render geometry must never be reused as a collider');
  });

  test(`[${m.name}] every rendered mesh has uv, uv1, uv2, partId and emissive`, () => {
    const missing = [];
    m.root.traverse((o) => {
      if (!o.isMesh || o.userData.isCollision) return;
      for (const key of ['uv', 'uv1', 'uv2', 'partId', 'emissive']) {
        if (!o.geometry.getAttribute(key)) missing.push(`${o.name}:${key}`);
      }
    });
    assert.deepEqual(missing, []);
  });

  test(`[${m.name}] no two rendered meshes share a part id`, () => {
    // A shared id means the outline filter cannot tell the two apart, so the seam between them
    // vanishes. It happened once already, by cloning a geometry that had already been
    // registered — invisible in that case only because the two parts never touch on screen.
    const seen = new Map();
    const clashes = [];
    m.root.traverse((o) => {
      if (!o.isMesh || o.userData.isCollision) return;
      const id = o.userData.partId;
      if (seen.has(id)) clashes.push(`${seen.get(id)} + ${o.name} both id ${id}`);
      else seen.set(id, o.name);
    });
    assert.deepEqual(clashes, []);
  });

  test(`[${m.name}] part ids fit the 8-bit channel the G-buffer packs them into`, () => {
    let max = 0;
    m.root.traverse((o) => { if (o.userData.partId) max = Math.max(max, o.userData.partId); });
    assert.ok(max > 0 && max < 255, `part id ${max} would wrap the id channel`);
  });

  test(`[${m.name}] no NaN in any position buffer`, () => {
    const bad = [];
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      const arr = o.geometry.getAttribute('position').array;
      for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) { bad.push(o.name); break; }
    });
    assert.deepEqual(bad, []);
  });

  test(`[${m.name}] running gear matches what the subject claims`, () => {
    const w = m.root.getObjectByName('Wheels_Instanced');
    if (m.instancedGear) {
      assert.ok(w?.isInstancedMesh, 'Wheels_Instanced must be an InstancedMesh');
      const loose = [];
      m.root.traverse((o) => {
        if (o.isMesh && !o.isInstancedMesh && /RoadWheel/i.test(o.name)) loose.push(o.name);
      });
      assert.deepEqual(loose, [], 'road wheels must be instanced, not N loose meshes');
    } else {
      // A hovering vehicle carrying leftover running gear is worse than one carrying none:
      // it looks like the change was abandoned halfway.
      const leftovers = [];
      m.root.traverse((o) => {
        if (/RoadWheel|Sprocket|ReturnRoller|^Track_|Wheels_Instanced/i.test(o.name)) leftovers.push(o.name);
      });
      assert.deepEqual(leftovers, [],
        'this subject declares no instanced running gear but still carries some');
    }
  });

  test(`[${m.name}] armament matches what the subject claims`, () => {
    const WEAPON = /Turret|Barrel|Muzzle|Breech|Gun|AmmoDrum|CoilRing|Trunnion/i;
    const found = [];
    m.root.traverse((o) => { if (WEAPON.test(o.name)) found.push(o.name); });
    if (m.armed) {
      assert.ok(found.length > 0, 'an armed subject should carry a weapon');
    } else {
      // The mirror of the wheels check. A frame that kept its turret ring or its breech after
      // the weapon was cut reads as an abandoned edit, and nothing else would notice.
      assert.deepEqual(found, [], 'this subject declares no armament but still carries some');
    }
  });

  test(`[${m.name}] explode is stored data and is exactly reversible`, () => {
    const parts = collectExplodable(m.root);
    assert.ok(parts.length >= 8, `expected many explodable parts, got ${parts.length}`);
    const before = parts.map((p) => p.position.clone());
    applyExplode(m.root, 1);
    const moved = parts.filter((p, i) => p.position.distanceTo(before[i]) > 0.01).length;
    assert.ok(moved >= parts.length * 0.8, 'most explodable parts should actually move');
    applyExplode(m.root, 0);
    parts.forEach((p, i) => assert.equal(p.position.distanceTo(before[i]), 0, `${p.name} did not return`));
  });

  test(`[${m.name}] every declared joint target resolves and is unique`, () => {
    const joints = m.root.userData.joints;
    const pairs = joints.flatMap((j) => j.targets.map((t) => `${t.node}.${t.axis}`));
    assert.equal(new Set(pairs).size, pairs.length,
      'two joints driving the same node axis fight each other every frame');
  });

  test(`[${m.name}] declares joints the viewer can drive without knowing the subject`, () => {
    const joints = m.root.userData.joints;
    assert.ok(Array.isArray(joints) && joints.length >= 2, 'no joints declared');
    for (const j of joints) {
      for (const key of ['key', 'label', 'min', 'max', 'step', 'value', 'targets']) {
        assert.ok(j[key] !== undefined, `joint ${j.key} missing ${key}`);
      }
      assert.ok(j.max > j.min, `joint ${j.key} has an empty range`);
      assert.ok(j.value >= j.min && j.value <= j.max, `joint ${j.key} default is out of range`);
      assert.ok(j.targets.length > 0, `joint ${j.key} drives nothing`);
      for (const t of j.targets) {
        assert.ok(m.root.getObjectByName(t.node), `joint ${j.key} targets missing node ${t.node}`);
        assert.ok(['x', 'y', 'z'].includes(t.axis), `joint ${j.key} bad axis ${t.axis}`);
        assert.ok(Number.isFinite(t.from) && Number.isFinite(t.to), `joint ${j.key} bad range`);
      }
    }
    const keys = joints.map((j) => j.key);
    assert.equal(new Set(keys).size, keys.length, 'duplicate joint keys');
  });
}

console.log('\narticulation — pivots at true mechanical origins');

test('Turret_Pivot sits at the turret ring centre', () => {
  const p = byName('Turret_Pivot');
  assert.equal(p.position.y, DIM.turret.ringY);
  assert.equal(p.position.z, DIM.turret.ringZ);
  assert.equal(p.position.x, 0);
});

test('Barrel_Pivot is a child of Turret_Pivot, at the trunnion', () => {
  const b = byName('Barrel_Pivot');
  assert.equal(b.parent.name, 'Turret_Pivot');
  assert.equal(b.position.y, DIM.barrel.trunnionY);
  assert.equal(b.position.z, DIM.barrel.trunnionZ);
});

test('azimuth on Turret_Pivot carries the barrel with it', () => {
  const turret = byName('Turret_Pivot');
  const barrel = byName('Barrel_Mesh');
  turret.rotation.y = 0;
  tank.updateMatrixWorld(true);
  const before = barrel.getWorldPosition({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, copy() { return this; }, applyMatrix4(m) { const e = m.elements; this.x = e[12]; this.y = e[13]; this.z = e[14]; return this; }, setFromMatrixPosition(m) { return this.applyMatrix4(m); } });
  turret.rotation.y = Math.PI / 2;
  tank.updateMatrixWorld(true);
  const after = barrel.matrixWorld.elements;
  assert.ok(Math.abs(after[12] - before.x) > 0.5, 'rotating the turret must move the barrel');
  turret.rotation.y = 0;
  tank.updateMatrixWorld(true);
});

console.log('\ninstancing and collision');

test('[mkcx] emissive parts are flagged in the geometry, not just the material', () => {
  // The blueprint pass has no materials — it renders with an overrideMaterial — so a glow
  // expressed only as MeshStandardMaterial.emissive would show in the PBR mode and silently
  // vanish in the schematic. The attribute is what makes both modes agree.
  const lit = [];
  mkcx.traverse((o) => {
    if (o.isMesh && o.userData.emissive) lit.push(o.name);
  });
  assert.ok(lit.length >= 8, `expected several emissive parts, got ${lit.length}`);
  for (const name of lit) {
    const attr = mkcx.getObjectByName(name).geometry.getAttribute('emissive');
    assert.ok(attr, `${name} is flagged emissive but has no emissive attribute`);
    assert.equal(attr.array[0], 1, `${name} emissive attribute is not set`);
  }
});

test('[mkcx] deviates from the MK-VI it projects forward from', () => {
  // It is supposed to be a different vehicle, not a retexture. If these ever converge, the
  // silhouette claim in the README stopped being true.
  assert.ok(CXDIM.hull.length > DIM.hull.length, 'MK-CX should be the longer hull');
  assert.ok(CXDIM.hull.deckY < DIM.hull.deckY, 'MK-CX should be the lower hull');
  assert.equal(CXDIM.roadWheel, undefined, 'MK-CX has no running gear at all');
  assert.ok(CXDIM.hover.gap > 0, 'MK-CX should sit off the ground');
});

test('[mkcx] hovers: the lowest geometry clears the ground', () => {
  mkcx.updateMatrixWorld(true);
  let lowest = Infinity;
  mkcx.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    lowest = Math.min(lowest, bb.min.y);
  });
  assert.ok(lowest > 0.01, `lowest geometry sits at y=${lowest.toFixed(3)} — it is resting, not hovering`);
});

test('[mkcx] the secondary turrets clear the main gun bore line', () => {
  // The design constraint the user set: small enough to sit under the main cannon. If a later
  // tweak grows them past the bore, the silhouette reads as a collision.
  const c = CXDIM.secondary;
  const secTop = c.y + Math.max(...c.profile.map(([, y]) => y)) + 0.10;
  const boreY = CXDIM.turret.ringY + CXDIM.barrel.trunnionY;
  assert.ok(secTop < boreY,
    `secondary tops out at ${secTop.toFixed(2)} but the bore is at ${boreY.toFixed(2)}`);
});

test('[heptat] the tail ramp reaches the ground when fully deployed', () => {
  // Length and hinge height are coupled: L*cos(open) must equal -hingeY or the ramp stops in
  // mid-air. It did, on the first pass. Either number can be nudged later without the other.
  const c = HTDIM.cargo;
  const hinge = c.y0 + 0.02;
  const tip = hinge + c.ramp.height * Math.cos((c.ramp.open * Math.PI) / 180);
  assert.ok(Math.abs(tip) < 0.08, `ramp tip lands at y=${tip.toFixed(3)}, not on the ground`);
});

test('[heptat] stowage is asymmetric and jittered — deterministically', () => {
  // "Lived-in" is structural here: things a crew accumulated, not things a designer mirrored.
  // Both halves of that matter. Perfect mirroring reads as a product render; a non-deterministic
  // jitter would make the scene graph — the actual deliverable — differ between builds.
  const a = rng(HTDIM.stowage.seed);
  const b = rng(HTDIM.stowage.seed);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()], 'the jitter source must be reproducible');

  const named = [];
  heptat.traverse((o) => { if (o.name) named.push(o.name); });
  for (const solo of ['SpareWheel', 'Toolbox', 'CableReel']) {
    assert.ok(named.includes(solo), `missing ${solo}`);
    assert.ok(!named.includes(`${solo}_L`) && !named.includes(`${solo}_R`),
      `${solo} should exist once, not as a mirrored pair`);
  }

  // Crates must not share a rotation — that would mean the jitter never applied.
  const crates = [];
  heptat.traverse((o) => { if (/^Crate_/.test(o.name)) crates.push(o.rotation.y); });
  assert.ok(crates.length >= 4, 'expected several stowed crates');
  assert.ok(new Set(crates.map((r) => r.toFixed(6))).size === crates.length,
    'every crate has the same cant, so the jitter is not being applied');
});

test('[heptat] the steered axle is the only one that turns', () => {
  const layout = heptat.getObjectByName('Wheels_Instanced').userData.layout;
  const steered = layout.filter((l) => l.steers);
  assert.equal(steered.length, 2, 'exactly one axle should steer');
  assert.ok(steered.every((l) => l.axle === HTDIM.wheel.steerAxle));
  for (const l of steered) {
    assert.ok(heptat.getObjectByName(`Steer_${l.name}`), `no carrier for ${l.name}`);
  }
});

console.log('\nthe walker — ride height is leg state, not a dimension');

/** Drive one declared joint to a value, exactly as main.js does, and run the subject fix-up. */
function setJoint(root, key, value, after) {
  const j = root.userData.joints.find((x) => x.key === key);
  const t = (value - j.min) / (j.max - j.min);
  for (const target of j.targets) {
    const node = root.getObjectByName(target.node);
    node.rotation[target.axis] =
      ((target.from + t * (target.to - target.from)) * Math.PI) / 180;
  }
  after?.(root);
  root.updateMatrixWorld(true);
}

/** Lowest world Y of each foot pad. */
function footContacts(root) {
  const out = [];
  root.traverse((o) => {
    if (!/^FootPad_/.test(o.name)) return;
    o.geometry.computeBoundingBox();
    out.push(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).min.y);
  });
  return out;
}

test('[heptapod] neutral pose is the midpoint of crouch and extend', () => {
  // The STANCE slider maps min..max linearly onto each target, so its default of 50 lands on
  // the rest posture only if neutral IS the midpoint. Author a third pose freehand and the
  // machine silently stops resting at the height every title-block figure was derived from.
  const { crouch, neutral, extend } = HPDIM.leg.pose;
  neutral.forEach((v, i) => {
    assert.equal(Number(((crouch[i] + extend[i]) / 2).toFixed(6)), v,
      `pose limb ${i}: neutral is not halfway between crouch and extend`);
  });
});

test('[heptapod] all eight feet are on the ground at every stance', () => {
  // The one thing a walker must not get wrong. Ride height is written by afterArticulate from
  // the leg angles; if that ever drifts from the geometry the machine either floats or sinks,
  // and neither is visible in a still until someone looks at the shadow.
  for (const v of [0, 25, 50, 75, 100]) {
    setJoint(heptapod, 'stance', v, updateHeptapodStance);
    const contacts = footContacts(heptapod);
    assert.equal(contacts.length, 8, 'expected eight foot pads');
    for (const y of contacts) {
      assert.ok(Math.abs(y) < 0.002,
        `stance ${v}: a foot pad sits at y=${y.toFixed(4)}, not on the ground`);
    }
  }
});

test('[heptapod] folding the legs actually lowers the hull', () => {
  const heights = [];
  for (const v of [0, 50, 100]) {
    setJoint(heptapod, 'stance', v, updateHeptapodStance);
    heights.push(heptapod.getObjectByName('Body_Group').position.y);
  }
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2],
    `ride height should rise with stance, got ${heights.map((h) => h.toFixed(3)).join(' / ')}`);
  assert.ok(heights[2] - heights[0] > 0.5, 'the stance range is too small to be worth a slider');
  setJoint(heptapod, 'stance', 50, updateHeptapodStance);
  assert.equal(
    Number(heptapod.getObjectByName('Body_Group').position.y.toFixed(6)),
    Number(legSolve(HPDIM.leg.pose.neutral).hipHeight.toFixed(6)),
    'the rest height the drawing quotes is not the height the graph produces',
  );
});

test('[heptapod] the stride keeps an alternating tetrapod', () => {
  // Four legs swing while four stand, and the two sets alternate along each flank — that is
  // what keeps a statically stable machine statically stable mid-stride. It is a parity in
  // legLayout(), which is exactly the kind of thing that survives a refactor by accident.
  const legs = legLayout();
  assert.equal(legs.length, 8, 'eight legs');
  const sets = { A: legs.filter((l) => l.tetrad === 'A'), B: legs.filter((l) => l.tetrad === 'B') };
  assert.equal(sets.A.length, 4);
  assert.equal(sets.B.length, 4);
  for (const side of [-1, 1]) {
    const flank = legs.filter((l) => l.side === side).map((l) => l.tetrad).join('');
    assert.ok(flank === 'ABAB' || flank === 'BABA', `flank ${side} is not alternating: ${flank}`);
  }
  for (const l of legs) {
    const opposite = legs.find((o) => o.index === l.index && o.side === -l.side);
    assert.notEqual(l.tetrad, opposite.tetrad, `${l.name} and its pair are in the same set`);
  }

  const stride = heptapod.userData.joints.find((j) => j.key === 'stride');
  assert.equal(stride.targets.length, 8, 'one hip per leg');
  setJoint(heptapod, 'stride', stride.max);
  const yaws = legs.map((l) => heptapod.getObjectByName(`${l.name}_Hip`).rotation.y);
  assert.ok(yaws.some((y) => y > 0) && yaws.some((y) => y < 0),
    'at full stride the two sets should be swung opposite ways');
  setJoint(heptapod, 'stride', 0);
});

test('[heptapod] every leg is its own geometry, not eight clones of one', () => {
  // Cloning a registered geometry across eight legs would give them one shared part id, and the
  // outline pass would stop drawing the seam wherever two legs cross. Cheap to do by accident,
  // invisible until two limbs overlap on screen.
  const geoms = new Set();
  let segments = 0;
  heptapod.traverse((o) => {
    if (!o.isMesh || !/^(Coxa|Femur|Tibia|FootPad)_/.test(o.name)) return;
    segments++;
    geoms.add(o.geometry);
  });
  assert.equal(segments, 32, 'expected four segments on each of eight legs');
  assert.equal(geoms.size, 32, 'leg segments share geometry, so they share a part id');
});

test('[heptapod] the quoted span is the span the graph produces', () => {
  // Width and length are the foot circle, not a hull dimension — so they are derived, and this
  // is what stops the title block drifting from the machine after a limb-length change.
  setJoint(heptapod, 'stance', 50, updateHeptapodStance);
  const feet = [];
  heptapod.traverse((o) => {
    if (/^FootPad_/.test(o.name)) feet.push(o.getWorldPosition(new THREE.Vector3()));
  });
  const [declaredW, declaredL] = footSpan(HPDIM.leg.pose.neutral);
  const xs = feet.map((f) => f.x), zs = feet.map((f) => f.z);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - declaredW) < 0.02,
    `width: solve says ${declaredW.toFixed(3)}, graph says ${(Math.max(...xs) - Math.min(...xs)).toFixed(3)}`);
  assert.ok(Math.abs((Math.max(...zs) - Math.min(...zs)) - declaredL) < 0.02,
    `length: solve says ${declaredL.toFixed(3)}, graph says ${(Math.max(...zs) - Math.min(...zs)).toFixed(3)}`);
});

test('[heptapod] the sentry is lit on both accent channels', () => {
  // The weapon and the reactor are on channel 1, the sensors and the pads on channel 2. A
  // subject that put everything on one channel would render, and would have thrown away the
  // distinction the channel exists to carry.
  const channels = new Set();
  heptapod.traverse((o) => {
    if (o.isMesh && o.userData.emissive) channels.add(o.userData.emissive);
  });
  assert.deepEqual([...channels].sort(), [1, 2], 'expected parts on both accent channels');
});

console.log('\nthe biped — two feet, no head, and a height figure that has to be true');

/** Lowest world Y actually reached by a mesh's vertices — not its transformed AABB. */
function vertexExtremes(root, filter = () => true) {
  const v = new THREE.Vector3();
  let lo = Infinity, hi = -Infinity, name = '';
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision || !filter(o)) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      lo = Math.min(lo, v.y);
      if (v.y > hi) { hi = v.y; name = o.name; }
    }
  });
  return { lo, hi, highest: name };
}

test('[headless] neutral pose is the midpoint of crouch and extend', () => {
  // Same relation the walker needs, and for the same reason: STANCE maps min..max linearly onto
  // every target, so its default of 50 lands on the rest posture only if neutral IS the midpoint.
  const { crouch, neutral, extend } = BHDIM.leg.pose;
  neutral.forEach((v, i) => {
    assert.equal(Number(((crouch[i] + extend[i]) / 2).toFixed(6)), v,
      `pose limb ${i}: neutral is not halfway between crouch and extend`);
  });
  assert.equal((BHDIM.torso.lean.min + BHDIM.torso.lean.max) / 2, BHDIM.torso.lean.rest,
    'the torso lean default is not the midpoint of its range, so the drawing rests off-pose');
});

test('[headless] both soles are flat on the ground at every stance', () => {
  for (const v of [0, 25, 50, 75, 100]) {
    setJoint(headless, 'stance', v, updateHeadlessStance);
    const soles = [];
    headless.traverse((o) => {
      if (!/^Foot_[LR]_Sole$/.test(o.name)) return;
      o.geometry.computeBoundingBox();
      soles.push(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).min.y);
    });
    assert.equal(soles.length, 2, 'expected two soles');
    for (const y of soles) {
      assert.ok(Math.abs(y) < 0.002, `stance ${v}: a sole sits at y=${y.toFixed(4)}, not on the ground`);
    }
  }
  setJoint(headless, 'stance', 50, updateHeadlessStance);
});

test('[headless] the foot frame stays world-aligned through the whole fold', () => {
  // This is the claim `bipedPivots` makes: mount + hip + knee + ankle cancel to identity, which
  // is what keeps the sole flat with no IK. Checking the sole's y-extent rather than its lowest
  // point is what distinguishes "flat" from "one corner happens to touch".
  for (const v of [0, 50, 100]) {
    setJoint(headless, 'stance', v, updateHeadlessStance);
    const sole = headless.getObjectByName('Foot_L_Sole');
    sole.geometry.computeBoundingBox();
    const bb = sole.geometry.boundingBox.clone().applyMatrix4(sole.matrixWorld);
    assert.ok(bb.max.y - bb.min.y < BHDIM.leg.foot.sole.height + 0.002,
      `stance ${v}: the sole is canted — its y-extent is ${(bb.max.y - bb.min.y).toFixed(4)}`);
  }
  setJoint(headless, 'stance', 50, updateHeadlessStance);
});

test('[headless] the hip stays over the ankle at every stance', () => {
  // A walker with eight feet has a stability polygon it can be sloppy inside. Two feet in a row
  // have none: let the ankle drift forward as the knees bend and the drawing shows a machine in
  // the act of falling, which reads as a mistake rather than as a pose.
  const half = BHDIM.leg.foot.sole.depth / 2;
  for (const p of [BHDIM.leg.pose.crouch, BHDIM.leg.pose.neutral, BHDIM.leg.pose.extend]) {
    const { reach } = stand(p);
    assert.ok(Math.abs(reach) < half,
      `pose ${p.join('/')}: the ankle lands ${reach.toFixed(3)} m from under the hip, outside the sole`);
  }
});

test('[headless] folding the legs actually lowers the body', () => {
  const heights = [];
  for (const v of [0, 50, 100]) {
    setJoint(headless, 'stance', v, updateHeadlessStance);
    heights.push(headless.getObjectByName('Body_Group').position.y);
  }
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2],
    `hip height should rise with stance, got ${heights.map((h) => h.toFixed(3)).join(' / ')}`);
  assert.ok(heights[2] - heights[0] > 0.3, 'the stance range is too small to be worth a slider');
  setJoint(headless, 'stance', 50, updateHeadlessStance);
  assert.equal(
    Number(headless.getObjectByName('Body_Group').position.y.toFixed(6)),
    Number(stand(BHDIM.leg.pose.neutral).hipHeight.toFixed(6)),
    'the rest height the drawing quotes is not the height the graph produces',
  );
});

test('[headless] the quoted height is the height the graph actually reaches', () => {
  /**
   * The one that caught a real bug. `extrudeProfile` scales BOTH caps toward the profile
   * centroid, so the full-size profile is never in the mesh — the first version of
   * `crownHeight()` read the raw profile and over-quoted the machine by 9 cm. Nothing else in
   * the project would have noticed: the drawing would simply have printed a number about a
   * different object.
   *
   * Vertices, not bounding boxes. A transformed AABB of a rotated cylinder is inflated by up to
   * its own diagonal, which here is larger than the tolerance being asserted.
   */
  setJoint(headless, 'stance', 50, updateHeadlessStance);
  setJoint(headless, 'lean', BHDIM.torso.lean.rest);
  const { hi, highest } = vertexExtremes(headless);
  const quoted = crownHeight();
  assert.ok(Math.abs(hi - quoted) < 0.01,
    `title block says ${quoted.toFixed(3)} m, the graph reaches ${hi.toFixed(3)} m (at ${highest})`);
  assert.equal(highest, 'Thorax_Mesh',
    `the crown should be the carapace, not ${highest} — the height figure is derived from the shell profile`);
});

test('[headless] the carapace crown accounts for the extrusion taper', () => {
  // Guards the fix directly, so a later "simplification" back to Math.max(profile.y) fails here
  // rather than silently in the title block.
  const [, y] = crownPoint();
  const raw = Math.max(...BHDIM.torso.profile.map(([, py]) => py));
  assert.ok(y < raw, 'crownPoint() is not applying the taper the generator applies');
});

test('[headless] one GRIP slider drives every digit, and the hand rests where the slider does', () => {
  const grip = headless.userData.joints.find((j) => j.key === 'grip');
  assert.equal(grip.targets.length, 20, 'expected two driven segments on each of ten digits');
  assert.equal(grip.value, BHDIM.hand.rest,
    'the slider default must equal the percentage the geometry was authored at');

  // The authored rest pose and the slider default have to agree, or the exported GLB ships a
  // hand the drawing never shows. They agree by construction — this is what holds it.
  const prox = headless.getObjectByName('Finger_L1_Prox');
  assert.equal(
    Number((prox.rotation.x * 180 / Math.PI).toFixed(6)),
    Number((BHDIM.hand.curl.proximal * BHDIM.hand.rest / 100).toFixed(6)),
    'the authored finger curl is not the curl the GRIP default produces',
  );

  // Ten distinct digits, not one geometry cloned ten times — a shared geometry is a shared part
  // id, and the outline pass would stop drawing the gap between two closed fingers.
  const geoms = new Set();
  let segments = 0;
  headless.traverse((o) => {
    if (!o.isMesh || !/^(Finger|Thumb)_[LR].*_Mesh$/.test(o.name)) return;
    segments++; geoms.add(o.geometry);
  });
  assert.equal(segments, 20, 'expected twenty finger segments');
  assert.equal(geoms.size, 20, 'finger segments share geometry, so they share a part id');
});

test('[headless] the waist splits twist and lean across two nodes', () => {
  // One node driven on two axes would compose them in a fixed Euler order, and the declared-joint
  // contract gives each target exactly one node and one axis. Splitting them is what lets the
  // viewer drive both without knowing either.
  const twist = headless.getObjectByName('Waist_Yaw');
  const lean = headless.getObjectByName('Waist_Pitch');
  assert.equal(lean.parent.name, 'Waist_Yaw', 'lean must hang below twist');
  assert.equal(Number(twist.rotation.x.toFixed(6)), 0, 'the twist node must carry no pitch');
  assert.equal(Number(lean.rotation.y.toFixed(6)), 0, 'the lean node must carry no yaw');
});

test('[headless] the sensor band is lit — it is the only thing on the machine that looks at you', () => {
  // With no head there is no cupola, no optics block and no gun sight. The band and the core
  // lens are the entire read of "this is powered and facing you", and both display modes have to
  // agree about it: the blueprint pass renders with an overrideMaterial and never sees a
  // material, so a glow expressed only in MeshStandardMaterial.emissive would vanish there.
  for (const name of ['Sensor_Band', 'Core_Lens']) {
    const node = headless.getObjectByName(name);
    assert.ok(node.userData.emissive, `${name} is not on an accent channel`);
    assert.equal(node.geometry.getAttribute('emissive').array[0], node.userData.emissive,
      `${name} carries no emissive vertex attribute`);
  }
  const channels = new Set();
  headless.traverse((o) => { if (o.isMesh && o.userData.emissive) channels.add(o.userData.emissive); });
  assert.deepEqual([...channels].sort(), [1, 2], 'expected parts on both accent channels');
});

console.log('\nthe two-wheeler — it leans, and the road is the roll axis');

/** Lowest world Y over the actual vertices of the meshes a filter selects. */
function lowestVertex(root, filter = () => true) {
  const v = new THREE.Vector3();
  let lo = Infinity, name = '';
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision || !filter(o)) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y < lo) { lo = v.y; name = o.name; }
    }
  });
  return { lo, name };
}

test('[motopod] both tyres are on the road at every lean angle', () => {
  /**
   * The one a two-wheeler must not get wrong, and the reason it needs `afterArticulate`.
   *
   * Rolling about the ground contact line gets it most of the way, but a crowned tyre's
   * contact point migrates around the crown as it banks, so the axle has to sit
   * `crown*(1 - cos t)` higher than a rigid roll leaves it. That is 20 mm at full lean —
   * invisible in a still, and a wheel sunk 20 mm into the tarmac the moment anything casts a
   * shadow.
   */
  for (const angle of [-MPDIM.lean, -20, -7, 0, 7, 20, MPDIM.lean]) {
    setJoint(motopod, 'lean', angle, updateMotopodRide);
    const { lo } = lowestVertex(motopod, (o) => /^Tyre_/.test(o.name));
    assert.ok(Math.abs(lo) < 0.002,
      `lean ${angle}: the tyres sit at y=${lo.toFixed(4)}, not on the road`);
  }
  setJoint(motopod, 'lean', 0, updateMotopodRide);
});

test('[motopod] nothing but the tyres reaches the road at full lean', () => {
  // The lean limit is a clearance figure, not a styling choice: past it the bodywork touches
  // down before the tyre's shoulder does, and a schematic that lets you scrape the fairing is
  // drawing a crash rather than a corner.
  for (const angle of [-MPDIM.lean, MPDIM.lean]) {
    setJoint(motopod, 'lean', angle, updateMotopodRide);
    const { lo, name } = lowestVertex(motopod, (o) => !/^Tyre_/.test(o.name));
    assert.ok(lo > 0.02,
      `lean ${angle}: ${name} is ${(lo * 1000).toFixed(0)} mm off the road — the lean limit is too generous`);
  }
  setJoint(motopod, 'lean', 0, updateMotopodRide);
});

test('[motopod] the ride lift is zero upright and grows with lean', () => {
  // Guards the direction as well as the magnitude. A sign error here reads as a machine that
  // sinks further the harder it banks, which the contact test above would also catch — but
  // this one says why.
  assert.equal(rideLift(0), 0, 'upright, the machine must sit where it was authored');
  const steps = [0, 10, 20, MPDIM.lean].map(rideLift);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] > steps[i - 1], 'the lift must increase with lean');
  }
  assert.ok(steps.at(-1) < 0.05, 'a lift this large means the crown radius is wrong');
});

test('[motopod] the tread is crowned, which is what makes the lean mean anything', () => {
  // A flat tread leaned over stands on its shoulder edge — further from the axle than the
  // tread is — so the machine would climb as it banked and the contact patch would be a
  // corner. `trackBand` makes flat bands and a track never leans; this is why the tyre is the
  // one ring on the machine that is not one.
  const { width, crown } = MPDIM.wheel.tyre;
  assert.ok(crown >= width / 2, 'the crown arc is too tight to span the tread');
  assert.ok(treadRadius(0) === MPDIM.wheel.radius, 'the crown must be tangent on the centreline');
  assert.ok(treadRadius(width / 2) < MPDIM.wheel.radius - 0.005,
    'the shoulder is level with the centreline — the tread is effectively flat');
});

test('[motopod] the wheels are hubless — there is a clear bore through each', () => {
  // The reference sheet's whole read, and the thing a stray inner ring would silently fill in.
  // Measured off the built vertices rather than off the radius table, because the table is
  // what a mistake would be consistent with.
  motopod.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  for (const tag of ['F', 'R']) {
    const mount = motopod.getObjectByName(`Wheel_${tag}_Mount`);
    const centre = mount.getWorldPosition(new THREE.Vector3());
    let closest = Infinity;
    mount.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).sub(centre);
        // Distance from the axle line, which runs along X.
        closest = Math.min(closest, Math.hypot(v.y, v.z));
      }
    });
    assert.ok(closest > MPDIM.wheel.bore - 0.002,
      `wheel ${tag}: something sits ${closest.toFixed(3)} m from the axle line, inside the bore`);
    assert.ok(closest * 2 > 0.28, `wheel ${tag}: the bore is too small to read as hubless`);
  }
});

test('[motopod] spinning a wheel turns the rim and leaves the stator alone', () => {
  // On a hubless wheel the arms grip the stator, so which rings turn is mechanism, not
  // labelling. Putting all five on the spin pivot renders identically at rest and is wrong the
  // moment anything moves.
  const sample = (name) => {
    const o = motopod.getObjectByName(name);
    return o.matrixWorld.elements.slice(0, 12).map((n) => Number(n.toFixed(6))).join(',');
  };
  const watched = ['Tyre_F', 'Rotor_F', 'Motor_F', 'Stator_F', 'Sensor_F'];
  setJoint(motopod, 'roll', 0);
  const before = Object.fromEntries(watched.map((n) => [n, sample(n)]));
  setJoint(motopod, 'roll', 90);
  for (const name of ['Tyre_F', 'Rotor_F', 'Motor_F']) {
    assert.notEqual(sample(name), before[name], `${name} should turn with the rim`);
  }
  for (const name of ['Stator_F', 'Sensor_F']) {
    assert.equal(sample(name), before[name], `${name} is a fixed ring and must not turn`);
  }
  setJoint(motopod, 'roll', 0);
});

test('[motopod] the graph is the size the reference sheet dimensions', () => {
  // The sheet carries three figures. They are derived here — length off the tyre and the
  // nozzle, height off the canopy profile AFTER the extrusion taper, width off the fairing's
  // caps — and this is what stops the title block drifting from the machine.
  setJoint(motopod, 'lean', 0, updateMotopodRide);
  setJoint(motopod, 'steer', 0);
  setJoint(motopod, 'canopy', 0);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  motopod.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
  const got = { length: box.max.z - box.min.z, height: box.max.y, width: box.max.x - box.min.x };
  for (const [key, derived] of [['length', overallLength()], ['height', overallHeight()], ['width', overallWidth()]]) {
    assert.ok(Math.abs(got[key] - derived) < 0.01,
      `${key}: the helpers say ${derived.toFixed(3)}, the graph is ${got[key].toFixed(3)}`);
    assert.ok(Math.abs(derived - MPDIM.quoted[key]) < 0.01,
      `${key}: the sheet dimensions ${MPDIM.quoted[key]}, the machine is ${derived.toFixed(3)}`);
  }
});

test('[motopod] the roll axis is the road, not the body centreline', () => {
  // Roll a vehicle about its own middle and the tyres go through the tarmac. The lean pivot
  // has to sit on the ground line, which means its own origin carries no height at all — the
  // ride lift lives on the node ABOVE it, so the correction is a lift along world Y rather
  // than along the leaned Y.
  const lean = motopod.getObjectByName('Lean_Pivot');
  const ride = motopod.getObjectByName('Ride_Height');
  assert.equal(lean.parent.name, 'Ride_Height', 'the lift must sit above the lean, not below it');
  assert.equal(lean.position.length(), 0, 'the lean pivot must be on the ground contact line');
  assert.equal(ride.position.x, 0);
  assert.equal(ride.position.z, 0);
});

test('[tank] road wheel count matches the declared layout', () => {
  assert.equal(byName('Wheels_Instanced').count, DIM.roadWheel.count * 2);
});

test('[howitzer] trail hinges sit at their declared origins', () => {
  for (const t of trailLayout()) {
    const pivot = howitzer.getObjectByName(t.name);
    assert.ok(pivot, `missing ${t.name}`);
    assert.equal(Number(pivot.position.x.toFixed(4)), Number(t.x.toFixed(4)));
    assert.equal(Number(pivot.position.z.toFixed(4)), Number(t.z.toFixed(4)));
  }
});

test('[howitzer] barrel length matches calibre × calibres', () => {
  assert.equal(Number(HDIM.barrel.length.toFixed(3)), Number((0.155 * 39).toFixed(3)));
});

test('[howitzer] Elevation_Pivot is a child of Traverse_Pivot', () => {
  assert.equal(howitzer.getObjectByName('Elevation_Pivot').parent.name, 'Traverse_Pivot');
});

test('running gear layout is shared, not duplicated', () => {
  const layout = wheelLayout();
  assert.equal(layout.filter((c) => c.kind === 'road').length, DIM.roadWheel.count);
  assert.equal(layout.filter((c) => c.kind !== 'road').length, 2);
});

console.log('\nUVs and part data');

console.log('\nexplode');

test('anchor parts do not move — the hull stays put', () => {
  const hull = byName('Hull_Mesh');
  applyExplode(tank, 1);
  assert.equal(hull.position.length(), 0);
  applyExplode(tank, 0);
});

console.log('\nasset / display boundary');

test('asset code never imports from display code', () => {
  const offenders = [];
  const assetDirs = ['lib', 'tank', 'mkcx', 'heptat', 'heptapod', 'headless', 'motopod', 'howitzer'].map((d) => join(ROOT, 'src', d));
  for (const file of assetDirs.flatMap(walk)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (/(^|\/)(render|chrome|camera|subjects)\//.test(m[1])) {
        offenders.push(`${file.replace(ROOT + '/', '')} -> ${m[1]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `the asset must not depend on how it is drawn:\n${offenders.join('\n')}`);
});

test('display code never imports from a specific asset — it renders any scene', () => {
  const offenders = [];
  for (const dir of ['render', 'camera', 'chrome']) {
    for (const file of walk(join(ROOT, 'src', dir))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        if (/(^|\/)(tank|howitzer|subjects)\//.test(m[1])) {
          offenders.push(`${file.replace(ROOT + '/', '')} -> ${m[1]}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [],
    `the viewer must not know what it is drawing:\n${offenders.join('\n')}`);
});

test('cache-bust token is present in index.html and stamped on every local asset URL', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  // The pattern is assembled rather than written as a literal on purpose: scripts/bust.sh
  // rewrites `<meta name="cb" content="9fb11204">` in EVERY source file it walks, not just HTML,
  // so a literal here gets clobbered by the next bust and the suite stops parsing.
  const metaPattern = new RegExp('<meta name=' + '"cb" content="([^"]+)"');
  const token = html.match(metaPattern)?.[1];
  assert.ok(token, 'no cache-bust meta tag — the build has no identity');
  const unstamped = [...html.matchAll(/(?:src|href)="(\.\/[^"?]+)"/g)].map((m) => m[1]);
  assert.deepEqual(unstamped, [], `asset URLs missing ?v=: ${unstamped.join(', ')}`);
});

console.log('\nPWA');

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));

test('service worker cache key matches the build token in index.html', () => {
  // This is the load-bearing one. scripts/bust.sh stamps the SW token, but that step is a
  // project addition to a file the cache-busting installer owns — re-running the installer
  // silently drops it. A drifted SW token means every installed user is pinned to whatever
  // build they first cached, forever, and nothing else in the system notices.
  const metaPattern = new RegExp('<meta name=' + '"cb" content="([^"]+)"');
  const htmlToken = html.match(metaPattern)?.[1];
  const swToken = readFileSync(join(ROOT, 'sw.js'), 'utf8').match(/const CB_TOKEN = '([^']+)'/)?.[1];
  assert.ok(swToken, 'sw.js has no CB_TOKEN constant');
  assert.notEqual(swToken, '__CB_TOKEN__', 'sw.js still holds the unstamped placeholder');
  assert.equal(swToken, htmlToken, 'service worker and HTML disagree about which build this is');
});

test('service worker never calls skipWaiting outside a message handler', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  assert.ok(!/self\.skipWaiting\(\)/.test(install),
    'unconditional skipWaiting() in install reloads the app out from under a live session');
  assert.ok(/type === 'SKIP_WAITING'/.test(sw), 'no consent-gated skipWaiting path');
});

test('manifest has the fields installability actually requires', () => {
  for (const key of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) {
    assert.ok(manifest[key], `manifest missing ${key}`);
  }
  assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display));
  assert.ok(manifest.start_url.includes('src=pwa'), 'start_url needs an analytics marker');
});

test('manifest has 192, 512 and a maskable icon, and every file exists', () => {
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'), 'no 192 icon');
  assert.ok(sizes.includes('512x512'), 'no 512 icon');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'),
    'no maskable icon — Android will letterbox the mark inside its mask');
  for (const icon of manifest.icons) {
    assert.ok(statSync(join(ROOT, icon.src)).size > 0, `missing icon file: ${icon.src}`);
  }
});

test('iOS head tags are present — iOS ignores the manifest for most of this', () => {
  for (const needle of [
    'rel="manifest"',
    'name="theme-color"',
    'name="apple-mobile-web-app-capable"',
    'name="apple-mobile-web-app-status-bar-style"',
    'name="apple-mobile-web-app-title"',
    'rel="apple-touch-icon"',
    'viewport-fit=cover',
  ]) {
    assert.ok(html.includes(needle), `index.html missing ${needle}`);
  }
  assert.ok(statSync(join(ROOT, 'icons', 'apple-touch-icon-180.png')).size > 0);
});

test('every precached URL in the service worker resolves to a real file', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const list = sw.slice(sw.indexOf('const PRECACHE'), sw.indexOf('self.addEventListener'));
  const urls = [...list.matchAll(/'(\/[^']*)'|`(\/[^`]*)`/g)]
    .map((m) => (m[1] || m[2]).split('?')[0])
    .filter((u) => u !== '/' && !u.endsWith('/'));
  // vendor/ is gitignored and produced by `npm run vendor`, so on a fresh clone those paths
  // legitimately do not exist yet. Skipping them keeps `npm install && npm test` green without
  // weakening the check that matters: that OUR files have not moved out from under the list.
  const hasVendor = (() => {
    try { return statSync(join(ROOT, 'vendor')).isDirectory(); } catch { return false; }
  })();
  if (!hasVendor) console.log('       (vendor/ absent — run `npm run vendor`; skipping those entries)');

  const missing = urls.filter((u) => {
    if (!hasVendor && u.startsWith('/vendor/')) return false;
    for (const base of [ROOT, join(ROOT, 'public')]) {
      try { if (statSync(join(base, u)).isFile()) return false; } catch { /* next */ }
    }
    return true;
  });
  // A missing precache entry does not throw at install time (they are added individually on
  // purpose) — it just quietly leaves a hole in the offline app. This is the only thing that
  // catches it.
  assert.deepEqual(missing, [], `precache references files that do not exist: ${missing.join(', ')}`);
});

test('no root-absolute URLs anywhere the site is addressed from', () => {
  // The site is served from a project path on GitHub Pages (/blueprint-to-life/), so every
  // root-absolute reference 404s there while working perfectly on localhost — the worst kind
  // of bug, invisible until deploy. Import-map values, the SW registration and its scope, and
  // the manifest's start_url/scope/icons all resolve against a base URL, so relative is
  // correct in every one of them.
  const offenders = [];

  for (const m of html.matchAll(/(?:src|href)="(\/[^\/][^"]*)"/g)) offenders.push(`index.html: ${m[1]}`);
  for (const m of html.matchAll(/"three(?:\/addons\/)?":\s*"(\/[^"]*)"/g)) offenders.push(`importmap: ${m[1]}`);

  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const list = sw.slice(sw.indexOf('<precache:begin>'), sw.indexOf('<precache:end>'));
  for (const m of list.matchAll(/['`](\/[^'`]*)['`]/g)) offenders.push(`sw precache: ${m[1]}`);

  const life = readFileSync(join(ROOT, 'src', 'pwa', 'lifecycle.js'), 'utf8');
  for (const m of life.matchAll(/register\(\s*'(\/[^']*)'/g)) offenders.push(`sw register: ${m[1]}`);
  for (const m of life.matchAll(/scope:\s*'(\/[^']*)'/g)) offenders.push(`sw scope: ${m[1]}`);

  for (const key of ['start_url', 'scope', 'id']) {
    if (typeof manifest[key] === 'string' && manifest[key].startsWith('/')) {
      offenders.push(`manifest.${key}: ${manifest[key]}`);
    }
  }
  for (const icon of manifest.icons) {
    if (icon.src.startsWith('/')) offenders.push(`manifest icon: ${icon.src}`);
  }

  assert.deepEqual(offenders, [],
    `root-absolute URLs break a subpath deploy:\n${offenders.join('\n')}`);
});

test('offline fallback exists and is precached', () => {
  assert.ok(statSync(join(ROOT, 'offline.html')).size > 0);
  assert.ok(readFileSync(join(ROOT, 'sw.js'), 'utf8').includes('OFFLINE_URL'));
});

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

console.log(`\n${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
