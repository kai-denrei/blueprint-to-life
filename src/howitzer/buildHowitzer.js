import * as THREE from 'three';
import { HDIM, trailLayout } from './dimensions.js';
import { extrudeProfile, latheZ, mergeNonIndexed, finish } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * M777-pattern 155 mm towed howitzer, built from primitives on the same contract as the tank.
 *
 * The naming maps onto the same articulation shape so nothing downstream has to special-case
 * a vehicle without a turret:
 *
 *   Turret_Pivot  ->  Traverse_Pivot   (rotation.y, the pintle)
 *   Barrel_Pivot  ->  Elevation_Pivot  (rotation.x, the trunnion)
 *
 * The mechanism this one adds is the trails: four arms hinged about their own vertical pivots,
 * closed for towing and opened to a cross for firing. They are declared as a third joint, so
 * they cost the viewer no code — which is the point of building a second subject at all.
 */
export function buildHowitzer() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'Howitzer_Root';

  root.add(buildBase(M));
  root.add(buildCollision());
  root.add(buildTrails(M));
  root.add(buildTraverse(M));
  root.add(buildDetails(M));

  const layout = trailLayout();
  root.userData.joints = [
    {
      key: 'azimuth', label: 'TRAVERSE', unit: '°',
      min: HDIM.limits.traverse[0], max: HDIM.limits.traverse[1], step: 0.5, value: 0,
      targets: [{ node: 'Traverse_Pivot', axis: 'y', from: HDIM.limits.traverse[0], to: HDIM.limits.traverse[1] }],
    },
    {
      key: 'elevation', label: 'ELEVATE', unit: '°',
      min: HDIM.limits.elevation[0], max: HDIM.limits.elevation[1], step: 0.5, value: 0,
      // Negative because +rotation.x pitches the muzzle down; the display value is the gunner's.
      targets: [{ node: 'Elevation_Pivot', axis: 'x', from: 0, to: -HDIM.limits.elevation[1] }],
    },
    {
      key: 'trails', label: 'TRAILS', unit: '', min: 0, max: 1, step: 0.01, value: 1,
      targets: layout.map((t) => ({ node: t.name, axis: 'y', from: t.stowed, to: t.deployed })),
    },
  ];
  return root;
}

// --- lower carriage --------------------------------------------------------

function buildBase(M) {
  const t = HDIM.topCarriage;
  const bp = HDIM.baseplate;

  // Saddle: the block the pintle sits in, spanning the four trail hinges.
  const saddle = extrudeProfile([
    [-0.78, 0.22], [0.78, 0.22], [0.86, 0.62], [0.62, t.pintleY - 0.06],
    [-0.58, t.pintleY - 0.06], [-0.82, 0.62],
  ], 1.02);

  // Firing platform under it — a disc, so it reads as the thing that takes the recoil.
  const plate = finish(
    new THREE.CylinderGeometry(bp.radius, bp.radius * 1.12, bp.height, 26).toNonIndexed(),
  );
  plate.translate(0, bp.y, 0);

  const mesh = new THREE.Mesh(mergeNonIndexed([saddle, plate]), M.armour);
  mesh.name = 'Chassis_Mesh';
  mesh.castShadow = mesh.receiveShadow = true;
  return registerPart(mesh, { explodable: false });
}

function buildCollision() {
  // Sized to the towing envelope, not the deployed cross: a collider that grows when the
  // trails open would be a moving proxy, which is not what a proxy is for.
  const geom = new THREE.BoxGeometry(1.9, 1.55, 4.2);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Chassis_Collision';
  mesh.position.set(0, 0.80, 0.15);
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}

// --- trails ----------------------------------------------------------------

function buildTrails(M) {
  const group = new THREE.Object3D();
  group.name = 'Trails_Group';

  const wheels = [];

  for (const t of trailLayout()) {
    // The hinge pivot IS the node the joint rotates — same rule as Turret_Pivot: pivots sit at
    // the true mechanical origin and the mesh is an offset child.
    const pivot = new THREE.Object3D();
    pivot.name = t.name;
    pivot.position.set(t.x, t.y, t.z);
    pivot.rotation.y = THREE.MathUtils.degToRad(t.deployed);
    registerPart(pivot, { explode: [t.side * 1.2, 0.3, t.kind === 'front' ? 1.0 : -1.0] });

    // Trail arm: a box lying along the pivot's local -Z, thinning toward the tip.
    //
    // No frontScale/backScale here. Those scale the whole ZY profile about its centroid, which
    // tapers the section but also SHORTENS the arm — the spade at z = -length ended up floating
    // in space with a visible gap. The taper belongs in the profile itself, which is where the
    // thinning below already comes from.
    const arm = new THREE.Mesh(extrudeProfile([
      [0, -t.height / 2], [0, t.height / 2],
      [-t.length, t.height * 0.20], [-t.length, -t.height * 0.32],
    ], t.width), M.armour);
    arm.name = `${t.name}_Arm`;
    arm.castShadow = true;
    pivot.add(registerPart(arm, { explodable: false }));

    if (t.kind === 'front') {
      const w = HDIM.trails.front.wheel;
      wheels.push({ pivot, along: w.along, side: t.side });
      // Stub axle so the wheel is visibly mounted rather than floating.
      const axle = new THREE.Mesh(
        finish(new THREE.CylinderGeometry(0.06, 0.06, 0.36, 10).toNonIndexed()), M.steel,
      );
      axle.name = `${t.name}_Axle`;
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, -0.04, -w.along);
      pivot.add(registerPart(axle, { explodable: false }));
    } else {
      const sp = HDIM.trails.rear.spade;
      const spade = new THREE.Mesh(extrudeProfile([
        [0.10, -sp.height / 2], [0.10, sp.height / 2],
        [-sp.depth, sp.height * 0.30], [-sp.depth, -sp.height / 2],
      ], sp.width), M.steel);
      spade.name = `${t.name}_Spade`;
      spade.position.set(0, -0.10, -t.length);
      pivot.add(registerPart(spade, { explode: [0, -0.5, -1.0] }));
    }

    group.add(pivot);
  }

  group.add(buildRoadWheels(wheels, M));
  return group;
}

/**
 * The two road wheels as one InstancedMesh — same rule as the tank's running gear, even though
 * the count is two. Consistency of the asset contract matters more here than the draw call.
 *
 * They are parented to the trails group rather than to the trail pivots, because instances
 * cannot live under different parents. Their matrices are recomputed when the trails move —
 * see updateHowitzerWheels().
 */
function buildRoadWheels(mounts, M) {
  const w = HDIM.trails.front.wheel;
  const base = new THREE.CylinderGeometry(1, 1, 1, 24, 1, false).toNonIndexed();
  base.rotateZ(Math.PI / 2);
  finish(base);

  const mesh = new THREE.InstancedMesh(base, M.rubber, mounts.length);
  mesh.name = 'Wheels_Instanced';
  mesh.castShadow = true;
  mesh.userData.wheelMounts = mounts.map((m) => ({ pivotName: m.pivot.name, along: m.along }));
  mesh.userData.wheelSize = { radius: w.radius, width: w.width };
  mesh.userData.instanceNames = mounts.map((m) => `RoadWheel_${m.side < 0 ? 'L' : 'R'}`);
  registerPart(mesh, { explode: [0, -0.9, 0] });
  return mesh;
}

/**
 * Re-place the wheel instances from the current trail pivot transforms.
 *
 * This is the cost of using one InstancedMesh for wheels mounted on two independently moving
 * arms: the instance matrices are in the InstancedMesh's own space, so they have to be
 * recomputed rather than inherited. Cheap (two matrices), and it keeps the asset's "wheels are
 * instanced" contract intact instead of special-casing this vehicle with loose meshes.
 */
export function updateHowitzerWheels(root) {
  const mesh = root.getObjectByName('Wheels_Instanced');
  if (!mesh?.userData.wheelMounts) return;
  const { radius, width } = mesh.userData.wheelSize;
  const parent = mesh.parent;
  parent.updateMatrixWorld(true);

  const local = new THREE.Matrix4();
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const offset = new THREE.Matrix4();
  const scale = new THREE.Matrix4().makeScale(width, radius, radius);

  mesh.userData.wheelMounts.forEach((m, i) => {
    const pivot = root.getObjectByName(m.pivotName);
    if (!pivot) return;
    offset.makeTranslation(0, -0.04, -m.along);
    local.multiplyMatrices(inv, pivot.matrixWorld).multiply(offset).multiply(scale);
    mesh.setMatrixAt(i, local);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

// --- traverse / elevation --------------------------------------------------

function buildTraverse(M) {
  const t = HDIM.topCarriage;

  const pivot = new THREE.Object3D();
  pivot.name = 'Traverse_Pivot';                  // rotation.y — the pintle
  pivot.position.set(0, t.pintleY, t.pintleZ);
  registerPart(pivot, { explode: [0, 1.5, 0] });

  const body = new THREE.Mesh(extrudeProfile(t.profile, t.width, { frontScale: 0.82, backScale: 0.82 }), M.turret);
  body.name = 'TopCarriage_Mesh';
  body.castShadow = body.receiveShadow = true;
  pivot.add(registerPart(body, { explodable: false }));

  pivot.add(buildElevation(M));
  pivot.add(buildCarriageDetails(M));
  return pivot;
}

function buildElevation(M) {
  const t = HDIM.topCarriage;
  const c = HDIM.cradle;
  const b = HDIM.barrel;

  const pivot = new THREE.Object3D();
  pivot.name = 'Elevation_Pivot';                 // rotation.x — the trunnion
  pivot.position.set(0, t.trunnionY, t.trunnionZ);
  registerPart(pivot, { explode: [0, 0.4, 1.9] });

  // Cradle: the trough the barrel recoils in, open on top and slung under the bore.
  const cradle = new THREE.Mesh(extrudeProfile([
    [-c.length / 2, -c.height / 2], [c.length / 2 - 0.18, -c.height / 2],
    [c.length / 2, -c.height / 2 + 0.14], [c.length / 2, c.height / 2],
    [-c.length / 2 + 0.20, c.height / 2], [-c.length / 2, c.height / 2 - 0.12],
  ], c.width), M.steel);
  cradle.name = 'Cradle_Mesh';
  cradle.position.set(0, c.y, c.z);
  cradle.castShadow = true;
  pivot.add(registerPart(cradle, { explode: [0, 0.9, 0] }));

  const barrel = new THREE.Mesh(latheZ(b.profile, 22), M.steel);
  barrel.name = 'Barrel_Mesh';
  barrel.castShadow = true;
  pivot.add(registerPart(barrel, { explodable: false }));

  const brake = new THREE.Mesh(latheZ(b.muzzleBrake.profile, 22), M.steel);
  brake.name = 'MuzzleBrake_Mesh';
  brake.castShadow = true;
  pivot.add(registerPart(brake, { explode: [0, 0, 2.2] }));

  const br = b.breech;
  const breech = new THREE.Mesh(
    finish(new THREE.BoxGeometry(br.width, br.height, br.depth).toNonIndexed()), M.steel,
  );
  breech.name = 'Breech_Mesh';
  breech.position.z = br.z;
  pivot.add(registerPart(breech, { explode: [0, 0, -1.5] }));

  // Recuperator / recoil cylinders slung under the cradle, one per side.
  const rc = c.recoilCylinder;
  const cylBase = new THREE.CylinderGeometry(1, 1, 1, 14, 1, false).toNonIndexed();
  cylBase.rotateX(Math.PI / 2);
  finish(cylBase);
  const cylinders = new THREE.InstancedMesh(cylBase, M.steel, 2);
  cylinders.name = 'RecoilCylinders_Instanced';
  const m = new THREE.Matrix4();
  [-1, 1].forEach((side, i) => {
    m.compose(
      new THREE.Vector3(side * rc.dx, rc.dy, rc.z),
      new THREE.Quaternion(),
      new THREE.Vector3(rc.radius, rc.radius, rc.length),
    );
    cylinders.setMatrixAt(i, m);
  });
  cylinders.instanceMatrix.needsUpdate = true;
  cylinders.userData.instanceNames = ['RecoilCylinder_L', 'RecoilCylinder_R'];
  pivot.add(registerPart(cylinders, { explode: [0, -1.0, 0] }));

  return pivot;
}

function buildCarriageDetails(M) {
  const g = new THREE.Object3D();
  g.name = 'Details_Carriage';

  // Elevation and traverse handwheels — the two controls that define the crew station.
  const handwheel = (name, pos, rot, radius) => {
    const rim = new THREE.Mesh(
      finish(new THREE.TorusGeometry(radius, 0.026, 6, 20).toNonIndexed()), M.steel,
    );
    rim.name = name;
    rim.position.set(...pos);
    rim.rotation.set(...rot);
    g.add(registerPart(rim, { explode: [pos[0] * 1.6, 0.7, 0] }));

    const shaft = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(0.032, 0.032, 0.30, 8).toNonIndexed()), M.steel,
    );
    shaft.name = `${name}_Shaft`;
    shaft.position.set(pos[0] * 0.72, pos[1], pos[2]);
    shaft.rotation.z = Math.PI / 2;
    g.add(registerPart(shaft, { explodable: false }));
  };
  // Pulled in from ±0.78: the carriage caps are scaled to 0.82, so the handwheels were mounted
  // outboard of the metal they are supposed to be bolted to.
  handwheel('Handwheel_Elevation', [-0.60, 0.06, 0.18], [0, Math.PI / 2, 0], 0.19);
  handwheel('Handwheel_Traverse', [0.60, -0.06, 0.02], [0, Math.PI / 2, 0], 0.16);

  const sight = new THREE.Mesh(
    finish(new THREE.BoxGeometry(0.22, 0.30, 0.20).toNonIndexed()), M.detail,
  );
  sight.name = 'Sight_Panoramic';
  sight.position.set(-0.44, 0.56, 0.10);
  g.add(registerPart(sight, { explode: [-1.0, 1.1, 0] }));

  const guard = new THREE.Mesh(
    finish(new THREE.BoxGeometry(1.02, 0.05, 0.46).toNonIndexed()), M.detail,
  );
  guard.name = 'Shield_Deck';
  guard.position.set(0, -0.40, -0.52);
  g.add(registerPart(guard, { explode: [0, -0.4, -1.2] }));

  return g;
}

function buildDetails(M) {
  const g = new THREE.Object3D();
  g.name = 'Details_Group';

  const db = HDIM.drawbar;
  const bar = new THREE.Mesh(
    finish(new THREE.BoxGeometry(db.width, db.height, db.length).toNonIndexed()), M.armour,
  );
  bar.name = 'Drawbar';
  bar.position.set(0, db.y, db.z0 + db.length / 2);
  g.add(registerPart(bar, { explode: [0, 0.2, 1.4] }));

  const lunette = new THREE.Mesh(
    finish(new THREE.TorusGeometry(0.13, 0.034, 6, 14).toNonIndexed()), M.steel,
  );
  lunette.name = 'Tow_Lunette';
  lunette.position.set(0, db.y, db.z0 + db.length + 0.10);
  lunette.rotation.y = Math.PI / 2;
  g.add(registerPart(lunette, { explode: [0, 0.3, 1.6] }));

  for (const side of [-1, 1]) {
    const jack = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(0.055, 0.075, 0.46, 8).toNonIndexed()), M.steel,
    );
    jack.name = `Levelling_Jack_${side < 0 ? 'L' : 'R'}`;
    jack.position.set(side * 0.66, 0.28, -0.30);
    g.add(registerPart(jack, { explode: [side * 1.1, -0.6, 0] }));
  }

  const ammo = new THREE.Mesh(
    finish(new THREE.BoxGeometry(0.72, 0.34, 0.52).toNonIndexed()), M.detail,
  );
  ammo.name = 'Ready_Rack';
  ammo.position.set(0.62, 0.44, -0.62);
  g.add(registerPart(ammo, { explode: [1.4, 0.2, -0.8] }));

  return g;
}
