import * as THREE from 'three';
import {
  PDIM, apertureDepth, apertureRadius, legFoot, outerRadius, podAngles, rowProfile, vaneAngle,
} from './dimensions.js';
import {
  arcSegment, cableRun, extrudeProfile, finish, latheZ, ringLayout, taperedBeam,
} from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * GT-9 — transit gate.
 *
 * The thirteenth subject, and the first whose specification includes something that must NOT
 * exist.
 *
 * Every subject so far has been described by what it has: a turret, eight legs, twenty-eight
 * sleds, a printed pier. The brief for this one is a heavy industrial ring with an EMPTY centre,
 * because whatever appears in that centre is composited downstream in another application. So
 * the hole is not an absence of modelling effort — it is the deliverable, and it needs the same
 * treatment as any other part of it.
 *
 * **The aperture is a transform, not a mesh.** `Aperture_Volume` is an empty `Object3D` at the
 * bore centre whose SCALE is the clear cylinder: `(radius, radius, halfDepth)`. That is the
 * whole interface. It exports as TRS like every other node, so the other application reads the
 * volume off the node rather than off a README, and it cannot drift from the geometry because
 * the same `apertureRadius()` lays out the liner that bounds it.
 *
 * It is deliberately not a hidden proxy mesh. The collision proxy is one of those and it costs
 * the shared contract an exemption — `isCollision` meshes are skipped by the UV/partId checks —
 * and a second exemption for a second kind of invisible mesh would be the checklist growing a
 * hole per subject. A node with a scale needs no exemption at all.
 *
 * **What guarantees the hole is a test, not a display feature.** No vertex in the graph may lie
 * inside that cylinder, swept over the entire articulation envelope. That is the property the
 * downstream artist is actually relying on, and it is worth being precise that this subject
 * added nothing to the viewer to provide it — the FD-4 earned a display hook, this one earned
 * an assertion. Not every requirement is a capability.
 *
 * **The collision proxy cannot bound this subject.** Every other proxy is a box around the whole
 * machine. A box around a ring contains the bore, so it would claim as solid the one volume the
 * subject promises is empty — and anything pathing against it would refuse to walk through the
 * gate. The proxy is the plinth footprint, which is the part that is actually there. The RA-6
 * set this precedent for a swept volume; here the reason is sharper.
 */
export function buildPortal() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'Portal_Root';

  root.add(buildBase(M));

  const yaw = new THREE.Object3D();
  yaw.name = 'Yaw_Turntable';
  registerPart(yaw, { explodable: false });
  root.add(yaw);

  yaw.add(buildButtresses(M));

  const ring = new THREE.Object3D();
  ring.name = 'Ring_Group';
  ring.position.y = PDIM.centreY;
  registerPart(ring, { explodable: false });
  yaw.add(ring);

  /**
   * The hole. A unit cylinder scaled to the clear volume: radius in X and Y, half-depth in Z.
   * It has no children on purpose — a scale that reached anything would be a scale on geometry.
   */
  const aperture = new THREE.Object3D();
  aperture.name = 'Aperture_Volume';
  aperture.scale.set(apertureRadius(), apertureRadius(), apertureDepth() / 2);
  registerPart(aperture, { explodable: false });
  ring.add(aperture);

  ring.add(buildLiner(M));
  ring.add(buildStator(M));

  const rotorA = buildRotor(M, 'A', PDIM.rows.rotorA, [0, 0, 0.9]);
  const rotorB = buildRotor(M, 'B', PDIM.rows.rotorB, [0, 0, -0.9]);
  ring.add(rotorA, rotorB);

  ring.add(buildPods(M));

  const L = PDIM.limits;
  root.userData.joints = [
    {
      key: 'yaw', label: 'GATE BEARING', unit: '°', min: -L.yaw, max: L.yaw, step: 1, value: 0,
      targets: [{ node: 'Yaw_Turntable', axis: 'y', from: -L.yaw, to: L.yaw }],
    },
    {
      key: 'rotorA', label: 'ROTOR A', unit: '°', min: 0, max: L.rotor, step: 1, value: 0,
      targets: [{ node: 'Rotor_A_Spin', axis: 'z', from: 0, to: L.rotor }],
    },
    {
      // Counter-rotating, which is why the running clearances between rows are dimensions
      // rather than taste. `rowGaps` is what holds them apart; an invariant reads it.
      key: 'rotorB', label: 'ROTOR B', unit: '°', min: 0, max: L.rotor, step: 1, value: 0,
      targets: [{ node: 'Rotor_B_Spin', axis: 'z', from: 0, to: -L.rotor }],
    },
    {
      // One slider, sixteen hinges — the pods are a bank, not sixteen independent surfaces.
      key: 'vanes', label: 'RADIATOR FAN', unit: '', min: 0, max: 100, step: 1,
      value: PDIM.rest.vanes,
      targets: podAngles().flatMap((_, i) => [
        { node: `Pod_${i + 1}_Vane_L`, axis: 'z', from: PDIM.pod.fan.stowed, to: PDIM.pod.fan.deployed },
        { node: `Pod_${i + 1}_Vane_R`, axis: 'z', from: -PDIM.pod.fan.stowed, to: -PDIM.pod.fan.deployed },
      ]),
    },
  ];

  return root;
}

// --- the ring --------------------------------------------------------------

/**
 * The bore liner: the one part of the gate that touches the aperture, and the surface that
 * defines it. Full 360°, because a segmented liner would leave the clear volume bounded by
 * eight separate faces with gaps between them — and the gaps would be inside the bore.
 */
function buildLiner(M) {
  const L = PDIM.rows.liner;
  const E = PDIM.edge;
  const group = new THREE.Object3D();
  group.name = 'Liner_Group';

  const h = L.depth / 2;
  const liner = new THREE.Mesh(
    // Lathed about Z: down the bore, out along the rear face, back along the outside, in along
    // the front. A closed section, so the game path sees a solid ring from both sides.
    latheZ([
      [L.r0, -h], [L.r1, -h], [L.r1, h], [L.r0, h], [L.r0, -h],
    ], 64),
    M.steel,
  );
  liner.name = 'Liner_Ring';
  liner.castShadow = liner.receiveShadow = true;
  group.add(registerPart(liner, { explodable: false }));

  // The accent the brief puts on the edges: a lit ring on each face of the liner, so the bore
  // is outlined in blue from the front, the back and every angle between.
  for (const [tag, sz] of [['Front', 1], ['Rear', -1]]) {
    const glow = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(E.radius, E.radius, E.thickness, 64, 1, true).toNonIndexed()),
      M.glow2,
    );
    glow.name = `Edge_Ring_${tag}`;
    glow.rotation.x = Math.PI / 2;
    glow.position.z = sz * (h - E.inset);
    group.add(registerPart(glow, { explode: [0, 0, sz * 1.4], emissive: 'secondary' }));
  }

  return group;
}

/**
 * A rotor row: N arc segments and N lit strips, two InstancedMeshes over the same transforms.
 *
 * Split lit from unlit for the reason the rack's sleds are split — `registerPart` writes one
 * emissive channel across a whole geometry, so a segment and its accent cannot share a mesh.
 *
 * The instance matrices are static within the row; the row's own node carries the rotation. That
 * is what makes instancing legitimate here where the walker refused it for its feet: eighteen
 * copies of one transform under one articulated parent, not eighteen different ones.
 */
function buildRotor(M, tag, row, explode) {
  const spin = new THREE.Object3D();
  spin.name = `Rotor_${tag}_Spin`;
  registerPart(spin, { explodable: false });

  const layout = ringLayout(row.count, PDIM.gap);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 0, 1);
  const zero = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  const place = (mesh, z = 0) => {
    layout.forEach((s, i) => {
      quat.setFromAxisAngle(axis, s.angle);
      matrix.compose(zero.set(0, 0, z), quat, one);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  const body = new THREE.InstancedMesh(
    arcSegment({
      profile: rowProfile(row), radius: row.r0, angle: layout[0].span, segments: row.arcSteps,
    }),
    M.armour, row.count,
  );
  body.name = `Rotor${tag}_Instanced`;
  body.castShadow = body.receiveShadow = true;
  place(body);
  spin.add(registerPart(body, { explode }));

  /**
   * Lit strips on the row's two FACES, not on its bore side.
   *
   * The first pass put them at `r0 + 12 mm`, which is inside the segment: the strip was buried
   * in the armour and rendered as nothing in both display modes. There is only 40 mm of running
   * clearance inboard of a rotor and an accent cannot live in it — the faces are where a ring
   * this deep has room to show anything.
   *
   * One InstancedMesh carrying twice the count: the front half of the instances sit proud of
   * the front face, the back half of the rear. Two rows of accents, one draw call, one part id
   * — and the id is shared harmlessly because no two of them touch.
   */
  const strip = { r0: row.r0 + 0.09, r1: row.r1 - 0.09, depth: 0.045 };
  const proud = row.depth / 2 - strip.depth / 2 + 0.012;
  const glow = new THREE.InstancedMesh(
    arcSegment({
      profile: rowProfile(strip, 0.012), radius: strip.r0, angle: layout[0].span * 0.80,
      segments: row.arcSteps,
    }),
    M.glow2, row.count * 2,
  );
  glow.name = `Rotor${tag}_Glow_Instanced`;
  layout.forEach((s, i) => {
    quat.setFromAxisAngle(axis, s.angle);
    for (const [half, sz] of [[0, 1], [1, -1]]) {
      matrix.compose(zero.set(0, 0, sz * proud), quat, one);
      glow.setMatrixAt(i + half * row.count, matrix);
    }
  });
  glow.instanceMatrix.needsUpdate = true;
  spin.add(registerPart(glow, { explode: explode.map((v) => v * 1.3), emissive: 'secondary' }));

  return spin;
}

/**
 * The stator: the fixed outer armour, its bolted-on blocks, and the rim strip.
 *
 * This is the row that carries the industrial read, so it gets the deepest section, the fewest
 * and largest segments, and a block on every one.
 */
function buildStator(M) {
  const S = PDIM.rows.stator;
  const B = PDIM.block;
  const group = new THREE.Object3D();
  group.name = 'Stator_Group';

  const layout = ringLayout(S.count, PDIM.gap);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 0, 1);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  const shell = new THREE.InstancedMesh(
    arcSegment({
      profile: rowProfile(S, 0.13), radius: S.r0, angle: layout[0].span, segments: S.arcSteps,
    }),
    M.armour, S.count,
  );
  shell.name = 'Shell_Instanced';
  shell.castShadow = shell.receiveShadow = true;
  layout.forEach((s, i) => {
    quat.setFromAxisAngle(axis, s.angle);
    matrix.compose(pos.set(0, 0, 0), quat, one);
    shell.setMatrixAt(i, matrix);
  });
  shell.instanceMatrix.needsUpdate = true;
  group.add(registerPart(shell, { explode: [0, 0, 0] }));

  // Rim blocks: one per armour segment, standing proud of the outer face.
  const rimR = S.r1 + B.rim.radial / 2 - 0.05;
  const block = new THREE.InstancedMesh(
    finish(new THREE.BoxGeometry(B.rim.radial, B.rim.tangential, B.rim.axial).toNonIndexed()),
    M.turret, B.rim.count,
  );
  block.name = 'Block_Instanced';
  block.castShadow = true;
  ringLayout(B.rim.count, 0).forEach((seg, i) => {
    quat.setFromAxisAngle(axis, seg.angle);
    matrix.compose(pos.set(Math.cos(seg.angle) * rimR, Math.sin(seg.angle) * rimR, 0), quat, one);
    block.setMatrixAt(i, matrix);
  });
  block.instanceMatrix.needsUpdate = true;
  group.add(registerPart(block, { explode: [0, 0, 0] }));

  /**
   * Face boxes: a finer row lying on the ring's front face, at a count that shares no factor
   * with the armour segmentation. Twenty against eight means the two rows drift in and out of
   * phase all the way round, so the rim never repeats — the structural version of the argument
   * the Hepta-T's stowage makes about symmetry reading as a render.
   */
  const face = new THREE.InstancedMesh(
    finish(new THREE.BoxGeometry(B.face.radial, B.face.tangential, B.face.axial).toNonIndexed()),
    M.detail, B.face.count,
  );
  face.name = 'Face_Block_Instanced';
  face.castShadow = true;
  ringLayout(B.face.count, 0).forEach((seg, i) => {
    quat.setFromAxisAngle(axis, seg.angle);
    matrix.compose(
      pos.set(Math.cos(seg.angle) * B.face.radius, Math.sin(seg.angle) * B.face.radius,
        S.depth / 2 + B.face.axial / 2 - 0.03),
      quat, one,
    );
    face.setMatrixAt(i, matrix);
  });
  face.instanceMatrix.needsUpdate = true;
  group.add(registerPart(face, { explode: [0, 0, 1.6] }));

  return group;
}

/**
 * The power pods.
 *
 * The brief's "power sources with blue accent on the edges", built as eight capacitor banks on
 * the rim. Each carries a lit core running right through it along the gate's axis, so the accent
 * reads from the front, from the back and from the edge — a lamp on one face would have been
 * invisible from the other side of a subject you are meant to look through.
 *
 * The vanes fold back along the rim and fan out on one slider. Their hinges are about the gate's
 * axis, so they open in the ring's own plane and the motion reads in the front elevation, which
 * is the view this subject is actually about.
 */
function buildPods(M) {
  const P = PDIM.pod;
  const group = new THREE.Object3D();
  group.name = 'Pods_Group';

  const rest = vaneAngle(PDIM.rest.vanes);
  const rim = outerRadius();

  podAngles().forEach((angle, i) => {
    const n = i + 1;
    const mount = new THREE.Object3D();
    mount.name = `Pod_${n}_Mount`;
    mount.rotation.z = angle;
    registerPart(mount, { explodable: false });
    group.add(mount);

    // In the mount's frame +X is radially out, +Y tangential, +Z along the gate's axis.
    const cx = rim + P.body.radial / 2 - 0.05;

    const body = new THREE.Mesh(
      finish(new THREE.BoxGeometry(P.body.radial, P.body.tangential, P.body.axial).toNonIndexed()),
      M.turret,
    );
    body.name = `Pod_${n}_Body`;
    body.position.x = cx;
    body.castShadow = true;
    mount.add(registerPart(body, { explode: [2.0, 0, 0] }));

    const core = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(P.core.radius, P.core.radius, P.core.length, 14).toNonIndexed()),
      M.glow2,
    );
    core.name = `Pod_${n}_Core`;
    core.rotation.x = Math.PI / 2;
    core.position.x = cx;
    mount.add(registerPart(core, { explode: [2.6, 0, 0], emissive: 'secondary' }));

    for (const [tag, sz] of [['Front', 1], ['Rear', -1]]) {
      const collar = new THREE.Mesh(
        finish(new THREE.CylinderGeometry(P.collar.radius, P.collar.radius * 0.86, P.collar.length, 14)
          .toNonIndexed()),
        M.steel,
      );
      collar.name = `Pod_${n}_Collar_${tag}`;
      collar.rotation.x = Math.PI / 2;
      collar.position.set(cx, 0, sz * (P.core.length / 2 - P.collar.length / 2));
      mount.add(registerPart(collar, { explode: [2.2, 0, sz * 1.2] }));
    }

    for (const [tag, sz] of [['L', 1], ['R', -1]]) {
      const hinge = new THREE.Object3D();
      hinge.name = `Pod_${n}_Vane_${tag}`;
      hinge.position.set(cx, sz * P.vane.offset, 0);
      hinge.rotation.z = THREE.MathUtils.degToRad(sz * rest);
      registerPart(hinge, { explodable: false });
      mount.add(hinge);

      // Authored along +Z and stood up along the hinge's +X, so the fin sweeps in the ring plane.
      const vane = new THREE.Mesh(
        taperedBeam({ length: P.vane.length, w0: P.vane.h0, h0: P.vane.w0, w1: P.vane.h1, h1: P.vane.w1 }),
        M.detail,
      );
      vane.name = `Pod_${n}_Fin_${tag}`;
      vane.rotation.y = Math.PI / 2;
      vane.castShadow = true;
      hinge.add(registerPart(vane, { explode: [1.4, sz * 1.6, 0] }));
    }
  });

  return group;
}

// --- the base --------------------------------------------------------------

function buildBase(M) {
  const B = PDIM.base;
  const group = new THREE.Object3D();
  group.name = 'Base_Group';

  group.add(buildCollision());

  const plinth = new THREE.Mesh(
    extrudeProfile([
      [-B.plinth.depth / 2, 0], [B.plinth.depth / 2, 0],
      [B.plinth.depth / 2 - 0.14, B.plinth.height], [-B.plinth.depth / 2 + 0.14, B.plinth.height],
    ], B.plinth.width),
    M.armour,
  );
  plinth.name = 'Plinth_Mesh';
  plinth.receiveShadow = true;
  group.add(registerPart(plinth, { explodable: false }));

  const slew = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(B.slew.radius, B.slew.radius * 1.06, B.slew.height, 40).toNonIndexed()),
    M.steel,
  );
  slew.name = 'Slew_Ring';
  slew.position.y = B.plinth.height + B.slew.height / 2 - 0.04;
  slew.castShadow = true;
  group.add(registerPart(slew, { explode: [0, -1.2, 0] }));

  const slewGlow = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(B.slew.radius + 0.02, B.slew.radius + 0.02, 0.045, 40).toNonIndexed()),
    M.glow2,
  );
  slewGlow.name = 'Slew_Glow';
  slewGlow.position.y = B.plinth.height + 0.03;
  group.add(registerPart(slewGlow, { explode: [0, -1.6, 0], emissive: 'secondary' }));

  for (const [tag, side] of [['L', -1], ['R', 1]]) {
    const pad = new THREE.Mesh(
      finish(new THREE.BoxGeometry(B.pad.width, B.pad.height, B.pad.depth).toNonIndexed()), M.detail,
    );
    pad.name = `Pad_${tag}`;
    pad.position.set(side * B.pad.x, B.pad.height / 2, 0);
    pad.receiveShadow = true;
    group.add(registerPart(pad, { explode: [side * 1.8, -0.4, 0] }));

    for (const [i, sz] of [-1, 1].entries()) {
      const anchor = new THREE.Mesh(
        finish(new THREE.CylinderGeometry(B.anchor.radius, B.anchor.radius * 1.15, B.anchor.height, 12)
          .toNonIndexed()),
        M.steel,
      );
      anchor.name = `Anchor_${tag}${i + 1}`;
      anchor.position.set(side * B.anchor.x, B.anchor.height / 2, sz * B.anchor.z);
      group.add(registerPart(anchor, { explode: [side * 2.2, -0.6, sz * 1.0] }));
    }
  }

  return group;
}

/**
 * The two buttresses, and the conduits that climb them.
 *
 * Both ends are derived: the foot from the plinth, the head from `legFoot()`, which is the
 * armour's outer radius at the declared leg angle. Typing the head position instead is how the
 * MK-CX's fenders ended up floating clear of the hull — an attachment point belongs to the thing
 * it attaches to.
 */
function buildButtresses(M) {
  const B = PDIM.base;
  const group = new THREE.Object3D();
  group.name = 'Buttress_Group';

  for (const [tag, side] of [['L', -1], ['R', 1]]) {
    const head = legFoot(side);
    const foot = { x: side * B.pad.x, y: B.plinth.height - 0.06 };
    const dx = head.x - foot.x;
    const dy = head.y - foot.y;
    const len = Math.hypot(dx, dy);

    const leg = new THREE.Mesh(
      taperedBeam({ length: len, w0: B.leg.w0, h0: B.leg.h0, w1: B.leg.w1, h1: B.leg.h1 }), M.armour,
    );
    leg.name = `Buttress_${tag}`;
    leg.position.set(foot.x, foot.y, 0);
    // Authored along +Z, then swung into the XY plane and rotated to point at the ring.
    leg.rotation.set(-Math.PI / 2, 0, Math.atan2(dy, dx) - Math.PI / 2, 'ZXY');
    leg.castShadow = leg.receiveShadow = true;
    group.add(registerPart(leg, { explode: [side * 1.6, -0.8, 0] }));

    const conduit = new THREE.Mesh(
      cableRun([
        [foot.x + side * 0.22, foot.y + 0.10, 0.42],
        [foot.x + dx * 0.34 + side * 0.24, foot.y + dy * 0.34, 0.50],
        [foot.x + dx * 0.72 + side * 0.20, foot.y + dy * 0.72, 0.46],
        [head.x + side * 0.06, head.y - 0.10, 0.40],
      ], { radius: B.conduit.radius }),
      M.rubber,
    );
    conduit.name = `Conduit_${tag}`;
    group.add(registerPart(conduit, { explode: [side * 2.4, -0.4, 1.0] }));
  }

  return group;
}

/**
 * Collision proxy: the plinth footprint, and nothing above it.
 *
 * A box around this subject would contain the bore — it would claim as solid the one volume the
 * whole thing exists to keep empty, and anything pathing against it would refuse to walk through
 * the gate. A proxy that describes the base is true; one that bounds the ring is worse than
 * none.
 */
function buildCollision() {
  const B = PDIM.base;
  const geom = new THREE.BoxGeometry(B.plinth.width, B.plinth.height, B.plinth.depth);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Base_Collision';
  mesh.position.y = B.plinth.height / 2;
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}
