import * as THREE from 'three';
import { CX2DIM as D } from './dimensions.js';
import { extrudeProfile, latheZ, mergeNonIndexed, finish } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * MK-CX/2 — the MK-CX, streamlined. See dimensions.js for what changed and why.
 *
 * Same hierarchy contract as the MK-CX (Hull_Mesh, Hull_Collision, Turret_Pivot, Turret_Mesh,
 * Barrel_Pivot, Barrel_Mesh, Details_Group, Hover_Gear, the two secondaries), so anything
 * rigged for the MK-CX rigs this. What is gone: the turret's applique, hatch, sight, launcher
 * pods and stowage bin; the hull's engine grille, driver hatch and sensor mast. What is new:
 * ShellRack_Mount and nine Shell_Socket_N in the rear deck, and Deck_Glow_1/2 on top.
 */
export function buildMkcx2() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'MKCX2_Root';

  root.add(buildHull(M));
  root.add(buildCollision());
  root.add(buildHoverGear(M));
  root.add(buildPedestal(M));
  root.add(buildTurret(M));
  root.add(buildSecondaries(M));
  root.add(buildHullDetails(M));
  root.position.y = D.hover.gap;

  const sec = D.secondary.limits;
  root.userData.joints = [
    {
      key: 'azimuth', label: 'AZIMUTH', unit: '°', min: -180, max: 180, step: 1, value: 0,
      targets: [{ node: 'Turret_Pivot', axis: 'y', from: -180, to: 180 }],
    },
    {
      key: 'elevation', label: 'ELEVATE', unit: '°',
      min: D.limits.elevation[0], max: D.limits.elevation[1], step: 0.5, value: 0,
      targets: [{ node: 'Barrel_Pivot', axis: 'x', from: -D.limits.elevation[0], to: -D.limits.elevation[1] }],
    },
    {
      key: 'secAzimuth', label: 'SEC TRAV', unit: '°',
      min: sec.azimuth[0], max: sec.azimuth[1], step: 1, value: 0,
      targets: [
        { node: 'Secondary_L_Pivot', axis: 'y', from: sec.azimuth[0], to: sec.azimuth[1] },
        { node: 'Secondary_R_Pivot', axis: 'y', from: sec.azimuth[0], to: sec.azimuth[1] },
      ],
    },
    {
      key: 'secElevation', label: 'SEC ELEV', unit: '°',
      min: sec.elevation[0], max: sec.elevation[1], step: 0.5, value: 0,
      targets: [
        { node: 'Secondary_L_Gun_Pivot', axis: 'x', from: -sec.elevation[0], to: -sec.elevation[1] },
        { node: 'Secondary_R_Gun_Pivot', axis: 'x', from: -sec.elevation[0], to: -sec.elevation[1] },
      ],
    },
  ];
  return root;
}

// --- hull ------------------------------------------------------------------

function buildHull(M) {
  const h = D.hull;
  const halfL = h.length / 2;

  const tub = extrudeProfile([
    [-halfL, h.bellyY], [halfL - 0.85, h.bellyY], [halfL - 0.10, h.bellyY + 0.42],
    [halfL - 0.10, h.sponsonY], [-halfL, h.sponsonY],
  ], h.tubWidth);

  // ONE plane on top. The MK-CX's deck is a step behind a glacis; this runs the knife nose
  // straight up to a flat roof and holds it to a short raked tail.
  const upper = extrudeProfile([
    [-halfL, h.sponsonY],
    [halfL - 0.20, h.sponsonY],
    [h.noseZ, h.sponsonY + 0.24],
    [1.30, h.deckY],
    [-halfL + 0.30, h.deckY],
    [-halfL - 0.26, h.deckY - 0.26],
  ], h.sponsonWidth, { frontScale: 0.94, backScale: 0.94 });

  const mesh = new THREE.Mesh(mergeNonIndexed([tub, upper]), M.armour);
  mesh.name = 'Hull_Mesh';
  mesh.castShadow = mesh.receiveShadow = true;
  return registerPart(mesh, { explodable: false });
}

function buildCollision() {
  const h = D.hull;
  const geom = new THREE.BoxGeometry(h.sponsonWidth, h.deckY - h.bellyY, h.length);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Hull_Collision';
  mesh.position.y = (h.deckY + h.bellyY) / 2;
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}

// --- hover gear (the MK-CX's, verbatim) --------------------------------------

function buildHoverGear(M) {
  const group = new THREE.Object3D();
  group.name = 'Hover_Gear';
  const h = D.hover;
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const nacelle = new THREE.Mesh(
      extrudeProfile(h.nacelle.profile, h.nacelle.width, { frontScale: 0.86, backScale: 0.86 }),
      M.armour,
    );
    nacelle.name = `Nacelle_${tag}`;
    nacelle.position.x = side * h.nacelle.centreX;
    nacelle.castShadow = nacelle.receiveShadow = true;
    group.add(registerPart(nacelle, { explode: [side * 2.0, -0.5, 0] }));
    h.emitters.forEach(([z, len], i) => {
      const emitter = new THREE.Mesh(
        finish(new THREE.BoxGeometry(h.nacelle.width * 0.62, 0.05, len).toNonIndexed()), M.glow,
      );
      emitter.name = `LiftEmitter_${tag}${i + 1}`;
      emitter.position.set(side * h.nacelle.centreX, 0.02, z);
      group.add(registerPart(emitter, { explode: [side * 0.8, -1.1, 0], emissive: 'primary' }));
    });
    for (const z of [-2.30, 0.10, 2.40]) {
      const pylon = new THREE.Mesh(finish(new THREE.BoxGeometry(0.52, 0.30, 0.34).toNonIndexed()), M.steel);
      pylon.name = `Pylon_${tag}${z < 0 ? 'A' : z < 1 ? 'B' : 'C'}`;
      pylon.position.set(side * (h.nacelle.centreX - 0.22), 0.88, z);
      group.add(registerPart(pylon, { explodable: false }));
    }
  }
  return group;
}

// --- the pedestal the blade stands on -----------------------------------------
// Static (a child of the root, not the pivot): the blade turns on it. Its
// footprint is inside the blade's, so the blade overhangs it on every side
// and the raise reads as deliberate rather than as a gap.
function buildPedestal(M) {
  const t = D.turret, p = t.pedestal;
  const hz = p.length / 2, hh = p.height;
  const mesh = new THREE.Mesh(
    extrudeProfile([[-hz, 0], [-hz - 0.06, hh / 2], [-hz, hh], [hz, hh], [hz + 0.06, hh / 2], [hz, 0]], p.width),
    M.turret,
  );
  mesh.name = 'Turret_Pedestal';
  mesh.position.set(0, D.hull.deckY, t.ringZ);
  mesh.castShadow = mesh.receiveShadow = true;
  return registerPart(mesh, { explodable: false });
}

// --- the blade turret --------------------------------------------------------

function buildTurret(M) {
  const t = D.turret;
  const pivot = new THREE.Object3D();
  pivot.name = 'Turret_Pivot';
  pivot.position.set(0, t.ringY, t.ringZ);
  registerPart(pivot, { explode: [0, 2.1, 0] });

  const body = new THREE.Mesh(
    extrudeProfile(t.profile, t.width, { frontScale: 0.72, backScale: 0.72 }), M.turret,
  );
  body.name = 'Turret_Mesh';
  body.castShadow = body.receiveShadow = true;
  pivot.add(registerPart(body, { explodable: false }));

  strips(pivot, D.glow.turret, 'Turret_Glow', M.glow);
  pivot.add(buildBarrel(M));
  return pivot;
}

function buildBarrel(M) {
  const b = D.barrel;
  const pivot = new THREE.Object3D();
  pivot.name = 'Barrel_Pivot';
  pivot.position.set(0, b.trunnionY, b.trunnionZ);
  registerPart(pivot, { explode: [0, 0, 2.0] });

  const barrel = new THREE.Mesh(latheZ(b.profile, 18), M.steel);
  barrel.name = 'Barrel_Mesh';
  barrel.castShadow = true;
  pivot.add(registerPart(barrel, { explodable: false }));

  const brake = new THREE.Mesh(latheZ(b.brakeProfile, 18), M.steel);
  brake.name = 'MuzzleBrake_Mesh';
  brake.castShadow = true;
  pivot.add(registerPart(brake, { explode: [0, 0, 2.4] }));

  // The cradle: a low wedge-fronted block the trunnion sits in, the one thing allowed to
  // stand above the blade. Its underside reaches the blade so it reads as one casting.
  const mantlet = new THREE.Mesh(
    extrudeProfile([
      [-0.30, -b.trunnionY + 0.02], [0.30, -b.trunnionY + 0.02], [0.30, -0.02],
      [0.22, b.mantlet.height / 2], [-0.30, b.mantlet.height / 2],
    ], b.mantlet.width, { frontScale: 0.9, backScale: 0.9 }),
    M.steel,
  );
  mantlet.name = 'Mantlet_Mesh';
  mantlet.position.z = 0.16;
  pivot.add(registerPart(mantlet, { explode: [0, 1.0, 0] }));

  strips(pivot, D.glow.barrel, 'Barrel_Glow', M.glow);
  return pivot;
}

// --- secondaries (the MK-CX's, lower) ------------------------------------------

function buildSecondaries(M) {
  const group = new THREE.Object3D();
  group.name = 'Secondary_Turrets';
  const c = D.secondary;
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const ring = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(c.ring.radius, c.ring.radius * 1.1, c.ring.height, 12).toNonIndexed()),
      M.detail,
    );
    ring.name = `Secondary_${tag}_Ring`;
    ring.position.set(side * c.x, c.y - c.ring.height / 2, c.z);
    group.add(registerPart(ring, { explodable: false }));

    const pivot = new THREE.Object3D();
    pivot.name = `Secondary_${tag}_Pivot`;
    pivot.position.set(side * c.x, c.y, c.z);
    registerPart(pivot, { explode: [side * 1.3, 0.9, 0.7] });

    const shell = new THREE.Mesh(
      extrudeProfile(c.profile, c.width, { frontScale: 0.78, backScale: 0.78 }), M.turret,
    );
    shell.name = `Secondary_${tag}_Mesh`;
    shell.castShadow = true;
    pivot.add(registerPart(shell, { explodable: false }));
    strips(pivot, [[0, 0.15, 0.30, 0.24, 0.03, 0.02]], `Secondary_${tag}_Glow`, M.glow);

    const gunPivot = new THREE.Object3D();
    gunPivot.name = `Secondary_${tag}_Gun_Pivot`;
    gunPivot.position.set(0, c.gunTrunnionY, c.gunTrunnionZ);
    registerPart(gunPivot, { explode: [0, 0, 0.7] });

    const gun = new THREE.Mesh(latheZ(c.gunProfile, 10), M.steel);
    gun.name = `Secondary_${tag}_Gun_Mesh`;
    gunPivot.add(registerPart(gun, { explodable: false }));

    const mantlet = new THREE.Mesh(finish(new THREE.BoxGeometry(0.20, 0.16, 0.16).toNonIndexed()), M.steel);
    mantlet.name = `Secondary_${tag}_Mantlet`;
    mantlet.position.z = 0.04;
    gunPivot.add(registerPart(mantlet, { explodable: false }));

    pivot.add(gunPivot);
    group.add(pivot);
  }
  return group;
}

// --- hull details: applique, side strips, headlights, the DECK strips, the rack ------

function buildHullDetails(M) {
  const g = new THREE.Object3D();
  g.name = 'Details_Group';
  const h = D.hull;

  slabs(g, D.applique.hull, 'Hull_Applique', M.armour, [2.0, 0.3, 0]);
  strips(g, D.glow.hull, 'Hull_Glow', M.glow);
  strips(g, D.glow.deck, 'Deck_Glow', M.glow);

  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const light = new THREE.Mesh(finish(new THREE.BoxGeometry(0.30, 0.10, 0.06).toNonIndexed()), M.glow);
    light.name = `Headlight_${tag}`;
    light.position.set(side * 1.06, h.sponsonY + 0.18, h.noseZ - 0.28);
    g.add(registerPart(light, { explode: [side * 0.6, 0.4, 1.3], emissive: 'primary' }));
  }

  // THE RACK. An empty at the rack's centre for whoever places the shells, and nine shallow
  // sockets so the deck says "nine go here" even with nothing in them. Row-major from the
  // rear-left, the same order a 3x3 rack is read in.
  const r = D.rack;
  const mount = new THREE.Object3D();
  mount.name = 'ShellRack_Mount';
  mount.position.set(0, h.deckY, r.z);
  registerPart(mount, { explodable: false });
  let n = 1;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const socket = new THREE.Mesh(
        finish(new THREE.CylinderGeometry(r.socket, r.socket * 1.08, r.depth, 10).toNonIndexed()), M.detail,
      );
      socket.name = `Shell_Socket_${n++}`;
      socket.position.set((col - 1) * r.gapX, r.depth / 2 - 0.01, (row - 1) * r.gapZ);
      mount.add(registerPart(socket, { explodable: false }));
    }
  }
  g.add(mount);
  return g;
}

// --- shared builders (the MK-CX's) ----------------------------------------------

function slabs(parent, defs, prefix, material, explodeBase) {
  defs.forEach(([x, y, z, w, hgt, d, rotZ], i) => {
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(
        extrudeProfile([[-d / 2, -hgt / 2], [d / 2, -hgt / 2 + 0.04], [d / 2, hgt / 2 - 0.10], [-d / 2, hgt / 2]], w),
        material,
      );
      mesh.name = `${prefix}_${side < 0 ? 'L' : 'R'}${i + 1}`;
      mesh.position.set(side * x, y, z);
      mesh.rotation.z = side * rotZ;
      mesh.castShadow = true;
      parent.add(registerPart(mesh, { explode: [side * explodeBase[0], explodeBase[1], explodeBase[2]] }));
    }
  });
}

function strips(parent, defs, prefix, material) {
  defs.forEach(([x, y, z, w, hgt, d], i) => {
    const mesh = new THREE.Mesh(finish(new THREE.BoxGeometry(w, hgt, d).toNonIndexed()), material);
    mesh.name = `${prefix}_${i + 1}`;
    mesh.position.set(x, y, z);
    parent.add(registerPart(mesh, { explode: [x * 1.2, 0.6, 0], emissive: 'primary' }));
  });
}
