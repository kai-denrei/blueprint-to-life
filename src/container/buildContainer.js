import * as THREE from 'three';
import {
  CDIM, castingLayout, interiorHeight, interiorLength, interiorWidth, leafWidth, palletLayout,
} from './dimensions.js';
import { corrugatedPanel, finish, foldPitch, mergeNonIndexed } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * CX-20 — 20 ft intermodal container, powered variant, doors open.
 *
 * The eleventh subject, and the first you look INTO rather than at.
 *
 * That turns out to be a modelling constraint rather than a framing choice. The blueprint pass
 * renders the whole scene with `side: THREE.DoubleSide`, so a container whose walls were planes
 * would look completely correct in the schematic — and you would see straight out through the
 * back of it the moment anyone pressed GAME / PBR, where the standard materials cull back faces.
 * The two display modes would have disagreed about whether the box had walls.
 *
 * So the walls are real sheets with thickness, and `corrugatedPanel` makes them solid: an outer
 * surface, an inner surface, and closed edges. Neither renderer needed changing, which is the
 * point — the same argument the `emissive` attribute makes about not living in a material.
 *
 * The other half is that a container is a shape agreed on by everybody. ISO 668 fixes the
 * envelope and ISO 1161 fixes the corner castings, so the interesting figures here are derived
 * and checked rather than styled: get them wrong and you have drawn something no crane can lift.
 */
export function buildContainer() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'Container_Root';

  root.add(buildFrame(M));
  root.add(buildShell(M));
  root.add(buildFloor(M));
  root.add(buildCargo(M));
  root.add(buildTech(M));
  root.add(buildDoors(M));
  root.add(buildCollision());

  const D = CDIM.door;
  root.userData.joints = [
    {
      // Negated: the left leaf swings back along -Z on the left flank, and a positive rotation
      // about Y would carry it forward across the opening instead.
      key: 'doorL', label: 'DOOR, LEFT', unit: '°', min: 0, max: D.open, step: 1,
      value: CDIM.rest.doorL,
      targets: [{ node: 'Door_L_Pivot', axis: 'y', from: 0, to: -D.open }],
    },
    {
      key: 'doorR', label: 'DOOR, RIGHT', unit: '°', min: 0, max: D.open, step: 1,
      value: CDIM.rest.doorR,
      targets: [{ node: 'Door_R_Pivot', axis: 'y', from: 0, to: D.open }],
    },
    {
      // Four cam rods on one slider. They are what actually holds a door shut against a sea,
      // and they have to be turned before either leaf can move — which the drawing can show and
      // a single DOOR slider could not.
      key: 'locks', label: 'CAM LOCKS', unit: '°', min: 0, max: 100, step: 1, value: CDIM.rest.locks,
      targets: ['L1', 'L2', 'R1', 'R2'].map((tag) => ({
        node: `Lock_${tag}_Rod`, axis: 'y', from: 0, to: D.rod.turn,
      })),
    },
  ];
  return root;
}

// --- structure -------------------------------------------------------------

function buildFrame(M) {
  const I = CDIM.iso;
  const F = CDIM.frame;
  const group = new THREE.Object3D();
  group.name = 'Frame_Group';

  // Four corner posts, full height between the castings.
  const postH = I.height - 2 * I.casting.height;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(
        finish(new THREE.BoxGeometry(F.post, postH, F.postDepth).toNonIndexed()), M.steel,
      );
      post.name = `Post_${sz > 0 ? 'F' : 'R'}${sx < 0 ? 'L' : 'R'}`;
      post.position.set(
        sx * (I.width / 2 - F.post / 2), I.height / 2, sz * (I.length / 2 - F.postDepth / 2),
      );
      post.castShadow = true;
      group.add(registerPart(post, { explode: [sx * 0.8, 0, sz * 0.8] }));
    }
  }

  // Top and bottom side rails.
  const railLen = I.length - 2 * F.postDepth;
  for (const sx of [-1, 1]) {
    for (const [tag, y] of [['Top', I.height - I.casting.height - F.rail.height / 2],
      ['Bot', I.casting.height + F.rail.height / 2]]) {
      const rail = new THREE.Mesh(
        finish(new THREE.BoxGeometry(F.rail.depth, F.rail.height, railLen).toNonIndexed()), M.steel,
      );
      rail.name = `Rail_${tag}_${sx < 0 ? 'L' : 'R'}`;
      rail.position.set(sx * (I.width / 2 - F.rail.depth / 2), y, 0);
      group.add(registerPart(rail, { explode: [sx * 1.3, 0, 0] }));
    }
  }

  // End headers and sills, front and rear. The rear pair is what the doors hang on.
  const spanW = I.width - 2 * F.post;
  for (const sz of [-1, 1]) {
    const tag = sz > 0 ? 'Rear' : 'Front';
    const header = new THREE.Mesh(
      finish(new THREE.BoxGeometry(spanW, F.header.height, F.header.depth).toNonIndexed()), M.steel,
    );
    header.name = `Header_${tag}`;
    header.position.set(0, I.height - I.casting.height - F.header.height / 2,
      sz * (I.length / 2 - F.header.depth / 2));
    group.add(registerPart(header, { explode: [0, 0.9, sz * 0.9] }));

    const sill = new THREE.Mesh(
      finish(new THREE.BoxGeometry(spanW, F.sill.height, F.sill.depth).toNonIndexed()), M.steel,
    );
    sill.name = `Sill_${tag}`;
    sill.position.set(0, I.casting.height + F.sill.height / 2,
      sz * (I.length / 2 - F.sill.depth / 2));
    group.add(registerPart(sill, { explode: [0, -0.9, sz * 0.9] }));
  }

  /**
   * The eight ISO 1161 corner fittings.
   *
   * Every one is at a corner of the declared envelope, because that is the entire specification:
   * a spreader finds them by geometry, not by looking. An invariant holds them there.
   */
  for (const c of castingLayout()) {
    const cast = new THREE.Mesh(
      finish(new THREE.BoxGeometry(I.casting.width, I.casting.height, I.casting.length).toNonIndexed()),
      M.armour,
    );
    cast.name = c.name;
    cast.position.set(c.x, c.y, c.z);
    cast.castShadow = true;
    group.add(registerPart(cast, { explode: [c.sx * 1.1, c.sy * 1.1, c.sz * 1.1] }));
  }

  return group;
}

/**
 * The corrugated shell: two side walls, a front end and a roof.
 *
 * Each panel's fold pitch is snapped so it divides that panel exactly — a wall that ends on a
 * half fold is a wall nobody pressed — so the three walls have three different pitches, all
 * derived. The crest of each side wall sits flush with the ISO width and the trough is inboard
 * of it, which is why the clear internal width is the envelope minus twice the fold depth.
 */
function buildShell(M) {
  const I = CDIM.iso;
  const F = CDIM.frame;
  const C = CDIM.corrugation;
  const group = new THREE.Object3D();
  group.name = 'Shell_Group';

  const wallH = I.height - I.casting.height * 2 - F.rail.height * 2;
  const wallY = I.height / 2;
  const sideLen = I.length - 2 * F.postDepth;
  const sidePitch = foldPitch(sideLen, C.nominal);

  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(
      corrugatedPanel({
        length: sideLen, height: wallH, thickness: C.thickness,
        pitch: sidePitch, depth: C.depth, crest: C.crest, trough: C.trough,
      }),
      M.armour,
    );
    wall.name = `Wall_${sx < 0 ? 'L' : 'R'}`;
    // Turn the panel into the YZ plane with its fold bulging outboard.
    wall.rotation.y = sx * Math.PI / 2;
    wall.position.set(sx * (I.width / 2 - C.depth), wallY, 0);
    wall.castShadow = wall.receiveShadow = true;
    group.add(registerPart(wall, { explode: [sx * 1.9, 0, 0] }));
  }

  const endW = I.width - 2 * F.post;
  const front = new THREE.Mesh(
    corrugatedPanel({
      length: endW, height: wallH, thickness: C.thickness,
      pitch: foldPitch(endW, C.nominal), depth: C.depth, crest: C.crest, trough: C.trough,
    }),
    M.armour,
  );
  front.name = 'Wall_Front';
  front.rotation.y = Math.PI;                       // fold bulges toward -Z, the front
  front.position.set(0, wallY, -(I.length / 2 - C.depth));
  front.castShadow = front.receiveShadow = true;
  group.add(registerPart(front, { explode: [0, 0, -1.9] }));

  const roof = new THREE.Mesh(
    corrugatedPanel({
      length: endW, height: sideLen, thickness: C.thickness,
      pitch: foldPitch(endW, C.roofNominal), depth: C.roofDepth, crest: C.crest, trough: C.trough,
    }),
    M.armour,
  );
  roof.name = 'Roof_Mesh';
  roof.rotation.x = -Math.PI / 2;                   // lay it flat, fold bulging up
  roof.position.set(0, I.height - I.casting.height - C.roofDepth, 0);
  roof.castShadow = roof.receiveShadow = true;
  group.add(registerPart(roof, { explode: [0, 1.7, 0] }));

  return group;
}

function buildFloor(M) {
  const I = CDIM.iso;
  const F = CDIM.frame;
  const group = new THREE.Object3D();
  group.name = 'Floor_Group';

  const deckY = I.casting.height + F.sill.height;
  const deck = new THREE.Mesh(
    finish(new THREE.BoxGeometry(interiorWidth(), F.floorThickness, interiorLength()).toNonIndexed()),
    M.detail,
  );
  deck.name = 'Floor_Deck';
  deck.position.y = deckY + F.floorThickness / 2;
  deck.receiveShadow = true;
  group.add(registerPart(deck, { explode: [0, -1.2, 0] }));

  // The underframe: eleven cross members, merged. It is one weldment, so it is one part — the
  // same call the rack's heatsink and the gimbal's fan rotors make.
  const X = F.crossMember;
  const boxes = [];
  for (let i = 0; i < X.count; i++) {
    boxes.push({
      size: [I.width - 2 * F.post, X.height, X.depth],
      at: [0, 0, (i - (X.count - 1) / 2) * (interiorLength() / X.count)],
    });
  }
  const under = new THREE.Mesh(
    mergeNonIndexed(boxes.map(({ size, at }) => {
      const g = finish(new THREE.BoxGeometry(...size).toNonIndexed());
      g.translate(...at);
      return g;
    })),
    M.steel,
  );
  under.name = 'Underframe_Mesh';
  under.position.y = deckY - X.height / 2;
  group.add(registerPart(under, { explode: [0, -1.7, 0] }));

  // Lit floor strips: the powered part of an otherwise entirely conventional deck, and what
  // makes an open container read as lit rather than as a dark hole.
  const S = CDIM.interior.floorStrip;
  for (const sx of [-1, 1]) {
    const strip = new THREE.Mesh(
      finish(new THREE.BoxGeometry(S.width, S.height, interiorLength() * 0.96).toNonIndexed()),
      M.glow3,
    );
    strip.name = `Floor_Strip_${sx < 0 ? 'L' : 'R'}`;
    strip.position.set(sx * (interiorWidth() / 2 - S.inset), deckY + F.floorThickness + S.height / 2, 0);
    group.add(registerPart(strip, { explode: [sx * 1.5, 0.4, 0], emissive: 'tertiary' }));
  }

  return group;
}

/**
 * The unit load: eight identical pallets on a grid.
 *
 * Instanced, and the justification is the format itself — a container exists so that freight
 * arrives as identical boxes at a known pitch. Eight copies of one static transform is the same
 * test the rack's sleds pass and the walker's feet fail.
 */
function buildCargo(M) {
  const I = CDIM.iso;
  const F = CDIM.frame;
  const P = CDIM.interior.pallet;
  const group = new THREE.Object3D();
  group.name = 'Cargo_Group';

  const deckTop = I.casting.height + F.sill.height + F.floorThickness;
  const spots = palletLayout();
  const matrix = new THREE.Matrix4();

  const make = (name, geom, material, yOffset, explode) => {
    const mesh = new THREE.InstancedMesh(geom, material, spots.length);
    mesh.name = name;
    spots.forEach((s, i) => {
      matrix.makeTranslation(s.x, deckTop + yOffset, s.z);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.userData.layout = spots.slice();
    group.add(registerPart(mesh, { explode }));
    return mesh;
  };

  make('Pallets_Instanced',
    finish(new THREE.BoxGeometry(P.width, P.height, P.depth).toNonIndexed()),
    M.detail, P.height / 2, [0, -0.8, 1.4]);

  make('Loads_Instanced',
    finish(new THREE.BoxGeometry(
      P.width - 2 * P.load.inset, P.load.height, P.depth - 2 * P.load.inset,
    ).toNonIndexed()),
    M.turret, P.height + P.load.height / 2, [0, 0.5, 1.8]);

  return group;
}

/** The powered fittings, which are the only part of this that is not a 1968 container. */
function buildTech(M) {
  const I = CDIM.iso;
  const T = CDIM.tech;
  const group = new THREE.Object3D();
  group.name = 'Details_Group';
  // Flush with the envelope's front face, not proud of the corrugation. Mounted on the wall's
  // outer surface they stood 34 mm past the ISO length — a fitting outside the envelope is a
  // fitting a cell guide shears off.
  const faceZ = -(I.length / 2);

  const panel = new THREE.Mesh(
    finish(new THREE.BoxGeometry(T.panel.width, T.panel.height, T.panel.depth).toNonIndexed()),
    M.turret,
  );
  panel.name = 'Telemetry_Panel';
  panel.position.set(0, T.panel.y, faceZ + T.panel.depth / 2);
  group.add(registerPart(panel, { explode: [0, 0.7, -1.7] }));

  const readout = new THREE.Mesh(
    finish(new THREE.BoxGeometry(T.readout.width, T.readout.height, T.readout.depth).toNonIndexed()),
    M.glow2,
  );
  readout.name = 'Telemetry_Readout';
  readout.position.set(0, T.panel.y, faceZ + T.readout.depth / 2);
  group.add(registerPart(readout, { explode: [0, 0.9, -2.1], emissive: 'secondary' }));

  const vent = new THREE.Mesh(
    finish(new THREE.BoxGeometry(T.vent.width, T.vent.height, T.vent.depth).toNonIndexed()),
    M.detail,
  );
  vent.name = 'Climate_Vent';
  vent.position.set(0, T.vent.y, faceZ + T.vent.depth / 2);
  group.add(registerPart(vent, { explode: [0, 0, -1.9] }));

  const plate = new THREE.Mesh(
    finish(new THREE.BoxGeometry(T.idPlate.width, T.idPlate.height, T.idPlate.depth).toNonIndexed()),
    M.steel,
  );
  plate.name = 'ID_Plate';
  plate.position.set(0, T.idPlate.y, faceZ + T.idPlate.depth / 2);
  group.add(registerPart(plate, { explode: [0, -0.6, -1.6] }));

  /**
   * A lock indicator on each of the four top castings.
   *
   * Green on channel 3, which is the same accent the floor strips and the door seals use — one
   * colour for "powered and secured" across the whole machine, rather than a different hue per
   * fitting. Channel 4's red is left for the thing that actually means stop.
   */
  for (const c of castingLayout().filter((k) => k.sy > 0)) {
    const lamp = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(T.lockLamp.radius, T.lockLamp.radius, T.lockLamp.height, 12).toNonIndexed()),
      M.glow3,
    );
    lamp.name = `Lock_Lamp_${c.name.slice(-2)}`;
    // Flush with the casting's top face, not proud of it. Anything standing above the top
    // castings is what the container stacked on top of this one lands on — and it would have
    // put the machine 8 mm over the ISO height, which the envelope invariant caught.
    lamp.position.set(c.x, c.y + I.casting.height / 2 - T.lockLamp.height / 2, c.z);
    group.add(registerPart(lamp, { explode: [c.sx * 1.3, 1.4, c.sz * 1.3], emissive: 'tertiary' }));
  }

  return group;
}

// --- doors -----------------------------------------------------------------

/**
 * Two leaves on the rear frame, opening flat back against the side walls.
 *
 * 268 degrees, not 90: a container door folds all the way round so a forklift can reach the
 * opening, and it is held there by the same castings that hold the box together. There is an
 * invariant that the open leaves clear the side walls rather than passing through them.
 */
function buildDoors(M) {
  const I = CDIM.iso;
  const F = CDIM.frame;
  const D = CDIM.door;
  const group = new THREE.Object3D();
  group.name = 'Door_Group';

  const leafW = leafWidth();
  const leafH = I.height - 2 * I.casting.height - F.header.height - F.sill.height;
  const midY = I.casting.height + F.sill.height + leafH / 2;
  const pitch = foldPitch(leafW, D.nominal);

  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const pivot = new THREE.Object3D();
    pivot.name = `Door_${tag}_Pivot`;
    // Recessed behind the corner posts. Flush, the cam-rod hardware stood 66 mm proud of the
    // ISO envelope even stowed — and the envelope is what a ship's cell guide allows, so a
    // handle outside it is a container that does not fit.
    pivot.position.set(side * (I.width / 2 - D.hingeInset), midY, I.length / 2 - D.recess);
    pivot.rotation.y = THREE.MathUtils.degToRad(
      side < 0 ? -CDIM.rest.doorL : CDIM.rest.doorR,
    );
    registerPart(pivot, { explodable: false });
    group.add(pivot);

    // Panel, hung from the hinge toward the centre of the opening.
    const panel = new THREE.Mesh(
      corrugatedPanel({
        length: leafW, height: leafH, thickness: D.thickness,
        pitch, depth: D.depth, crest: D.crest ?? 0.32, trough: D.trough ?? 0.32,
      }),
      M.armour,
    );
    panel.name = `Door_${tag}_Panel`;
    panel.position.set(-side * leafW / 2, 0, D.depth);
    panel.rotation.y = Math.PI;                     // fold bulges outboard, away from the cargo
    panel.castShadow = panel.receiveShadow = true;
    pivot.add(registerPart(panel, { explodable: false }));

    // Perimeter frame, so the leaf reads as a door rather than a loose sheet.
    const S = D.frameSection;
    const frameBoxes = [
      { size: [leafW, S, S], at: [-side * leafW / 2, leafH / 2 - S / 2, 0] },
      { size: [leafW, S, S], at: [-side * leafW / 2, -leafH / 2 + S / 2, 0] },
      { size: [S, leafH, S], at: [-side * S / 2, 0, 0] },
      { size: [S, leafH, S], at: [-side * (leafW - S / 2), 0, 0] },
    ];
    const frame = new THREE.Mesh(
      mergeNonIndexed(frameBoxes.map(({ size, at }) => {
        const g = finish(new THREE.BoxGeometry(...size).toNonIndexed());
        g.translate(...at);
        return g;
      })),
      M.steel,
    );
    frame.name = `Door_${tag}_Frame`;
    frame.castShadow = true;
    pivot.add(registerPart(frame, { explode: [side * 0.9, 0, 0.7] }));

    // The lit seal down the leading edge — the powered detail, on the same green as the floor.
    const seal = new THREE.Mesh(
      finish(new THREE.BoxGeometry(D.seal.width, leafH * 0.96, D.seal.depth).toNonIndexed()),
      M.glow3,
    );
    seal.name = `Door_${tag}_Seal`;
    seal.position.set(-side * (leafW - D.seal.width / 2), 0, -D.seal.depth);
    pivot.add(registerPart(seal, { explode: [-side * 1.4, 0, -0.8], emissive: 'tertiary' }));

    // Two cam-lock rods per leaf, each on its own turn node.
    D.rod.x.forEach((rx, i) => {
      const spin = new THREE.Object3D();
      spin.name = `Lock_${tag}${i + 1}_Rod`;
      spin.position.set(-side * rx, 0, D.depth + D.rod.radius);
      registerPart(spin, { explodable: false });
      pivot.add(spin);

      const rod = new THREE.Mesh(
        finish(new THREE.CylinderGeometry(D.rod.radius, D.rod.radius, leafH * 0.98, 10).toNonIndexed()),
        M.steel,
      );
      rod.name = `Lock_${tag}${i + 1}_Bar`;
      rod.castShadow = true;
      spin.add(registerPart(rod, { explode: [-side * 1.2, 0, 1.1] }));

      const handle = new THREE.Mesh(
        finish(new THREE.BoxGeometry(D.handle.length, D.handle.height, D.handle.width).toNonIndexed()),
        M.detail,
      );
      handle.name = `Lock_${tag}${i + 1}_Handle`;
      handle.position.set(D.handle.length / 2, D.handle.y, 0);
      spin.add(registerPart(handle, { explode: [-side * 1.6, 0.2, 1.4] }));

      // Cam keepers, top and bottom, which are what the rod actually turns into.
      for (const sy of [-1, 1]) {
        const keeper = new THREE.Mesh(
          finish(new THREE.BoxGeometry(D.keeper.width, D.keeper.height, D.keeper.depth).toNonIndexed()),
          M.detail,
        );
        keeper.name = `Lock_${tag}${i + 1}_Cam_${sy < 0 ? 'B' : 'T'}`;
        keeper.position.set(0, sy * leafH * 0.47, 0);
        spin.add(registerPart(keeper, { explode: [0, sy * 1.3, 0.9] }));
      }
    });
  }

  return group;
}

function buildCollision() {
  const I = CDIM.iso;
  const geom = new THREE.BoxGeometry(I.width, I.height, I.length);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Container_Collision';
  mesh.position.y = I.height / 2;
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}
