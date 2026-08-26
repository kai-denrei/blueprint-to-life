import * as THREE from 'three';
import { CXDIM } from './dimensions.js';
import { extrudeProfile, latheZ, mergeNonIndexed, finish } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * MK-CX — a forward projection of the MK-VI on the same hierarchy contract.
 *
 * It keeps the parts of the MK-VI's contract that still mean something — Hull_Mesh,
 * Hull_Collision, Turret_Pivot, Barrel_Pivot, Details_Group — and breaks one that does not.
 * There is no `Wheels_Instanced`, because there are no wheels: the vehicle is held up by lift
 * nacelles. That is the first time a subject has failed to satisfy the shared hierarchy
 * contract, and the honest response was to make the contract conditional rather than bolt on
 * decorative running gear so the checklist stayed green.
 *
 * Armament is a compact main turret plus two secondary turrets on the forward deck, sized to
 * pass under the main gun's bore line.
 */
export function buildMkcx() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'MKCX_Root';

  root.add(buildHull(M));
  root.add(buildCollision());
  root.add(buildHoverGear(M));
  root.add(buildTurret(M));
  root.add(buildSecondaries(M));
  root.add(buildHullDetails(M));

  // The whole vehicle floats. Lifting the root rather than every part keeps the hover gap a
  // single number instead of an offset baked into every Y coordinate in the dimensions file.
  root.position.y = CXDIM.hover.gap;

  const sec = CXDIM.secondary.limits;
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
    // Both secondaries slave to one pair of sliders. A joint already supports several targets
    // — the howitzer's trails joint drives four hinges — so paired turrets cost nothing extra,
    // and four sliders is as many as the mobile CTRL sheet holds comfortably.
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

// --- hover gear ------------------------------------------------------------

/**
 * Lift nacelles in place of running gear.
 *
 * Each is a single extruded pod along one side, with emissive emitters on its underside. There
 * is nothing instanced here because there is nothing repeated: the whole point of the change is
 * that the repeated element — a road wheel — no longer exists.
 */
function buildHoverGear(M) {
  const group = new THREE.Object3D();
  group.name = 'Hover_Gear';
  const h = CXDIM.hover;

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

    // Emitters: flat panels under the nacelle, flagged emissive. These are what the viewer
    // reads as "this is what is holding it up".
    h.emitters.forEach(([z, len], i) => {
      const emitter = new THREE.Mesh(
        finish(new THREE.BoxGeometry(h.nacelle.width * 0.62, 0.05, len).toNonIndexed()), M.glow,
      );
      emitter.name = `LiftEmitter_${tag}${i + 1}`;
      emitter.position.set(side * h.nacelle.centreX, 0.02, z);
      group.add(registerPart(emitter, { explode: [side * 0.8, -1.1, 0], emissive: true }));
    });

    // Pylons tying the nacelle to the sponson, so it does not read as floating alongside.
    // Pylons bridging nacelle top (0.74) to the sponson underside (1.02), so the nacelle is
    // visibly carried rather than floating alongside.
    for (const z of [-2.30, 0.10, 2.40]) {
      const pylon = new THREE.Mesh(
        finish(new THREE.BoxGeometry(0.52, 0.30, 0.34).toNonIndexed()), M.steel,
      );
      pylon.name = `Pylon_${tag}${z < 0 ? 'A' : z < 1 ? 'B' : 'C'}`;
      pylon.position.set(side * (h.nacelle.centreX - 0.22), 0.88, z);
      group.add(registerPart(pylon, { explodable: false }));
    }
  }
  return group;
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
 * Two secondary turrets on the forward deck.
 *
 * Named on the same pattern as the main armament — a pivot for azimuth, a nested pivot for
 * elevation — so the joint declaration that drives them is identical in shape to the one that
 * drives the 120 mm. Both slave to one pair of sliders.
 */
function buildSecondaries(M) {
  const group = new THREE.Object3D();
  group.name = 'Secondary_Turrets';
  const c = CXDIM.secondary;

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
    pivot.name = `Secondary_${tag}_Pivot`;          // rotation.y
    pivot.position.set(side * c.x, c.y, c.z);
    registerPart(pivot, { explode: [side * 1.3, 0.9, 0.7] });

    const shell = new THREE.Mesh(
      extrudeProfile(c.profile, c.width, { frontScale: 0.78, backScale: 0.78 }), M.turret,
    );
    shell.name = `Secondary_${tag}_Mesh`;
    shell.castShadow = true;
    pivot.add(registerPart(shell, { explodable: false }));

    strips(pivot, [[0, 0.20, 0.30, 0.24, 0.03, 0.02]], `Secondary_${tag}_Glow`, M.glow);

    const gunPivot = new THREE.Object3D();
    gunPivot.name = `Secondary_${tag}_Gun_Pivot`;   // rotation.x
    gunPivot.position.set(0, c.gunTrunnionY, c.gunTrunnionZ);
    registerPart(gunPivot, { explode: [0, 0, 0.7] });

    const gun = new THREE.Mesh(latheZ(c.gunProfile, 10), M.steel);
    gun.name = `Secondary_${tag}_Gun_Mesh`;
    gunPivot.add(registerPart(gun, { explodable: false }));

    const mantlet = new THREE.Mesh(
      finish(new THREE.BoxGeometry(0.20, 0.18, 0.16).toNonIndexed()), M.steel,
    );
    mantlet.name = `Secondary_${tag}_Mantlet`;
    mantlet.position.z = 0.04;
    gunPivot.add(registerPart(mantlet, { explodable: false }));

    pivot.add(gunPivot);
    group.add(pivot);
  }
  return group;
}

function buildTurretDetails(M) {
  const g = new THREE.Object3D();
  g.name = 'Details_Turret';
  const top = 0.78;   // matches CXDIM.turret.profile's roof

  const hatch = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(0.25, 0.27, 0.09, 8).toNonIndexed()), M.detail,
  );
  hatch.name = 'Hatch_Commander';
  hatch.position.set(-0.44, top + 0.04, -0.52);
  g.add(registerPart(hatch, { explode: [-0.5, 1.2, 0] }));

  const sight = new THREE.Mesh(
    finish(new THREE.BoxGeometry(0.36, 0.22, 0.32).toNonIndexed()), M.detail,
  );
  sight.name = 'Sight_Primary';
  sight.position.set(-0.36, top + 0.09, 0.42);
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

    pod.position.set(side * 0.70, top - 0.16, -0.98);
    pod.rotation.set(-0.26, side * 0.18, 0);
    g.add(registerPart(pod, { explode: [side * 1.6, 0.8, -1.0] }));
  }

  const bin = new THREE.Mesh(
    extrudeProfile([[-0.44, 0], [0.34, 0], [0.24, 0.42], [-0.38, 0.36]], 1.56), M.detail,
  );
  bin.name = 'Stowage_Bin';
  bin.position.set(0, 0.14, -1.62);
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
    const light = new THREE.Mesh(
      finish(new THREE.BoxGeometry(0.30, 0.10, 0.06).toNonIndexed()), M.glow,
    );
    light.name = `Headlight_${tag}`;
    // Sunk into the glacis rather than perched on the nose point: the upper hull's front
    // vertex is at (noseZ, sponsonY + 0.26), so anything placed AT that vertex touches the
    // hull at a single edge and reads as detached.
    light.position.set(side * 1.06, h.sponsonY + 0.20, h.noseZ - 0.28);
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
