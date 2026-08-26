import * as THREE from 'three';
import { HTDIM, rng, wheelLayout } from './dimensions.js';
import { extrudeProfile, latheZ, mergeNonIndexed, finish } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * Hepta-T — 6x6 heavy cargo transport.
 *
 * The first wheeled subject, and the first that is not a fighting vehicle. It keeps the parts of
 * the contract that generalise (Turret_Pivot, Barrel_Pivot, Wheels_Instanced, Details_Group,
 * a separate collision proxy) and adds two mechanisms neither tracked nor hovering vehicles had:
 * a steered front axle and a cargo ramp.
 *
 * Steering is why `afterArticulate` exists on this subject too. The six wheels are one
 * InstancedMesh, per the contract, but two of them turn — and instance matrices live in the
 * InstancedMesh's own space, so they cannot inherit a parent's rotation. They are recomputed
 * from the steer angle instead. Same escape hatch the howitzer's trail-mounted wheels needed,
 * used for the same underlying reason.
 */
export function buildHeptat() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'HeptaT_Root';

  root.add(buildFrame(M));
  root.add(buildCollision());
  root.add(buildRunningGear(M));
  root.add(buildCab(M));
  root.add(buildCargo(M));
  root.add(buildTurret(M));
  root.add(buildStowage(M));

  const t = HTDIM.turret.limits;
  root.userData.joints = [
    {
      key: 'azimuth', label: 'AZIMUTH', unit: '°', min: -180, max: 180, step: 1, value: 0,
      targets: [{ node: 'Turret_Pivot', axis: 'y', from: -180, to: 180 }],
    },
    {
      key: 'elevation', label: 'ELEVATE', unit: '°',
      min: t.elevation[0], max: t.elevation[1], step: 0.5, value: 0,
      targets: [{ node: 'Barrel_Pivot', axis: 'x', from: -t.elevation[0], to: -t.elevation[1] }],
    },
    {
      // Drives the hub carriers directly; the wheel instances follow in afterArticulate.
      key: 'steer', label: 'STEER', unit: '°',
      min: -HTDIM.limits.steer, max: HTDIM.limits.steer, step: 1, value: 0,
      targets: wheelLayout().filter((w) => w.steers).map((w) => ({
        node: `Steer_${w.name}`, axis: 'y',
        from: -HTDIM.limits.steer, to: HTDIM.limits.steer,
      })),
    },
    {
      key: 'ramp', label: 'RAMP', unit: '°', min: 0, max: HTDIM.limits.ramp, step: 1, value: 0,
      targets: [{ node: 'Ramp_Pivot', axis: 'x', from: 0, to: HTDIM.cargo.ramp.open }],
    },
  ];
  return root;
}

// --- chassis ---------------------------------------------------------------

function buildFrame(M) {
  const f = HTDIM.frame;
  const parts = [];

  for (const side of [-1, 1]) {
    const rail = new THREE.BoxGeometry(f.railWidth, f.railHeight, f.length).toNonIndexed();
    rail.translate(side * f.railSpacing / 2, f.y, -0.30);
    parts.push(finish(rail));
  }
  for (const z of f.crossMembers) {
    const cross = new THREE.BoxGeometry(f.railSpacing, f.railHeight * 0.7, 0.14).toNonIndexed();
    cross.translate(0, f.y, z);
    parts.push(finish(cross));
  }

  const mesh = new THREE.Mesh(mergeNonIndexed(parts), M.steel);
  mesh.name = 'Chassis_Mesh';
  mesh.castShadow = mesh.receiveShadow = true;
  return registerPart(mesh, { explodable: false });
}

function buildCollision() {
  const geom = new THREE.BoxGeometry(HTDIM.cargo.width, 2.30, HTDIM.frame.length);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Chassis_Collision';
  mesh.position.set(0, 1.95, -0.28);
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}

// --- running gear ----------------------------------------------------------

function buildRunningGear(M) {
  const group = new THREE.Object3D();
  group.name = 'Running_Gear';
  const w = HTDIM.wheel;
  const layout = wheelLayout();

  // One InstancedMesh for all six tyres. A tyre is the most-repeated thing on the vehicle, so
  // if anything here is instanced it is this.
  const tyre = new THREE.CylinderGeometry(1, 1, 1, 20, 1, false).toNonIndexed();
  tyre.rotateZ(Math.PI / 2);
  finish(tyre);

  const wheels = new THREE.InstancedMesh(tyre, M.rubber, layout.length);
  wheels.name = 'Wheels_Instanced';
  wheels.castShadow = true;
  wheels.userData.layout = layout.map((l) => ({ ...l }));
  wheels.userData.size = { radius: w.radius, width: w.width };
  wheels.userData.instanceNames = layout.map((l) => l.name);
  group.add(registerPart(wheels, { explode: [0, -1.5, 0] }));

  const hub = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false).toNonIndexed();
  hub.rotateZ(Math.PI / 2);
  finish(hub);
  const hubs = new THREE.InstancedMesh(hub, M.steel, layout.length);
  hubs.name = 'Hubs_Instanced';
  hubs.userData.layout = layout.map((l) => ({ ...l }));
  hubs.userData.size = { radius: w.hubRadius, width: w.width * 1.15 };
  hubs.userData.instanceNames = layout.map((l) => `Hub_${l.name}`);
  group.add(registerPart(hubs, { explode: [0, -1.5, 0] }));

  // Steering carriers. Empty pivots at each steered wheel's centre — the joint turns these and
  // afterArticulate copies their rotation onto the matching instances.
  for (const l of layout.filter((x) => x.steers)) {
    const carrier = new THREE.Object3D();
    carrier.name = `Steer_${l.name}`;
    carrier.position.set(l.x, l.y, l.z);
    registerPart(carrier, { explodable: false });
    group.add(carrier);
  }

  // Suspension: a trailing arm per wheel, plus a damper. Visible mechanism is most of what
  // makes a truck read as industrial rather than as a shape.
  for (const l of layout) {
    const arm = new THREE.Mesh(
      finish(new THREE.BoxGeometry(0.12, 0.16, 0.86).toNonIndexed()), M.steel,
    );
    arm.name = `SuspArm_${l.name}`;
    arm.position.set(l.x - l.side * 0.20, l.y + 0.10, l.z + (l.axle === 0 ? -0.44 : 0.44));
    group.add(registerPart(arm, { explodable: false }));

    const damper = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(0.07, 0.07, 0.58, 8).toNonIndexed()), M.steel,
    );
    damper.name = `Damper_${l.name}`;
    damper.position.set(l.x - l.side * 0.26, l.y + 0.42, l.z);
    damper.rotation.z = l.side * 0.16;
    group.add(registerPart(damper, { explodable: false }));
  }

  // Mudguards, one per wheel. Sized to the tyre and arched rather than flat: the first pass was
  // 1.64 m long and nearly level, which read as a running board and clipped the cargo floor.
  for (const l of layout) {
    const guard = new THREE.Mesh(extrudeProfile([
      [-0.74, 0.00], [-0.78, 0.20], [-0.44, 0.40], [0.44, 0.40], [0.78, 0.20], [0.74, 0.00],
    ], w.width + 0.16), M.armour);
    guard.name = `Mudguard_${l.name}`;
    guard.position.set(l.x, l.y + w.radius - 0.10, l.z);
    group.add(registerPart(guard, { explode: [l.side * 1.1, 0.7, 0] }));
  }
  return group;
}

/**
 * Re-place wheel and hub instances for the current steer angle.
 *
 * Instance matrices are expressed in the InstancedMesh's own space, so a steered wheel cannot
 * simply be parented to a turning carrier. Reading the carrier's rotation back and rebuilding
 * the affected matrices keeps "the tyres are one instanced draw" true, which is the contract,
 * rather than splitting the front axle into loose meshes for the convenience of one joint.
 */
export function updateHeptatWheels(root) {
  for (const name of ['Wheels_Instanced', 'Hubs_Instanced']) {
    const mesh = root.getObjectByName(name);
    if (!mesh?.userData.layout) continue;
    const { radius, width } = mesh.userData.size;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(width, radius, radius);

    mesh.userData.layout.forEach((l, i) => {
      let yaw = 0;
      if (l.steers) {
        const carrier = root.getObjectByName(`Steer_${l.name}`);
        if (carrier) yaw = carrier.rotation.y;
      }
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      pos.set(l.x, l.y, l.z);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
}

// --- cab -------------------------------------------------------------------

function buildCab(M) {
  const group = new THREE.Object3D();
  group.name = 'Cab_Group';
  const c = HTDIM.cab;
  const midZ = (c.z0 + c.z1) / 2;

  const shell = new THREE.Mesh(extrudeProfile(c.profile, c.width), M.armour);
  shell.name = 'Cab_Mesh';
  shell.position.set(0, c.y0, midZ);
  shell.castShadow = shell.receiveShadow = true;
  group.add(registerPart(shell, { explode: [0, 0.8, 2.2] }));

  const glass = new THREE.Mesh(
    finish(new THREE.BoxGeometry(c.windscreen.width, c.windscreen.height, 0.06).toNonIndexed()),
    M.detail,
  );
  glass.name = 'Windscreen';
  glass.position.set(0, c.y0 + 1.52, midZ + 0.92);
  glass.rotation.x = -0.42;
  group.add(registerPart(glass, { explode: [0, 0.9, 1.6] }));

  const bumper = new THREE.Mesh(
    finish(new THREE.BoxGeometry(c.bumper.width, c.bumper.height, c.bumper.depth).toNonIndexed()),
    M.steel,
  );
  bumper.name = 'Bumper';
  bumper.position.set(0, c.y0 + 0.20, c.z1 + 0.10);
  group.add(registerPart(bumper, { explode: [0, -0.3, 1.8] }));

  for (const side of [-1, 1]) {
    const step = new THREE.Mesh(
      finish(new THREE.BoxGeometry(0.42, 0.06, 0.52).toNonIndexed()), M.steel,
    );
    step.name = `CabStep_${side < 0 ? 'L' : 'R'}`;
    step.position.set(side * (c.width / 2 + 0.14), c.y0 - 0.34, midZ - 0.55);
    group.add(registerPart(step, { explodable: false }));

    const mirror = new THREE.Mesh(
      finish(new THREE.BoxGeometry(0.05, 0.36, 0.16).toNonIndexed()), M.detail,
    );
    mirror.name = `Mirror_${side < 0 ? 'L' : 'R'}`;
    mirror.position.set(side * (c.width / 2 + 0.30), c.y0 + 1.66, midZ + 0.66);
    group.add(registerPart(mirror, { explode: [side * 1.2, 0.5, 0.4] }));

    const lamp = new THREE.Mesh(
      finish(new THREE.BoxGeometry(0.26, 0.20, 0.08).toNonIndexed()), M.glow2,
    );
    lamp.name = `Headlamp_${side < 0 ? 'L' : 'R'}`;
    lamp.position.set(side * 0.86, c.y0 + 0.44, c.z1 + 0.20);
    group.add(registerPart(lamp, { explode: [side * 0.6, 0.3, 1.4], emissive: 'secondary' }));
  }

  // Cab accents are authored relative to the cab's own floor and mid-Z, like its profile is.
  strips(group, HTDIM.glow.cab.map(([x, y, z, w, h, d]) => [x, c.y0 + y, midZ + z, w, h, d]),
    'Cab_Glow', M.glow2);
  return group;
}

// --- cargo bay -------------------------------------------------------------

function buildCargo(M) {
  const group = new THREE.Object3D();
  group.name = 'Cargo_Bay';
  const c = HTDIM.cargo;
  const midZ = (c.z0 + c.z1) / 2;
  const len = c.z1 - c.z0;

  // Bay walls and floor as one shell, open at the back where the ramp closes it.
  const shell = new THREE.Mesh(extrudeProfile([
    [-len / 2, 0], [len / 2, 0], [len / 2, c.height], [-len / 2, c.height],
  ], c.width), M.armour);
  shell.name = 'CargoBay_Mesh';
  shell.position.set(0, c.y0, midZ);
  shell.castShadow = shell.receiveShadow = true;
  group.add(registerPart(shell, { explode: [0, 1.0, -1.6] }));

  // External stiffening ribs. The single cheapest way to make a big box read as fabricated.
  for (const [i, z] of c.ribs.entries()) {
    for (const side of [-1, 1]) {
      const rib = new THREE.Mesh(
        finish(new THREE.BoxGeometry(0.09, c.height * 0.86, 0.16).toNonIndexed()), M.armour,
      );
      rib.name = `CargoRib_${side < 0 ? 'L' : 'R'}${i + 1}`;
      rib.position.set(side * (c.width / 2 + 0.04), c.y0 + c.height * 0.46, z);
      group.add(registerPart(rib, { explodable: false }));
    }
  }

  const rampPivot = new THREE.Object3D();
  rampPivot.name = 'Ramp_Pivot';               // rotation.x — hinged at the bay floor
  rampPivot.position.set(0, c.y0 + 0.02, c.z0);
  registerPart(rampPivot, { explode: [0, -0.4, -1.4] });

  const ramp = new THREE.Mesh(
    finish(new THREE.BoxGeometry(c.ramp.width, 0.10, c.ramp.height).toNonIndexed()), M.armour,
  );
  ramp.name = 'Ramp_Mesh';
  // Offset so the hinge is at the ramp's edge, not its centre.
  ramp.position.set(0, c.ramp.height / 2, -0.05);
  ramp.rotation.x = Math.PI / 2;
  rampPivot.add(registerPart(ramp, { explodable: false }));
  group.add(rampPivot);

  strips(group, HTDIM.glow.cargo, 'Cargo_Glow', M.glow2);
  strips(group, HTDIM.glow.sills, 'SillLight', M.glow2);
  return group;
}

// --- turret ----------------------------------------------------------------

function buildTurret(M) {
  const t = HTDIM.turret;
  const roofY = HTDIM.cargo.y0 + HTDIM.cargo.height;

  const pivot = new THREE.Object3D();
  pivot.name = 'Turret_Pivot';
  pivot.position.set(t.ringX, roofY, t.ringZ);
  registerPart(pivot, { explode: [0, 1.4, 0] });

  const ring = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(0.40, 0.44, 0.10, 12).toNonIndexed()), M.steel,
  );
  ring.name = 'Turret_Ring';
  ring.position.y = -0.03;
  pivot.add(registerPart(ring, { explodable: false }));

  const shell = new THREE.Mesh(
    extrudeProfile(t.profile, t.width, { frontScale: 0.78, backScale: 0.78 }), M.turret,
  );
  shell.name = 'Turret_Mesh';
  shell.castShadow = true;
  pivot.add(registerPart(shell, { explodable: false }));

  strips(pivot, [[0, 0.28, 0.40, 0.30, 0.035, 0.02]], 'Turret_Glow', M.glow2);

  const barrelPivot = new THREE.Object3D();
  barrelPivot.name = 'Barrel_Pivot';
  barrelPivot.position.set(0, t.trunnionY, t.trunnionZ);
  registerPart(barrelPivot, { explode: [0, 0, 0.9] });

  const barrel = new THREE.Mesh(latheZ(t.barrelProfile, 10), M.steel);
  barrel.name = 'Barrel_Mesh';
  barrelPivot.add(registerPart(barrel, { explodable: false }));

  const box = new THREE.Mesh(
    finish(new THREE.BoxGeometry(0.22, 0.20, 0.34).toNonIndexed()), M.steel,
  );
  box.name = 'Turret_Receiver';
  box.position.z = -0.08;
  barrelPivot.add(registerPart(box, { explodable: false }));

  pivot.add(barrelPivot);
  return pivot;
}

// --- lived-in --------------------------------------------------------------

/**
 * Stowage: the things a crew put there, not the things a designer did.
 *
 * Asymmetric on purpose — ladder one side, spare wheel and toolbox the other, cans on one
 * flank — and every item gets a small seeded offset and cant. A grid of aligned crates reads as
 * cargo someone modelled; the same crates a few centimetres out of true read as cargo someone
 * threw on and strapped down.
 */
function buildStowage(M) {
  const g = new THREE.Object3D();
  g.name = 'Details_Group';
  const s = HTDIM.stowage;
  const rand = rng(s.seed);
  const jitter = () => (rand() - 0.5) * 2;

  const place = (mesh, x, y, z, cant = true) => {
    mesh.position.set(
      x + jitter() * s.jitter.pos,
      y + jitter() * s.jitter.pos * 0.4,
      z + jitter() * s.jitter.pos,
    );
    if (cant) {
      mesh.rotation.y = jitter() * s.jitter.rot;
      mesh.rotation.z = jitter() * s.jitter.rot * 0.35;
    }
    return mesh;
  };

  s.roofCrates.forEach(([x, y, z, w, h, d], i) => {
    const crate = new THREE.Mesh(finish(new THREE.BoxGeometry(w, h, d).toNonIndexed()), M.detail);
    crate.name = `Crate_${String(i + 1).padStart(2, '0')}`;
    crate.castShadow = true;
    g.add(registerPart(place(crate, x, y, z), { explode: [x * 1.4, 1.3, z * 0.3] }));
  });

  s.cans.zs.forEach((z, i) => {
    const can = new THREE.Mesh(
      finish(new THREE.BoxGeometry(...s.cans.size).toNonIndexed()), M.detail,
    );
    can.name = `FuelCan_${i + 1}`;
    g.add(registerPart(place(can, s.cans.x, s.cans.y, z), { explode: [-1.3, 0.5, 0] }));
  });

  const toolbox = new THREE.Mesh(
    finish(new THREE.BoxGeometry(...s.toolbox.size).toNonIndexed()), M.detail,
  );
  toolbox.name = 'Toolbox';
  g.add(registerPart(place(toolbox, s.toolbox.x, s.toolbox.y, s.toolbox.z), { explode: [1.3, 0.4, 0] }));

  const spare = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(HTDIM.wheel.radius, HTDIM.wheel.radius, HTDIM.wheel.width, 16).toNonIndexed()),
    M.rubber,
  );
  spare.name = 'SpareWheel';
  spare.rotation.z = Math.PI / 2;
  spare.position.set(s.spareWheel.x, s.spareWheel.y, s.spareWheel.z);
  spare.rotation.x = jitter() * 0.05;
  g.add(registerPart(spare, { explode: [1.6, 0.3, -0.6] }));

  // Ladder, left side only.
  const stile = (dz) => {
    const bar = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(0.026, 0.026, 1.30, 6).toNonIndexed()), M.steel,
    );
    bar.name = `LadderStile_${dz > 0 ? 'A' : 'B'}`;
    bar.position.set(s.ladder.x, s.ladder.y, s.ladder.z + dz);
    return registerPart(bar, { explodable: false });
  };
  g.add(stile(0.20), stile(-0.20));
  for (let i = 0; i < s.ladder.rungs; i++) {
    const rung = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(0.018, 0.018, 0.40, 6).toNonIndexed()), M.steel,
    );
    rung.name = `LadderRung_${i + 1}`;
    rung.rotation.x = Math.PI / 2;
    rung.position.set(s.ladder.x, s.ladder.y - 0.55 + i * 0.27, s.ladder.z);
    g.add(registerPart(rung, { explodable: false }));
  }

  const reel = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(s.cableReel.radius, s.cableReel.radius, s.cableReel.width, 12).toNonIndexed()),
    M.detail,
  );
  reel.name = 'CableReel';
  reel.rotation.z = Math.PI / 2;
  reel.position.set(s.cableReel.x, s.cableReel.y, s.cableReel.z);
  reel.rotation.x = jitter() * 0.06;
  g.add(registerPart(reel, { explode: [1.1, 1.2, 0] }));

  s.antennae.forEach(([x, y, z, len, lean], i) => {
    const mast = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(0.014, 0.024, len, 6).toNonIndexed()), M.steel,
    );
    mast.name = `Antenna_${i + 1}`;
    mast.position.set(x, y + len / 2, z);
    mast.rotation.z = lean + jitter() * 0.03;
    g.add(registerPart(mast, { explode: [x * 1.2, 1.1, 0] }));
  });

  return g;
}

// --- shared ----------------------------------------------------------------

/** Accent strips. The channel, not the colour, is what the asset declares. */
function strips(parent, defs, prefix, material) {
  defs.forEach(([x, y, z, w, h, d], i) => {
    const mesh = new THREE.Mesh(finish(new THREE.BoxGeometry(w, h, d).toNonIndexed()), material);
    mesh.name = `${prefix}_${i + 1}`;
    mesh.position.set(x, y, z);
    parent.add(registerPart(mesh, { explode: [x * 1.2, 0.6, 0], emissive: 'secondary' }));
  });
}
