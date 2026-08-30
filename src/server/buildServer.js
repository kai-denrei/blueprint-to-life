import * as THREE from 'three';
import {
  SDIM, fanLayout, faceZ, fieldHeight, overallHeight, serviceSlot, sledSlots, spanCentreY,
} from './dimensions.js';
import { finish, mergeNonIndexed, trackBand } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * SERVER01 — 42U liquid-assisted compute rack.
 *
 * The tenth subject and the first that is not a vehicle or a machine that moves itself. Two
 * things fall out of that, and both of them are about repetition.
 *
 * **It earns an InstancedMesh, and it is the first thing since the tanks to.** Twenty-eight of
 * the compute sleds are the same part at the same pitch — twenty-eight copies of one static
 * transform. That is exactly the test the walker's docstring set out when it declined to
 * instance its feet ("six wheels are six copies of one static transform, whereas every foot
 * here carries a different articulated one"), and this is the first subject since to come out
 * on the other side of it.
 *
 * **The twenty-ninth is not instanced, for the same reason read backwards.** One sled is pulled
 * out for service, so it carries a different transform and has to be its own node — and getting
 * it out needed the project's first PRISMATIC joint. Every articulation in eight subjects had
 * been a hinge, so "a joint is a rotation, in degrees" had never had to be anything else.
 *
 * The light accents are the MK-CX's lift emitters restated: a lit slot down each sled face, on
 * accent channel 3. The channel is new; nothing about declaring it is. That is what the Hepta-T
 * bought when it turned `emissive` from a boolean into a channel.
 */
export function buildServer() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'Server_Root';

  root.add(buildFrame(M));
  root.add(buildCollision());
  root.add(buildSleds(M));
  root.add(buildFurniture(M));
  root.add(buildService(M));
  root.add(buildDoors(M));

  const D = SDIM.door;
  root.userData.joints = [
    {
      key: 'frontDoor', label: 'FRONT DOOR', unit: '°', min: 0, max: D.open, step: 1,
      value: SDIM.rest.frontDoor,
      targets: [{ node: 'Door_Front_Pivot', axis: 'y', from: 0, to: D.open }],
    },
    {
      key: 'rearDoor', label: 'REAR DOOR', unit: '°', min: 0, max: D.open, step: 1,
      value: SDIM.rest.rearDoor,
      targets: [{ node: 'Door_Rear_Pivot', axis: 'y', from: 0, to: -D.open }],
    },
    {
      /**
       * The project's first prismatic joint.
       *
       * Its range is in METRES, not degrees, and it says so with `prop: 'position'`. Everything
       * before this was a hinge — a turret ring, a trunnion, a trail, a canopy, a wrist — so
       * `applyArticulation` had only ever needed to write rotations. A target that omits `prop`
       * still behaves exactly as it always did.
       *
       * The node it drives is deliberately NOT explodable. Explode restores every part from a
       * stored rest position, so a node written by both would snap back to wherever the slider
       * left it the first time anyone touched EXPLODE. There is an invariant for that.
       */
      key: 'sled', label: 'SLED OUT', unit: ' m', min: 0, max: SDIM.service.travel, step: 0.005,
      value: SDIM.rest.sled,
      targets: [{
        node: 'Service_Slide', axis: 'z', prop: 'position',
        // Absolute coordinates, not an offset — `from` is where the sled sits closed.
        from: faceZ(), to: faceZ() + SDIM.service.travel,
      }],
    },
    {
      // One slider, six rotors. They are identical parts and would instance happily — except
      // that each one turns, so each carries a different animated transform and instance
      // matrices cannot inherit a parent's. Same call the walker made about its feet.
      key: 'fans', label: 'FANS', unit: '°', min: 0, max: 360, step: 1, value: 0,
      targets: fanLayout().map((f) => ({ node: `${f.name}_Spin`, axis: 'z', from: 0, to: 360 })),
    },
  ];
  return root;
}

/**
 * Merge a list of boxes into one geometry.
 *
 * Used wherever a repeated feature is one PART rather than many: a vent grid belongs to its
 * panel, a port row is a connector block, a heatsink is a heatsink. Modelling them as N meshes
 * would give each element its own part id, and the outline pass would draw a seam through the
 * middle of a component that has none — as well as spending 130 of the 255 ids the G-buffer's
 * id channel can carry on louvres.
 *
 * @param {Array<{size:[number,number,number], at:[number,number,number]}>} boxes
 */
function mergedBoxes(boxes) {
  return mergeNonIndexed(boxes.map(({ size, at }) => {
    const g = finish(new THREE.BoxGeometry(...size).toNonIndexed());
    g.translate(...at);
    return g;
  }));
}

// --- frame -----------------------------------------------------------------

function buildFrame(M) {
  const F = SDIM.frame;
  const group = new THREE.Object3D();
  group.name = 'Frame_Group';

  const plinth = new THREE.Mesh(
    finish(new THREE.BoxGeometry(F.width, F.plinth, F.depth).toNonIndexed()), M.armour,
  );
  plinth.name = 'Plinth_Mesh';
  plinth.position.y = F.plinth / 2;
  plinth.receiveShadow = true;
  group.add(registerPart(plinth, { explodable: false }));

  // Levelling feet, which is what stops a rack reading as a box sitting on the floor.
  let n = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = new THREE.Mesh(
        finish(new THREE.CylinderGeometry(F.foot.radius, F.foot.radius * 0.8, F.foot.height, 10).toNonIndexed()),
        M.steel,
      );
      foot.name = `Foot_${++n}`;
      foot.position.set(
        sx * (F.width / 2 - F.foot.inset), F.foot.height / 2, sz * (F.depth / 2 - F.foot.inset),
      );
      group.add(registerPart(foot, { explode: [sx * 0.6, -0.6, sz * 0.6] }));
    }
  }

  const top = SDIM.frame.plinth + fieldHeight();

  // Four corner posts.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(
        finish(new THREE.BoxGeometry(F.post, fieldHeight() + F.cap, F.post).toNonIndexed()), M.steel,
      );
      post.name = `Post_${sz > 0 ? 'F' : 'R'}${sx < 0 ? 'L' : 'R'}`;
      post.position.set(
        sx * (F.width / 2 - F.post / 2), F.plinth + (fieldHeight() + F.cap) / 2,
        sz * (F.depth / 2 - F.post / 2),
      );
      post.castShadow = true;
      group.add(registerPart(post, { explode: [sx * 0.9, 0, sz * 0.9] }));
    }
  }

  // The EIA mounting rails. Their separation is the standard 482.6 mm, which is the one
  // dimension a rack actually has to honour — everything bolted into it is cut to it.
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(
      finish(new THREE.BoxGeometry(F.railWidth, fieldHeight(), 0.026).toNonIndexed()), M.detail,
    );
    rail.name = `Rail_${sx < 0 ? 'L' : 'R'}`;
    rail.position.set(
      sx * (SDIM.mountWidth / 2 + F.railWidth / 2), F.plinth + fieldHeight() / 2, F.depth / 2 - 0.05,
    );
    group.add(registerPart(rail, { explode: [sx * 1.4, 0, 0.3] }));
  }

  const cap = new THREE.Mesh(
    finish(new THREE.BoxGeometry(F.width, F.cap, F.depth).toNonIndexed()), M.armour,
  );
  cap.name = 'Top_Cap';
  cap.position.y = top + F.cap / 2;
  cap.castShadow = true;
  group.add(registerPart(cap, { explode: [0, 1.0, 0] }));

  // Side panels, perforated. The vent grid is a real hole pattern rather than a texture,
  // because the blueprint pass renders flat ink and a drawn-on louvre would not exist in it.
  for (const sx of [-1, 1]) {
    const panel = new THREE.Mesh(
      finish(new THREE.BoxGeometry(F.panelThickness, fieldHeight() * 0.98, F.depth * 0.94).toNonIndexed()),
      M.turret,
    );
    panel.name = `Side_Panel_${sx < 0 ? 'L' : 'R'}`;
    panel.position.set(sx * (F.width / 2 - F.panelThickness / 2), F.plinth + fieldHeight() / 2, 0);
    panel.castShadow = true;
    group.add(registerPart(panel, { explode: [sx * 1.8, 0, 0] }));

    const V = F.vent;
    const slots = [];
    for (let r = 0; r < V.rows; r++) {
      for (let c = 0; c < V.cols; c++) {
        slots.push({
          size: [F.panelThickness + 0.006, V.height, V.width],
          at: [0,
            V.margin + (r + 0.5) * ((fieldHeight() - 2 * V.margin) / V.rows) - fieldHeight() / 2,
            (c - (V.cols - 1) / 2) * 0.16 - 0.24],
        });
      }
    }
    const vents = new THREE.Mesh(mergedBoxes(slots), M.detail);
    vents.name = `Vent_Grid_${sx < 0 ? 'L' : 'R'}`;
    vents.position.copy(panel.position);
    group.add(registerPart(vents, { explode: [sx * 2.2, 0, 0] }));
  }

  return group;
}

// --- the array -------------------------------------------------------------

/** One compute sled's body, as a single merged geometry: face, chassis and two handles. */
function sledGeometry() {
  const s = SDIM.sled;
  const w = SDIM.mountWidth - 2 * s.inset;
  const h = SDIM.U - 0.004;                       // a hairline between units, as a rack has

  const parts = [];
  const face = finish(new THREE.BoxGeometry(w, h, s.faceThickness).toNonIndexed());
  face.translate(0, 0, s.faceThickness / 2);
  parts.push(face);

  const body = finish(new THREE.BoxGeometry(w * 0.96, h * 0.86, s.depth).toNonIndexed());
  body.translate(0, 0, -s.depth / 2);
  parts.push(body);

  for (const side of [-1, 1]) {
    const handle = finish(new THREE.BoxGeometry(s.handle.width, s.handle.height, s.handle.depth).toNonIndexed());
    handle.translate(side * s.handle.x, 0, s.faceThickness + s.handle.depth / 2);
    parts.push(handle);
  }
  return mergeNonIndexed(parts);
}

/** The lit slot down each sled face — the MK-CX's lift emitter, restated as a rack accent. */
function sledLightGeometry() {
  const s = SDIM.sled;
  const parts = [];
  for (const side of [-1, 1]) {
    const slot = finish(new THREE.BoxGeometry(s.light.width, s.light.height, s.light.depth).toNonIndexed());
    slot.translate(side * s.light.x, 0, s.faceThickness + s.light.depth / 2);
    parts.push(slot);
  }
  return mergeNonIndexed(parts);
}

/**
 * The instanced block.
 *
 * Two InstancedMeshes over the same twenty-eight transforms rather than one, because the lit
 * slot and the sled body are on different accent channels and `registerPart` writes ONE channel
 * across a whole geometry. Splitting lit from unlit is the same move the walker's rail gun
 * makes with its coil rings, for the same reason.
 */
function buildSleds(M) {
  const group = new THREE.Object3D();
  group.name = 'Sled_Block';

  const slots = sledSlots();
  const face = faceZ();
  const matrix = new THREE.Matrix4();

  const build = (name, geom, material, emissive, explode) => {
    const mesh = new THREE.InstancedMesh(geom, material, slots.length);
    mesh.name = name;
    slots.forEach((u, i) => {
      matrix.makeTranslation(0, spanCentreY(u, 1), face);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    // The layout travels with the mesh, so anything downstream can ask which slots are filled
    // without re-deriving it. Same contract the Hepta-T's wheels carry.
    mesh.userData.layout = slots.slice();
    group.add(registerPart(mesh, { explode, emissive }));
    return mesh;
  };

  build('Sleds_Instanced', sledGeometry(), M.armour, false, [0, 0, 1.1]);
  build('SledLights_Instanced', sledLightGeometry(), M.glow3, 'tertiary', [0, 0, 1.4]);

  return group;
}

// --- fixed furniture -------------------------------------------------------

/**
 * A row of port LEDs, as ONE part.
 *
 * A row of twenty ports is a connector block, not twenty components — and at three interconnect
 * trays plus two switch rows, modelling them individually spent seventy-six of the id channel's
 * two hundred and fifty-five on lights.
 */
function portRow(group, M, prefix, y, z, count) {
  const P = SDIM.ports;
  const boxes = [];
  for (let i = 0; i < count; i++) {
    boxes.push({ size: [P.size, P.size, 0.006], at: [(i - (count - 1) / 2) * P.pitch, 0, 0] });
  }
  const row = new THREE.Mesh(mergedBoxes(boxes), M.glow2);
  row.name = `${prefix}_Ports`;
  row.position.set(0, y, z);
  group.add(registerPart(row, { explode: [0, 0.3, 1.6], emissive: 'secondary' }));
}

function buildFurniture(M) {
  const F = SDIM.frame;
  const group = new THREE.Object3D();
  group.name = 'Details_Group';
  const face = faceZ();
  const w = SDIM.mountWidth - 2 * SDIM.sled.inset;

  for (const row of SDIM.elevation) {
    if (row.kind === 'sled' || row.kind === 'service') continue;
    const y = spanCentreY(row.u, row.h);
    const h = row.h * SDIM.U - 0.004;

    const panel = new THREE.Mesh(
      finish(new THREE.BoxGeometry(w, h, row.kind === 'blank' ? 0.014 : 0.4).toNonIndexed()),
      row.kind === 'blank' ? M.detail : M.turret,
    );
    panel.name = `${row.name}_Mesh`;
    panel.position.set(0, y, row.kind === 'blank' ? face : face - 0.19);
    panel.castShadow = true;
    group.add(registerPart(panel, { explode: [0, 0, 1.2] }));

    if (row.kind === 'power') buildPowerFace(group, M, y, face);
    if (row.kind === 'interconnect') {
      for (let i = 0; i < row.h; i++) {
        portRow(group, M, `IC${i + 1}`, spanCentreY(row.u + i, 1), face + 0.005, 12);
      }
    }
    if (row.kind === 'switch') {
      portRow(group, M, 'SW_A', y + 0.026, face + 0.005, SDIM.ports.count);
      portRow(group, M, 'SW_B', y - 0.026, face + 0.005, SDIM.ports.count);
    }
    if (row.kind === 'cable') {
      for (let i = 0; i < 5; i++) {
        const ring = new THREE.Mesh(
          trackBand([{ z: 0, y: 0, r: 0.022 }], { thickness: 0.008, width: 0.030, segments: 14 }),
          M.detail,
        );
        ring.name = `Cable_Ring_${i + 1}`;
        ring.rotation.y = Math.PI / 2;
        ring.position.set((i - 2) * 0.085, y, face + 0.02);
        group.add(registerPart(ring, { explode: [(i - 2) * 0.6, 0.2, 1.4] }));
      }
    }
  }

  return group;
}

/**
 * The power shelf face: breakers, a white illuminated start pair and a red emergency stop.
 *
 * The red button is accent channel 4 and reads red in both display modes. The white ones cannot
 * be: the blueprint's paper is itself near-white, so a white accent is the one colour the
 * schematic has no way to show. They are a white material with a LIT GREEN RING instead, which
 * is both what a real illuminated start button looks like and the only version of "white
 * button" that survives being drawn on paper.
 */
function buildPowerFace(group, M, y, face) {
  const P = SDIM.power;

  const collar = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(P.epoCollar.radius, P.epoCollar.radius, P.epoCollar.height, 16).toNonIndexed()),
    M.steel,
  );
  collar.name = 'EPO_Collar';
  collar.rotation.x = Math.PI / 2;
  collar.position.set(P.epo.x, y, face + P.epoCollar.height / 2);
  group.add(registerPart(collar, { explode: [-1.2, 0, 1.4] }));

  const epo = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(P.epo.radius, P.epo.radius * 0.92, P.epo.height, 16).toNonIndexed()),
    M.glow4,
  );
  epo.name = 'Button_EPO';
  epo.rotation.x = Math.PI / 2;
  epo.position.set(P.epo.x, y, face + P.epoCollar.height + P.epo.height / 2);
  group.add(registerPart(epo, { explode: [-1.5, 0, 1.9], emissive: 'quaternary' }));

  P.start.x.forEach((x, i) => {
    const ring = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(P.startRing.radius, P.startRing.radius, P.startRing.height, 16).toNonIndexed()),
      M.glow3,
    );
    ring.name = `Start_Ring_${i + 1}`;
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y, face + P.startRing.height / 2);
    group.add(registerPart(ring, { explode: [1.2, 0, 1.4], emissive: 'tertiary' }));

    const button = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(P.start.radius, P.start.radius, P.start.height, 16).toNonIndexed()),
      M.white,
    );
    button.name = `Button_Start_${i + 1}`;
    button.rotation.x = Math.PI / 2;
    button.position.set(x, y, face + P.startRing.height + P.start.height / 2);
    group.add(registerPart(button, { explode: [1.5, 0, 1.9] }));
  });

  for (let i = 0; i < P.breaker.count; i++) {
    const br = new THREE.Mesh(
      finish(new THREE.BoxGeometry(P.breaker.width, P.breaker.height, P.breaker.depth).toNonIndexed()),
      M.detail,
    );
    br.name = `Breaker_${i + 1}`;
    br.position.set(P.breaker.x + i * P.breaker.pitch, y, face + P.breaker.depth / 2);
    group.add(registerPart(br, { explode: [0, -0.5, 1.3] }));
  }
}

// --- the sled that is out --------------------------------------------------

/**
 * The serviced sled, on its slide, and the board it exposes.
 *
 * Everything here hangs off `Service_Slide`, whose Z is written by the prismatic joint. The
 * slide node itself carries no geometry and is not explodable — see the joint's docstring.
 */
function buildService(M) {
  const S = SDIM.service;
  const u = serviceSlot();

  const slide = new THREE.Object3D();
  slide.name = 'Service_Slide';
  // Authored where the SLED OUT default puts it, so the built graph is the drawn graph and an
  // exported GLB opens in the pose the title block describes.
  slide.position.set(0, spanCentreY(u, 1), faceZ() + SDIM.rest.sled);
  registerPart(slide, { explodable: false });

  const body = new THREE.Mesh(sledGeometry(), M.armour);
  body.name = 'Service_Sled_Mesh';
  body.castShadow = true;
  slide.add(registerPart(body, { explodable: false }));

  const lights = new THREE.Mesh(sledLightGeometry(), M.glow3);
  lights.name = 'Service_Sled_Lights';
  slide.add(registerPart(lights, { explode: [0, 0.4, 0.6], emissive: 'tertiary' }));

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      finish(new THREE.BoxGeometry(S.rails.width, S.rails.height, S.board.depth * 0.9).toNonIndexed()),
      M.steel,
    );
    rail.name = `Slide_Rail_${side < 0 ? 'L' : 'R'}`;
    rail.position.set(side * S.rails.x, -SDIM.U * 0.34, -S.board.depth * 0.45);
    slide.add(registerPart(rail, { explode: [side * 1.1, -0.4, 0] }));
  }

  // The board, face down the rack. Its Z is behind the face plate, so it only appears as the
  // sled comes out — which is the entire point of a service position.
  const board = new THREE.Mesh(
    finish(new THREE.BoxGeometry(S.board.width, S.board.height, S.board.depth).toNonIndexed()),
    M.detail,
  );
  board.name = 'Board_Mesh';
  board.position.set(0, -SDIM.U * 0.22, -S.board.depth / 2 - 0.02);
  slide.add(registerPart(board, { explode: [0, -0.8, 0] }));

  slide.add(buildIC(M, board.position.clone()));

  // Memory, stood on edge in two banks, and the VRM row that feeds the package.
  const D = S.dimm;
  for (let i = 0; i < D.count; i++) {
    const bank = i < D.count / 2 ? -1 : 1;
    const k = i % (D.count / 2);
    const dimm = new THREE.Mesh(
      finish(new THREE.BoxGeometry(D.width, D.height, D.depth).toNonIndexed()), M.steel,
    );
    dimm.name = `DIMM_${i + 1}`;
    dimm.position.set(
      bank * D.x + (k - (D.count / 4 - 0.5)) * D.pitch * bank,
      board.position.y + D.height / 2,
      board.position.z + D.z,
    );
    slide.add(registerPart(dimm, { explode: [bank * 1.3, 0.9, 0] }));
  }

  const V = S.vrm;
  for (let i = 0; i < V.count; i++) {
    const vrm = new THREE.Mesh(
      finish(new THREE.BoxGeometry(V.width, V.height, V.depth).toNonIndexed()), M.detail,
    );
    vrm.name = `VRM_${i + 1}`;
    vrm.position.set(
      (i - (V.count - 1) / 2) * V.pitch, board.position.y + V.height / 2, board.position.z - V.z,
    );
    slide.add(registerPart(vrm, { explode: [0, 0.7, -0.9] }));
  }

  return slide;
}

/**
 * The IC package: substrate, lid, exposed die, and the heatsink over it.
 *
 * Built as a real stack rather than one box because the stack is what makes it read as a chip —
 * a carrier wider than the lid, a lid wider than the die, and fins above. The die is on accent
 * channel 1, which is the only part of this machine that is meant to look hot.
 */
function buildIC(M, boardPos) {
  const S = SDIM.service;
  const group = new THREE.Object3D();
  group.name = 'IC_Group';
  group.position.set(0, boardPos.y + S.board.height / 2, boardPos.z + S.ic.z);

  const sub = new THREE.Mesh(
    finish(new THREE.BoxGeometry(S.ic.substrate.width, S.ic.substrate.height, S.ic.substrate.depth).toNonIndexed()),
    M.turret,
  );
  sub.name = 'IC_Substrate';
  sub.position.y = S.ic.substrate.height / 2;
  group.add(registerPart(sub, { explode: [0, 0.6, 0] }));

  const lid = new THREE.Mesh(
    finish(new THREE.BoxGeometry(S.ic.lid.width, S.ic.lid.height, S.ic.lid.depth).toNonIndexed()),
    M.steel,
  );
  lid.name = 'IC_Lid';
  lid.position.y = S.ic.substrate.height + S.ic.lid.height / 2;
  group.add(registerPart(lid, { explode: [0, 1.0, 0] }));

  const die = new THREE.Mesh(
    finish(new THREE.BoxGeometry(S.ic.die.width, S.ic.die.height, S.ic.die.depth).toNonIndexed()),
    M.glow,
  );
  die.name = 'IC_Die';
  die.position.y = S.ic.substrate.height + S.ic.lid.height + S.ic.die.height / 2;
  group.add(registerPart(die, { explode: [0, 1.6, 0], emissive: 'primary' }));

  // The heatsink is one machined part, so it is one mesh — fins merged, plus the base plate
  // they stand on.
  const H = S.heatsink;
  const base = S.ic.substrate.height + S.ic.lid.height + S.ic.die.height;
  const boxes = [{ size: [H.width, 0.006, H.depth], at: [0, base + 0.003, 0] }];
  for (let i = 0; i < H.fins; i++) {
    boxes.push({
      size: [H.finThickness, H.finHeight, H.depth],
      at: [(i - (H.fins - 1) / 2) * (H.width / H.fins), base + 0.006 + H.finHeight / 2, 0],
    });
  }
  const sink = new THREE.Mesh(mergedBoxes(boxes), M.detail);
  sink.name = 'Heatsink_Mesh';
  group.add(registerPart(sink, { explode: [0, 1.3, 0] }));

  return group;
}

// --- doors and fans --------------------------------------------------------

function buildDoors(M) {
  const F = SDIM.frame;
  const D = SDIM.door;
  const group = new THREE.Object3D();
  group.name = 'Door_Group';
  const h = fieldHeight();
  const midY = F.plinth + h / 2;

  // Front: a perforated door, hinged on the left post.
  const front = new THREE.Object3D();
  front.name = 'Door_Front_Pivot';
  front.position.set(-F.width / 2, midY, F.depth / 2);
  front.rotation.y = THREE.MathUtils.degToRad(SDIM.rest.frontDoor);
  registerPart(front, { explodable: false });
  group.add(front);

  const frontMesh = new THREE.Mesh(
    finish(new THREE.BoxGeometry(F.width, h, D.thickness).toNonIndexed()), M.turret,
  );
  frontMesh.name = 'Door_Front_Mesh';
  frontMesh.position.set(F.width / 2, 0, D.thickness / 2);
  frontMesh.castShadow = true;
  front.add(registerPart(frontMesh, { explodable: false }));

  const frontHandle = new THREE.Mesh(
    finish(new THREE.BoxGeometry(D.handle.width, D.handle.height, D.handle.depth).toNonIndexed()),
    M.steel,
  );
  frontHandle.name = 'Door_Front_Handle';
  frontHandle.position.set(F.width - 0.06, 0, D.thickness + D.handle.depth / 2);
  front.add(registerPart(frontHandle, { explode: [0.8, 0, 1.4] }));

  // Rear: the fan wall, hinged on the right post so the two doors open away from each other.
  const rear = new THREE.Object3D();
  rear.name = 'Door_Rear_Pivot';
  rear.position.set(F.width / 2, midY, -F.depth / 2);
  rear.rotation.y = THREE.MathUtils.degToRad(-SDIM.rest.rearDoor);
  registerPart(rear, { explodable: false });
  group.add(rear);

  const rearMesh = new THREE.Mesh(
    finish(new THREE.BoxGeometry(F.width, h, D.thickness).toNonIndexed()), M.turret,
  );
  rearMesh.name = 'Fan_Wall_Mesh';
  rearMesh.position.set(-F.width / 2, 0, -D.thickness / 2);
  rearMesh.castShadow = true;
  rear.add(registerPart(rearMesh, { explodable: false }));

  const A = SDIM.fans;
  for (const f of fanLayout()) {
    const shroud = new THREE.Mesh(
      trackBand([{ z: 0, y: 0, r: A.radius }], {
        thickness: A.ringThickness, width: A.ringWidth, segments: 28,
      }),
      M.steel,
    );
    shroud.name = `${f.name}_Shroud`;
    shroud.rotation.y = Math.PI / 2;                     // ring axis along Z, the airflow
    shroud.position.set(-F.width / 2 + f.x, f.y, -D.thickness - A.ringWidth / 2);
    rear.add(registerPart(shroud, { explode: [f.x * 1.4, f.y * 0.8, -1.2] }));

    const spin = new THREE.Object3D();
    spin.name = `${f.name}_Spin`;
    spin.position.set(-F.width / 2 + f.x, f.y, -D.thickness - A.ringWidth / 2);
    registerPart(spin, { explodable: false });
    rear.add(spin);

    const rotor = new THREE.Mesh(fanRotorGeometry(), M.detail);
    rotor.name = `${f.name}_Rotor`;
    rotor.castShadow = true;
    spin.add(registerPart(rotor, { explode: [f.x * 1.8, f.y * 1.2, -1.8] }));
  }

  return group;
}

/**
 * One fan rotor: hub and blades merged into a single geometry.
 *
 * Seven blades as seven meshes would be seven part ids for one turned part, and the outline
 * pass would draw a seam through the middle of a component that has none. A rotor is one part;
 * the merge says so.
 */
function fanRotorGeometry() {
  const A = SDIM.fans;
  const parts = [];

  const hub = finish(new THREE.CylinderGeometry(A.hubRadius, A.hubRadius, 0.026, 14).toNonIndexed());
  hub.rotateX(Math.PI / 2);
  parts.push(hub);

  const m = new THREE.Matrix4();
  const pitch = new THREE.Matrix4();
  for (let i = 0; i < A.blades; i++) {
    const blade = finish(
      new THREE.BoxGeometry(A.bladeLength, A.bladeWidth, A.bladeThickness).toNonIndexed(),
    );
    // Out to the blade's own centre, cambered, then swung round the hub.
    pitch.makeRotationX(0.42);
    m.makeTranslation(A.hubRadius + A.bladeLength / 2, 0, 0).multiply(pitch);
    blade.applyMatrix4(m);
    blade.applyMatrix4(new THREE.Matrix4().makeRotationZ((i / A.blades) * Math.PI * 2));
    parts.push(blade);
  }
  return mergeNonIndexed(parts);
}

function buildCollision() {
  const F = SDIM.frame;
  const geom = new THREE.BoxGeometry(F.width, overallHeight(), F.depth);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Rack_Collision';
  mesh.position.y = overallHeight() / 2;
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}
