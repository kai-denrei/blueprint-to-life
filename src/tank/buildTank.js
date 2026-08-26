import * as THREE from 'three';
import { DIM, wheelLayout } from './dimensions.js';
import { extrudeProfile, trackBand, latheZ, mergeNonIndexed, finish } from './geometry.js';
import { createMaterials } from './materials.js';
import { registerPart, resetPartIds } from './parts.js';

/**
 * Build the tank as a THREE.Object3D hierarchy from primitives. No imported assets.
 *
 * The hierarchy IS the deliverable. Node names below are the contract with whatever engine
 * consumes this later — GLTF preserves node names and local transforms, so Turret_Pivot /
 * Barrel_Pivot map 1:1 onto bones or an Animator rig on the other side.
 *
 * Deviation from the spec's flat hierarchy, deliberate: the spec puts hatches, dischargers and
 * sights in a single `Details_Group` under Tank_Root. Turret-mounted details have to rotate with
 * the turret, so they live in `Details_Turret` under Turret_Pivot instead, and `Details_Group`
 * keeps the hull-fixed details. A flat details group cannot express that and would have needed
 * a per-frame fix-up later.
 */
export function buildTank() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'Tank_Root';

  root.add(buildHull(M));
  root.add(buildCollision());
  root.add(buildRunningGear(M));
  const turret = buildTurret(M);
  root.add(turret);
  root.add(buildHullDetails(M));

  root.userData.articulation = {
    azimuth: { node: 'Turret_Pivot', axis: 'y', limits: DIM.limits.azimuth },
    elevation: { node: 'Barrel_Pivot', axis: 'x', limits: DIM.limits.elevation },
  };
  return root;
}

// --- hull ------------------------------------------------------------------

function buildHull(M) {
  const h = DIM.hull;
  const halfL = h.length / 2;

  // Lower tub: narrow, sits between the tracks.
  const tub = extrudeProfile([
    [-halfL, h.bellyY],
    [halfL - 0.55, h.bellyY],
    [halfL, h.bellyY + 0.34],
    [halfL, h.sponsonY],
    [-halfL, h.sponsonY],
  ], h.tubWidth);

  // Upper hull: overhangs the tracks, sloped glacis at the front.
  const upper = extrudeProfile([
    [-halfL, h.sponsonY],
    [halfL - 0.10, h.sponsonY],
    [halfL + 0.18, h.sponsonY + 0.14],
    [1.05, h.deckY],
    [-halfL + 0.15, h.deckY],
    [-halfL - 0.05, h.deckY - 0.22],
  ], h.sponsonWidth);

  const mesh = new THREE.Mesh(mergeNonIndexed([tub, upper]), M.armour);
  mesh.name = 'Hull_Mesh';
  mesh.castShadow = mesh.receiveShadow = true;
  return registerPart(mesh, { explodable: false });
}

function buildCollision() {
  const h = DIM.hull;
  const geom = new THREE.BoxGeometry(h.sponsonWidth, h.deckY - h.bellyY, h.length);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Hull_Collision';
  mesh.position.y = (h.deckY + h.bellyY) / 2;
  mesh.visible = false;            // a proxy, not a render mesh — never drawn by default
  mesh.userData.isCollision = true;
  // Deliberately NOT registerPart()'d: it carries no partId, so the blueprint pass would
  // ignore it even if something turned it on. Render geometry is never reused as a collider.
  return mesh;
}

// --- running gear ----------------------------------------------------------

function buildRunningGear(M) {
  const group = new THREE.Object3D();
  group.name = 'Running_Gear';

  const circles = wheelLayout();
  const road = circles.filter((c) => c.kind === 'road');
  const drive = circles.filter((c) => c.kind !== 'road');

  group.add(instancedWheels('Wheels_Instanced', road, M.rubber, [0, -1.30, 0]));
  group.add(instancedWheels('Sprockets_Instanced', drive, M.steel, [0, -1.30, 0]));

  const rr = DIM.returnRoller;
  const rollers = rr.zs.map((z, i) => ({
    name: `ReturnRoller_${i}`, z, y: rr.y, r: rr.radius, thickness: rr.thickness,
  }));
  group.add(instancedWheels('ReturnRollers_Instanced', rollers, M.rubber, [0, 0.70, 0]));

  const bandGeom = trackBand(circles, { thickness: DIM.track.thickness, width: DIM.track.width });
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(side < 0 ? bandGeom : bandGeom.clone(), M.track);
    mesh.name = side < 0 ? 'Track_L' : 'Track_R';
    mesh.position.x = side * DIM.track.centreX;
    mesh.castShadow = true;
    group.add(registerPart(mesh, { explode: [side * 1.6, -0.35, 0] }));
  }
  return group;
}

/**
 * One InstancedMesh covering both sides. The base geometry is a unit cylinder with its axis
 * on X; per-instance scale carries the radius and thickness, so road wheels, sprockets and
 * rollers can share one draw call if they ever need to.
 */
function instancedWheels(name, circles, material, explode) {
  const base = new THREE.CylinderGeometry(1, 1, 1, 22, 1, false).toNonIndexed();
  base.rotateZ(Math.PI / 2);
  finish(base);

  const count = circles.length * 2;
  const mesh = new THREE.InstancedMesh(base, material, count);
  mesh.name = name;
  mesh.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let i = 0;
  for (const side of [-1, 1]) {
    for (const c of circles) {
      m.compose(
        new THREE.Vector3(side * DIM.track.centreX, c.y, c.z),
        q,
        new THREE.Vector3(c.thickness, c.r, c.r),
      );
      mesh.setMatrixAt(i++, m);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.instanceNames = [
    ...circles.map((c) => `${c.name}_L`), ...circles.map((c) => `${c.name}_R`),
  ];
  return registerPart(mesh, { explode });
}

// --- turret ----------------------------------------------------------------

function buildTurret(M) {
  const t = DIM.turret;

  const pivot = new THREE.Object3D();
  pivot.name = 'Turret_Pivot';                 // rotation.y drives azimuth
  pivot.position.set(0, t.ringY, t.ringZ);     // true turret-ring centre
  registerPart(pivot, { explode: [0, 1.9, 0] });

  const body = new THREE.Mesh(extrudeProfile(t.profile, t.width, { frontScale: 1, backScale: 1 }), M.turret);
  body.name = 'Turret_Mesh';
  body.castShadow = body.receiveShadow = true;
  pivot.add(registerPart(body, { explodable: false }));

  // Sloped cheek plates — the extrusion is a constant-width prism, so the silhouette
  // personality has to come from bolted-on plates rather than a tapered cross-section.
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(extrudeProfile([
      [0.05, 0.06], [1.30, 0.06], [1.52, 0.14], [1.30, 0.66], [0.05, 0.70],
    ], 0.34), M.turret);
    cheek.name = side < 0 ? 'Turret_Cheek_L' : 'Turret_Cheek_R';
    cheek.position.set(side * (t.width / 2 + 0.10), 0, 0);
    cheek.rotation.z = side * -0.12;
    pivot.add(registerPart(cheek, { explode: [side * 1.4, 0.2, 0] }));
  }

  pivot.add(buildBarrel(M));
  pivot.add(buildTurretDetails(M));
  return pivot;
}

function buildBarrel(M) {
  const b = DIM.barrel;

  const pivot = new THREE.Object3D();
  pivot.name = 'Barrel_Pivot';                       // rotation.x drives elevation
  pivot.position.set(0, b.trunnionY, b.trunnionZ);   // trunnion point
  registerPart(pivot, { explode: [0, 0, 1.7] });

  const barrel = new THREE.Mesh(latheZ(b.profile, 20), M.steel);
  barrel.name = 'Barrel_Mesh';
  barrel.castShadow = true;
  pivot.add(registerPart(barrel, { explodable: false }));

  const mantlet = new THREE.Mesh(
    finish(new THREE.BoxGeometry(b.mantlet.width, b.mantlet.height, b.mantlet.depth).toNonIndexed()),
    M.steel,
  );
  mantlet.name = 'Mantlet_Mesh';
  mantlet.position.set(0, 0, 0.18);
  pivot.add(registerPart(mantlet, { explode: [0, 0.9, 0] }));

  return pivot;
}

function buildTurretDetails(M) {
  const g = new THREE.Object3D();
  g.name = 'Details_Turret';
  const t = DIM.turret;
  const top = 0.76;

  const hatch = (name, x, z, r) => {
    const mesh = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(r, r * 1.06, 0.13, 18).toNonIndexed()), M.detail,
    );
    mesh.name = name;
    mesh.position.set(x, top + 0.05, z);
    return registerPart(mesh, { explode: [x * 0.6, 1.1, 0] });
  };
  g.add(hatch('Hatch_Commander', 0.62, -0.52, 0.33));
  g.add(hatch('Hatch_Loader', -0.66, -0.42, 0.30));

  const box = (name, w, h, d, pos, explode, mat = M.detail) => {
    const mesh = new THREE.Mesh(finish(new THREE.BoxGeometry(w, h, d).toNonIndexed()), mat);
    mesh.name = name;
    mesh.position.set(...pos);
    g.add(registerPart(mesh, { explode }));
    return mesh;
  };
  box('Sight_Commander', 0.40, 0.30, 0.34, [0.62, top + 0.24, -0.05], [0, 1.3, 0]);
  box('Sight_Gunner', 0.34, 0.26, 0.30, [-0.58, top - 0.04, 0.72], [-0.8, 0.9, 0]);
  box('Stowage_Bin', 1.90, 0.46, 0.42, [0, 0.30, -1.86], [0, 0.4, -1.6]);

  // Smoke discharger clusters: four tubes a side, canted outward and forward.
  for (const side of [-1, 1]) {
    const cluster = new THREE.Object3D();
    cluster.name = side < 0 ? 'Dischargers_L' : 'Dischargers_R';
    for (let i = 0; i < 4; i++) {
      const tag = `${side < 0 ? 'L' : 'R'}${i + 1}`;
      const tube = new THREE.Mesh(
        finish(new THREE.CylinderGeometry(0.062, 0.062, 0.30, 10).toNonIndexed()), M.steel,
      );
      tube.name = `Discharger_${tag}`;
      tube.rotation.x = Math.PI / 2;
      // Registered so the tube gets a part id: without one the G-buffer reads a default of 0
      // for those pixels and the outline pass silently loses every seam on the cluster.
      registerPart(tube, { explodable: false });

      const holder = new THREE.Object3D();
      holder.name = `DischargerMount_${tag}`;
      holder.position.set(0, 0.10 + (i % 2) * 0.17, -0.30 + Math.floor(i / 2) * 0.20);
      holder.add(tube);
      cluster.add(holder);
    }
    cluster.position.set(side * (t.width / 2 + 0.24), 0.36, 0.42);
    cluster.rotation.y = side * 0.28;
    g.add(registerPart(cluster, { explode: [side * 1.8, 0.5, 0.4] }));
  }

  const mast = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(0.022, 0.030, 1.35, 6).toNonIndexed()), M.steel,
  );
  mast.name = 'Antenna_Mast';
  mast.position.set(-1.05, top + 0.62, -1.20);
  mast.rotation.z = 0.10;
  g.add(registerPart(mast, { explode: [-0.6, 1.4, -0.4] }));

  return g;
}

// --- hull-fixed details ----------------------------------------------------

function buildHullDetails(M) {
  const g = new THREE.Object3D();
  g.name = 'Details_Group';
  const h = DIM.hull;
  const halfL = h.length / 2;

  const add = (name, geom, pos, explode, mat = M.detail, rot) => {
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = name;
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    g.add(registerPart(mesh, { explode }));
    return mesh;
  };

  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    // Both of these hang off the sponson edge, not off an arbitrary offset from the track
    // centreline — getting that wrong left them floating clear of the hull in the iso view.
    const sponsonEdge = h.sponsonWidth / 2;
    add(`Fender_${tag}`,
      finish(new THREE.BoxGeometry(0.52, 0.07, 5.4).toNonIndexed()),
      [side * (sponsonEdge - 0.26), h.deckY + 0.035, -0.2], [side * 1.5, 0.7, 0], M.armour);
    add(`SideSkirt_${tag}`,
      finish(new THREE.BoxGeometry(0.06, 0.54, 4.9).toNonIndexed()),
      [side * (sponsonEdge - 0.03), h.sponsonY - 0.25, 0.1], [side * 1.9, 0, 0], M.armour);
    add(`Headlight_${tag}`,
      finish(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 12).toNonIndexed()),
      [side * 1.10, h.sponsonY + 0.14, halfL - 0.06], [side * 0.5, 0.4, 1.2], M.steel,
      [Math.PI / 2, 0, 0]);
    add(`TowHook_${tag}`,
      finish(new THREE.BoxGeometry(0.16, 0.16, 0.26).toNonIndexed()),
      [side * 0.70, h.bellyY + 0.22, -halfL - 0.06], [side * 0.4, -0.2, -1.1], M.steel);
  }

  add('EngineDeck_Grille',
    finish(new THREE.BoxGeometry(2.30, 0.09, 1.55).toNonIndexed()),
    [0, h.deckY + 0.04, -2.10], [0, 1.5, -0.8], M.steel);
  add('Driver_Hatch',
    finish(new THREE.CylinderGeometry(0.30, 0.30, 0.10, 16).toNonIndexed()),
    [0, h.deckY + 0.04, 1.62], [0, 1.2, 0.6]);
  add('MG_Mount',
    finish(new THREE.BoxGeometry(0.20, 0.18, 0.72).toNonIndexed()),
    [0.95, h.deckY + 0.14, 0.55], [0.8, 1.1, 0], M.steel);

  return g;
}
