import * as THREE from 'three';
import {
  FDIM, beadPose, beadProfile, nozzleTarget, nozzleTipZ, segmentLength, segmentsLaid,
  tankLength, tankLitres, totalSegments,
} from './dimensions.js';
import { cableRun, extrudeProfile, finish, latheZ, mergeNonIndexed, taperedBeam } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * FD-4 — additive fabrication drone.
 *
 * The twelfth subject, and the first that brings something with it.
 *
 * Every subject before this one was a machine and nothing else. The tank is a tank; the rack is
 * a rack; even the container, which you look into, is only ever the box. This one is a machine
 * plus **the thing it made** — a printed pier standing on the bed underneath it — and that
 * turns out to be the change worth writing down, because it forces two questions the project
 * had never had to answer.
 *
 * **Where does the work live in the graph?** Not under the nozzle. A bead parented to the head
 * would fly off with the drone the moment anything moved, which is exactly backwards: material
 * that has left the nozzle is in the world's frame and stays there. So `Workpiece_Group` is a
 * SIBLING of the airframe, at the origin, and the airframe is what moves relative to it. That
 * one decision is the whole reason the hover solve below reads the way it does.
 *
 * **Who commands the drone's position?** Nothing does, and that is the subject.
 *
 * The RA-6 made the sliders stop being the axes: you tell the head where to look and the arm
 * solves two of its six axes to hold that aim while the rest of it moves. This goes one step
 * further and removes the command as well. The nozzle has to be over the next segment of bead
 * to be laid, and which segment that is follows from how much feedstock has left the tank — so
 * the machine's position in space is a function of a single number, CHARGE, and there is no
 * slider for X, Y or Z anywhere. Drain the reservoir from full to empty and the drone walks
 * itself around the pier and climbs it, course by course, laying the bead as it goes.
 *
 * It can do that for a reason the arm could not: an arm is bolted to a floor, so the only thing
 * it can spend to hold a target is its own joints, and it runs out of them. This machine is not
 * bolted to anything. Its three spare degrees of freedom are the free-flying root itself, which
 * makes the solve a subtraction rather than an inverse — `platform += target - wherever the tip
 * ended up` — with no trigonometry, no iteration and no unreachable poses to be honest about.
 *
 * The three boom sliders are still real axes and still driven directly. What they now change is
 * the machine's ATTITUDE relative to the work rather than the nozzle's position: swing BOOM YAW
 * and the whole airframe slides across the pier to keep the tip where it has to be. That is the
 * demonstration, and it is the same shape of statement the RA-6 makes with its wrist.
 */
export function buildFabricator() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'Fab_Root';

  root.add(buildWorkpiece(M));

  /**
   * The node the hover solve writes. It carries no joint of its own and no explode vector —
   * its position is a derived quantity, and anything else writing to it would be fighting the
   * solve every frame.
   */
  const platform = new THREE.Object3D();
  platform.name = 'Airframe_Platform';
  registerPart(platform, { explodable: false });
  root.add(platform);

  platform.add(buildCollision());
  platform.add(buildBody(M));
  platform.add(buildCore(M));
  platform.add(buildLift(M));
  platform.add(buildReservoir(M));
  platform.add(buildPump(M));
  platform.add(buildLegs(M));
  platform.add(buildDetails(M));
  platform.add(buildBoom(M));

  const L = FDIM.limits;
  const legStance = FDIM.leg.stance;
  const half = tankLength() / 2;

  root.userData.joints = [
    {
      /**
       * The only command on the machine, and the one every other fact about its pose is derived
       * from. Its declared target is the reservoir's ram, which is a real prismatic axis: a
       * viewer that never calls `afterArticulate` still gets a working piston and a static
       * drone, rather than a dead control. Degraded, not broken — the same fallback the RA-6's
       * aim sliders arrange.
       *
       * Full at `max`, so the piston sits at the back of the barrel and travels forward to the
       * outlet as the tank empties.
       */
      key: 'charge', label: 'CHARGE, L', unit: '', min: 0, max: tankLitres(), step: 0.05,
      value: FDIM.rest.charge * tankLitres(),
      targets: [{ node: 'Piston_Slide', axis: 'z', prop: 'position', from: half, to: -half }],
    },
    {
      key: 'boomYaw', label: 'BOOM YAW', unit: '°', min: -L.boomYaw, max: L.boomYaw, step: 1, value: 0,
      targets: [{ node: 'Boom_Yaw', axis: 'y', from: -L.boomYaw, to: L.boomYaw }],
    },
    {
      key: 'boomPitch', label: 'BOOM PITCH', unit: '°',
      min: -L.boomPitch, max: L.boomPitch, step: 0.5, value: 0,
      targets: [{ node: 'Boom_Pitch', axis: 'x', from: -L.boomPitch, to: L.boomPitch }],
    },
    {
      key: 'headPitch', label: 'HEAD PITCH', unit: '°',
      min: -L.headPitch, max: L.headPitch, step: 0.5, value: 0,
      targets: [{ node: 'Head_Pitch', axis: 'x', from: -L.headPitch, to: L.headPitch }],
    },
    {
      // One slider, eight pivots. The limbs are landing gear; posing them independently would
      // claim a manipulator this machine does not have.
      key: 'stance', label: 'STANCE', unit: '', min: 0, max: 100, step: 1, value: FDIM.rest.stance,
      targets: legQuadrants().flatMap(({ tag }) => [
        { node: `Leg_${tag}_Hip`, axis: 'x', from: legStance.hip[0], to: legStance.hip[1] },
        { node: `Leg_${tag}_Knee`, axis: 'x', from: legStance.knee[0], to: legStance.knee[1] },
      ]),
    },
    {
      key: 'rotors', label: 'ROTOR PHASE', unit: '°', min: 0, max: 360, step: 1, value: 0,
      targets: legQuadrants().map(({ tag }) => ({
        node: `Rotor_${tag}_Spin`, axis: 'y', from: 0, to: 360,
      })),
    },
  ];

  /**
   * Author the rest pose through the same path the viewer will take: seat the ram where the
   * CHARGE slider's default would put it, then run the solve. Building the graph in a pose the
   * viewer would never produce is how a drawing and its exported GLB quietly stop agreeing —
   * and here it would be worse than cosmetic, because the ram's position IS the charge and the
   * whole machine's position follows from it.
   */
  root.getObjectByName('Piston_Slide').position.z = half * (1 - 2 * FDIM.rest.charge);
  updateFabricatorPose(root);
  return root;
}

/**
 * Put the nozzle on the work, and the work under the nozzle.
 *
 * Two derived facts, both read out of the graph rather than held anywhere:
 *
 *   1. How much bead is on the bed. The ram's position IS the charge — `applyArticulation` has
 *      just written it from the slider — so the segment count is a pure function of one node's
 *      transform. Nothing accumulates and nothing has to be reset between frames.
 *   2. Where the airframe has to be. Zero the platform, look at where the orifice landed, and
 *      translate by the difference. Doing it from zero rather than incrementally is what makes
 *      it idempotent: run it twice on the same state and you get the same answer, which an
 *      accumulating version would not.
 *
 * The extra `updateMatrixWorld` is the cost, and it is one subtree walk per frame. The
 * alternative is composing the boom's three rotations by hand here, which would put the
 * builder's link lengths in two places and drift the first time one of them changed.
 */
export function updateFabricatorPose(root) {
  const piston = root.getObjectByName('Piston_Slide');
  const platform = root.getObjectByName('Airframe_Platform');
  const tip = root.getObjectByName('Nozzle_Tip');
  const bead = root.getObjectByName('Bead_Instanced');
  if (!piston || !platform || !tip || !bead) return;

  const span = tankLength();
  // The ram travels from -half (full) to +half (empty); invert that back into litres.
  const charge = ((span / 2 - piston.position.z) / span) * tankLitres();

  bead.count = Math.min(segmentsLaid(charge), totalSegments());

  const target = nozzleTarget(charge);
  platform.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  // Resolved in the root's own frame rather than the world's, so the answer does not change if
  // the subject is ever placed somewhere other than the scene origin.
  const at = root.worldToLocal(tip.getWorldPosition(new THREE.Vector3()));
  platform.position.set(target.x - at.x, target.y - at.y, target.z - at.z);
}

// --- the work --------------------------------------------------------------

/**
 * The printed pier, and the slab it stands on.
 *
 * One InstancedMesh over the whole finished part, with `count` cut back to what has actually
 * been extruded. This is the project's first instanced block that is not part of the machine
 * at all — and it is the most honest instancing case yet, because every segment really is one
 * static transform of one identical extrusion. That is the test the walker set when it declined
 * to instance its feet, and the bead passes it more cleanly than the rack's sleds did.
 *
 * Hiding the unlaid segments by lowering `count` rather than by scaling or moving them matters:
 * an instance past `count` is not drawn and not submitted, so the triangle readout falls as the
 * tank empties in reverse. The drawing's own instrumentation shows the print happening.
 */
function buildWorkpiece(M) {
  const P = FDIM.pier;
  const group = new THREE.Object3D();
  group.name = 'Workpiece_Group';

  const slab = new THREE.Mesh(
    finish(new THREE.BoxGeometry(P.slab.size, P.slab.thickness, P.slab.size).toNonIndexed()),
    M.detail,
  );
  slab.name = 'Bed_Slab';
  slab.position.y = P.slab.thickness / 2;
  slab.receiveShadow = true;
  group.add(registerPart(slab, { explodable: false }));

  const total = totalSegments();
  // Extruded along X, then turned to run along Z so `beadPose`'s yaws stay written in terms of
  // the path rather than the generator's axis.
  const section = extrudeProfile(beadProfile(), segmentLength()).rotateY(-Math.PI / 2);
  section.computeBoundingBox();
  section.computeBoundingSphere();
  const seg = new THREE.InstancedMesh(section, M.armour, total);
  seg.name = 'Bead_Instanced';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < total; i++) {
    const p = beadPose(i);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
    m.compose(pos.set(p.x, p.y, p.z), q, one);
    seg.setMatrixAt(i, m);
  }
  seg.instanceMatrix.needsUpdate = true;
  seg.castShadow = seg.receiveShadow = true;
  group.add(registerPart(seg, { explodable: false }));

  return group;
}

// --- airframe --------------------------------------------------------------

function buildBody(M) {
  const B = FDIM.body;
  const group = new THREE.Object3D();
  group.name = 'Body_Group';

  const hull = new THREE.Mesh(extrudeProfile(B.profile, B.width), M.armour);
  hull.name = 'Hull_Mesh';
  hull.castShadow = hull.receiveShadow = true;
  group.add(registerPart(hull, { explodable: false }));

  const spine = new THREE.Mesh(
    finish(new THREE.BoxGeometry(B.spine.width, B.spine.height, B.spine.length).toNonIndexed()),
    M.detail,
  );
  spine.name = 'Spine_Mesh';
  spine.position.set(0, B.spine.y, B.spine.z);
  spine.castShadow = true;
  group.add(registerPart(spine, { explode: [0, 1.4, 0] }));

  for (const [i, sz] of [-1, 1].entries()) {
    const panel = new THREE.Mesh(
      finish(new THREE.BoxGeometry(B.panel.width, B.panel.height, B.panel.length).toNonIndexed()),
      M.steel,
    );
    panel.name = `Service_Panel_${i + 1}`;
    panel.position.set(0, B.panel.y, B.panel.z * sz);
    group.add(registerPart(panel, { explode: [0, 1.9, sz * 0.6] }));
  }

  const pod = new THREE.Mesh(
    finish(new THREE.BoxGeometry(B.sensor.width, B.sensor.height, B.sensor.depth).toNonIndexed()),
    M.turret,
  );
  pod.name = 'Sensor_Pod';
  pod.position.set(0, B.sensor.y, B.sensor.z);
  pod.castShadow = true;
  group.add(registerPart(pod, { explode: [0, 0.3, 1.6] }));

  const lens = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(B.lens.radius, B.lens.radius, B.lens.depth, 16).toNonIndexed()),
    M.glow2,
  );
  lens.name = 'Sensor_Lens';
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, B.lens.y, B.lens.z);
  group.add(registerPart(lens, { explode: [0, 0.3, 2.1], emissive: 'secondary' }));

  return group;
}

/**
 * The power core, exposed at the centre of the frame.
 *
 * A lit barrel inside an open cage of six ribs, rather than a lit box behind a grille. The
 * distinction is the same one the container's walls made: the cage is real geometry with real
 * gaps, so both display modes agree about what you can see through, and neither has to be told
 * that something is meant to look open.
 */
function buildCore(M) {
  const C = FDIM.core;
  const group = new THREE.Object3D();
  group.name = 'Core_Group';
  group.position.set(0, C.y, C.z);

  const lens = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(C.lens.radius, C.lens.radius, C.lens.length, 20).toNonIndexed()),
    M.glow2,
  );
  lens.name = 'Core_Lens';
  lens.rotation.x = Math.PI / 2;
  group.add(registerPart(lens, { explode: [0, -1.6, 0], emissive: 'secondary' }));

  for (let i = 0; i < C.cage.count; i++) {
    const a = (i / C.cage.count) * Math.PI * 2;
    const rib = new THREE.Mesh(
      finish(new THREE.BoxGeometry(C.cage.thickness, C.cage.thickness, C.lens.length + 0.05).toNonIndexed()),
      M.steel,
    );
    rib.name = `Core_Rib_${i + 1}`;
    rib.position.set(Math.cos(a) * C.cage.radius, Math.sin(a) * C.cage.radius, 0);
    group.add(registerPart(rib, { explode: [Math.cos(a) * 2.0, Math.sin(a) * 2.0, 0] }));
  }

  for (const [i, sz] of [-1, 1].entries()) {
    const ring = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(C.ring.radius, C.ring.radius, C.ring.height, 20).toNonIndexed()),
      M.detail,
    );
    ring.name = `Core_Ring_${i === 0 ? 'R' : 'F'}`;
    ring.rotation.x = Math.PI / 2;
    ring.position.z = sz * C.ring.z;
    group.add(registerPart(ring, { explode: [0, -0.8, sz * 1.5] }));
  }

  return group;
}

/**
 * Lift: four rotor masts and four antigravity emitter pads.
 *
 * Both, and deliberately. The brief carries the emitters as the thing that holds the machine up
 * and the rotors as stabilisers, which is a fiction — but it is a fiction with a consequence
 * the geometry can honour: the emitters sit UNDER the frame, on the load path, and the rotors
 * sit above it on outriggers where a stabiliser has leverage. A drawing that put them the other
 * way round would be saying something different about the machine.
 */
function buildLift(M) {
  const R = FDIM.rotor;
  const E = FDIM.emitter;
  const group = new THREE.Object3D();
  group.name = 'Lift_Group';

  for (const { tag, sx, sz } of legQuadrants()) {
    const mast = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(R.mast.radius, R.mast.radius * 1.2, R.mast.height, 12).toNonIndexed()),
      M.steel,
    );
    mast.name = `Mast_${tag}`;
    mast.position.set(sx * R.mast.x, R.y - R.mast.height / 2, sz * R.mast.z);
    mast.castShadow = true;
    group.add(registerPart(mast, { explode: [sx * 1.1, 0.5, sz * 1.1] }));

    const spin = new THREE.Object3D();
    spin.name = `Rotor_${tag}_Spin`;
    spin.position.set(sx * R.mast.x, R.y + R.hub.height / 2, sz * R.mast.z);
    registerPart(spin, { explodable: false });
    group.add(spin);

    const hub = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(R.hub.radius, R.hub.radius * 0.85, R.hub.height, 12).toNonIndexed()),
      M.detail,
    );
    hub.name = `Rotor_${tag}_Hub`;
    spin.add(registerPart(hub, { explode: [sx * 1.4, 1.2, sz * 1.4] }));

    // Two blades as one mesh: a prop is one part, and splitting it would give the outline
    // filter a seam through the middle of a component that has none.
    const one = taperedBeam({ length: R.blade.length, ...bladeBox(R) });
    const blades = new THREE.Mesh(
      mergeNonIndexed([one, one.clone().rotateY(Math.PI)]), M.rubber,
    );
    blades.name = `Rotor_${tag}_Blades`;
    blades.position.y = R.hub.height / 2 + 0.012;
    blades.castShadow = true;
    spin.add(registerPart(blades, { explode: [sx * 1.8, 1.7, sz * 1.8] }));

    const pad = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(E.pad.radius, E.pad.radius * 0.88, E.pad.height, 16).toNonIndexed()),
      M.armour,
    );
    pad.name = `Emitter_${tag}_Pad`;
    pad.position.set(sx * E.pad.x, E.y, sz * E.pad.z);
    pad.castShadow = true;
    group.add(registerPart(pad, { explode: [sx * 1.3, -1.1, sz * 1.3] }));

    const lens = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(E.lens.radius, E.lens.radius, E.lens.height, 16).toNonIndexed()),
      M.glow2,
    );
    lens.name = `Emitter_${tag}_Lens`;
    lens.position.set(sx * E.pad.x, E.y - E.pad.height / 2, sz * E.pad.z);
    group.add(registerPart(lens, { explode: [sx * 1.5, -1.6, sz * 1.5], emissive: 'secondary' }));
  }

  return group;
}

/**
 * The reservoir: a ram-fed barrel with its level made visible outside it.
 *
 * The ram is the CHARGE slider's declared target, which makes it this project's second
 * prismatic joint after the rack's service slide — and the first where the prismatic axis is
 * the machine's primary command rather than a maintenance convenience.
 *
 * The level follower exists because a sealed barrel has nothing to look at. Rather than pretend
 * the shell is transparent — which the blueprint pass could fake and the game path could not,
 * so the two modes would disagree — the piston carries a lit collar on an external rail. Same
 * argument the container's walls settled: give both renderers real geometry and neither has to
 * be told anything.
 */
function buildReservoir(M) {
  const T = FDIM.tank;
  const len = tankLength();
  const group = new THREE.Object3D();
  group.name = 'Reservoir_Group';
  group.position.set(T.x, T.y, T.z);

  const shell = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(T.radius, T.radius, len, 22).toNonIndexed()), M.armour,
  );
  shell.name = 'Tank_Shell';
  shell.rotation.x = Math.PI / 2;
  shell.castShadow = shell.receiveShadow = true;
  group.add(registerPart(shell, { explode: [-1.8, 0, 0] }));

  for (const [i, sz] of [-1, 1].entries()) {
    const cap = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(T.cap.radius, T.cap.radius * 0.9, T.cap.length, 22).toNonIndexed()),
      M.steel,
    );
    cap.name = `Tank_Cap_${i === 0 ? 'R' : 'F'}`;
    cap.rotation.x = Math.PI / 2;
    cap.position.z = sz * (len / 2 + T.cap.length / 2);
    group.add(registerPart(cap, { explode: [-1.9, 0, sz * 1.2] }));
  }

  for (const [i, sz] of [-1, 1].entries()) {
    const strap = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(T.radius + T.strap.thickness, T.radius + T.strap.thickness, T.strap.width, 22)
        .toNonIndexed()),
      M.detail,
    );
    strap.name = `Tank_Strap_${i + 1}`;
    strap.rotation.x = Math.PI / 2;
    strap.position.z = sz * T.strap.z;
    group.add(registerPart(strap, { explode: [-2.2, 0, sz * 0.5] }));
  }

  const rail = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(T.rail.radius, T.rail.radius, len, 10).toNonIndexed()), M.steel,
  );
  rail.name = 'Sight_Rail';
  rail.rotation.x = Math.PI / 2;
  rail.position.x = T.rail.x;
  group.add(registerPart(rail, { explode: [-2.6, 0, 0] }));

  const outlet = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(T.outlet.radius, T.outlet.radius, T.outlet.length, 12).toNonIndexed()),
    M.steel,
  );
  outlet.name = 'Feed_Outlet';
  outlet.rotation.x = Math.PI / 2;
  outlet.position.z = len / 2 + T.cap.length + T.outlet.length / 2;
  group.add(registerPart(outlet, { explode: [-1.4, 0, 2.0] }));

  /**
   * The ram. Driven by CHARGE through `prop: 'position'`, so it must not be explodable — the
   * explode system restores from a stored rest position and the two would fight over the same
   * property. The invariant suite checks exactly that, on every subject.
   */
  const slide = new THREE.Object3D();
  slide.name = 'Piston_Slide';
  registerPart(slide, { explodable: false });
  group.add(slide);

  const face = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(T.radius * 0.94, T.radius * 0.94, 0.03, 20).toNonIndexed()),
    M.detail,
  );
  face.name = 'Piston_Face';
  face.rotation.x = Math.PI / 2;
  slide.add(registerPart(face, { explode: [-1.2, 0.9, 0] }));

  const arm = new THREE.Mesh(
    finish(new THREE.BoxGeometry(-T.rail.x, 0.026, 0.03).toNonIndexed()), M.steel,
  );
  arm.name = 'Follower_Arm';
  arm.position.x = T.rail.x / 2;
  slide.add(registerPart(arm, { explode: [-1.5, 0.7, 0] }));

  const collar = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(T.collar.radius, T.collar.radius, T.collar.length, 12).toNonIndexed()),
    M.glow2,
  );
  collar.name = 'Level_Collar';
  collar.rotation.x = Math.PI / 2;
  collar.position.x = T.rail.x;
  slide.add(registerPart(collar, { explode: [-2.0, 0.9, 0], emissive: 'secondary' }));

  return group;
}

function buildPump(M) {
  const P = FDIM.pump;
  const group = new THREE.Object3D();
  group.name = 'Pump_Group';

  const body = new THREE.Mesh(
    finish(new THREE.BoxGeometry(P.body.width, P.body.height, P.body.depth).toNonIndexed()), M.turret,
  );
  body.name = 'Pump_Body';
  body.position.set(P.body.x, P.body.y, P.body.z);
  body.castShadow = true;
  group.add(registerPart(body, { explode: [1.9, 0, 0] }));

  const motor = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(P.motor.radius, P.motor.radius * 0.9, P.motor.length, 14).toNonIndexed()),
    M.steel,
  );
  motor.name = 'Pump_Motor';
  motor.rotation.z = Math.PI / 2;
  motor.position.set(P.motor.x, P.motor.y, P.motor.z);
  group.add(registerPart(motor, { explode: [2.4, 0.5, 0.4] }));

  const manifold = new THREE.Mesh(
    finish(new THREE.BoxGeometry(P.manifold.width, P.manifold.height, P.manifold.depth).toNonIndexed()),
    M.detail,
  );
  manifold.name = 'Pump_Manifold';
  manifold.position.set(P.manifold.x, P.manifold.y, P.manifold.z);
  group.add(registerPart(manifold, { explode: [1.7, -1.0, 0.6] }));

  return group;
}

/**
 * Four bracing limbs.
 *
 * The splay is a fixed node rather than part of the hip's rotation, for the reason the RA-6's
 * `Shoulder_Mount` exists: with the outward lean held in one non-driven transform, the STANCE
 * slider is a single pair of angles applied identically to all four limbs. Fold the splay into
 * the driven hip and every quadrant needs its own numbers, and the pose table stops being
 * readable as a pose.
 */
function buildLegs(M) {
  const G = FDIM.leg;
  const group = new THREE.Object3D();
  group.name = 'Legs_Group';

  const t = FDIM.rest.stance / 100;
  const restHip = G.stance.hip[0] + t * (G.stance.hip[1] - G.stance.hip[0]);
  const restKnee = G.stance.knee[0] + t * (G.stance.knee[1] - G.stance.knee[0]);

  for (const { tag, sx, sz } of legQuadrants()) {
    const splay = new THREE.Object3D();
    splay.name = `Leg_${tag}_Splay`;
    splay.position.set(sx * G.hip.x, G.hip.y, sz * G.hip.z);
    /**
     * Which way this limb swings. A hip rotation drives the limb toward its frame's -Z, so the
     * front pair are turned through 180 to swing forward and the rear pair are left alone —
     * then both are leaned `splay` degrees outboard. Four quadrants, one pair of hip angles.
     */
    splay.rotation.y = THREE.MathUtils.degToRad((sz > 0 ? 180 : 0) + sx * sz * G.splay);
    registerPart(splay, { explodable: false });
    group.add(splay);

    const yoke = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(G.yoke.radius, G.yoke.radius, G.yoke.width, 14).toNonIndexed()),
      M.steel,
    );
    yoke.name = `Leg_${tag}_Yoke`;
    yoke.rotation.z = Math.PI / 2;
    splay.add(registerPart(yoke, { explode: [sx * 1.4, 0, sz * 1.4] }));

    /**
     * Fixed +90 about X so the limb's local +Z points at the ground and every segment below can
     * be authored along its own axis with `taperedBeam`. Same trick as the arm's shoulder
     * mount, pointed the other way.
     */
    const mount = new THREE.Object3D();
    mount.name = `Leg_${tag}_Mount`;
    mount.rotation.x = Math.PI / 2;
    registerPart(mount, { explodable: false });
    splay.add(mount);

    const hip = new THREE.Object3D();
    hip.name = `Leg_${tag}_Hip`;
    hip.rotation.x = THREE.MathUtils.degToRad(restHip);
    registerPart(hip, { explodable: false });
    mount.add(hip);

    const thigh = new THREE.Mesh(taperedBeam({ length: G.thigh.length, ...beamBox(G.thigh) }), M.armour);
    thigh.name = `Leg_${tag}_Thigh`;
    thigh.castShadow = true;
    hip.add(registerPart(thigh, { explode: [sx * 1.0, 0, 1.0] }));

    const knee = new THREE.Object3D();
    knee.name = `Leg_${tag}_Knee`;
    knee.position.z = G.thigh.length;
    knee.rotation.x = THREE.MathUtils.degToRad(restKnee);
    registerPart(knee, { explodable: false });
    hip.add(knee);

    const cap = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(G.knee.radius, G.knee.radius, G.knee.width, 12).toNonIndexed()),
      M.detail,
    );
    cap.name = `Leg_${tag}_Cap`;
    cap.rotation.z = Math.PI / 2;
    knee.add(registerPart(cap, { explode: [sx * 1.5, 0, 1.3] }));

    const shin = new THREE.Mesh(taperedBeam({ length: G.shin.length, ...beamBox(G.shin) }), M.armour);
    shin.name = `Leg_${tag}_Shin`;
    shin.castShadow = true;
    knee.add(registerPart(shin, { explode: [sx * 1.2, 0, 1.7] }));

    const pad = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(G.pad.radius, G.pad.radius * 1.15, G.pad.height, 14).toNonIndexed()),
      M.rubber,
    );
    pad.name = `Leg_${tag}_Pad`;
    pad.rotation.x = Math.PI / 2;
    pad.position.z = G.shin.length + G.pad.height / 2;
    knee.add(registerPart(pad, { explode: [sx * 1.4, 0, 2.2] }));
  }

  return group;
}

/**
 * The print boom, and the extruder on the end of it.
 *
 * Three driven axes, none of which decides where the nozzle ends up — the hover solve does
 * that. `Nozzle_Tip` is an empty at the orifice and is the one node in this subject that other
 * code reads by name, which is why it is a named pivot rather than a position buried in the
 * cone's geometry.
 */
function buildBoom(M) {
  const B = FDIM.boom;
  const H = FDIM.head;

  const yaw = new THREE.Object3D();
  yaw.name = 'Boom_Yaw';
  yaw.position.y = B.yawY;
  registerPart(yaw, { explodable: false });

  const collar = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(B.collar.radius, B.collar.radius * 1.1, B.collar.height, 16).toNonIndexed()),
    M.steel,
  );
  collar.name = 'Boom_Collar';
  yaw.add(registerPart(collar, { explode: [0, -1.2, 0] }));

  const mount = new THREE.Object3D();
  mount.name = 'Boom_Mount';
  mount.rotation.x = Math.PI / 2;      // local +Z now points at the bed
  registerPart(mount, { explodable: false });
  yaw.add(mount);

  const pitch = new THREE.Object3D();
  pitch.name = 'Boom_Pitch';
  registerPart(pitch, { explodable: false });
  mount.add(pitch);

  const shoulder = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(B.shoulder.radius, B.shoulder.radius, B.shoulder.width, 16).toNonIndexed()),
    M.detail,
  );
  shoulder.name = 'Boom_Shoulder';
  shoulder.rotation.z = Math.PI / 2;
  pitch.add(registerPart(shoulder, { explode: [1.4, 0, 0] }));

  // Cranked: the far end is offset in the mount's local +Y, which this frame points forward.
  // That offset is the radius BOOM YAW swings the head through — see `boom.crank`.
  const upper = new THREE.Mesh(
    taperedBeam({ length: B.upper, ...B.upperBox, dy: B.crank }), M.armour,
  );
  upper.name = 'Boom_Upper';
  upper.castShadow = true;
  pitch.add(registerPart(upper, { explode: [0, 0, 1.1] }));

  /**
   * The feed line, in three runs with a swivel at each break.
   *
   * The reference sheet draws one continuous hose from the reservoir to the nozzle, and that is
   * the one thing on it this subject will not build. `cableRun` carries the constraint in its
   * docstring — a run must stay inside ONE rigid frame, because there is no skinning anywhere
   * in this project — so a hose authored across the boom's pitch axis would tear open the first
   * time the slider moved. The fix is not a renderer feature; it is how a real machine is
   * dressed: break the line at every joint and put a rotary coupling there. Three runs, two
   * couplings, and it survives the whole envelope.
   */
  const coupling = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(0.036, 0.036, 0.06, 12).toNonIndexed()), M.steel,
  );
  coupling.name = 'Coupling_Boom';
  coupling.rotation.z = Math.PI / 2;
  coupling.position.set(0.085, -0.04, 0.05);
  pitch.add(registerPart(coupling, { explode: [1.8, -0.6, 0.2] }));

  const hose = new THREE.Mesh(
    cableRun([
      [0.085, -0.04, 0.06], [0.10, 0.01, 0.14], [0.088, 0.08, 0.24],
      [0.06, B.crank - 0.04, B.upper - 0.01],
    ], { radius: 0.024 }),
    M.rubber,
  );
  hose.name = 'Feed_Line_Boom';
  pitch.add(registerPart(hose, { explode: [1.6, -0.9, 0.4] }));

  const headPitch = new THREE.Object3D();
  headPitch.name = 'Head_Pitch';
  headPitch.position.set(0, B.crank, B.upper);
  registerPart(headPitch, { explodable: false });
  pitch.add(headPitch);

  const elbow = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(B.elbow.radius, B.elbow.radius, B.elbow.width, 14).toNonIndexed()),
    M.detail,
  );
  elbow.name = 'Head_Elbow';
  elbow.rotation.z = Math.PI / 2;
  headPitch.add(registerPart(elbow, { explode: [1.3, 0, 1.4] }));

  const body = new THREE.Mesh(
    finish(new THREE.BoxGeometry(H.body.width, H.body.height, H.body.depth).toNonIndexed()), M.turret,
  );
  body.name = 'Extruder_Body';
  body.position.z = H.gap + H.body.depth / 2;
  body.castShadow = true;
  headPitch.add(registerPart(body, { explode: [0, 0, 1.9] }));

  const headHose = new THREE.Mesh(
    cableRun([
      [0.06, -0.04, 0.0], [0.075, -0.03, 0.03], [0.055, -0.01, 0.07], [0.02, 0.0, 0.10],
    ], { radius: 0.022 }),
    M.rubber,
  );
  headHose.name = 'Feed_Line_Head';
  headPitch.add(registerPart(headHose, { explode: [1.5, -0.5, 1.6] }));

  // A heated extruder is genuinely hot, and it is the only thing on this machine that is hot
  // rather than powered — so it takes the fourth accent channel instead of the blue one every
  // other lit part is on. The distinction is a fact about the part, not a palette choice.
  const heater = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(H.heater.radius, H.heater.radius, H.heater.length, 16).toNonIndexed()),
    M.glow4,
  );
  heater.name = 'Nozzle_Heater';
  heater.rotation.x = Math.PI / 2;
  heater.position.z = H.gap + H.body.depth + H.heater.length / 2;
  headPitch.add(registerPart(heater, { explode: [0, 0, 2.3], emissive: 'quaternary' }));

  const cone = new THREE.Mesh(
    // Down the outside, across the orifice annulus, back up the bore and out along the top:
    // a solid cone with a hole in it rather than a one-sided surface, for the reason the
    // container's walls are sheets. The only open end is buried inside the heater band.
    latheZ([
      [H.cone.radius, 0], [H.cone.tip, H.cone.length], [H.cone.tip * 0.55, H.cone.length],
      [H.cone.tip * 0.55, H.cone.length * 0.35], [H.cone.radius * 0.72, 0],
    ], 16), M.steel,
  );
  cone.name = 'Nozzle_Cone';
  cone.position.z = H.gap + H.body.depth + H.heater.length;
  headPitch.add(registerPart(cone, { explode: [0, 0, 2.7] }));

  /** The orifice. The hover solve reads this node and nothing else about the boom. */
  const tip = new THREE.Object3D();
  tip.name = 'Nozzle_Tip';
  tip.position.z = nozzleTipZ();
  registerPart(tip, { explodable: false });
  headPitch.add(tip);

  return yaw;
}

/**
 * Dress-out on the airframe: the first of the three feed runs, and its clips.
 *
 * Authored in the platform's frame, from the reservoir outlet round to the boom's yaw axis, and
 * it stops there. Everything past the yaw axis belongs to a frame that rotates.
 */
function buildDetails(M) {
  const T = FDIM.tank;
  const len = tankLength();
  const group = new THREE.Object3D();
  group.name = 'Details_Group';

  const z0 = T.z + len / 2 + T.cap.length + T.outlet.length;
  const run = new THREE.Mesh(
    cableRun([
      [T.x, T.y, z0], [T.x + 0.06, T.y - 0.06, z0 + 0.08], [-0.22, -0.14, 0.16],
      [-0.10, -0.15, 0.04], [0, -0.13, -0.01],
    ], { radius: 0.028 }),
    M.rubber,
  );
  run.name = 'Feed_Line_Body';
  group.add(registerPart(run, { explode: [-1.2, -1.4, 0] }));

  for (const [i, p] of [[-0.26, -0.145, 0.19], [-0.12, -0.15, 0.05]].entries()) {
    const clip = new THREE.Mesh(
      finish(new THREE.BoxGeometry(0.05, 0.035, 0.04).toNonIndexed()), M.detail,
    );
    clip.name = `Feed_Clip_${i + 1}`;
    clip.position.set(...p);
    group.add(registerPart(clip, { explode: [-1.0, -1.8, 0] }));
  }

  const beacon = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 10).toNonIndexed()), M.glow2,
  );
  beacon.name = 'Beacon_Aft';
  beacon.position.set(0, 0.235, -0.34);
  group.add(registerPart(beacon, { explode: [0, 2.3, -0.8], emissive: 'secondary' }));

  return group;
}

/**
 * Collision proxy: the airframe body, and only that.
 *
 * The RA-6's precedent — a proxy that describes what is reliably there rather than one that
 * pretends to bound a swept volume. Boxing the rotors in would claim a 1.7 m cube of mostly
 * empty air, and boxing the boom in would claim a volume that moves. A child of the platform,
 * so it travels with the machine rather than sitting where the drone used to be.
 */
function buildCollision() {
  const geom = new THREE.BoxGeometry(0.66, 0.34, 1.06);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Airframe_Collision';
  mesh.position.set(0, 0.005, 0.07);
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}

// --- helpers ---------------------------------------------------------------

/** The four corner quadrants, named the way the reference sheet labels them. */
function legQuadrants() {
  return [
    { tag: 'FL', sx: -1, sz: 1 },
    { tag: 'FR', sx: 1, sz: 1 },
    { tag: 'RL', sx: -1, sz: -1 },
    { tag: 'RR', sx: 1, sz: -1 },
  ];
}

function beamBox(s) {
  return { w0: s.w0, h0: s.h0, w1: s.w1, h1: s.h1 };
}

function bladeBox(R) {
  return { w0: R.blade.w0, h0: R.blade.h0, w1: R.blade.w1, h1: R.blade.h1 };
}
