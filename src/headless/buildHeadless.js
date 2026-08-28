import * as THREE from 'three';
import { BHDIM, armLayout, bipedPivots, legLayout, stand } from './dimensions.js';
import { cableRun, extrudeProfile, finish, taperedBeam } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * BP-Headless01 — headless powered exoframe.
 *
 * The sixth subject and the first unarmed one. It carries no turret, no barrel and no head, and
 * the useful result is what that did NOT cost: the renderer, the composite, the camera and the
 * chrome are byte-identical to what they were before it existed. The shared contract had
 * encoded "vehicles have wheels" once and had to be taught otherwise; it turns out it never
 * encoded "vehicles are armed" at all, because a weapon only ever appeared in a subject's own
 * `required` list. Two asset files, one descriptor, one registry line, one shared generator.
 *
 * Three structural facts, in the order they constrain the code:
 *
 *   - Ride height is leg state. `Body_Group`'s Y is written by `updateHeadlessStance` from the
 *     current knee and hip angles rather than authored — the walker's escape hatch, reused
 *     unchanged, which is the evidence that it was a *legged* feature and not a walker feature.
 *   - The foot frame is world-aligned by construction. The ankle carries the negated shin angle
 *     minus the mount's 90°, so the chain cancels and the sole is flat at every stance with no
 *     IK and no second slider. See `bipedPivots`.
 *   - Twenty finger pivots are one slider. The same joint fan-out that folds eight legs on the
 *     walker closes ten fingers here, and the viewer still knows nothing but "a range remapped
 *     onto some rotations".
 */
export function buildHeadless() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'Headless_Root';

  // Everything above the ground contact patch. Its height is leg state, not a dimension.
  const body = new THREE.Object3D();
  body.name = 'Body_Group';
  body.position.y = stand(BHDIM.leg.pose.neutral).hipHeight;
  registerPart(body, { explodable: false });
  root.add(body);

  body.add(buildPelvis(M));
  body.add(buildCollision());
  body.add(buildWaist(M));
  for (const leg of legLayout()) body.add(buildLeg(M, leg));

  const T = BHDIM.torso;
  const legs = legLayout();
  const crouch = bipedPivots(BHDIM.leg.pose.crouch);
  const extend = bipedPivots(BHDIM.leg.pose.extend);
  const H = BHDIM.hand;

  root.userData.joints = [
    {
      /**
       * Six targets: hip, knee and ankle on each leg.
       *
       * The ankle is driven from the same slider rather than left rigid, exactly as the walker's
       * is — a sole that tilts with the shin stops being a foot. Here it does double duty: the
       * angle it carries is what cancels the chain and leaves the foot world-aligned.
       *
       * 50 is the rest posture and is the midpoint of crouch and extend by construction.
       */
      key: 'stance', label: 'STANCE', unit: '', min: 0, max: 100, step: 1, value: 50,
      targets: legs.flatMap((l) => [
        { node: `${l.name}_Hip`, axis: 'x', from: crouch.hip, to: extend.hip },
        { node: `${l.name}_Knee`, axis: 'x', from: crouch.knee, to: extend.knee },
        { node: `${l.name}_Ankle`, axis: 'x', from: crouch.ankle, to: extend.ankle },
      ]),
    },
    {
      // The hunch. Its default is the midpoint of the range for the same reason STANCE's is:
      // the drawing is dimensioned in the leaning pose, so the slider has to rest there.
      key: 'lean', label: 'TORSO LEAN', unit: '°',
      min: T.lean.min, max: T.lean.max, step: 0.5, value: T.lean.rest,
      targets: [{ node: 'Waist_Pitch', axis: 'x', from: T.lean.min, to: T.lean.max }],
    },
    {
      key: 'twist', label: 'TORSO TWIST', unit: '°', min: -T.twist, max: T.twist, step: 1, value: 0,
      targets: [{ node: 'Waist_Yaw', axis: 'y', from: -T.twist, to: T.twist }],
    },
    {
      // Both shoulders off one slider. Negated because the arm chain hangs off a mount rotated
      // +90° about X, so a positive rotation.x swings the limb backward — the same sign
      // inversion the legs carry, and for the same reason.
      key: 'arms', label: 'SHOULDER', unit: '°',
      min: BHDIM.arm.stowed.shoulder, max: BHDIM.arm.deployed.shoulder, step: 1,
      value: BHDIM.arm.stowed.shoulder,
      targets: armLayout().map((a) => ({
        node: `Shoulder_${a.tag}_Pivot`, axis: 'x',
        from: -BHDIM.arm.stowed.shoulder, to: -BHDIM.arm.deployed.shoulder,
      })),
    },
    {
      key: 'elbow', label: 'ELBOW', unit: '°',
      min: BHDIM.arm.stowed.elbow, max: BHDIM.arm.deployed.elbow, step: 1,
      value: BHDIM.arm.stowed.elbow,
      targets: armLayout().map((a) => ({
        node: `Elbow_${a.tag}_Pivot`, axis: 'x',
        from: -BHDIM.arm.stowed.elbow, to: -BHDIM.arm.deployed.elbow,
      })),
    },
    {
      /**
       * One slider, twenty targets: two driven segments on each of five fingers, twice.
       *
       * The rest position is not a third authored pose — every pivot is built at `H.rest`
       * percent of its own closed angle, which is the same percentage this slider defaults to.
       * That is what stops the hand in the exported GLB from disagreeing with the hand in the
       * drawing after someone nudges one curl angle.
       */
      key: 'grip', label: 'GRIP', unit: '', min: 0, max: 100, step: 1, value: H.rest,
      targets: armLayout().flatMap((a) => [
        ...H.fingers.flatMap((f) => [
          { node: `Finger_${a.tag}${f.tag}_Prox`, axis: 'x', from: 0, to: H.curl.proximal },
          { node: `Finger_${a.tag}${f.tag}_Dist`, axis: 'x', from: 0, to: H.curl.distal },
        ]),
        { node: `Thumb_${a.tag}_Prox`, axis: 'x', from: 0, to: H.thumbCurl.proximal },
        { node: `Thumb_${a.tag}_Dist`, axis: 'x', from: 0, to: H.thumbCurl.distal },
      ]),
    },
  ];
  return root;
}

/**
 * Ride height follows the legs.
 *
 * The hip line sits `drop` above the ankle and the ankle sits a fixed height above the sole, so
 * the body's Y is fully determined by two angles — and no parent transform can express it,
 * because the legs are children of the thing that has to move. Identical in shape to the
 * walker's fix-up, which is the point: this is what a legged subject costs, not what a
 * particular leg count costs.
 *
 * One leg is read rather than both: STANCE drives them from one range, so they are equal by
 * construction. A per-leg stance would make this a min over the two drops — the machine stands
 * at the height of its straighter leg.
 */
export function updateHeadlessStance(root) {
  const body = root.getObjectByName('Body_Group');
  const leg = legLayout()[0].name;
  const hip = root.getObjectByName(`${leg}_Hip`);
  const knee = root.getObjectByName(`${leg}_Knee`);
  if (!body || !hip || !knee) return;

  // The scene graph stores negated, relative angles; the solve wants absolute, forward-positive.
  const deg = 180 / Math.PI;
  const thigh = -hip.rotation.x * deg;
  const shin = thigh - knee.rotation.x * deg;
  body.position.y = stand([thigh, shin]).hipHeight;
}

// --- pelvis and waist ------------------------------------------------------

function buildPelvis(M) {
  const p = BHDIM.pelvis;
  const group = new THREE.Object3D();
  group.name = 'Pelvis_Group';

  const box = new THREE.Mesh(
    finish(new THREE.BoxGeometry(p.box.width, p.box.height, p.box.depth).toNonIndexed()), M.armour,
  );
  box.name = 'Pelvis_Mesh';
  box.position.y = p.box.y;
  box.castShadow = box.receiveShadow = true;
  group.add(registerPart(box, { explodable: false }));

  // Hex plate on the pelvis front, echoing the chest core — six radial segments, not a
  // decorative disc: the front elevation reads the two hexagons as one family.
  const plate = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(p.plate.radius, p.plate.radius, p.plate.depth, 6).toNonIndexed()),
    M.detail,
  );
  plate.name = 'Pelvis_Plate';
  plate.rotation.x = Math.PI / 2;
  plate.position.set(0, p.plate.y, p.plate.z);
  group.add(registerPart(plate, { explode: [0, 0, 1.3] }));

  const column = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(p.column.radius, p.column.radius * 1.12, p.column.height, 10).toNonIndexed()),
    M.steel,
  );
  column.name = 'Waist_Column';
  column.position.y = p.column.y;
  group.add(registerPart(column, { explode: [0, 0.8, -0.5] }));

  for (const leg of legLayout()) {
    const yoke = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(p.yoke.radius, p.yoke.radius, p.yoke.width, 12).toNonIndexed()),
      M.steel,
    );
    yoke.name = `HipYoke_${leg.tag}`;
    yoke.rotation.z = Math.PI / 2;
    yoke.position.x = leg.x;
    group.add(registerPart(yoke, { explode: [leg.side * 1.2, 0, 0] }));
  }
  return group;
}

/**
 * Waist yaw → waist pitch → thorax.
 *
 * Two nodes rather than one Euler because a single node driven on two axes would put the twist
 * and the lean in a fixed composition order, and the declared-joint contract gives each target
 * one node and one axis. Splitting them is what lets the viewer stay ignorant of both.
 */
function buildWaist(M) {
  const T = BHDIM.torso;

  const yaw = new THREE.Object3D();
  yaw.name = 'Waist_Yaw';
  yaw.position.y = T.waistY;
  registerPart(yaw, { explodable: false });

  const pitch = new THREE.Object3D();
  pitch.name = 'Waist_Pitch';
  pitch.rotation.x = THREE.MathUtils.degToRad(T.lean.rest);
  registerPart(pitch, { explodable: false });
  yaw.add(pitch);

  pitch.add(buildThorax(M));
  for (const arm of armLayout()) pitch.add(buildArm(M, arm));
  return yaw;
}

function buildThorax(M) {
  const T = BHDIM.torso;
  const group = new THREE.Object3D();
  group.name = 'Thorax_Group';

  const shell = new THREE.Mesh(
    extrudeProfile(T.profile, T.width, { frontScale: T.taper, backScale: T.taper }), M.armour,
  );
  shell.name = 'Thorax_Mesh';
  shell.castShadow = shell.receiveShadow = true;
  group.add(registerPart(shell, { explodable: false }));

  const cover = new THREE.Mesh(
    finish(new THREE.BoxGeometry(T.spineCover.width, T.spineCover.height, T.spineCover.depth).toNonIndexed()),
    M.turret,
  );
  cover.name = 'Spine_Cover';
  cover.position.set(0, T.spineCover.y, T.spineCover.z);
  cover.castShadow = true;
  group.add(registerPart(cover, { explode: [0, 0.3, -1.6] }));

  T.backPlates.forEach((b, i) => {
    const plate = new THREE.Mesh(
      finish(new THREE.BoxGeometry(b.width, b.height, b.depth).toNonIndexed()), M.armour,
    );
    plate.name = `Back_Plate_${i + 1}`;
    plate.position.set(0, b.y, b.z);
    group.add(registerPart(plate, { explode: [0, 0.2 + i * 0.25, -1.1 - i * 0.3] }));
  });

  // The chest. On a machine with no head this is the whole face — a hexagonal core plate, a lit
  // centre and a sensor band above it. Everything a cupola would have carried, moved down.
  const hex = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(T.chestHex.radius, T.chestHex.radius * 0.94, T.chestHex.depth, 6).toNonIndexed()),
    M.turret,
  );
  hex.name = 'Chest_Hex';
  hex.rotation.x = Math.PI / 2;
  hex.position.set(0, T.chestHex.y, T.chestHex.z);
  hex.castShadow = true;
  group.add(registerPart(hex, { explode: [0, 0, 1.5] }));

  const lens = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(T.coreLens.radius, T.coreLens.radius, T.coreLens.depth, 10).toNonIndexed()),
    M.glow,
  );
  lens.name = 'Core_Lens';
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, T.coreLens.y, T.coreLens.z);
  group.add(registerPart(lens, { explode: [0, 0, 2.1], emissive: 'primary' }));

  const band = new THREE.Mesh(
    finish(new THREE.BoxGeometry(T.sensorBand.width, T.sensorBand.height, T.sensorBand.depth).toNonIndexed()),
    M.glow2,
  );
  band.name = 'Sensor_Band';
  band.position.set(0, T.sensorBand.y, T.sensorBand.z);
  group.add(registerPart(band, { explode: [0, 0.9, 1.2], emissive: 'secondary' }));

  const details = new THREE.Object3D();
  details.name = 'Details_Group';
  registerPart(details, { explodable: false });
  group.add(details);

  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';

    const vent = new THREE.Mesh(
      finish(new THREE.BoxGeometry(T.vent.width, T.vent.height, T.vent.depth).toNonIndexed()), M.detail,
    );
    vent.name = `Chest_Vent_${tag}`;
    vent.position.set(side * T.vent.x, T.vent.y, T.vent.z);
    group.add(registerPart(vent, { explode: [side * 1.2, -0.2, 0.9] }));

    const strip = new THREE.Mesh(
      finish(new THREE.BoxGeometry(T.coreStrip.width, T.coreStrip.height, T.coreStrip.depth).toNonIndexed()),
      M.glow,
    );
    strip.name = `Core_Strip_${tag}`;
    strip.position.set(side * T.coreStrip.x, T.coreStrip.y, T.coreStrip.z);
    group.add(registerPart(strip, { explode: [side * 1.5, 0, 1.0], emissive: 'primary' }));

    // Loom over the shoulder. Authored on the left and mirrored in X — mirroring a cable is
    // legitimate where mirroring stowage is not: a hose bundle is a fitted part, not something
    // a crew threw on one flank.
    const loom = new THREE.Mesh(
      cableRun(T.loom.map(([x, y, z]) => [-side * x, y, z]), { radius: T.loomRadius }), M.rubber,
    );
    loom.name = `Loom_${tag}`;
    group.add(registerPart(loom, { explode: [side * 1.0, 1.1, 0] }));

    // The flank ram. Both halves live on the thorax — see BHDIM.torso.ram.
    const R = T.ram;
    const ram = new THREE.Object3D();
    ram.name = `Ram_${tag}_Group`;
    ram.position.set(side * R.x, R.y, R.z);
    ram.rotation.x = THREE.MathUtils.degToRad(R.tilt);
    registerPart(ram, { explodable: false });
    group.add(ram);

    const barrel = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(R.radius, R.radius, R.length * 0.62, 10).toNonIndexed()), M.steel,
    );
    barrel.name = `Ram_${tag}_Body`;
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = R.length * 0.31;
    ram.add(registerPart(barrel, { explode: [side * 1.5, 0.5, -0.5] }));

    const rod = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(R.rodRadius, R.rodRadius, R.length * 0.52, 8).toNonIndexed()), M.detail,
    );
    rod.name = `Ram_${tag}_Rod`;
    rod.rotation.x = Math.PI / 2;
    rod.position.z = R.length * 0.78;
    ram.add(registerPart(rod, { explode: [side * 1.8, 0.2, 0.4] }));

    const latch = new THREE.Mesh(
      finish(new THREE.BoxGeometry(T.latch.width, T.latch.height, T.latch.depth).toNonIndexed()), M.steel,
    );
    latch.name = `Shell_Latch_${tag}`;
    latch.position.set(side * T.latch.x, T.latch.y, T.latch.z);
    details.add(registerPart(latch, { explode: [side * 1.7, 0.6, -0.3] }));

    const port = new THREE.Mesh(
      finish(new THREE.BoxGeometry(T.dataPort.width, T.dataPort.height, T.dataPort.depth).toNonIndexed()),
      M.detail,
    );
    port.name = `Data_Port_${tag}`;
    port.position.set(side * T.dataPort.x, T.dataPort.y, T.dataPort.z);
    details.add(registerPart(port, { explode: [side * 1.4, -0.6, 1.1] }));
  }

  T.conduits.forEach((c, i) => {
    const hose = new THREE.Mesh(
      cableRun(T.conduitPath.map(([, y, z]) => [c.x, y, z]), { radius: c.radius }), M.rubber,
    );
    hose.name = `Back_Conduit_${i + 1}`;
    group.add(registerPart(hose, { explode: [c.x * 4, 0, -1.4] }));
  });

  const hatch = new THREE.Mesh(
    finish(new THREE.BoxGeometry(T.hatch.width, T.hatch.height, T.hatch.depth).toNonIndexed()), M.detail,
  );
  hatch.name = 'Access_Hatch';
  hatch.position.set(0, T.hatch.y, T.hatch.z);
  details.add(registerPart(hatch, { explode: [0, -0.4, -1.8] }));

  return group;
}

function buildCollision() {
  const T = BHDIM.torso;
  const geom = new THREE.BoxGeometry(T.width + 0.08, 1.30, 1.24);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Torso_Collision';
  mesh.position.set(0, 0.56, -0.04);
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}

// --- legs ------------------------------------------------------------------

/**
 * One leg: Mount → Hip → Knee → Ankle.
 *
 * The mount carries a fixed +90° about X so the chain's local +Z points at the ground and every
 * segment can be authored along its own axis with `taperedBeam`. The sign inversion that costs
 * lives in `bipedPivots`, not here.
 *
 * Geometry is rebuilt per leg rather than shared. Two meshes cloning one geometry would share
 * one part id and the outline pass would stop drawing the seam where the legs cross — which on
 * a biped is every frame of the side elevation.
 */
function buildLeg(M, leg) {
  const L = BHDIM.leg;
  const rest = bipedPivots(L.pose.neutral);

  const mount = new THREE.Object3D();
  mount.name = `${leg.name}_Mount`;
  mount.position.x = leg.x;
  mount.rotation.x = Math.PI / 2;
  registerPart(mount, { explodable: false });

  const hip = new THREE.Object3D();
  hip.name = `${leg.name}_Hip`;
  hip.rotation.x = THREE.MathUtils.degToRad(rest.hip);
  registerPart(hip, { explodable: false });
  mount.add(hip);

  const thigh = new THREE.Mesh(taperedBeam({ length: L.thigh, ...L.thighBox }), M.steel);
  thigh.name = `Thigh_${leg.tag}_Mesh`;
  thigh.castShadow = true;
  hip.add(registerPart(thigh, { explode: [leg.side * 0.9, 0, 0.4] }));

  const thighPlate = new THREE.Mesh(
    extrudeProfile(L.thighPlate.profile, L.thighPlate.width,
      { frontScale: L.thighPlate.taper, backScale: L.thighPlate.taper }), M.armour,
  );
  thighPlate.name = `ThighPlate_${leg.tag}`;
  thighPlate.castShadow = true;
  hip.add(registerPart(thighPlate, { explode: [leg.side * 1.4, 0.2, 0.2] }));

  // Hip actuator, swinging with the thigh rather than bridging the hip — the walker's strut
  // argument again. A ram across a driven pivot would have to change length.
  const actuator = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(L.actuator.radius, L.actuator.radius * 0.82, L.actuator.length, 8).toNonIndexed()),
    M.steel,
  );
  actuator.name = `HipActuator_${leg.tag}`;
  actuator.rotation.x = Math.PI / 2;
  actuator.position.set(leg.side * 0.13, -0.19, 0.24);
  hip.add(registerPart(actuator, { explode: [leg.side * 0.6, -1.0, 0.3] }));

  const knee = new THREE.Object3D();
  knee.name = `${leg.name}_Knee`;
  knee.position.z = L.thigh;
  knee.rotation.x = THREE.MathUtils.degToRad(rest.knee);
  registerPart(knee, { explodable: false });
  hip.add(knee);

  const hub = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(L.knee.radius, L.knee.radius, L.knee.width, 12).toNonIndexed()),
    M.detail,
  );
  hub.name = `KneeHub_${leg.tag}`;
  hub.rotation.z = Math.PI / 2;
  knee.add(registerPart(hub, { explode: [leg.side * 1.1, 0.5, 0] }));

  const shin = new THREE.Mesh(taperedBeam({ length: L.shin, ...L.shinBox }), M.steel);
  shin.name = `Shin_${leg.tag}_Mesh`;
  shin.castShadow = true;
  knee.add(registerPart(shin, { explode: [leg.side * 0.9, 0, 0.6] }));

  const shinPlate = new THREE.Mesh(
    extrudeProfile(L.shinPlate.profile, L.shinPlate.width,
      { frontScale: L.shinPlate.taper, backScale: L.shinPlate.taper }), M.armour,
  );
  shinPlate.name = `ShinPlate_${leg.tag}`;
  shinPlate.castShadow = true;
  knee.add(registerPart(shinPlate, { explode: [leg.side * 1.4, -0.2, 0.5] }));

  const hose = new THREE.Mesh(
    cableRun(L.calfHose.map(([x, y, z]) => [leg.side * x, y, z]), { radius: L.calfHoseRadius }),
    M.rubber,
  );
  hose.name = `CalfHose_${leg.tag}`;
  knee.add(registerPart(hose, { explode: [leg.side * 1.6, -0.5, 0.4] }));

  // Ankle bearing stack, mounted on the shin rather than on the foot. The discs are the joint's
  // outer races in the reference sheet, and hanging them on the shin means they cant with the
  // shin — which is what makes the crouch read as a joint bending rather than a stick bending.
  L.bearings.forEach((b, i) => {
    const disc = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(b.radius, b.radius, b.width, 12).toNonIndexed()), M.detail,
    );
    disc.name = `Bearing_${leg.tag}_${i + 1}`;
    disc.rotation.z = Math.PI / 2;
    disc.position.set(b.x, 0, L.shin);
    knee.add(registerPart(disc, { explode: [b.x * 6 + leg.side * 0.5, -0.4, 0.9] }));
  });

  /**
   * The ankle. Its angle cancels the whole chain — mount, hip and knee — so this frame comes
   * out world-aligned and the foot below can be authored in ordinary +Y-up, +Z-forward terms.
   * That, and not a solver, is what keeps the sole flat at every stance.
   */
  const ankle = new THREE.Object3D();
  ankle.name = `${leg.name}_Ankle`;
  ankle.position.z = L.shin;
  ankle.rotation.x = THREE.MathUtils.degToRad(rest.ankle);
  registerPart(ankle, { explodable: false });
  knee.add(ankle);

  ankle.add(buildFoot(M, leg));
  return mount;
}

/** The foot, in the world-aligned ankle frame. Ground is at y = -ankleY by construction. */
function buildFoot(M, leg) {
  const L = BHDIM.leg;
  const F = L.foot;
  const ground = -L.ankleY;

  const group = new THREE.Object3D();
  group.name = `Foot_${leg.tag}_Group`;

  const sole = new THREE.Mesh(
    finish(new THREE.BoxGeometry(F.sole.width, F.sole.height, F.sole.depth).toNonIndexed()), M.detail,
  );
  sole.name = `Foot_${leg.tag}_Sole`;
  sole.position.set(0, ground + F.sole.height / 2, F.sole.z);
  sole.castShadow = sole.receiveShadow = true;
  group.add(registerPart(sole, { explode: [leg.side * 0.6, -0.9, 0] }));

  const heel = new THREE.Mesh(
    finish(new THREE.BoxGeometry(F.heel.width, F.heel.height, F.heel.depth).toNonIndexed()), M.steel,
  );
  heel.name = `Foot_${leg.tag}_Heel`;
  heel.position.set(0, ground + F.heel.height / 2, F.heel.z);
  group.add(registerPart(heel, { explode: [leg.side * 0.5, -0.6, -1.1] }));

  const shroud = new THREE.Mesh(
    finish(new THREE.BoxGeometry(F.shroud.width, F.shroud.height, F.shroud.depth).toNonIndexed()), M.armour,
  );
  shroud.name = `Ankle_${leg.tag}_Shroud`;
  shroud.position.set(0, ground + F.shroud.y + F.shroud.height / 2 + F.sole.height, F.shroud.z);
  group.add(registerPart(shroud, { explode: [leg.side * 1.1, 0.4, -0.3] }));

  // Splayed toe plates. Their undersides sit on the same plane as the sole, so the whole
  // contact patch is flat — a toe hanging a centimetre low is invisible in a still and obvious
  // the moment anything casts a shadow.
  F.toes.forEach((t, i) => {
    const toe = new THREE.Mesh(
      taperedBeam({ length: t.length, w0: t.w0, h0: t.h0, w1: t.w1, h1: t.h1 }), M.steel,
    );
    toe.name = `Toe_${leg.tag}_${i + 1}`;
    toe.position.set(t.x, ground + t.h0 / 2, F.toeZ);
    toe.rotation.y = THREE.MathUtils.degToRad(t.yaw);
    group.add(registerPart(toe, { explode: [t.x * 5, -0.5, 1.3] }));
  });

  const lamp = new THREE.Mesh(
    finish(new THREE.BoxGeometry(F.lamp.width, F.lamp.height, F.lamp.depth).toNonIndexed()), M.glow2,
  );
  lamp.name = `Foot_${leg.tag}_Lamp`;
  lamp.position.set(0, ground + F.lamp.y + F.sole.height, F.lamp.z);
  group.add(registerPart(lamp, { explode: [leg.side * 0.8, -0.3, -1.5], emissive: 'secondary' }));

  return group;
}

// --- arms and hands --------------------------------------------------------

/**
 * One arm: Socket → Mount → Shoulder → Elbow → Wrist → hand.
 *
 * The splay lives on the socket and the +90° on the mount, deliberately on two nodes. Putting
 * both on one node would compose them in Euler order and the shoulder's swing would scribe a
 * cone instead of an arc — a bug that looks like "the arm drifts sideways as it lifts" and is
 * very hard to read back to its cause.
 */
function buildArm(M, arm) {
  const A = BHDIM.arm;
  const S = A.socket;

  const socket = new THREE.Object3D();
  socket.name = `${arm.name}_Socket`;
  socket.position.set(arm.x, S.y, S.z);
  socket.rotation.z = THREE.MathUtils.degToRad(arm.side * S.splay);
  registerPart(socket, { explodable: false });

  const pauldron = new THREE.Mesh(
    extrudeProfile(A.pauldron.profile, A.pauldron.width,
      { frontScale: A.pauldron.taper, backScale: A.pauldron.taper }), M.armour,
  );
  pauldron.name = `Pauldron_${arm.tag}`;
  pauldron.castShadow = true;
  // On the thorax, not on the socket: a pauldron that swung with the arm would slice into the
  // carapace at full reach, and on the reference sheet it is plainly part of the shell.
  pauldron.position.set(arm.side * A.pauldron.x, A.pauldron.y, 0);

  const mount = new THREE.Object3D();
  mount.name = `${arm.name}_Mount`;
  mount.rotation.x = Math.PI / 2;
  registerPart(mount, { explodable: false });
  socket.add(mount);

  const shoulder = new THREE.Object3D();
  shoulder.name = `Shoulder_${arm.tag}_Pivot`;
  shoulder.rotation.x = THREE.MathUtils.degToRad(-A.stowed.shoulder);
  registerPart(shoulder, { explodable: false });
  mount.add(shoulder);

  const upper = new THREE.Mesh(taperedBeam({ length: A.upper.length, ...beamBox(A.upper) }), M.steel);
  upper.name = `UpperArm_${arm.tag}_Mesh`;
  upper.castShadow = true;
  shoulder.add(registerPart(upper, { explode: [arm.side * 1.2, 0.2, 0.2] }));

  const elbowHub = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(A.elbow.radius, A.elbow.radius, A.elbow.width, 12).toNonIndexed()),
    M.detail,
  );
  elbowHub.name = `ElbowHub_${arm.tag}`;
  elbowHub.rotation.z = Math.PI / 2;
  elbowHub.position.z = A.upper.length;
  shoulder.add(registerPart(elbowHub, { explode: [arm.side * 1.4, 0.1, 0.4] }));

  const elbow = new THREE.Object3D();
  elbow.name = `Elbow_${arm.tag}_Pivot`;
  elbow.position.z = A.upper.length;
  elbow.rotation.x = THREE.MathUtils.degToRad(-A.stowed.elbow);
  registerPart(elbow, { explodable: false });
  shoulder.add(elbow);

  const fore = new THREE.Mesh(taperedBeam({ length: A.fore.length, ...beamBox(A.fore) }), M.steel);
  fore.name = `Forearm_${arm.tag}_Mesh`;
  fore.castShadow = true;
  elbow.add(registerPart(fore, { explode: [arm.side * 1.2, 0, 0.7] }));

  const forePlate = new THREE.Mesh(
    extrudeProfile(A.forePlate.profile, A.forePlate.width,
      { frontScale: A.forePlate.taper, backScale: A.forePlate.taper }), M.armour,
  );
  forePlate.name = `ForearmPlate_${arm.tag}`;
  elbow.add(registerPart(forePlate, { explode: [arm.side * 1.6, 0.2, 0.6] }));

  const wrist = new THREE.Object3D();
  wrist.name = `Wrist_${arm.tag}`;
  wrist.position.z = A.fore.length + BHDIM.hand.wristZ;
  registerPart(wrist, { explodable: false });
  elbow.add(wrist);
  wrist.add(buildHand(M, arm));

  const group = new THREE.Object3D();
  group.name = `${arm.name}_Group`;
  group.add(registerPart(pauldron, { explode: [arm.side * 1.8, 0.6, 0] }));
  group.add(socket);
  return group;
}

/**
 * A hand. Five fingers, two driven segments each, all off one GRIP slider.
 *
 * Curl is positive about X in the wrist frame, which folds the fingers toward the palm. The
 * thumb gets a fixed yaw on its own base node so it opposes the row instead of paralleling it —
 * without that, a five-finger hand reads as a rake.
 */
function buildHand(M, arm) {
  const H = BHDIM.hand;
  const t = H.rest / 100;

  const group = new THREE.Object3D();
  group.name = `Hand_${arm.tag}_Group`;

  const palm = new THREE.Mesh(
    finish(new THREE.BoxGeometry(H.palm.width, H.palm.height, H.palm.depth).toNonIndexed()), M.detail,
  );
  palm.name = `Palm_${arm.tag}_Mesh`;
  palm.position.z = H.palm.depth / 2;
  palm.castShadow = true;
  group.add(registerPart(palm, { explode: [arm.side * 1.4, -0.4, 0.9] }));

  const knuckle = new THREE.Mesh(
    finish(new THREE.BoxGeometry(H.knuckle.width, H.knuckle.height, H.knuckle.depth).toNonIndexed()),
    M.steel,
  );
  knuckle.name = `Knuckle_${arm.tag}_Mesh`;
  knuckle.position.z = H.palm.depth;
  group.add(registerPart(knuckle, { explode: [arm.side * 1.2, -0.6, 1.2] }));

  for (const f of H.fingers) {
    const prox = new THREE.Object3D();
    prox.name = `Finger_${arm.tag}${f.tag}_Prox`;
    prox.position.set(f.x, 0, H.palm.depth + H.knuckle.depth / 2);
    prox.rotation.x = THREE.MathUtils.degToRad(H.curl.proximal * t);
    registerPart(prox, { explodable: false });
    group.add(prox);

    const proxMesh = new THREE.Mesh(
      taperedBeam({ length: f.prox, w0: f.w, h0: f.w, w1: f.w * 0.88, h1: f.w * 0.88 }), M.steel,
    );
    proxMesh.name = `Finger_${arm.tag}${f.tag}_Prox_Mesh`;
    prox.add(registerPart(proxMesh, { explode: [f.x * 6, -0.5, 1.0] }));

    const dist = new THREE.Object3D();
    dist.name = `Finger_${arm.tag}${f.tag}_Dist`;
    dist.position.z = f.prox;
    dist.rotation.x = THREE.MathUtils.degToRad(H.curl.distal * t);
    registerPart(dist, { explodable: false });
    prox.add(dist);

    const distMesh = new THREE.Mesh(
      taperedBeam({ length: f.dist, w0: f.w * 0.86, h0: f.w * 0.86, w1: f.w * 0.6, h1: f.w * 0.6 }),
      M.detail,
    );
    distMesh.name = `Finger_${arm.tag}${f.tag}_Dist_Mesh`;
    dist.add(registerPart(distMesh, { explode: [f.x * 8, -0.7, 1.3] }));
  }

  // The thumb sits inboard of the finger row and is yawed across the palm. `-side` puts it on
  // the body side of each hand, which is the only reason the two hands are not identical.
  const T = H.thumb;
  const base = new THREE.Object3D();
  base.name = `Thumb_${arm.tag}_Base`;
  base.position.set(-arm.side * T.x, T.y, T.z);
  base.rotation.y = THREE.MathUtils.degToRad(-arm.side * T.yaw);
  registerPart(base, { explodable: false });
  group.add(base);

  const thumbProx = new THREE.Object3D();
  thumbProx.name = `Thumb_${arm.tag}_Prox`;
  thumbProx.rotation.x = THREE.MathUtils.degToRad(H.thumbCurl.proximal * t);
  registerPart(thumbProx, { explodable: false });
  base.add(thumbProx);

  const thumbProxMesh = new THREE.Mesh(
    taperedBeam({ length: T.prox, w0: T.w, h0: T.w, w1: T.w * 0.86, h1: T.w * 0.86 }), M.steel,
  );
  thumbProxMesh.name = `Thumb_${arm.tag}_Prox_Mesh`;
  thumbProx.add(registerPart(thumbProxMesh, { explode: [-arm.side * 1.2, -0.4, 0.8] }));

  const thumbDist = new THREE.Object3D();
  thumbDist.name = `Thumb_${arm.tag}_Dist`;
  thumbDist.position.z = T.prox;
  thumbDist.rotation.x = THREE.MathUtils.degToRad(H.thumbCurl.distal * t);
  registerPart(thumbDist, { explodable: false });
  thumbProx.add(thumbDist);

  const thumbDistMesh = new THREE.Mesh(
    taperedBeam({ length: T.dist, w0: T.w * 0.84, h0: T.w * 0.84, w1: T.w * 0.58, h1: T.w * 0.58 }),
    M.detail,
  );
  thumbDistMesh.name = `Thumb_${arm.tag}_Dist_Mesh`;
  thumbDist.add(registerPart(thumbDistMesh, { explode: [-arm.side * 1.5, -0.6, 1.1] }));

  return group;
}

function beamBox(s) {
  return { w0: s.w0, h0: s.h0, w1: s.w1, h1: s.h1 };
}
