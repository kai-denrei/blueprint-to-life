import * as THREE from 'three';
import { RADIM, solveAim } from './dimensions.js';
import { cableRun, extrudeProfile, finish, taperedBeam } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * RA-6 — six-axis articulated robot arm.
 *
 * The eighth subject, and the first whose sliders are not axes.
 *
 * Every subject before this one exposed its mechanism directly: a slider was a joint, a joint
 * was a rotation, and the number on screen was the number in the graph. That is the right
 * default and it is what makes the viewer able to drive a machine it knows nothing about. It is
 * also the wrong control for an arm. Nobody points a tool by reasoning about J1 through J6 — you
 * say where the head should look, and the arm is the thing that has to work it out.
 *
 * So SWING and TOOL PITCH are the head's bearing and elevation, in world terms, and J1 and J5
 * are solved from them in `updateRobotArmAim`. Drag SHOULDER or ELBOW through their entire
 * travel and the head keeps aiming exactly where it was told to; the wrist absorbs the posture
 * change. That is the whole subject.
 *
 * Two things make it fit the existing contract rather than break it:
 *
 *   - **The commands ride on the axes they dominate.** SWING's declared target is `J1_Pivot.y`
 *     and TOOL PITCH's is `J5_Pivot.x`, so a viewer that never calls `afterArticulate` still
 *     gets a working arm — just a joint-frame one, where the head's aim drifts as the arm
 *     moves. Degraded, not broken. Same shape of graceful fallback as a renderer that ignores
 *     the `emissive` attribute and draws the part normally.
 *   - **The solve is closed-form.** `solveAim` inverts a single sinusoid; there is no iteration
 *     and no solver state, so the scene graph is byte-identical between builds. An iterative IK
 *     would have made the deliverable non-reproducible, which is the same argument the
 *     Hepta-T's seeded jitter makes about `Math.random`.
 */
export function buildRobotArm() {
  resetPartIds();
  const M = createMaterials();
  const A = RADIM.arm;
  const L = RADIM.limits;

  const root = new THREE.Object3D();
  root.name = 'RobotArm_Root';

  root.add(buildBase(M));
  root.add(buildCollision());

  // J1 — the slew axis. Written by the aim solve, not by the slider directly.
  const j1 = new THREE.Object3D();
  j1.name = 'J1_Pivot';
  registerPart(j1, { explodable: false });
  root.add(j1);

  j1.add(buildColumn(M));

  /**
   * Fixed -90 about X, so the chain's local +Z points at the sky and every limb below can be
   * authored along its own axis with `taperedBeam`. The exoframe's legs use the same trick
   * pointed the other way; keeping the rest orientation in one fixed node rather than in each
   * segment's geometry is what lets the pose table be angles instead of matrices.
   */
  const mount = new THREE.Object3D();
  mount.name = 'Shoulder_Mount';
  mount.position.set(0, A.shoulderY, A.shoulderZ);
  mount.rotation.x = -Math.PI / 2;
  registerPart(mount, { explodable: false });
  j1.add(mount);

  const j2 = new THREE.Object3D();
  j2.name = 'J2_Pivot';
  j2.rotation.x = THREE.MathUtils.degToRad(RADIM.rest.shoulder);
  registerPart(j2, { explodable: false });
  mount.add(j2);

  const boss = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.shoulderBoss.radius, A.shoulderBoss.radius, A.shoulderBoss.width, 18).toNonIndexed()),
    M.steel,
  );
  boss.name = 'Shoulder_Boss';
  boss.rotation.z = Math.PI / 2;
  boss.castShadow = true;
  j2.add(registerPart(boss, { explode: [0, 0.9, 0] }));

  const upper = new THREE.Mesh(taperedBeam({ length: A.upper, ...A.upperBox }), M.armour);
  upper.name = 'UpperArm_Mesh';
  upper.castShadow = upper.receiveShadow = true;
  j2.add(registerPart(upper, { explode: [0, 0, 0.9] }));

  // Casting rib. One side only — an arm with a symmetric pair of ribs reads as a render.
  const rib = new THREE.Mesh(
    finish(new THREE.BoxGeometry(A.upperRib.width, A.upperRib.height, A.upperRib.length).toNonIndexed()),
    M.detail,
  );
  rib.name = 'UpperArm_Rib';
  rib.position.set(A.upperRib.y, 0, A.upperRib.z + A.upper / 2);
  j2.add(registerPart(rib, { explode: [1.3, 0, 0.4] }));

  const j3 = new THREE.Object3D();
  j3.name = 'J3_Pivot';
  j3.position.z = A.upper;
  j3.rotation.x = THREE.MathUtils.degToRad(RADIM.rest.elbow);
  registerPart(j3, { explodable: false });
  j2.add(j3);

  const elbow = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.elbowHousing.radius, A.elbowHousing.radius, A.elbowHousing.width, 18).toNonIndexed()),
    M.steel,
  );
  elbow.name = 'Elbow_Housing';
  elbow.rotation.z = Math.PI / 2;
  elbow.castShadow = true;
  j3.add(registerPart(elbow, { explode: [0, 0.8, 0.4] }));

  // Drive can on one flank, where a real arm puts the J3 servo.
  const motor = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.elbowMotor.radius, A.elbowMotor.radius * 0.9, A.elbowMotor.length, 14).toNonIndexed()),
    M.detail,
  );
  motor.name = 'Elbow_Motor';
  motor.rotation.z = Math.PI / 2;
  motor.position.x = A.elbowMotor.x;
  j3.add(registerPart(motor, { explode: [1.6, 0.3, 0] }));

  const band = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.elbowHousing.radius + 0.012, A.elbowHousing.radius + 0.012, 0.028, 18).toNonIndexed()),
    M.glow2,
  );
  band.name = 'Elbow_Band';
  band.rotation.z = Math.PI / 2;
  band.position.x = -A.elbowHousing.width / 2 + 0.03;
  j3.add(registerPart(band, { explode: [-1.4, 0.5, 0], emissive: 'secondary' }));

  const fore = new THREE.Mesh(taperedBeam({ length: A.fore, ...A.foreBox }), M.armour);
  fore.name = 'Forearm_Mesh';
  fore.castShadow = fore.receiveShadow = true;
  j3.add(registerPart(fore, { explode: [0, 0, 1.1] }));

  const drive = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.foreDrive.radius, A.foreDrive.radius, A.foreDrive.length, 14).toNonIndexed()),
    M.steel,
  );
  drive.name = 'Forearm_Drive';
  drive.rotation.x = Math.PI / 2;
  drive.position.z = A.foreDrive.z;
  j3.add(registerPart(drive, { explode: [0, 0.6, 0.8] }));

  j3.add(buildDetails(M));

  // J4 — forearm roll. A real axis and a driven one, and the reason `solveAim` cannot just
  // subtract angles: rolled, the wrist's pitch plane leaves the vertical and the head's bearing
  // stops being J1. The solve absorbs both.
  const j4 = new THREE.Object3D();
  j4.name = 'J4_Pivot';
  j4.position.z = A.fore;
  registerPart(j4, { explodable: false });
  j3.add(j4);

  const wristHousing = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.wristHousing.radius, A.wristHousing.radius * 0.92, A.wristHousing.length, 14).toNonIndexed()),
    M.steel,
  );
  wristHousing.name = 'Wrist_Housing';
  wristHousing.rotation.x = Math.PI / 2;
  wristHousing.position.z = A.wristHousing.length / 2;
  wristHousing.castShadow = true;
  j4.add(registerPart(wristHousing, { explode: [0, 0.4, 1.3] }));

  // J5 — wrist pitch. Carries the TOOL PITCH command until the solve replaces it.
  const j5 = new THREE.Object3D();
  j5.name = 'J5_Pivot';
  j5.position.z = A.wrist;
  registerPart(j5, { explodable: false });
  j4.add(j5);

  const yoke = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.wristYoke.radius, A.wristYoke.radius, A.wristYoke.width, 14).toNonIndexed()),
    M.detail,
  );
  yoke.name = 'Wrist_Yoke';
  yoke.rotation.z = Math.PI / 2;
  yoke.castShadow = true;
  j5.add(registerPart(yoke, { explode: [0, 0.3, 1.5] }));

  const j6 = new THREE.Object3D();
  j6.name = 'J6_Pivot';
  j6.position.z = A.flange;
  registerPart(j6, { explodable: false });
  j5.add(j6);

  const flange = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.flangeDisc.radius, A.flangeDisc.radius, A.flangeDisc.thickness, 16).toNonIndexed()),
    M.steel,
  );
  flange.name = 'Flange_Disc';
  flange.rotation.x = Math.PI / 2;
  j6.add(registerPart(flange, { explode: [0, 0, 1.7] }));

  j6.add(buildHead(M));

  // Author the rest pose through the same solve the viewer will run, so the graph as built is
  // the graph as drawn — and so an exported GLB opens in the pose the title block describes.
  const restAim = solveAim(RADIM.rest);
  j1.rotation.y = THREE.MathUtils.degToRad(restAim.j1);
  j5.rotation.x = THREE.MathUtils.degToRad(restAim.j5);

  root.userData.joints = [
    {
      /**
       * The head's compass bearing, NOT the base angle. `updateRobotArmAim` rewrites J1 so the
       * head's world azimuth is exactly this number whatever the wrist is doing.
       */
      key: 'swing', label: 'BEARING', unit: '°', min: -L.swing, max: L.swing, step: 1, value: 0,
      targets: [{ node: 'J1_Pivot', axis: 'y', from: -L.swing, to: L.swing }],
    },
    {
      /**
       * The head's elevation above horizontal. Its declared target is the wrist axis because
       * that is the axis the solve spends to achieve it — and because it leaves a viewer with
       * no fix-up holding a plain wrist-pitch slider rather than a dead control.
       */
      key: 'pitch', label: 'TOOL PITCH', unit: '°', min: -L.pitch, max: L.pitch, step: 0.5, value: 0,
      targets: [{ node: 'J5_Pivot', axis: 'x', from: -L.pitch, to: L.pitch }],
    },
    {
      key: 'shoulder', label: 'SHOULDER J2', unit: '°',
      min: L.shoulder[0], max: L.shoulder[1], step: 0.5, value: RADIM.rest.shoulder,
      targets: [{ node: 'J2_Pivot', axis: 'x', from: L.shoulder[0], to: L.shoulder[1] }],
    },
    {
      key: 'elbow', label: 'ELBOW J3', unit: '°',
      min: L.elbow[0], max: L.elbow[1], step: 0.5, value: RADIM.rest.elbow,
      targets: [{ node: 'J3_Pivot', axis: 'x', from: L.elbow[0], to: L.elbow[1] }],
    },
    {
      key: 'wristRoll', label: 'WRIST J4', unit: '°',
      min: -L.wristRoll, max: L.wristRoll, step: 1, value: 0,
      targets: [{ node: 'J4_Pivot', axis: 'z', from: -L.wristRoll, to: L.wristRoll }],
    },
    {
      key: 'flangeRoll', label: 'FLANGE J6', unit: '°',
      min: -L.flangeRoll, max: L.flangeRoll, step: 1, value: 0,
      targets: [{ node: 'J6_Pivot', axis: 'z', from: -L.flangeRoll, to: L.flangeRoll }],
    },
    {
      key: 'grip', label: 'GRIP', unit: '', min: 0, max: 100, step: 1, value: RADIM.rest.grip,
      targets: [
        { node: 'Jaw_L_Pivot', axis: 'x', from: -RADIM.head.grip.open, to: -RADIM.head.grip.closed },
        { node: 'Jaw_R_Pivot', axis: 'x', from: RADIM.head.grip.open, to: RADIM.head.grip.closed },
      ],
    },
  ];
  return root;
}

/**
 * Turn the aim command into axis angles.
 *
 * `applyArticulation` rewrites every declared target from its slider before calling this, every
 * frame — so reading the command out of J1 and J5 and writing the solution back to the same two
 * nodes is stable rather than cumulative. There is no state here and none is needed.
 *
 * This is the fourth subject to use `afterArticulate` and the first to use it for something
 * other than ground contact. The walker's hull height, the exoframe's and the pod's ride lift
 * were all "where does this machine sit"; this is "which way is it looking". What the hook has
 * turned out to be is the place where a fact about the machine that a tree of rotations cannot
 * carry gets computed — and an inverse relationship between a command and two axes is exactly
 * that kind of fact.
 */
export function updateRobotArmAim(root) {
  const nodes = ['J1_Pivot', 'J2_Pivot', 'J3_Pivot', 'J4_Pivot', 'J5_Pivot']
    .map((n) => root.getObjectByName(n));
  if (nodes.some((n) => !n)) return;
  const [j1, j2, j3, j4, j5] = nodes;

  const deg = 180 / Math.PI;
  const aim = solveAim({
    swing: j1.rotation.y * deg,       // the BEARING command, as the slider just wrote it
    pitch: j5.rotation.x * deg,       // the TOOL PITCH command, likewise
    shoulder: j2.rotation.x * deg,
    elbow: j3.rotation.x * deg,
    wristRoll: j4.rotation.z * deg,
  });

  j1.rotation.y = THREE.MathUtils.degToRad(aim.j1);
  j5.rotation.x = THREE.MathUtils.degToRad(aim.j5);
}

// --- base ------------------------------------------------------------------

function buildBase(M) {
  const B = RADIM.base;
  const group = new THREE.Object3D();
  group.name = 'Base_Group';

  const plate = new THREE.Mesh(
    finish(new THREE.BoxGeometry(B.plate.width, B.plate.height, B.plate.depth).toNonIndexed()),
    M.armour,
  );
  plate.name = 'Base_Plate';
  plate.position.y = B.plate.height / 2;
  plate.receiveShadow = true;
  group.add(registerPart(plate, { explodable: false }));

  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    const pad = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(B.boltPad.radius, B.boltPad.radius, B.boltPad.height, 10).toNonIndexed()),
      M.steel,
    );
    pad.name = `Bolt_Pad_${i + 1}`;
    pad.position.set(sx * B.boltPad.x, B.plate.height + B.boltPad.height / 2, sz * B.boltPad.z);
    group.add(registerPart(pad, { explode: [sx * 1.5, -0.4, sz * 1.5] }));
  });

  return group;
}

/**
 * Everything that swings with J1: the slew ring, the base casting and the shoulder cheeks.
 *
 * Called a casting rather than a turret on purpose. "Turret" is the word the tank subjects use
 * for a thing that carries a gun, and the shared contract's `armed: false` check is a name
 * heuristic — it flagged this machine as armed on the strength of one borrowed noun. The right
 * fix for a false positive on an ambiguous name is a better name, not a weaker check.
 */
function buildColumn(M) {
  const B = RADIM.base;
  const A = RADIM.arm;
  const group = new THREE.Object3D();
  group.name = 'Column_Group';

  const ring = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(B.ring.radius, B.ring.radius * 1.04, B.ring.height, 24).toNonIndexed()),
    M.steel,
  );
  ring.name = 'Slew_Ring';
  ring.position.y = B.ring.y;
  ring.castShadow = true;
  group.add(registerPart(ring, { explode: [0, -0.7, 0] }));

  // The one always-on indicator: a lit band on the slew ring, which on a real cell is how you
  // tell at a glance that the arm is live.
  const status = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(B.statusRing.radius, B.statusRing.radius, B.statusRing.height, 24).toNonIndexed()),
    M.glow2,
  );
  status.name = 'Status_Ring';
  status.position.y = B.statusRing.y;
  group.add(registerPart(status, { explode: [0, -1.0, 0], emissive: 'secondary' }));

  const casting = new THREE.Mesh(extrudeProfile(B.profile, B.width), M.armour);
  casting.name = 'Base_Casting';
  casting.castShadow = true;
  group.add(registerPart(casting, { explodable: false }));

  // Shoulder cheeks. The J2 bearing is carried between them, which is why they are on the
  // casting and not on the arm — they do not swing with the shoulder.
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(
      finish(new THREE.BoxGeometry(A.cheek.width, A.cheek.height, A.cheek.depth).toNonIndexed()),
      M.armour,
    );
    cheek.name = `Shoulder_Cheek_${side < 0 ? 'L' : 'R'}`;
    cheek.position.set(side * A.cheek.x, A.cheek.y, 0);
    cheek.castShadow = true;
    group.add(registerPart(cheek, { explode: [side * 1.7, 0.3, 0] }));
  }

  return group;
}

// --- head ------------------------------------------------------------------

/**
 * The head: a two-jaw gripper on the flange.
 *
 * Its axis IS the flange axis. That is the point — "where the head aims" and "where J6 points"
 * have to be the same line, or the aim solve is solving for something the drawing does not
 * show. An offset tool would need the solve to carry a tool transform as well, which is a real
 * thing a robot controller does and deliberately not something this subject pretends to.
 */
function buildHead(M) {
  const H = RADIM.head;
  const group = new THREE.Object3D();
  group.name = 'Head_Group';

  const body = new THREE.Mesh(
    taperedBeam({ length: H.body.length, w0: H.body.w0, h0: H.body.h0, w1: H.body.w1, h1: H.body.h1 }),
    M.turret,
  );
  body.name = 'Head_Body';
  body.castShadow = true;
  group.add(registerPart(body, { explode: [0, 0, 2.0] }));

  // Authored at the angle the GRIP default produces, not at "open" — the slider's default and
  // the geometry in the exported GLB cannot be allowed to disagree.
  const t = RADIM.rest.grip / 100;
  const restJaw = H.grip.open + t * (H.grip.closed - H.grip.open);

  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const pivot = new THREE.Object3D();
    pivot.name = `Jaw_${tag}_Pivot`;
    pivot.position.set(0, side * H.jaw.spread, H.body.length);
    pivot.rotation.x = THREE.MathUtils.degToRad(side * restJaw);
    registerPart(pivot, { explodable: false });
    group.add(pivot);

    const jaw = new THREE.Mesh(
      taperedBeam({ length: H.jaw.length, w0: H.jaw.w0, h0: H.jaw.h0, w1: H.jaw.w1, h1: H.jaw.h1 }),
      M.detail,
    );
    jaw.name = `Jaw_${tag}_Mesh`;
    jaw.castShadow = true;
    pivot.add(registerPart(jaw, { explode: [0, side * 0.9, 1.4] }));
  }

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(H.lamp.radius, H.lamp.radius, H.lamp.length, 10).toNonIndexed()),
      M.glow,
    );
    lamp.name = `Head_Lamp_${side < 0 ? 'L' : 'R'}`;
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * H.lamp.x, 0, H.body.length * 0.5);
    group.add(registerPart(lamp, { explode: [side * 1.2, 0, 1.8], emissive: 'primary' }));
  }

  return group;
}

/**
 * Dress-out: the cable loom clipped along the forearm.
 *
 * Authored in the J3 frame and nowhere else. A run that crossed J4 would have to twist with the
 * forearm roll, and there is no skinning here — the same constraint `cableRun` carries in its
 * docstring, and the reason the loom stops at the wrist housing rather than following the tool.
 */
function buildDetails(M) {
  const A = RADIM.arm;
  const group = new THREE.Object3D();
  group.name = 'Details_Group';

  const loom = new THREE.Mesh(
    cableRun([
      [0.09, 0.15, 0.04], [0.12, 0.17, 0.24], [0.11, 0.15, 0.48], [0.08, 0.12, A.fore - 0.06],
    ], { radius: 0.026 }),
    M.rubber,
  );
  loom.name = 'Forearm_Loom';
  group.add(registerPart(loom, { explode: [1.5, 0.6, 0] }));

  for (let i = 0; i < 2; i++) {
    const clip = new THREE.Mesh(
      finish(new THREE.BoxGeometry(0.06, 0.05, 0.035).toNonIndexed()), M.detail,
    );
    clip.name = `Loom_Clip_${i + 1}`;
    clip.position.set(0.105, 0.13, 0.20 + i * 0.30);
    group.add(registerPart(clip, { explode: [1.7, 0.4, 0] }));
  }

  return group;
}

/**
 * Collision proxy.
 *
 * The base envelope, and only that. Every other subject's proxy bounds the whole machine
 * because every other subject is rigid enough for a box to mean something; an arm's swept
 * volume is a torus with a hole in it, and a box around the fully extended pose would claim
 * two cubic metres of empty air. A proxy that describes the static footprint is useful and
 * true; one that pretends to bound the reach is neither.
 */
function buildCollision() {
  const B = RADIM.base;
  const geom = new THREE.BoxGeometry(B.plate.width, 0.56, B.plate.depth);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Base_Collision';
  mesh.position.y = 0.28;
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}
