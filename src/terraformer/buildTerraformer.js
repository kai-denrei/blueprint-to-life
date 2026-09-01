import * as THREE from 'three';
import {
  TDIM, beamTopY, courseSection, footprint, mastStageY, railLength, traverseHalf,
} from './dimensions.js';
import {
  arcSegment, cableRun, extrudeProfile, finish, latheZ, mergeNonIndexed, taperedBeam,
} from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * TF-3000 — planetary construction gantry.
 *
 * The fourteenth subject, and the first to declare a control that is not a slider.
 *
 * The FD-4 already established that a machine can ship the thing it made, and the GT-9 that a
 * subject can promise a volume stays empty. This one asks a question neither did: the operator
 * has to be able to take the printed structure AWAY — to look at the gantry alone, and to export
 * it alone. That is a boolean, and until now a boolean control could only be a viewer-level one.
 * `b` toggles display mode and `c` toggles the collision proxy; both are hardcoded in main.js
 * because both belong to the viewer rather than to any subject.
 *
 * So `userData.toggles` arrives alongside `userData.joints`, in the same shape and for the same
 * reason:
 *
 *     root.userData.toggles = [
 *       { key: 'structure', label: 'STRUCTURE', node: 'Structure_Group', value: true },
 *     ];
 *
 * The chrome grows one row of buttons and reuses the option row it already had; main.js learns
 * that a toggle is "a named node that is shown or hidden" and nothing about what any particular
 * one means. A subject that declares none is unaffected — the same test the `emissive` channel
 * and the FD-4's `derived` hook had to pass.
 *
 * One thing about it is worth being exact on, because it is where a toggle could easily have
 * lied. `exportGLB` passes `onlyVisible: false`, which it must: the collision proxy is always
 * hidden and has to ship. Merely hiding a toggled-off group would therefore have exported it
 * anyway, and the button would mean one thing on screen and another in the file. Off nodes are
 * DETACHED for the duration of the export instead, so "off" means off in both places.
 *
 * The machine itself is three prismatic axes and a three-axis arm. Prismatic joints were the
 * rack's contribution and nothing has used them in quantity since; here they are the whole
 * gantry, and the lift is one command driving two mast stages — a telescope is one motion and
 * two nodes, which is the same shape as the exoframe's GRIP closing twenty finger segments.
 */
export function buildTerraformer() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'Terraformer_Root';

  root.add(buildSite(M));
  root.add(buildStructure(M));

  /**
   * Machine X — the long travel along the rails. Prismatic, and therefore not explodable: the
   * explode system restores from a stored rest position and the two would fight over `position`.
   */
  const travel = new THREE.Object3D();
  travel.name = 'Travel_Carriage';
  registerPart(travel, { explodable: false });
  root.add(travel);

  travel.add(buildCollision());
  for (const side of [-1, 1]) travel.add(buildTower(M, side));
  travel.add(buildBeam(M));

  // Machine Y — the carriage traversing the beam.
  const traverse = new THREE.Object3D();
  traverse.name = 'Traverse_Carriage';
  traverse.position.set(TDIM.rest.traverse, TDIM.tower.height, 0);
  registerPart(traverse, { explodable: false });
  travel.add(traverse);
  traverse.add(buildCarriage(M));

  const L = TDIM.arm.limits;
  root.userData.joints = [
    {
      // Labelled in the MACHINE's axis names, driven in the scene's. See the header of
      // dimensions.js for the mapping and why both exist.
      key: 'travel', label: 'X TRAVEL', unit: '',
      min: -TDIM.site.travelRange, max: TDIM.site.travelRange, step: 0.1, value: TDIM.rest.travel,
      targets: [{
        node: 'Travel_Carriage', axis: 'z', prop: 'position',
        from: -TDIM.site.travelRange, to: TDIM.site.travelRange,
      }],
    },
    {
      key: 'traverse', label: 'Y TRAVERSE', unit: '',
      min: -traverseHalf(), max: traverseHalf(), step: 0.1, value: TDIM.rest.traverse,
      targets: [{ node: 'Traverse_Carriage', axis: 'x', prop: 'position', from: -traverseHalf(), to: traverseHalf() }],
    },
    {
      /**
       * Machine Z — one command, two telescoping stages. The stroke of each is declared in the
       * dimensions and `liftStroke()` adds them up, so the readout and the geometry cannot
       * disagree about how far the head can reach.
       */
      key: 'lift', label: 'Z LIFT', unit: '', min: 0, max: 100, step: 0.5, value: TDIM.rest.lift,
      targets: [
        // ABSOLUTE positions, not strokes: a prismatic target is assigned, not offset.
        { node: 'Mast_Stage_1', axis: 'y', prop: 'position', from: mastStageY(1, 0), to: mastStageY(1, 100) },
        { node: 'Mast_Stage_2', axis: 'y', prop: 'position', from: mastStageY(2, 0), to: mastStageY(2, 100) },
      ],
    },
    {
      key: 'swing', label: 'ARM SWING', unit: '°', min: -L.swing, max: L.swing, step: 1, value: TDIM.rest.swing,
      targets: [{ node: 'Arm_Swing', axis: 'y', from: -L.swing, to: L.swing }],
    },
    {
      key: 'shoulder', label: 'ARM SHOULDER', unit: '°',
      min: L.shoulder[0], max: L.shoulder[1], step: 0.5, value: TDIM.rest.shoulder,
      targets: [{ node: 'Arm_Shoulder', axis: 'x', from: L.shoulder[0], to: L.shoulder[1] }],
    },
    {
      key: 'elbow', label: 'ARM ELBOW', unit: '°',
      min: L.elbow[0], max: L.elbow[1], step: 0.5, value: TDIM.rest.elbow,
      targets: [{ node: 'Arm_Elbow', axis: 'x', from: L.elbow[0], to: L.elbow[1] }],
    },
    {
      key: 'wrist', label: 'NOZZLE PITCH', unit: '°',
      min: L.wrist[0], max: L.wrist[1], step: 0.5, value: TDIM.rest.wrist,
      targets: [{ node: 'Arm_Wrist', axis: 'x', from: L.wrist[0], to: L.wrist[1] }],
    },
  ];

  /**
   * Seat the prismatic axes where their sliders' defaults put them.
   *
   * The FD-4 learned this and it recurred here verbatim: a builder that leaves a driven node at
   * zero authors a rest pose the viewer can never produce. The mast stages were at full
   * retraction while the LIFT default said 20%, so the head sat 0.88 m above where the title
   * block and `nozzleHeight()` both said it was — and the exported GLB would have opened in that
   * pose. Rotational joints get this right by accident because they are authored from `rest`
   * already; prismatic ones have to be told.
   *
   * `mastStageY` is what both this and the joint's endpoints read, so seating the pose and
   * driving it cannot disagree about where the mast is.
   *
   * `headClearance()` is the check that fails loudly if this drifts again.
   */
  root.getObjectByName('Mast_Stage_1').position.y = mastStageY(1, TDIM.rest.lift);
  root.getObjectByName('Mast_Stage_2').position.y = mastStageY(2, TDIM.rest.lift);
  root.getObjectByName('Travel_Carriage').position.z = TDIM.rest.travel;

  /**
   * The one thing this subject added to the viewer.
   *
   * `Structure_Group` is the work, not the machine, so it hangs off the root rather than off the
   * gantry — the FD-4's argument, and for the same reason: material that has left the nozzle is
   * in the world's frame and must not travel when the gantry does.
   */
  root.userData.toggles = [
    { key: 'structure', label: 'STRUCTURE', node: 'Structure_Group', value: true },
  ];

  return root;
}

// --- the printed structure -------------------------------------------------

/**
 * The building, printed in identical courses.
 *
 * Every course is the same plan at a different height, which is exactly the case an
 * InstancedMesh is for — and unlike the walker's feet, all fifteen carry the same static
 * transform under the same parent. So the whole wall is ONE geometry, built once as a merge of
 * straight runs and corner arcs, and instanced up the Y axis.
 *
 * The corners are `arcSegment` — the generator the GT-9 added — turned flat with a single
 * `rotateX`. That it fitted the very next subject without a parameter is the only real evidence
 * that it belonged in `src/lib` rather than in the gate's own folder.
 */
function buildStructure(M) {
  const S = TDIM.structure;
  const group = new THREE.Object3D();
  group.name = 'Structure_Group';

  const f = footprint();

  const slab = new THREE.Mesh(
    finish(new THREE.BoxGeometry(
      2 * (S.A + S.thickness / 2 + S.slab.margin), S.slab.thickness,
      2 * (S.B + S.thickness / 2 + S.slab.margin),
    ).toNonIndexed()),
    M.detail,
  );
  slab.name = 'Slab_Mesh';
  slab.position.y = S.slab.thickness / 2;
  slab.receiveShadow = true;
  group.add(registerPart(slab, { explodable: false }));

  const section = courseSection();
  const pieces = [];

  for (const run of f.runs) {
    // `extrudeProfile` takes the section as [z, y] and pushes it along X — which is already the
    // run's own frame for a wall along X, and one rotateY away for a wall along Z.
    const geom = extrudeProfile(section, run.length);
    if (run.axis === 'z') geom.rotateY(Math.PI / 2);
    pieces.push(geom.translate(run.x, 0, run.z));
  }

  for (const c of f.corners) {
    // Swept about Z by the generator, then laid flat: `rotateX(-90)` maps the section's own axis
    // onto +Y, so the arc becomes a horizontal course with its height standing up.
    const geom = arcSegment({ profile: section, radius: f.radius, angle: Math.PI / 2, segments: 10 })
      .rotateX(-Math.PI / 2)
      .rotateY(Math.atan2(-c.sz, c.sx));
    pieces.push(geom.translate(c.x, 0, c.z));
  }

  const course = mergeNonIndexed(pieces);
  const layers = new THREE.InstancedMesh(course, M.armour, S.layer.count);
  layers.name = 'Layers_Instanced';
  layers.castShadow = layers.receiveShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < S.layer.count; i++) {
    m.makeTranslation(0, S.slab.thickness + (i + 0.5) * S.layer.height, 0);
    layers.setMatrixAt(i, m);
  }
  layers.instanceMatrix.needsUpdate = true;
  group.add(registerPart(layers, { explodable: false }));

  return group;
}

// --- the site --------------------------------------------------------------

function buildSite(M) {
  const S = TDIM.site;
  const group = new THREE.Object3D();
  group.name = 'Site_Group';

  for (const side of [-1, 1]) {
    for (const [i, gz] of [-1, 1].entries()) {
      const rail = new THREE.Mesh(
        finish(new THREE.BoxGeometry(S.rail.width, S.rail.height, railLength()).toNonIndexed()),
        M.steel,
      );
      rail.name = `Rail_${side < 0 ? 'L' : 'R'}${i + 1}`;
      rail.position.set(
        side * TDIM.tower.halfSpan + gz * S.railGauge / 2, S.rail.height / 2 + S.sleeper.height, 0,
      );
      rail.receiveShadow = true;
      group.add(registerPart(rail, { explode: [side * 1.4, -0.6, 0] }));
    }
  }

  const sleeper = new THREE.InstancedMesh(
    finish(new THREE.BoxGeometry(S.sleeper.length, S.sleeper.height, S.sleeper.width).toNonIndexed()),
    M.detail, S.sleeper.count * 2,
  );
  sleeper.name = 'Sleepers_Instanced';
  sleeper.receiveShadow = true;
  const m = new THREE.Matrix4();
  let n = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < S.sleeper.count; i++) {
      const z = -railLength() / 2 + (i + 0.5) * (railLength() / S.sleeper.count);
      m.makeTranslation(side * TDIM.tower.halfSpan, S.sleeper.height / 2, z);
      sleeper.setMatrixAt(n++, m);
    }
  }
  sleeper.instanceMatrix.needsUpdate = true;
  group.add(registerPart(sleeper, { explodable: false }));

  return group;
}

// --- the gantry ------------------------------------------------------------

function buildTower(M, side) {
  const T = TDIM.tower;
  const tag = side < 0 ? 'L' : 'R';
  const group = new THREE.Object3D();
  group.name = `Tower_${tag}_Group`;
  group.position.x = side * T.halfSpan;

  const bogie = new THREE.Mesh(
    finish(new THREE.BoxGeometry(T.bogie.width, T.bogie.height, T.bogie.length).toNonIndexed()),
    M.armour,
  );
  bogie.name = `Bogie_${tag}`;
  bogie.position.y = TDIM.site.sleeper.height + TDIM.site.rail.height + T.bogie.height / 2;
  bogie.castShadow = bogie.receiveShadow = true;
  group.add(registerPart(bogie, { explode: [side * 1.2, -1.0, 0] }));

  // Track units either side of the bogie, lathed as a stadium in profile.
  for (const [i, sx] of [-1, 1].entries()) {
    const track = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(T.track.radius, T.track.radius, T.track.width, 14).toNonIndexed()),
      M.track,
    );
    track.name = `Track_Pod_${tag}${i + 1}`;
    track.rotation.z = Math.PI / 2;
    track.position.set(sx * T.track.offset, TDIM.site.sleeper.height + T.track.radius * 0.6, 0);
    track.scale.z = T.track.length / (T.track.radius * 2);
    track.castShadow = true;
    group.add(registerPart(track, { explode: [sx * 1.8, -1.2, 0] }));
  }

  // The tower: a tapered box section standing on the bogie.
  const base = T.section;
  const top = { width: base.width * T.taper, depth: base.depth * T.taper };
  const y0 = TDIM.site.sleeper.height + TDIM.site.rail.height + T.bogie.height;
  const mast = new THREE.Mesh(
    taperedBeam({
      length: T.height - y0, w0: base.width, h0: base.depth, w1: top.width, h1: top.depth,
    }),
    M.armour,
  );
  mast.name = `Tower_${tag}_Mesh`;
  mast.rotation.x = -Math.PI / 2;
  mast.position.y = y0;
  mast.castShadow = mast.receiveShadow = true;
  group.add(registerPart(mast, { explode: [side * 1.5, 0.4, 0] }));

  /**
   * Stabilising outriggers: two per tower, splayed fore and aft onto pads.
   *
   * Derived from the two points they connect rather than from an angle. An angle mirrored across
   * the pair needs a sign, the sign was wrong, and the aft leg of every tower pointed at the sky
   * — visible immediately in the iso view and invisible in the numbers. Two endpoints cannot
   * produce that: the direction IS the difference between them. Same fix as the GT-9's
   * buttresses, and the third subject to reach for it.
   */
  for (const [i, sz] of [-1, 1].entries()) {
    const headY = y0 + T.outrigger.head;
    const footZ = sz * T.outrigger.foot;
    const len = Math.hypot(footZ, headY - T.pad.height);

    const leg = new THREE.Mesh(taperedBeam({ length: len, ...beam4(T.outrigger) }), M.armour);
    leg.name = `Outrigger_${tag}${i + 1}`;
    leg.position.set(side * base.width * 0.26, headY, 0);
    // Authored along +Z; swung so it points from the tower down at the pad.
    leg.rotation.x = Math.atan2(footZ, -(headY - T.pad.height)) + Math.PI;
    leg.castShadow = true;
    group.add(registerPart(leg, { explode: [side * 1.0, -0.8, sz * 2.0] }));

    const pad = new THREE.Mesh(
      finish(new THREE.BoxGeometry(T.pad.width, T.pad.height, T.pad.depth).toNonIndexed()), M.detail,
    );
    pad.name = `Outrigger_Pad_${tag}${i + 1}`;
    pad.position.set(side * base.width * 0.26, T.pad.height / 2, footZ);
    pad.receiveShadow = true;
    group.add(registerPart(pad, { explode: [side * 1.0, -1.4, sz * 2.6] }));
  }

  // Mid-height service platform with a handrail, as the reference sheet puts on each tower.
  const P = T.platform;
  const deck = new THREE.Mesh(
    finish(new THREE.BoxGeometry(P.width, P.thickness, P.depth).toNonIndexed()), M.detail,
  );
  deck.name = `Platform_${tag}`;
  deck.position.y = P.y;
  deck.castShadow = deck.receiveShadow = true;
  group.add(registerPart(deck, { explode: [side * 2.2, 0, 0] }));

  group.add(buildRailing(
    M, `Platform_Rail_${tag}`, P.width, P.depth, P.rail,
    new THREE.Vector3(0, P.y + P.thickness / 2, 0), [side * 2.6, 0.6, 0],
  ));

  group.add(buildLadder(M, tag, y0, T.height));

  // Status strip up the tower's outboard face — the machine's only always-on indicator.
  const strip = new THREE.Mesh(
    finish(new THREE.BoxGeometry(0.12, T.height - y0 - 2.0, 0.36).toNonIndexed()), M.glow2,
  );
  strip.name = `Tower_${tag}_Strip`;
  strip.position.set(side * (base.width / 2 + 0.05), y0 + (T.height - y0) / 2, 0);
  group.add(registerPart(strip, { explode: [side * 2.4, 0, 0], emissive: 'secondary' }));

  return group;
}

/**
 * An access ladder: two stiles and N rungs, merged into one mesh.
 *
 * Merged rather than instanced, and the distinction matters. Twenty-six rungs on one static
 * transform is exactly the InstancedMesh case — but a ladder is ONE part, and instancing it
 * would give the rungs a part id separate from their own stiles while sharing one between all
 * of them. The outline filter would then draw a boundary where the ladder meets nothing and
 * none where a rung meets a stile. Instancing is for repeated PARTS, not for repeated features.
 */
function buildLadder(M, tag, y0, top) {
  const L = TDIM.tower.ladder;
  const height = top - y0 - 1.2;
  const pieces = [];
  for (const sx of [-1, 1]) {
    pieces.push(finish(new THREE.BoxGeometry(L.rail, height, L.rail).toNonIndexed())
      .translate(sx * L.width / 2, height / 2, 0));
  }
  for (let i = 0; i < L.rungs; i++) {
    pieces.push(finish(new THREE.BoxGeometry(L.width, 0.05, 0.05).toNonIndexed())
      .translate(0, (i + 0.5) * (height / L.rungs), 0));
  }
  const ladder = new THREE.Mesh(mergeNonIndexed(pieces), M.steel);
  ladder.name = `Ladder_${tag}`;
  ladder.position.set(0, y0 + 0.6, -TDIM.tower.section.depth / 2 - 0.2);
  ladder.castShadow = true;
  return registerPart(ladder, { explode: [0, 0, -3.0] });
}

/**
 * A handrail: a top rail and its stanchions, merged into one mesh.
 *
 * Merged rather than instanced, for the reason the ladder is: a railing is one PART. Instancing
 * the stanchions would give them one part id between them and a different one from the rail they
 * carry, so the outline filter would draw a seam where the rail meets nothing and none where a
 * stanchion meets the rail.
 */
function buildRailing(M, name, width, depth, height, at, explode) {
  const pieces = [];
  const hw = width / 2;
  const hd = depth / 2;
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const rail = finish(new THREE.BoxGeometry(len, 0.08, 0.08).toNonIndexed());
    if (Math.abs(bz - az) > Math.abs(bx - ax)) rail.rotateY(Math.PI / 2);
    pieces.push(rail.translate((ax + bx) / 2, height, (az + bz) / 2));
    // Stanchions along the run.
    const n = Math.max(2, Math.round(len / 1.6));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      pieces.push(finish(new THREE.BoxGeometry(0.07, height, 0.07).toNonIndexed())
        .translate(ax + (bx - ax) * t, height / 2, az + (bz - az) * t));
    }
  }
  const mesh = new THREE.Mesh(mergeNonIndexed(pieces), M.steel);
  mesh.name = name;
  // Positioned BEFORE registering, always. `registerPart` snapshots `position` as the explode
  // rest pose, so a node moved afterwards springs back to where it was registered the first time
  // anyone touches the EXPLODE slider. The tank's cloned track geometry made the same mistake in
  // the other direction — register after the object is final, clone before.
  mesh.position.copy(at);
  return registerPart(mesh, { explode });
}

function buildBeam(M) {
  const B = TDIM.beam;
  const T = TDIM.tower;
  const group = new THREE.Object3D();
  group.name = 'Beam_Group';
  group.position.y = T.height + B.depth / 2;

  const length = 2 * T.halfSpan + T.section.width * T.taper;
  const girder = new THREE.Mesh(
    extrudeProfile([
      [-B.width / 2, -B.depth / 2 + 0.4], [-B.width / 2 + 0.5, -B.depth / 2],
      [B.width / 2 - 0.5, -B.depth / 2], [B.width / 2, -B.depth / 2 + 0.4],
      [B.width / 2, B.depth / 2 - 0.3], [B.width / 2 - 0.4, B.depth / 2],
      [-B.width / 2 + 0.4, B.depth / 2], [-B.width / 2, B.depth / 2 - 0.3],
    ], length),
    M.armour,
  );
  girder.name = 'Beam_Mesh';
  girder.castShadow = girder.receiveShadow = true;
  group.add(registerPart(girder, { explodable: false }));

  // Walkways down both flanks, with a handrail apiece.
  for (const [tag, sz] of [['F', 1], ['R', -1]]) {
    const deck = new THREE.Mesh(
      finish(new THREE.BoxGeometry(length, B.walkway.thickness, B.walkway.width).toNonIndexed()),
      M.detail,
    );
    deck.name = `Walkway_${tag}`;
    deck.position.set(0, B.depth / 2 - 0.2, sz * (B.width / 2 + B.walkway.width / 2));
    group.add(registerPart(deck, { explode: [0, 0.4, sz * 2.4] }));

    group.add(buildRailing(
      M, `Handrail_${tag}`, length, 0.001, B.walkway.rail,
      new THREE.Vector3(0, B.depth / 2 - 0.12, sz * (B.width / 2 + B.walkway.width)),
      [0, 1.2, sz * 3.0],
    ));
  }

  // The rail the traverse carriage rides, on the girder's underside.
  for (const [i, sz] of [-1, 1].entries()) {
    const rail = new THREE.Mesh(
      finish(new THREE.BoxGeometry(2 * (T.halfSpan - B.rail.inset), B.rail.height, B.rail.width)
        .toNonIndexed()),
      M.steel,
    );
    rail.name = `Carriage_Rail_${i + 1}`;
    rail.position.set(0, -B.depth / 2 - B.rail.height / 2, sz * TDIM.carriage.roller.x);
    group.add(registerPart(rail, { explode: [0, -1.0, sz * 1.4] }));
  }

  group.add(buildSilos(M));
  return group;
}

/** The two material reservoirs, standing on the beam's crown. */
function buildSilos(M) {
  const S = TDIM.silo;
  const B = TDIM.beam;
  const group = new THREE.Object3D();
  group.name = 'Silos_Group';

  for (const [i, sx] of [-1, 1].entries()) {
    const n = i + 1;
    const x = sx * S.spacing / 2;
    const y0 = B.depth / 2;

    const cone = new THREE.Mesh(
      latheZ([[0.35, 0], [S.radius, S.cone], [S.radius, S.cone + 0.02], [0.30, 0.02]], 22), M.steel,
    );
    cone.name = `Silo_${n}_Cone`;
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(x, y0, 0);
    cone.castShadow = true;
    group.add(registerPart(cone, { explode: [sx * 1.2, 0.6, 0] }));

    /**
      * `Silo_N_Shell`, not `Silo_N_Barrel`.
      *
      * A silo's cylindrical section is a barrel in ordinary usage, and the shared contract's
      * armament check — a name heuristic — duly flagged this unarmed machine as carrying a gun.
      * The RA-6 hit the same thing with a "turret" that was a base casting, and the resolution
      * there is the one taken here: a false positive on an ambiguous noun is fixed by a better
      * name, not by a weaker check.
      */
    const shell = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(S.radius, S.radius, S.barrel, 22).toNonIndexed()), M.armour,
    );
    shell.name = `Silo_${n}_Shell`;
    shell.position.set(x, y0 + S.cone + S.barrel / 2, 0);
    shell.castShadow = shell.receiveShadow = true;
    group.add(registerPart(shell, { explode: [sx * 1.4, 1.4, 0] }));

    for (let b = 0; b < S.band.count; b++) {
      const band = new THREE.Mesh(
        finish(new THREE.CylinderGeometry(S.radius + S.band.thickness, S.radius + S.band.thickness, 0.22, 22)
          .toNonIndexed()),
        M.detail,
      );
      band.name = `Silo_${n}_Band_${b + 1}`;
      band.position.set(x, y0 + S.cone + (b + 0.7) * (S.barrel / (S.band.count + 0.4)), 0);
      group.add(registerPart(band, { explode: [sx * 1.7, 1.4, 0] }));
    }

    const cap = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(S.cap.radius, S.cap.radius * 1.2, S.cap.height, 16).toNonIndexed()),
      M.steel,
    );
    cap.name = `Silo_${n}_Cap`;
    cap.position.set(x, y0 + S.cone + S.barrel + S.cap.height / 2, 0);
    group.add(registerPart(cap, { explode: [sx * 1.2, 2.4, 0] }));

    const level = new THREE.Mesh(
      finish(new THREE.BoxGeometry(0.14, S.barrel * 0.6, 0.3).toNonIndexed()), M.glow2,
    );
    level.name = `Silo_${n}_Level`;
    level.position.set(x + sx * (S.radius + 0.05), y0 + S.cone + S.barrel * 0.45, 0);
    group.add(registerPart(level, { explode: [sx * 2.4, 1.4, 0], emissive: 'secondary' }));

    // Feed line from the silo down the beam toward the carriage rail. Authored entirely in the
    // beam's frame — it stops at the traverse axis, because everything past it rotates.
    const hose = new THREE.Mesh(
      cableRun([
        [x, y0 + S.cone + S.barrel * 0.2, sx * 0.4],
        [x + sx * 1.6, y0 + 0.4, sx * 1.5],
        [x + sx * 3.4, y0 - 0.6, sx * 1.9],
        [x + sx * 6.0, -B.depth / 2 + 0.5, sx * 1.6],
      ], { radius: 0.22, radial: 8 }),
      M.rubber,
    );
    hose.name = `Feed_Line_${n}`;
    group.add(registerPart(hose, { explode: [sx * 2.0, 0.2, sx * 2.4] }));
  }

  return group;
}

// --- carriage, mast and arm ------------------------------------------------

function buildCarriage(M) {
  const C = TDIM.carriage;
  const group = new THREE.Object3D();
  group.name = 'Carriage_Group';

  const body = new THREE.Mesh(
    finish(new THREE.BoxGeometry(C.body.width, C.body.height, C.body.depth).toNonIndexed()), M.turret,
  );
  body.name = 'Carriage_Mesh';
  body.position.y = -C.body.height / 2;
  body.castShadow = true;
  group.add(registerPart(body, { explodable: false }));

  for (const [i, sx] of [-1, 1].entries()) {
    for (const [j, sz] of [-1, 1].entries()) {
      const roller = new THREE.Mesh(
        finish(new THREE.CylinderGeometry(C.roller.radius, C.roller.radius, C.roller.width, 12)
          .toNonIndexed()),
        M.steel,
      );
      roller.name = `Roller_${i + 1}${j + 1}`;
      roller.rotation.z = Math.PI / 2;
      roller.position.set(sx * C.roller.x, -C.roller.radius * 0.4, sz * C.roller.x);
      group.add(registerPart(roller, { explode: [sx * 1.4, 0.8, sz * 1.4] }));
    }
  }

  const collar = new THREE.Mesh(
    finish(new THREE.BoxGeometry(C.mast.collar.width, C.mast.collar.height, C.mast.collar.depth)
      .toNonIndexed()),
    M.detail,
  );
  collar.name = 'Mast_Collar';
  collar.position.y = -C.body.height - C.mast.collar.height / 2;
  group.add(registerPart(collar, { explode: [0, -1.0, 0] }));

  /**
   * Two telescoping stages, both driven by the one LIFT command. Stage 2 hangs off stage 1, so
   * its stroke adds to the parent's rather than replacing it — which is what makes the total
   * reach `liftStroke()` and not the larger of the two.
   */
  const s1 = new THREE.Object3D();
  s1.name = 'Mast_Stage_1';
  s1.position.y = -C.body.height - C.mast.collar.height;
  registerPart(s1, { explodable: false });
  group.add(s1);

  const m1 = new THREE.Mesh(
    taperedBeam({ length: C.mast.stage1.length, w0: C.mast.stage1.width, h0: C.mast.stage1.depth }),
    M.armour,
  );
  m1.name = 'Mast_1_Mesh';
  m1.rotation.x = Math.PI / 2;
  m1.castShadow = true;
  s1.add(registerPart(m1, { explodable: false }));

  const s2 = new THREE.Object3D();
  s2.name = 'Mast_Stage_2';
  s2.position.y = -C.mast.stage1.length + C.mast.stage1.overlap;
  registerPart(s2, { explodable: false });
  s1.add(s2);

  const m2 = new THREE.Mesh(
    taperedBeam({ length: C.mast.stage2.length, w0: C.mast.stage2.width, h0: C.mast.stage2.depth }),
    M.armour,
  );
  m2.name = 'Mast_2_Mesh';
  m2.rotation.x = Math.PI / 2;
  m2.castShadow = true;
  s2.add(registerPart(m2, { explodable: false }));

  s2.add(buildArm(M));
  return group;
}

function buildArm(M) {
  const A = TDIM.arm;
  const group = new THREE.Object3D();
  group.name = 'Arm_Group';
  group.position.y = -TDIM.carriage.mast.stage2.length;

  const swing = new THREE.Object3D();
  swing.name = 'Arm_Swing';
  swing.rotation.y = THREE.MathUtils.degToRad(TDIM.rest.swing);
  registerPart(swing, { explodable: false });
  group.add(swing);

  const housing = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.shoulder.radius, A.shoulder.radius, A.shoulder.width, 16)
      .toNonIndexed()),
    M.steel,
  );
  housing.name = 'Shoulder_Housing';
  housing.rotation.z = Math.PI / 2;
  housing.castShadow = true;
  swing.add(registerPart(housing, { explode: [0, 1.4, 0] }));

  /**
   * Fixed +90 about X so the chain's local +Z points at the ground and each limb is authored
   * along its own axis. The RA-6's shoulder mount and the FD-4's legs use the same node for the
   * same reason: the rest orientation belongs in one fixed transform, not in every segment's
   * geometry.
   */
  const mount = new THREE.Object3D();
  mount.name = 'Arm_Mount';
  mount.rotation.x = Math.PI / 2;
  registerPart(mount, { explodable: false });
  swing.add(mount);

  const shoulder = new THREE.Object3D();
  shoulder.name = 'Arm_Shoulder';
  shoulder.rotation.x = THREE.MathUtils.degToRad(TDIM.rest.shoulder);
  registerPart(shoulder, { explodable: false });
  mount.add(shoulder);

  const upper = new THREE.Mesh(taperedBeam({ length: A.upper.length, ...beam4(A.upper) }), M.armour);
  upper.name = 'Arm_Upper';
  upper.castShadow = true;
  shoulder.add(registerPart(upper, { explode: [0, 0, 1.2] }));

  const elbow = new THREE.Object3D();
  elbow.name = 'Arm_Elbow';
  elbow.position.z = A.upper.length;
  elbow.rotation.x = THREE.MathUtils.degToRad(TDIM.rest.elbow);
  registerPart(elbow, { explodable: false });
  shoulder.add(elbow);

  const elbowHousing = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.elbowHousing.radius, A.elbowHousing.radius, A.elbowHousing.width, 14)
      .toNonIndexed()),
    M.steel,
  );
  elbowHousing.name = 'Elbow_Housing';
  elbowHousing.rotation.z = Math.PI / 2;
  elbowHousing.castShadow = true;
  elbow.add(registerPart(elbowHousing, { explode: [1.6, 0, 0.6] }));

  const fore = new THREE.Mesh(taperedBeam({ length: A.fore.length, ...beam4(A.fore) }), M.armour);
  fore.name = 'Arm_Fore';
  fore.castShadow = true;
  elbow.add(registerPart(fore, { explode: [0, 0, 1.6] }));

  // Dress-out along the forearm, inside one rigid frame.
  const loom = new THREE.Mesh(
    cableRun([
      [0.5, 0.2, 0.2], [0.62, 0.28, 1.4], [0.55, 0.22, 2.6], [0.4, 0.16, A.fore.length - 0.2],
    ], { radius: 0.13 }),
    M.rubber,
  );
  loom.name = 'Arm_Loom';
  elbow.add(registerPart(loom, { explode: [2.0, 0.8, 0] }));

  const wrist = new THREE.Object3D();
  wrist.name = 'Arm_Wrist';
  wrist.position.z = A.fore.length;
  wrist.rotation.x = THREE.MathUtils.degToRad(TDIM.rest.wrist);
  registerPart(wrist, { explodable: false });
  elbow.add(wrist);

  const wristHousing = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.wristHousing.radius, A.wristHousing.radius, A.wristHousing.width, 12)
      .toNonIndexed()),
    M.detail,
  );
  wristHousing.name = 'Wrist_Housing';
  wristHousing.rotation.z = Math.PI / 2;
  wrist.add(registerPart(wristHousing, { explode: [1.2, 0, 1.8] }));

  const head = new THREE.Mesh(
    finish(new THREE.BoxGeometry(A.head.width, A.head.height, A.head.depth).toNonIndexed()), M.turret,
  );
  head.name = 'Head_Mesh';
  head.position.z = A.head.depth / 2 + 0.2;
  head.castShadow = true;
  wrist.add(registerPart(head, { explode: [0, 0, 2.2] }));

  // The extruder is hot rather than powered, so it takes the fourth channel and not the blue
  // one every other lit part on this machine is on — the same distinction the FD-4 draws.
  const heater = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.heater.radius, A.heater.radius, A.heater.height, 14).toNonIndexed()),
    M.glow4,
  );
  heater.name = 'Nozzle_Heater';
  heater.rotation.x = Math.PI / 2;
  heater.position.z = A.head.depth + 0.2 + A.heater.height / 2;
  wrist.add(registerPart(heater, { explode: [0, 0, 2.6], emissive: 'quaternary' }));

  const nozzle = new THREE.Mesh(
    latheZ([
      [A.nozzle.radius, 0], [A.nozzle.tip, A.nozzle.length],
      [A.nozzle.tip * 0.5, A.nozzle.length], [A.nozzle.tip * 0.5, A.nozzle.length * 0.4],
      [A.nozzle.radius * 0.7, 0],
    ], 14),
    M.steel,
  );
  nozzle.name = 'Nozzle_Cone';
  nozzle.position.z = A.head.depth + 0.2 + A.heater.height;
  wrist.add(registerPart(nozzle, { explode: [0, 0, 3.0] }));

  const tip = new THREE.Object3D();
  tip.name = 'Nozzle_Tip';
  tip.position.z = A.head.depth + 0.2 + A.heater.height + A.nozzle.length;
  registerPart(tip, { explodable: false });
  wrist.add(tip);

  return group;
}

/**
 * Collision proxy: the gantry's travelling envelope.
 *
 * A child of `Travel_Carriage`, so it moves with the machine rather than marking where the
 * machine used to be — the FD-4's platform proxy makes the same point. It bounds the towers and
 * the beam and deliberately not the arm, whose swept volume is a torus and whose box would claim
 * most of the build area as solid.
 */
function buildCollision() {
  const T = TDIM.tower;
  const width = 2 * T.halfSpan + T.section.width;
  const height = beamTopY();
  const geom = new THREE.BoxGeometry(width, height, T.bogie.length);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Gantry_Collision';
  mesh.position.y = height / 2;
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}

function beam4(s) {
  return { w0: s.w0, h0: s.h0, w1: s.w1, h1: s.h1 };
}
