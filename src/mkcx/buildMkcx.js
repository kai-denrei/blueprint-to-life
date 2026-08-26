import * as THREE from 'three';
import { CXDIM, wheelLayout } from './dimensions.js';
import { extrudeProfile, trackBand, latheZ, mergeNonIndexed, finish } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * MK-CX — a forward projection of the MK-VI on the same hierarchy contract.
 *
 * Everything the MK-VI's names promise is here (Hull_Mesh, Turret_Pivot, Barrel_Pivot,
 * Wheels_Instanced, Details_Group), so anything that could consume one can consume the other.
 * What it adds is a remote weapon station with its own azimuth and elevation — joints three and
 * four — and emissive strips marking powered elements.
 */
export function buildMkcx() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'MKCX_Root';

  root.add(buildHull(M));
  root.add(buildCollision());
  root.add(buildRunningGear(M));
  root.add(buildTurret(M));
  root.add(buildHullDetails(M));

  const r = CXDIM.rws.limits;
  root.userData.joints = [
    {
      key: 'azimuth', label: 'AZIMUTH', unit: '°', min: -180, max: 180, step: 1, value: 0,
      targets: [{ node: 'Turret_Pivot', axis: 'y', from: -180, to: 180 }],
    },
    {
      key: 'elevation', label: 'ELEVATE', unit: '°',
      min: CXDIM.limits.elevation[0], max: CXDIM.limits.elevation[1], step: 0.5, value: 0,
      targets: [{ node: 'Barrel_Pivot', axis: 'x', from: -CXDIM.limits.elevation[0], to: -CXDIM.limits.elevation[1] }],
    },
    {
      key: 'rwsAzimuth', label: 'RWS TRAV', unit: '°',
      min: r.azimuth[0], max: r.azimuth[1], step: 1, value: 0,
      targets: [{ node: 'RWS_Pivot', axis: 'y', from: r.azimuth[0], to: r.azimuth[1] }],
    },
    {
      key: 'rwsElevation', label: 'RWS ELEV', unit: '°',
      min: r.elevation[0], max: r.elevation[1], step: 0.5, value: 0,
      targets: [{ node: 'RWS_Gun_Pivot', axis: 'x', from: -r.elevation[0], to: -r.elevation[1] }],
    },
  ];
  return root;
}

// --- hull ------------------------------------------------------------------

function buildHull(M) {
  const h = CXDIM.hull;
  const halfL = h.length / 2;

  // Lower tub.
  const tub = extrudeProfile([
    [-halfL, h.bellyY], [halfL - 0.85, h.bellyY], [halfL - 0.10, h.bellyY + 0.42],
    [halfL - 0.10, h.sponsonY], [-halfL, h.sponsonY],
  ], h.tubWidth);

  // Upper hull: a long knife glacis running almost to the deck, and a raked tail. Where the
  // MK-VI has one slope, this has three planes meeting at hard chines.
  const upper = extrudeProfile([
    [-halfL, h.sponsonY],
    [halfL - 0.20, h.sponsonY],
    [h.noseZ, h.sponsonY + 0.26],
    [1.55, h.deckY],
    [-halfL + 0.40, h.deckY],
    [-halfL - 0.22, h.deckY - 0.30],
  ], h.sponsonWidth, { frontScale: 0.94, backScale: 0.94 });

  const mesh = new THREE.Mesh(mergeNonIndexed([tub, upper]), M.armour);
  mesh.name = 'Hull_Mesh';
  mesh.castShadow = mesh.receiveShadow = true;
  return registerPart(mesh, { explodable: false });
}

function buildCollision() {
  const h = CXDIM.hull;
  const geom = new THREE.BoxGeometry(h.sponsonWidth, h.deckY - h.bellyY, h.length);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Hull_Collision';
  mesh.position.y = (h.deckY + h.bellyY) / 2;
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}

// --- running gear ----------------------------------------------------------

function buildRunningGear(M) {
  const group = new THREE.Object3D();
  group.name = 'Running_Gear';

  const circles = wheelLayout();
  group.add(instanced('Wheels_Instanced', circles.filter((c) => c.kind === 'road'), M.rubber, [0, -1.4, 0]));
  group.add(instanced('Sprockets_Instanced', circles.filter((c) => c.kind !== 'road'), M.steel, [0, -1.4, 0]));

  const rr = CXDIM.returnRoller;
  group.add(instanced('ReturnRollers_Instanced',
    rr.zs.map((z, i) => ({ name: `ReturnRoller_${i}`, z, y: rr.y, r: rr.radius, thickness: rr.thickness })),
    M.rubber, [0, 0.75, 0]));

  const band = trackBand(circles, { thickness: CXDIM.track.thickness, width: CXDIM.track.width });
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(band.clone(), M.track);
    mesh.name = side < 0 ? 'Track_L' : 'Track_R';
    mesh.position.x = side * CXDIM.track.centreX;
    mesh.castShadow = true;
    group.add(registerPart(mesh, { explode: [side * 1.7, -0.4, 0] }));
  }
  return group;
}

function instanced(name, circles, material, explode) {
  const base = new THREE.CylinderGeometry(1, 1, 1, 20, 1, false).toNonIndexed();
  base.rotateZ(Math.PI / 2);
  finish(base);

  const mesh = new THREE.InstancedMesh(base, material, circles.length * 2);
  mesh.name = name;
  mesh.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let i = 0;
  for (const side of [-1, 1]) {
    for (const c of circles) {
      m.compose(
        new THREE.Vector3(side * CXDIM.track.centreX, c.y, c.z), q,
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
  const t = CXDIM.turret;

  const pivot = new THREE.Object3D();
  pivot.name = 'Turret_Pivot';
  pivot.position.set(0, t.ringY, t.ringZ);
  registerPart(pivot, { explode: [0, 2.1, 0] });

  const body = new THREE.Mesh(
    extrudeProfile(t.profile, t.width, { frontScale: 0.80, backScale: 0.80 }), M.turret,
  );
  body.name = 'Turret_Mesh';
  body.castShadow = body.receiveShadow = true;
  pivot.add(registerPart(body, { explodable: false }));

  slabs(pivot, CXDIM.applique.turret, 'Turret_Applique', M.armour, [1.5, 0.3, 0]);
  strips(pivot, CXDIM.glow.turret, 'Turret_Glow', M.glow);

  pivot.add(buildBarrel(M));
  pivot.add(buildRws(M));
  pivot.add(buildTurretDetails(M));
  return pivot;
}

function buildBarrel(M) {
  const b = CXDIM.barrel;

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

  const mantlet = new THREE.Mesh(
    finish(new THREE.BoxGeometry(b.mantlet.width, b.mantlet.height, b.mantlet.depth).toNonIndexed()),
    M.steel,
  );
  mantlet.name = 'Mantlet_Mesh';
  mantlet.position.z = 0.20;
  pivot.add(registerPart(mantlet, { explode: [0, 1.0, 0] }));

  strips(pivot, CXDIM.glow.barrel, 'Barrel_Glow', M.glow);
  return pivot;
}

/**
 * Remote weapon station. Two nested pivots on the turret roof, named on the same pattern as the
 * main armament so the joint declaration reads identically — the viewer cannot tell that one of
 * these is a 120 mm gun and the other is a 12.7 mm on a mount.
 */
function buildRws(M) {
  const r = CXDIM.rws;

  const pivot = new THREE.Object3D();
  pivot.name = 'RWS_Pivot';
  pivot.position.set(r.baseX, r.baseY, r.baseZ);
  registerPart(pivot, { explode: [0.8, 1.4, -0.4] });

  const ring = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(0.30, 0.34, 0.10, 14).toNonIndexed()), M.detail,
  );
  ring.name = 'RWS_Ring';
  ring.position.y = -0.04;
  pivot.add(registerPart(ring, { explodable: false }));

  const body = new THREE.Mesh(
    finish(new THREE.BoxGeometry(r.body.width, r.body.height, r.body.depth).toNonIndexed()), M.detail,
  );
  body.name = 'RWS_Mesh';
  body.position.y = r.body.height / 2 + 0.02;
  body.castShadow = true;
  pivot.add(registerPart(body, { explodable: false }));

  const sensor = new THREE.Mesh(
    finish(new THREE.BoxGeometry(0.30, 0.16, 0.14).toNonIndexed()), M.steel,
  );
  sensor.name = 'RWS_Sight';
  sensor.position.set(0, r.body.height + 0.08, -0.10);
  pivot.add(registerPart(sensor, { explode: [0, 0.6, -0.4] }));

  strips(pivot, [[0, 0.20, 0.31, 0.28, 0.035, 0.02]], 'RWS_Glow', M.glow);

  const gunPivot = new THREE.Object3D();
  gunPivot.name = 'RWS_Gun_Pivot';
  gunPivot.position.set(0, r.gunTrunnionY + r.body.height / 2, r.gunTrunnionZ);
  registerPart(gunPivot, { explode: [0, 0, 0.8] });

  const gun = new THREE.Mesh(latheZ(r.gunProfile, 10), M.steel);
  gun.name = 'RWS_Gun_Mesh';
  gunPivot.add(registerPart(gun, { explodable: false }));

  const receiver = new THREE.Mesh(
    finish(new THREE.BoxGeometry(0.16, 0.16, 0.34).toNonIndexed()), M.steel,
  );
  receiver.name = 'RWS_Receiver';
  receiver.position.z = -0.10;
  gunPivot.add(registerPart(receiver, { explodable: false }));

  pivot.add(gunPivot);
  return pivot;
}

function buildTurretDetails(M) {
  const g = new THREE.Object3D();
  g.name = 'Details_Turret';
  const top = 0.92;

  const hatch = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(0.31, 0.33, 0.11, 8).toNonIndexed()), M.detail,
  );
  hatch.name = 'Hatch_Commander';
  hatch.position.set(-0.60, top + 0.04, -0.70);
  g.add(registerPart(hatch, { explode: [-0.5, 1.2, 0] }));

  const sight = new THREE.Mesh(
    finish(new THREE.BoxGeometry(0.46, 0.26, 0.40).toNonIndexed()), M.detail,
  );
  sight.name = 'Sight_Primary';
  sight.position.set(-0.52, top + 0.10, 0.62);
  sight.rotation.x = -0.10;
  g.add(registerPart(sight, { explode: [-1.0, 1.0, 0.4] }));

  // Launcher pods: angled boxes of tubes on the bustle corners, straight from the reference
  // silhouette. Instanced because they are the same tube eight times.
  for (const side of [-1, 1]) {
    const pod = new THREE.Object3D();
    pod.name = side < 0 ? 'LauncherPod_L' : 'LauncherPod_R';
    const base = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false).toNonIndexed();
    base.rotateX(Math.PI / 2);
    finish(base);
    const tubes = new THREE.InstancedMesh(base, M.steel, 4);
    tubes.name = side < 0 ? 'LauncherTubes_L' : 'LauncherTubes_R';
    const m = new THREE.Matrix4();
    let i = 0;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        m.compose(
          new THREE.Vector3(-0.10 + col * 0.20, 0.10 + row * 0.20, 0),
          new THREE.Quaternion(),
          new THREE.Vector3(0.085, 0.085, 0.42),
        );
        tubes.setMatrixAt(i++, m);
      }
    }
    tubes.instanceMatrix.needsUpdate = true;
    tubes.userData.instanceNames = Array.from({ length: 4 }, (_, k) => `Tube_${side < 0 ? 'L' : 'R'}${k + 1}`);
    pod.add(registerPart(tubes, { explodable: false }));

    pod.position.set(side * 0.96, top - 0.06, -1.45);
    pod.rotation.set(-0.34, side * 0.20, 0);
    g.add(registerPart(pod, { explode: [side * 1.6, 0.8, -1.0] }));
  }

  const bin = new THREE.Mesh(
    extrudeProfile([[-0.55, 0], [0.42, 0], [0.30, 0.50], [-0.48, 0.44]], 1.90), M.detail,
  );
  bin.name = 'Stowage_Bin';
  bin.position.set(0, 0.16, -2.10);
  bin.rotation.y = Math.PI / 2;
  g.add(registerPart(bin, { explode: [0, 0.4, -1.8] }));

  return g;
}

// --- hull details ----------------------------------------------------------

function buildHullDetails(M) {
  const g = new THREE.Object3D();
  g.name = 'Details_Group';
  const h = CXDIM.hull;
  const halfL = h.length / 2;

  slabs(g, CXDIM.applique.hull, 'Hull_Applique', M.armour, [2.0, 0.3, 0], true);
  strips(g, CXDIM.glow.hull, 'Hull_Glow', M.glow);

  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const skirt = new THREE.Mesh(extrudeProfile([
      [-2.60, -0.30], [2.70, -0.30], [2.96, 0.02], [2.70, 0.34], [-2.60, 0.34], [-2.86, 0.02],
    ], 0.07), M.armour);
    skirt.name = `SideSkirt_${tag}`;
    // Dropped so its top edge sits just under the applique rather than through it.
    skirt.position.set(side * (h.sponsonWidth / 2 + 0.02), h.sponsonY - 0.28, 0.10);
    g.add(registerPart(skirt, { explode: [side * 2.0, 0, 0] }));

    const light = new THREE.Mesh(
      finish(new THREE.BoxGeometry(0.30, 0.10, 0.06).toNonIndexed()), M.glow,
    );
    light.name = `Headlight_${tag}`;
    light.position.set(side * 1.06, h.sponsonY + 0.26, h.noseZ - 0.06);
    g.add(registerPart(light, { explode: [side * 0.6, 0.4, 1.3], emissive: true }));
  }

  const grille = new THREE.Mesh(
    finish(new THREE.BoxGeometry(2.30, 0.10, 1.70).toNonIndexed()), M.steel,
  );
  grille.name = 'EngineDeck_Grille';
  grille.position.set(0, h.deckY + 0.05, -2.40);
  g.add(registerPart(grille, { explode: [0, 1.6, -0.9] }));

  const driver = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(0.29, 0.29, 0.10, 8).toNonIndexed()), M.detail,
  );
  driver.name = 'Driver_Hatch';
  driver.position.set(0, h.deckY + 0.04, 1.15);
  g.add(registerPart(driver, { explode: [0, 1.2, 0.6] }));

  const sensor = new THREE.Mesh(
    finish(new THREE.BoxGeometry(0.18, 0.44, 0.18).toNonIndexed()), M.detail,
  );
  sensor.name = 'Sensor_Mast';
  sensor.position.set(-1.30, h.deckY + 0.24, -3.00);
  g.add(registerPart(sensor, { explode: [-0.9, 1.4, -0.8] }));

  return g;
}

// --- shared builders -------------------------------------------------------

/** Applique armour slabs, mirrored across the centreline. */
function slabs(parent, defs, prefix, material, explodeBase, mirrorZ = false) {
  defs.forEach(([x, y, z, w, hgt, d, rotZ], i) => {
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(
        extrudeProfile([[-d / 2, -hgt / 2], [d / 2, -hgt / 2 + 0.04], [d / 2, hgt / 2 - 0.10], [-d / 2, hgt / 2]], w),
        material,
      );
      mesh.name = `${prefix}_${side < 0 ? 'L' : 'R'}${i + 1}`;
      mesh.position.set(side * x, y, mirrorZ ? z : z);
      mesh.rotation.z = side * rotZ;
      mesh.castShadow = true;
      parent.add(registerPart(mesh, {
        explode: [side * explodeBase[0], explodeBase[1], explodeBase[2]],
      }));
    }
  });
}

/** Emissive strips. Flagged, not coloured — the renderer decides what "powered" looks like. */
function strips(parent, defs, prefix, material) {
  defs.forEach(([x, y, z, w, hgt, d], i) => {
    const mesh = new THREE.Mesh(finish(new THREE.BoxGeometry(w, hgt, d).toNonIndexed()), material);
    mesh.name = `${prefix}_${i + 1}`;
    mesh.position.set(x, y, z);
    parent.add(registerPart(mesh, { explode: [x * 1.2, 0.6, 0], emissive: true }));
  });
}
