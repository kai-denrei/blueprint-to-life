import * as THREE from 'three';
import { HPDIM, legLayout, legSolve, poseToPivots } from './dimensions.js';
import { extrudeProfile, taperedBeam, mergeNonIndexed, finish } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * Heptapod Walker — eight-legged autonomous sentry platform.
 *
 * The first subject with no ground contact it can take for granted. A tank's hull height is a
 * number; a walker's is a consequence of where it has put its feet. Everything structural here
 * follows from that one difference:
 *
 *   - The hull hangs off `Body_Group`, whose Y is written by `updateHeptapodStance` from the
 *     current leg angles rather than authored. Fold the legs and the machine sits down, feet
 *     planted, which is the whole point of the STANCE control.
 *   - Twenty-four driven limb pivots are two sliders, not twenty-four. A joint already fans one
 *     range out over many targets — the Hepta-T's steer joint drives two hub carriers — so a
 *     stance is that same declaration with thirty-two targets and a stride is it with eight.
 *     No viewer code knows a leg from a trunnion.
 *   - Nothing is instanced. Eight feet are the most-repeated part on the machine and would be
 *     the obvious InstancedMesh, but every one of them carries a different articulated
 *     transform, and instance matrices cannot inherit a parent's. Instancing them would mean
 *     recomputing eight world matrices from eight sockets every frame to replace eight parent
 *     transforms the scene graph was already doing for free. The Hepta-T's six wheels are
 *     instanced because they are six copies of one static transform; these are not.
 */
export function buildHeptapod() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'Heptapod_Root';

  // Everything above the ground contact patch. Its height is leg state, not a dimension —
  // see updateHeptapodStance.
  const body = new THREE.Object3D();
  body.name = 'Body_Group';
  body.position.y = legSolve(HPDIM.leg.pose.neutral).hipHeight;
  registerPart(body, { explodable: false });
  root.add(body);

  body.add(buildHull(M));
  body.add(buildCollision());
  body.add(buildTurret(M));
  body.add(buildArm(M));
  body.add(buildDetails(M));
  for (const leg of legLayout()) body.add(buildLeg(M, leg));

  const t = HPDIM.turret.limits;
  const legs = legLayout();
  const [crouch, extend] = [HPDIM.leg.pose.crouch, HPDIM.leg.pose.extend];
  const pivotCrouch = poseToPivots(crouch);
  const pivotExtend = poseToPivots(extend);

  root.userData.joints = [
    {
      key: 'azimuth', label: 'AZIMUTH', unit: '°', min: -180, max: 180, step: 1, value: 0,
      targets: [{ node: 'Turret_Pivot', axis: 'y', from: -180, to: 180 }],
    },
    {
      key: 'elevation', label: 'ELEVATE', unit: '°',
      min: t.elevation[0], max: t.elevation[1], step: 0.5, value: 0,
      targets: [{ node: 'Barrel_Pivot', axis: 'x', from: -t.elevation[0], to: -t.elevation[1] }],
    },
    {
      /**
       * One slider, thirty-two targets: three limb pivots and an ankle on each of eight legs.
       *
       * The ankle is in here rather than left rigid because a foot pad that tilts with the shin
       * stops being a foot. Driving it from the same slider with the negated tibia angle keeps
       * the pad flat at every stance without a second control or an IK solver.
       *
       * 50 is the rest posture, and it is the midpoint of crouch and extend by construction —
       * see HPDIM.leg.pose.
       */
      key: 'stance', label: 'STANCE', unit: '', min: 0, max: 100, step: 1, value: 50,
      targets: legs.flatMap((l) => [
        { node: `${l.name}_Coxa`, axis: 'x', from: pivotCrouch[0], to: pivotExtend[0] },
        { node: `${l.name}_Femur`, axis: 'x', from: pivotCrouch[1], to: pivotExtend[1] },
        { node: `${l.name}_Tibia`, axis: 'x', from: pivotCrouch[2], to: pivotExtend[2] },
        { node: `Foot_${l.tag}_Ankle`, axis: 'x', from: -crouch[2], to: -extend[2] },
      ]),
    },
    {
      /**
       * Alternating tetrapod. Set A swings forward while set B swings back and the machine is
       * statically stable at every value of the slider, including the ends — which is the
       * reason it is a stride *phase* and not a canned walk cycle. A linear slider cannot
       * express a leg that lifts and sets down again within one stroke, and faking it would put
       * an animation the asset does not have into the schematic.
       */
      key: 'stride', label: 'STRIDE', unit: '°', min: -100, max: 100, step: 1, value: 0,
      targets: legs.map((l) => ({
        node: `${l.name}_Hip`, axis: 'y',
        from: l.tetrad === 'A' ? -HPDIM.leg.strideSwing : HPDIM.leg.strideSwing,
        to: l.tetrad === 'A' ? HPDIM.leg.strideSwing : -HPDIM.leg.strideSwing,
      })),
    },
    {
      key: 'arm', label: 'MANIP ARM', unit: '', min: 0, max: 100, step: 1, value: 0,
      targets: [
        { node: 'Arm_Shoulder_Pivot', axis: 'x', from: HPDIM.arm.stowed.shoulder, to: HPDIM.arm.deployed.shoulder },
        { node: 'Arm_Elbow_Pivot', axis: 'x', from: HPDIM.arm.stowed.elbow, to: HPDIM.arm.deployed.elbow },
      ],
    },
  ];
  return root;
}

/**
 * Ride height follows the legs.
 *
 * The hip line is `drop` above the ankle and the pad hangs below that, so the hull's Y is fully
 * determined by three angles — and no parent transform in the graph can express it, because the
 * legs are children of the thing that has to move. This is the same escape hatch the howitzer's
 * trail-mounted wheels and the Hepta-T's steered axle use, for the same underlying reason: a
 * fact about the machine that a tree of rotations cannot carry.
 *
 * One leg is read rather than all eight: STANCE drives every leg from one range, so they are
 * identical by construction. If a per-leg stance is ever added, this becomes a min over the
 * eight drops — the machine rides at the height of its longest reach.
 */
export function updateHeptapodStance(root) {
  const body = root.getObjectByName('Body_Group');
  const leg = legLayout()[0].name;
  const coxa = root.getObjectByName(`${leg}_Coxa`);
  const femur = root.getObjectByName(`${leg}_Femur`);
  const tibia = root.getObjectByName(`${leg}_Tibia`);
  if (!body || !coxa || !femur || !tibia) return;

  const deg = 180 / Math.PI;
  const a1 = coxa.rotation.x * deg;
  const a2 = a1 + femur.rotation.x * deg;
  const a3 = a2 + tibia.rotation.x * deg;
  body.position.y = legSolve([a1, a2, a3]).hipHeight;
}

// --- hull ------------------------------------------------------------------

function buildHull(M) {
  const b = HPDIM.body;

  const shell = new THREE.Mesh(
    extrudeProfile(b.profile, b.width, { frontScale: b.taper, backScale: b.taper }), M.armour,
  );
  shell.name = 'Hull_Mesh';
  shell.position.y = b.hullY;
  shell.castShadow = shell.receiveShadow = true;
  registerPart(shell, { explodable: false });

  const group = new THREE.Object3D();
  group.name = 'Hull_Group';
  group.add(shell);

  const deck = new THREE.Mesh(
    finish(new THREE.BoxGeometry(b.deck.width, b.deck.height, b.deck.length).toNonIndexed()),
    M.armour,
  );
  deck.name = 'Hull_Deck';
  deck.position.set(0, b.deck.y, b.deck.z);
  group.add(registerPart(deck, { explode: [0, 0.9, 0] }));

  const ai = new THREE.Mesh(
    finish(new THREE.BoxGeometry(b.aiCore.width, b.aiCore.height, b.aiCore.length).toNonIndexed()),
    M.detail,
  );
  ai.name = 'AICore_Mesh';
  ai.position.set(0, b.aiCore.y, b.aiCore.z);
  group.add(registerPart(ai, { explode: [0, 1.1, -1.2] }));

  // Fusion core, slung under the hull between the leg roots. It is the one part of a walker
  // that has nowhere else to go: the hull's whole top surface belongs to the ring.
  const housing = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(b.reactor.radius, b.reactor.radius * 0.86, b.reactor.height, 12).toNonIndexed()),
    M.steel,
  );
  housing.name = 'Reactor_Mesh';
  housing.position.y = b.reactor.y;
  group.add(registerPart(housing, { explode: [0, -1.4, 0] }));

  const core = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(b.reactor.radius * 0.72, b.reactor.radius * 0.72, b.reactor.height * 0.42, 12).toNonIndexed()),
    M.glow,
  );
  core.name = 'Reactor_Core';
  core.position.y = b.reactor.y - b.reactor.height * 0.34;
  group.add(registerPart(core, { explode: [0, -1.9, 0], emissive: 'primary' }));

  return group;
}

function buildCollision() {
  const geom = new THREE.BoxGeometry(HPDIM.body.width + 0.10, 0.78, 2.10);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Hull_Collision';
  mesh.position.set(0, HPDIM.body.hullY, 0);
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}

// --- legs ------------------------------------------------------------------

/**
 * One leg.
 *
 * Mount (fixed fan angle) → Hip (stride yaw) → Coxa → Femur → Tibia → Ankle. Below the mount
 * every segment is authored along +Z from its own pivot, which is what `taperedBeam` is for:
 * the segment's rest orientation lives in the pose table, not in a baked rotation, so a pose is
 * three numbers and not three matrices.
 *
 * Geometry is rebuilt per leg rather than shared. Eight meshes cloning one geometry would share
 * one part id, and the outline pass would stop drawing the seam wherever two legs cross.
 */
function buildLeg(M, leg) {
  const L = HPDIM.leg;
  const pivots = poseToPivots(L.pose.neutral);

  const mount = new THREE.Object3D();
  mount.name = `${leg.name}_Mount`;
  mount.position.set(leg.x, 0, leg.z);
  mount.rotation.y = THREE.MathUtils.degToRad(leg.yaw);
  registerPart(mount, { explodable: false });

  // Shoulder yoke — bolted to the hull, so it belongs to the mount and does not swing.
  //
  // It starts inboard of its own mount and runs past it. The fore and aft hip stations sit
  // ahead of and behind the hull's own nose and tail (that fan is what makes the plan view a
  // splay rather than a rank), so a yoke that began at the shoulder would leave those four legs
  // rooted in mid-air. This one is the girder that gets them out there.
  const yoke = new THREE.Mesh(
    taperedBeam({ length: 0.52, w0: 0.36, h0: 0.34, w1: 0.32, h1: 0.30 }), M.armour,
  );
  yoke.name = `HipYoke_${leg.tag}`;
  yoke.position.z = -0.32;
  mount.add(registerPart(yoke, { explode: [0, 0, 0.5] }));

  // Coincident with the mount, not standing off it: the stride's yaw axis is the shoulder
  // centre, and the yoke above is a shroud around the coxa root rather than a link in the
  // chain. Any standoff here is reach the leg solve does not know about, and it shows up as
  // feet landing wider than the drawing says they do.
  const hip = new THREE.Object3D();
  hip.name = `${leg.name}_Hip`;                       // rotation.y — stride
  registerPart(hip, { explodable: false });
  mount.add(hip);

  const coxa = new THREE.Object3D();
  coxa.name = `${leg.name}_Coxa`;                     // rotation.x — stance
  coxa.rotation.x = THREE.MathUtils.degToRad(pivots[0]);
  registerPart(coxa, { explodable: false });
  hip.add(coxa);

  const coxaMesh = new THREE.Mesh(taperedBeam({ length: L.coxa, ...L.coxaBox }), M.steel);
  coxaMesh.name = `Coxa_${leg.tag}`;
  coxaMesh.castShadow = true;
  coxa.add(registerPart(coxaMesh, { explode: [0, 0, 0.9] }));

  // Shock absorber strut. Decorative in the same way the Hepta-T's dampers are — it swings with
  // the upper limb rather than bridging a joint it would have to stretch across.
  const strut = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(L.strut.radius, L.strut.radius * 0.8, L.strut.length, 8).toNonIndexed()),
    M.steel,
  );
  strut.name = `Strut_${leg.tag}`;
  strut.rotation.x = Math.PI / 2;
  strut.position.set(0, 0.15, 0.30);
  coxa.add(registerPart(strut, { explode: [0, 0.7, 0.6] }));

  const femur = new THREE.Object3D();
  femur.name = `${leg.name}_Femur`;                   // rotation.x — stance
  femur.position.z = L.coxa;
  femur.rotation.x = THREE.MathUtils.degToRad(pivots[1]);
  registerPart(femur, { explodable: false });
  coxa.add(femur);

  const femurMesh = new THREE.Mesh(taperedBeam({ length: L.femur, ...L.femurBox }), M.steel);
  femurMesh.name = `Femur_${leg.tag}`;
  femurMesh.castShadow = true;
  femur.add(registerPart(femurMesh, { explode: [0, 0, 1.1] }));

  const knee = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(L.knee.radius, L.knee.radius, L.knee.width, 10).toNonIndexed()),
    M.detail,
  );
  knee.name = `Knee_${leg.tag}`;
  knee.rotation.z = Math.PI / 2;
  // On the femur's axis, not on its cranked far face: the joint centre is what the pose table
  // measures from, and moving it 3 cm up would put every foot 26 mm off the ground.
  knee.position.set(0, 0, L.femur);
  femur.add(registerPart(knee, { explode: [0, 0.6, 0.8] }));

  const tibia = new THREE.Object3D();
  tibia.name = `${leg.name}_Tibia`;                   // rotation.x — stance
  tibia.position.set(0, 0, L.femur);
  tibia.rotation.x = THREE.MathUtils.degToRad(pivots[2]);
  registerPart(tibia, { explodable: false });
  femur.add(tibia);

  const tibiaMesh = new THREE.Mesh(taperedBeam({ length: L.tibia, ...L.tibiaBox }), M.steel);
  tibiaMesh.name = `Tibia_${leg.tag}`;
  tibiaMesh.castShadow = true;
  tibia.add(registerPart(tibiaMesh, { explode: [0, 0, 1.3] }));

  const sensor = new THREE.Mesh(
    finish(new THREE.BoxGeometry(...L.foot.terrainSensor).toNonIndexed()), M.glow2,
  );
  sensor.name = `TerrainSensor_${leg.tag}`;
  sensor.position.set(0, L.tibiaBox.h1 * 0.7, L.tibia - L.foot.sensorY);
  tibia.add(registerPart(sensor, { explode: [0, 0.8, 0.4], emissive: 'secondary' }));

  // Ankle. Driven from the stance slider with the negated tibia angle, so the pad stays flat on
  // the ground through the whole fold instead of rolling onto its edge.
  const ankle = new THREE.Object3D();
  ankle.name = `Foot_${leg.tag}_Ankle`;               // rotation.x — stance
  ankle.position.z = L.tibia;
  ankle.rotation.x = THREE.MathUtils.degToRad(-L.pose.neutral[2]);
  registerPart(ankle, { explodable: false });
  tibia.add(ankle);

  const pad = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(L.foot.padRadius, L.foot.padRadius * 0.88, L.foot.padHeight, 10).toNonIndexed()),
    M.detail,
  );
  pad.name = `FootPad_${leg.tag}`;
  pad.position.y = -L.foot.padHeight / 2;
  pad.castShadow = true;
  ankle.add(registerPart(pad, { explode: [0, -0.9, 0] }));

  // Mag-lev band round the pad's waist rather than a disc under it: an emitter on the contact
  // face is invisible from every angle the drawing is ever seen from.
  const band = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(L.foot.padRadius + 0.015, L.foot.padRadius + 0.015, L.foot.glow.height, 10).toNonIndexed()),
    M.glow2,
  );
  band.name = `FootGlow_${leg.tag}`;
  band.position.y = -L.foot.padHeight / 2;
  ankle.add(registerPart(band, { explode: [0, -1.2, 0], emissive: 'secondary' }));

  return mount;
}

// --- turret and weapon -----------------------------------------------------

function buildTurret(M) {
  const t = HPDIM.turret;
  const w = HPDIM.weapon;

  const pivot = new THREE.Object3D();
  pivot.name = 'Turret_Pivot';
  pivot.position.set(0, t.ringY, 0.06);
  registerPart(pivot, { explode: [0, 1.5, 0] });

  const ring = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(t.ringRadius, t.ringRadius + 0.04, t.ringHeight, 14).toNonIndexed()),
    M.steel,
  );
  ring.name = 'Turret_Ring';
  ring.position.y = -0.03;
  pivot.add(registerPart(ring, { explodable: false }));

  const shell = new THREE.Mesh(
    extrudeProfile(t.profile, t.width, { frontScale: 0.74, backScale: 0.74 }), M.turret,
  );
  shell.name = 'Turret_Mesh';
  shell.castShadow = true;
  pivot.add(registerPart(shell, { explodable: false }));

  const head = new THREE.Mesh(
    finish(new THREE.BoxGeometry(t.sensorHead.width, t.sensorHead.height, t.sensorHead.length).toNonIndexed()),
    M.armour,
  );
  head.name = 'Sensor_Suite_Mesh';
  head.position.set(0, t.sensorHead.y, t.sensorHead.z);
  head.castShadow = true;
  pivot.add(registerPart(head, { explode: [0, 1.3, -0.9] }));

  const face = new THREE.Mesh(
    finish(new THREE.BoxGeometry(t.sensorFace.width, t.sensorFace.height, t.sensorFace.depth).toNonIndexed()),
    M.glow2,
  );
  face.name = 'Sensor_Face';
  face.position.set(0, t.sensorFace.y, t.sensorFace.z);
  pivot.add(registerPart(face, { explode: [0, 1.4, -1.4], emissive: 'secondary' }));

  const lidar = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(t.lidar.radius, t.lidar.radius, t.lidar.height, 12).toNonIndexed()),
    M.detail,
  );
  lidar.name = 'Lidar_Array';
  lidar.position.set(0, t.lidar.y, t.lidar.z);
  pivot.add(registerPart(lidar, { explode: [0, 1.6, -0.7] }));

  const lidarBand = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(t.lidar.radius + 0.012, t.lidar.radius + 0.012, t.lidar.height * 0.34, 12).toNonIndexed()),
    M.glow2,
  );
  lidarBand.name = 'Lidar_Band';
  lidarBand.position.set(0, t.lidar.y, t.lidar.z);
  pivot.add(registerPart(lidarBand, { explode: [0, 1.9, -0.7], emissive: 'secondary' }));

  // Electromagnetic drum feed, on the left cheek only — the arm is on the right, and a turret
  // with matching bulges on both sides reads as decoration rather than as a feed path.
  const drum = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(t.ammoDrum.radius, t.ammoDrum.radius, t.ammoDrum.width, 12).toNonIndexed()),
    M.detail,
  );
  drum.name = 'AmmoDrum_Mesh';
  drum.rotation.z = Math.PI / 2;
  drum.position.set(t.ammoDrum.x, t.ammoDrum.y, t.ammoDrum.z);
  pivot.add(registerPart(drum, { explode: [-1.3, 0.4, 0] }));

  const barrelPivot = new THREE.Object3D();
  barrelPivot.name = 'Barrel_Pivot';
  barrelPivot.position.set(0, t.trunnionY, t.trunnionZ);
  registerPart(barrelPivot, { explode: [0, 0, 1.2] });
  pivot.add(barrelPivot);

  const breech = new THREE.Mesh(
    finish(new THREE.BoxGeometry(w.breech.width, w.breech.height, w.breech.length).toNonIndexed()),
    M.steel,
  );
  breech.name = 'Breech_Mesh';
  breech.position.z = -0.06;
  barrelPivot.add(registerPart(breech, { explodable: false }));

  /**
   * The rail gun.
   *
   * Body and both rails merge into one mesh: a game engine sees the mesh boundary, and "the
   * gun" is one part however many extrusions were convenient to author it from. The coil rings
   * and the accelerator strip stay separate because they are lit and the body is not.
   */
  const barrelParts = [taperedBeam({ length: w.length, ...w.body })];
  for (const side of [-1, 1]) {
    const rail = taperedBeam({
      length: w.length + 0.04, w0: w.rail.width, h0: w.rail.height,
      w1: w.rail.width * 0.8, h1: w.rail.height * 0.8, dx: 0,
    });
    rail.translate(side * w.rail.offset, 0.02, 0);
    barrelParts.push(finish(rail));
  }
  const barrel = new THREE.Mesh(mergeNonIndexed(barrelParts), M.steel);
  barrel.name = 'Barrel_Mesh';
  barrel.castShadow = true;
  barrelPivot.add(registerPart(barrel, { explodable: false }));

  const strip = new THREE.Mesh(
    finish(new THREE.BoxGeometry(w.railGlow.width, w.railGlow.height, w.length * 0.92).toNonIndexed()),
    M.glow,
  );
  strip.name = 'Rail_Strip';
  strip.position.set(0, w.body.h0 * 0.42, w.length * 0.5);
  barrelPivot.add(registerPart(strip, { explode: [0, 0.7, 1.6], emissive: 'primary' }));

  w.coilRings.forEach((z, i) => {
    const coil = new THREE.Mesh(
      finish(new THREE.BoxGeometry(w.coil.width, w.coil.height, w.coil.depth).toNonIndexed()),
      M.glow,
    );
    coil.name = `CoilRing_${i + 1}`;
    coil.position.z = z;
    barrelPivot.add(registerPart(coil, { explode: [0, 0.5, 1.0 + i * 0.25], emissive: 'primary' }));
  });

  const muzzle = new THREE.Mesh(taperedBeam({ length: w.muzzle.length, ...muzzleBox(w) }), M.steel);
  muzzle.name = 'Muzzle_Mesh';
  muzzle.position.z = w.length - 0.02;
  barrelPivot.add(registerPart(muzzle, { explode: [0, 0, 2.2] }));

  return pivot;
}

function muzzleBox(w) {
  return { w0: w.muzzle.w0, h0: w.muzzle.h0, w1: w.muzzle.w1, h1: w.muzzle.h1 };
}

// --- auxiliary manipulator arm ---------------------------------------------

function buildArm(M) {
  const a = HPDIM.arm;

  const base = new THREE.Object3D();
  base.name = 'Arm_Base';
  base.position.set(a.base.x, a.base.y, a.base.z);
  base.rotation.y = THREE.MathUtils.degToRad(a.base.yaw);
  registerPart(base, { explodable: false });

  const housing = new THREE.Mesh(
    taperedBeam({ length: 0.16, w0: 0.22, h0: 0.22, w1: 0.20, h1: 0.20 }), M.armour,
  );
  housing.name = 'Arm_Base_Mesh';
  base.add(registerPart(housing, { explode: [1.0, 0.2, 0] }));

  const shoulder = new THREE.Object3D();
  shoulder.name = 'Arm_Shoulder_Pivot';
  shoulder.position.z = 0.14;
  shoulder.rotation.x = THREE.MathUtils.degToRad(a.stowed.shoulder);
  registerPart(shoulder, { explodable: false });
  base.add(shoulder);

  const upper = new THREE.Mesh(taperedBeam({ length: a.upper.length, ...beamBox(a.upper) }), M.steel);
  upper.name = 'Arm_Upper_Mesh';
  shoulder.add(registerPart(upper, { explode: [0.9, 0.3, 0.3] }));

  const elbow = new THREE.Object3D();
  elbow.name = 'Arm_Elbow_Pivot';
  elbow.position.z = a.upper.length;
  elbow.rotation.x = THREE.MathUtils.degToRad(a.stowed.elbow);
  registerPart(elbow, { explodable: false });
  shoulder.add(elbow);

  const fore = new THREE.Mesh(taperedBeam({ length: a.fore.length, ...beamBox(a.fore) }), M.steel);
  fore.name = 'Arm_Fore_Mesh';
  elbow.add(registerPart(fore, { explode: [0.9, 0.3, 0.6] }));

  for (const side of [-1, 1]) {
    const jaw = new THREE.Mesh(
      taperedBeam({ ...beamBox(a.jaw), length: a.jaw.length, dx: side * 0.03 }), M.detail,
    );
    jaw.name = `Arm_Jaw_${side < 0 ? 'L' : 'R'}`;
    jaw.position.set(side * a.jaw.spread, 0, a.fore.length);
    elbow.add(registerPart(jaw, { explode: [side * 0.5, 0, 0.9] }));
  }
  return base;
}

function beamBox(s) {
  return { w0: s.w0, h0: s.h0, w1: s.w1, h1: s.h1 };
}

// --- hull furniture --------------------------------------------------------

function buildDetails(M) {
  const g = new THREE.Object3D();
  g.name = 'Details_Group';
  const b = HPDIM.body;

  // Active cloaking emitters. Eight, round the rim — the only part of the machine that is
  // deliberately symmetric, because a gap in the field is a gap in the field.
  b.cloakEmitters.forEach(([x, y, z], i) => {
    const node = new THREE.Mesh(
      finish(new THREE.BoxGeometry(...b.emitterSize).toNonIndexed()), M.glow2,
    );
    node.name = `Cloak_Emitter_${i + 1}`;
    node.position.set(x, y, z);
    g.add(registerPart(node, { explode: [x * 2.0, 0.4, z * 1.6], emissive: 'secondary' }));
  });

  // Comms whip, left flank only — the arm is the right flank's fitting.
  const mast = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(0.012, 0.022, 0.50, 6).toNonIndexed()), M.steel,
  );
  mast.name = 'Antenna_Mast';
  mast.position.set(-0.42, 0.62, -0.70);
  mast.rotation.z = 0.12;
  g.add(registerPart(mast, { explode: [-1.0, 1.2, -0.4] }));

  const beacon = new THREE.Mesh(
    finish(new THREE.BoxGeometry(0.07, 0.07, 0.07).toNonIndexed()), M.glow2,
  );
  beacon.name = 'Antenna_Beacon';
  beacon.position.set(-0.47, 0.90, -0.70);
  g.add(registerPart(beacon, { explode: [-1.2, 1.5, -0.4], emissive: 'secondary' }));

  return g;
}
