import * as THREE from 'three';
import { MPDIM, overallWidth, rideLift, wheelLayout } from './dimensions.js';
import { crownedTyre, extrudeProfile, finish, taperedBeam, trackBand } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * MOTO // POD (R-POD) — two-wheel monocycle pod.
 *
 * The seventh subject, and the first that cannot stand up on its own. Everything structural
 * here follows from two facts about a hubless two-wheeler:
 *
 *   - **There is no axle.** Each wheel is an open ring, so the machine holds it by the rim.
 *     The arms grip the STATOR, which is what makes "which rings turn" a real distinction
 *     rather than a label: tyre, motor and mag-lev rotor hang off the spin pivot, the stator
 *     and the gyro sensor ring hang off the mount and stay put.
 *   - **It leans, and the roll axis is the road.** LEAN drives a pivot on the ground line, not
 *     on the body's centreline — roll a vehicle about its own middle and the tyres go through
 *     the tarmac. That gets it most of the way; the last 20 mm is the tyre crown, and it needs
 *     `afterArticulate`. See `updateMotopodRide`.
 *
 * What it did NOT cost is the more useful half. Four of the five rings on each wheel are
 * `trackBand` with a single circle in the list — the tank's track generator, which turns out
 * to have been "the taut band around a set of disks" all along, and a set of one disk is a
 * ring. No renderer change, no composite change, no chrome change.
 */
export function buildMotopod() {
  resetPartIds();
  const M = createMaterials();

  const root = new THREE.Object3D();
  root.name = 'MotoPod_Root';

  /**
   * Ride height, and it is not a constant.
   *
   * Written by `updateMotopodRide` from the lean angle. It has to sit ABOVE the lean pivot and
   * outside its rotation: the correction is a lift along world Y, and a child of the lean node
   * would lift along the leaned Y instead and be wrong by cos(lean) at exactly the angles it
   * matters.
   */
  const ride = new THREE.Object3D();
  ride.name = 'Ride_Height';
  registerPart(ride, { explodable: false });
  root.add(ride);

  // The roll axis is the ground contact line: origin on the road, on the centreline, so a
  // point at y = 0 stays at y = 0 through the whole lean.
  const lean = new THREE.Object3D();
  lean.name = 'Lean_Pivot';
  registerPart(lean, { explodable: false });
  ride.add(lean);

  lean.add(buildChassis(M));
  lean.add(buildCollision());

  const [front, rear] = wheelLayout();

  // The rear wheel and its swingarm hang straight off the lean frame.
  const rearMount = buildWheel(M, rear);
  lean.add(rearMount);
  lean.add(buildArm(M, rear));

  /**
   * Steering. Vertical, through the axle, so there is no rake and no trail.
   *
   * On a conventional machine that would be unrideable — caster is what makes a bike track
   * straight. This one declares DYNAMIC GYRO + AI ASSIST, and the geometric payoff is that the
   * front contact patch stays directly under the axis: a raked axis drags the patch sideways
   * and off the road every time the bar moves, which a schematic drawn at full lock would show
   * as a wheel hovering.
   */
  const steer = new THREE.Object3D();
  steer.name = 'Steer_Pivot';
  steer.position.set(0, MPDIM.wheel.radius, front.z);
  registerPart(steer, { explodable: false });
  lean.add(steer);

  const frontMount = buildWheel(M, front);
  frontMount.position.set(0, 0, 0);   // already at the axle: the steer pivot IS the axle centre
  steer.add(frontMount);
  steer.add(buildArm(M, front, true));

  const W = MPDIM.wheel;
  root.userData.joints = [
    {
      /**
       * Negated because a positive rotation about Z tips the top toward -X, and a rider who
       * asks for right lean means right. The sign convention is a fact about the machine, so
       * it lives here rather than in whoever is drawing it — same argument as the howitzer's
       * elevation.
       */
      key: 'lean', label: 'LEAN', unit: '°', min: -MPDIM.lean, max: MPDIM.lean, step: 0.5, value: 0,
      targets: [{ node: 'Lean_Pivot', axis: 'z', from: MPDIM.lean, to: -MPDIM.lean }],
    },
    {
      key: 'steer', label: 'STEER', unit: '°', min: -W.steer, max: W.steer, step: 0.5, value: 0,
      targets: [{ node: 'Steer_Pivot', axis: 'y', from: W.steer, to: -W.steer }],
    },
    {
      // Both wheels off one slider. They are the same diameter, so on a machine that is not
      // sliding they turn together by definition — two sliders would let the drawing show a
      // lock-up it has no way to mean.
      key: 'roll', label: 'WHEEL', unit: '°', min: 0, max: 360, step: 1, value: 0,
      targets: wheelLayout().map((w) => ({ node: `${w.name}_Spin`, axis: 'x', from: 0, to: 360 })),
    },
    {
      key: 'canopy', label: 'CANOPY', unit: '', min: 0, max: 100, step: 1, value: 0,
      targets: [{ node: 'Canopy_Pivot', axis: 'x', from: 0, to: MPDIM.canopy.open }],
    },
    {
      key: 'vector', label: 'THRUST VEC', unit: '°',
      min: -MPDIM.thruster.vector, max: MPDIM.thruster.vector, step: 0.5, value: 0,
      targets: [{ node: 'Thruster_Pivot', axis: 'x', from: -MPDIM.thruster.vector, to: MPDIM.thruster.vector }],
    },
  ];
  return root;
}

/**
 * Lift the machine as it leans, so both tyres stay on the road.
 *
 * Third subject in a row to need `afterArticulate`, and the first for a reason that has nothing
 * to do with legs — which is the interesting part. The walker's hull height and the exoframe's
 * both came out of a limb solve; this one comes out of the shape of a tyre. What the hook
 * actually generalises to is "any vehicle whose ground contact moves as it articulates", and a
 * tree of rotations cannot express that in any of the three cases.
 *
 * The number is small — 20 mm at full lean — and that is exactly why it needs a test rather
 * than an eye. See `rideLift` for the derivation.
 */
export function updateMotopodRide(root) {
  const ride = root.getObjectByName('Ride_Height');
  const lean = root.getObjectByName('Lean_Pivot');
  if (!ride || !lean) return;
  ride.position.y = rideLift((lean.rotation.z * 180) / Math.PI);
}

// --- wheels ----------------------------------------------------------------

/**
 * One wheel: a stack of concentric rings and a hole where the hub would be.
 *
 * Split across two parents rather than one, because on a hubless wheel that split is the
 * mechanism. The arms grip the stator, so the stator cannot turn; the motor drives the rim, so
 * the rim and the rotor do. Putting all five on the spin pivot would render identically at
 * rest and be wrong the moment anything moved.
 *
 * Geometry is rebuilt per wheel rather than shared between front and rear. Two meshes cloning
 * one geometry would share one part id, and the outline pass would stop drawing the seam
 * wherever the wheels overlap — which in the side elevation, on a machine this short, is often.
 */
function buildWheel(M, wheel) {
  const W = MPDIM.wheel;

  const mount = new THREE.Object3D();
  mount.name = `${wheel.name}_Mount`;
  if (!wheel.steers) mount.position.set(0, W.radius, wheel.z);
  registerPart(mount, { explodable: false });

  const fixed = new THREE.Object3D();
  fixed.name = `${wheel.name}_Fixed`;
  registerPart(fixed, { explodable: false });
  mount.add(fixed);

  const spin = new THREE.Object3D();
  spin.name = `${wheel.name}_Spin`;
  registerPart(spin, { explodable: false });
  mount.add(spin);

  // The tyre. The one ring that is not a track band — see crownedTyre.
  const tyre = new THREE.Mesh(
    crownedTyre({
      radius: W.radius, thickness: W.tyre.thickness, width: W.tyre.width, crown: W.tyre.crown,
      segments: W.segments, crownSteps: W.crownSteps,
    }),
    M.rubber,
  );
  tyre.name = `Tyre_${wheel.tag}`;
  tyre.castShadow = tyre.receiveShadow = true;
  spin.add(registerPart(tyre, { explode: [0, 0, wheel.steers ? 1.1 : -1.1] }));

  // The other four: one circle each, which is all a band around a set of disks needs.
  for (const ring of W.rings) {
    const mesh = new THREE.Mesh(
      trackBand([{ z: 0, y: 0, r: ring.r - ring.thickness }], {
        thickness: ring.thickness, width: ring.width, segments: W.ringSegments,
      }),
      ring.emissive ? (ring.emissive === 'primary' ? M.glow : M.glow2) : M.steel,
    );
    mesh.name = `${ring.tag}_${wheel.tag}`;
    mesh.castShadow = true;
    const host = ring.spins ? spin : fixed;
    host.add(registerPart(mesh, {
      explode: [0, 0.4 + ring.r, wheel.steers ? 0.6 : -0.6],
      emissive: ring.emissive,
    }));
  }

  return mount;
}

/**
 * The arm that holds a rim.
 *
 * It reaches the stator ring rather than an axle, because there is no axle to reach. On the
 * front it is a child of the steer pivot — the fork turns, the frame does not — and on the
 * rear it hangs off the lean frame directly.
 */
function buildArm(M, wheel, steered = false) {
  const A = steered ? MPDIM.arm.front : MPDIM.arm.rear;
  const W = MPDIM.wheel;

  const group = new THREE.Object3D();
  group.name = `Arm_${wheel.tag}_Group`;
  if (!steered) group.position.set(0, W.radius, wheel.z);
  registerPart(group, { explodable: false });

  // Two legs, one each side of the rim, gripping the stator's shoulders.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(taperedBeam({ length: A.length, ...beamBox(A) }), M.steel);
    leg.name = `Arm_${wheel.tag}_${side < 0 ? 'L' : 'R'}`;
    leg.position.x = side * MPDIM.arm.yokeWidth / 2;
    // Points inboard along the machine, back toward the chassis it hangs from.
    leg.rotation.y = steered ? Math.PI : 0;
    leg.castShadow = true;
    group.add(registerPart(leg, { explode: [side * 1.0, 0.5, 0] }));
  }

  const yoke = new THREE.Mesh(
    finish(new THREE.BoxGeometry(MPDIM.arm.yokeWidth + 0.10, 0.12, 0.16).toNonIndexed()), M.armour,
  );
  yoke.name = `Arm_${wheel.tag}_Yoke`;
  yoke.position.z = (steered ? -1 : 1) * (A.length + 0.06);
  group.add(registerPart(yoke, { explode: [0, 0.8, steered ? -0.5 : 0.5] }));

  return group;
}

// --- chassis ---------------------------------------------------------------

/**
 * The bodywork: four extrusions stacked at different heights and widths.
 *
 * None of them scales its caps. `extrudeProfile`'s frontScale/backScale shrink the whole ZY
 * profile about its centroid, so equal scales produce a straight prism of a SMALLER
 * silhouette rather than a sloped one — the howitzer's trail arms hit this and said so. Every
 * profile here is therefore the shape as drawn, and the ovoid front elevation comes from the
 * sponsons sitting proud of a narrow fairing rather than from a taper.
 */
function buildChassis(M) {
  const B = MPDIM.body;
  const group = new THREE.Object3D();
  group.name = 'Chassis_Group';

  const fairing = new THREE.Mesh(extrudeProfile(B.fairing.profile, B.fairing.width), M.armour);
  fairing.name = 'Fairing_Mesh';
  fairing.castShadow = fairing.receiveShadow = true;
  group.add(registerPart(fairing, { explodable: false }));

  // Side pods, the widest thing on the machine and the part the lean limit is measured from.
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(extrudeProfile(B.sponson.profile, B.sponson.width), M.armour);
    pod.name = `Sponson_${side < 0 ? 'L' : 'R'}`;
    pod.position.x = side * B.sponson.x;
    pod.castShadow = true;
    group.add(registerPart(pod, { explode: [side * 1.9, 0.2, 0] }));
  }

  const cowlF = new THREE.Mesh(extrudeProfile(B.cowlF.profile, B.cowlF.width), M.turret);
  cowlF.name = 'Cowl_F';
  cowlF.castShadow = true;
  group.add(registerPart(cowlF, { explode: [0, 0.5, 1.5] }));

  const cowlR = new THREE.Mesh(extrudeProfile(B.cowlR.profile, B.cowlR.width), M.turret);
  cowlR.name = 'Cowl_R';
  cowlR.castShadow = true;
  group.add(registerPart(cowlR, { explode: [0, 0.5, -1.5] }));

  const spine = new THREE.Mesh(
    finish(new THREE.BoxGeometry(B.spine.width, B.spine.height, B.spine.length).toNonIndexed()),
    M.steel,
  );
  spine.name = 'Spine_Mesh';
  spine.position.set(0, B.spine.y, B.spine.z);
  group.add(registerPart(spine, { explode: [0, 1.1, 0] }));

  const tray = new THREE.Mesh(
    finish(new THREE.BoxGeometry(B.underTray.width, B.underTray.height, B.underTray.length).toNonIndexed()),
    M.detail,
  );
  tray.name = 'UnderTray_Mesh';
  tray.position.set(0, B.underTray.y, B.underTray.z);
  group.add(registerPart(tray, { explode: [0, -1.2, 0] }));

  group.add(buildCockpit(M));
  group.add(buildCanopy(M));
  group.add(buildThruster(M));
  group.add(buildDetails(M));
  return group;
}

function buildCockpit(M) {
  const C = MPDIM.cockpit;
  const group = new THREE.Object3D();
  group.name = 'Cockpit_Group';

  const tub = new THREE.Mesh(
    finish(new THREE.BoxGeometry(C.tub.width, C.tub.height, C.tub.length).toNonIndexed()), M.turret,
  );
  tub.name = 'Cockpit_Tub';
  tub.position.set(0, C.tub.y, C.tub.z);
  group.add(registerPart(tub, { explode: [0, 0.9, -0.4] }));

  const seat = new THREE.Mesh(
    finish(new THREE.BoxGeometry(C.seat.width, C.seat.height, C.seat.length).toNonIndexed()), M.detail,
  );
  seat.name = 'Seat_Mesh';
  seat.position.set(0, C.seat.y, C.seat.z);
  group.add(registerPart(seat, { explode: [0, 1.2, -0.8] }));

  const yoke = new THREE.Mesh(
    finish(new THREE.BoxGeometry(C.yoke.width, C.yoke.height, C.yoke.depth).toNonIndexed()), M.steel,
  );
  yoke.name = 'Control_Yoke';
  yoke.position.set(0, C.yoke.y, C.yoke.z);
  group.add(registerPart(yoke, { explode: [0, 0.7, 1.1] }));

  // The holographic HUD is a plane in front of the rider, not a screen bonded to a surface —
  // it is the one part of this machine that is deliberately floating in mid-air.
  const hud = new THREE.Mesh(
    finish(new THREE.BoxGeometry(C.hud.width, C.hud.height, C.hud.depth).toNonIndexed()), M.glow,
  );
  hud.name = 'HUD_Panel';
  hud.position.set(0, C.hud.y, C.hud.z);
  hud.rotation.x = THREE.MathUtils.degToRad(C.hud.tilt);
  group.add(registerPart(hud, { explode: [0, 1.4, 1.4], emissive: 'primary' }));

  return group;
}

function buildCanopy(M) {
  const C = MPDIM.canopy;

  const pivot = new THREE.Object3D();
  pivot.name = 'Canopy_Pivot';
  pivot.position.set(0, C.hinge.y, C.hinge.z);
  registerPart(pivot, { explodable: false });

  // Authored in the chassis frame and then offset back by the hinge, so the profile table
  // stays readable as "where the canopy is on the machine" rather than as offsets from a hinge.
  const shell = new THREE.Mesh(
    extrudeProfile(C.profile.map(([z, y]) => [z - C.hinge.z, y - C.hinge.y]), C.width),
    M.turret,
  );
  shell.name = 'Canopy_Mesh';
  shell.castShadow = true;
  pivot.add(registerPart(shell, { explodable: false }));

  const frame = new THREE.Mesh(
    finish(new THREE.BoxGeometry(C.frame.width, C.frame.height, C.frame.depth).toNonIndexed()),
    M.steel,
  );
  frame.name = 'Canopy_Frame';
  frame.position.set(0, 0.02, 0.02);
  pivot.add(registerPart(frame, { explode: [0, 0.6, 0.9] }));

  return pivot;
}

function buildThruster(M) {
  const T = MPDIM.thruster;

  const pivot = new THREE.Object3D();
  pivot.name = 'Thruster_Pivot';
  pivot.position.set(0, T.housing.y, T.housing.z);
  registerPart(pivot, { explode: [0, 0, -1.6] });

  const housing = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(T.housing.radius, T.housing.radius * 1.06, T.housing.length, 14).toNonIndexed()),
    M.steel,
  );
  housing.name = 'Thruster_Housing';
  housing.rotation.x = Math.PI / 2;
  pivot.add(registerPart(housing, { explodable: false }));

  const nozzle = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(T.nozzle.r1, T.nozzle.r0, T.nozzle.length, 14).toNonIndexed()),
    M.detail,
  );
  nozzle.name = 'Thruster_Nozzle';
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = -(T.housing.length / 2 + T.nozzle.length / 2);
  pivot.add(registerPart(nozzle, { explode: [0, 0.3, -1.2] }));

  const core = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(T.core.radius, T.core.radius, T.core.length, 12).toNonIndexed()),
    M.glow,
  );
  core.name = 'Thruster_Core';
  core.rotation.x = Math.PI / 2;
  core.position.z = -(T.housing.length / 2 + T.nozzle.length - 0.02);
  pivot.add(registerPart(core, { explode: [0, 0.6, -2.0], emissive: 'primary' }));

  return pivot;
}

function buildDetails(M) {
  const S = MPDIM.shell;
  const group = new THREE.Object3D();
  group.name = 'Details_Group';

  const nose = new THREE.Mesh(
    finish(new THREE.BoxGeometry(S.lightArray.width, S.lightArray.height, S.lightArray.depth).toNonIndexed()),
    M.glow2,
  );
  nose.name = 'Light_Array_F';
  nose.position.set(0, S.lightArray.y, S.lightArray.z);
  group.add(registerPart(nose, { explode: [0, 0.3, 1.8], emissive: 'secondary' }));

  const tail = new THREE.Mesh(
    finish(new THREE.BoxGeometry(S.tailLight.width, S.tailLight.height, S.tailLight.depth).toNonIndexed()),
    M.glow,
  );
  tail.name = 'Light_Array_R';
  tail.position.set(0, S.tailLight.y, S.tailLight.z);
  group.add(registerPart(tail, { explode: [0, 0.3, -1.8], emissive: 'primary' }));

  // The long light lines, which are most of what the reference sheet actually draws. Mirrored,
  // unlike the Hepta-T's stowage: these are fitted lighting, not things a crew accumulated.
  S.strips.forEach((st, i) => {
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(
        finish(new THREE.BoxGeometry(st.width, st.height, st.length).toNonIndexed()), M.glow2,
      );
      strip.name = `Light_Strip_${i + 1}${side < 0 ? 'L' : 'R'}`;
      strip.position.set(side * st.x, st.y, st.z);
      group.add(registerPart(strip, { explode: [side * 1.6, 0.2, 0], emissive: 'secondary' }));
    }
  });

  // Magnetic access hatch, one flank only. A pod with a matched pair of service hatches reads
  // as decoration; one reads as the side you open.
  const hatch = new THREE.Mesh(
    finish(new THREE.BoxGeometry(S.hatch.width, S.hatch.height, S.hatch.depth).toNonIndexed()),
    M.detail,
  );
  hatch.name = 'Access_Hatch';
  hatch.position.set(-S.hatch.x, S.hatch.y, S.hatch.z);
  group.add(registerPart(hatch, { explode: [-1.7, 0, 0] }));

  const cell = new THREE.Mesh(
    finish(new THREE.BoxGeometry(S.energyCell.width, S.energyCell.height, S.energyCell.length).toNonIndexed()),
    M.armour,
  );
  cell.name = 'EnergyCell_Mesh';
  cell.position.set(0, S.energyCell.y, S.energyCell.z);
  group.add(registerPart(cell, { explode: [0, -0.9, -1.2] }));

  // Gyro stabilisation unit: a flywheel, so it is a disc on the machine's own roll axis. It is
  // the reason the steering has no rake to fall back on.
  const gyro = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(S.gyro.radius, S.gyro.radius, S.gyro.width, 16).toNonIndexed()),
    M.detail,
  );
  gyro.name = 'Gyro_Unit_Mesh';
  gyro.rotation.z = Math.PI / 2;
  gyro.position.set(0, S.gyro.y, S.gyro.z);
  group.add(registerPart(gyro, { explode: [0, -1.1, 0.6] }));

  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(
      taperedBeam({ length: S.fin.length, w0: S.fin.w0, h0: S.fin.h0, w1: S.fin.w1, h1: S.fin.h1 }),
      M.armour,
    );
    fin.name = `Fin_${side < 0 ? 'L' : 'R'}`;
    fin.position.set(side * S.fin.x, S.fin.y, S.fin.z);
    // Swept back and canted outward — the rear elevation's whole silhouette.
    fin.rotation.y = THREE.MathUtils.degToRad(180 - side * S.fin.cant);
    fin.castShadow = true;
    group.add(registerPart(fin, { explode: [side * 1.4, 0.5, -0.8] }));
  }

  return group;
}

function buildCollision() {
  const geom = new THREE.BoxGeometry(overallWidth() * 0.62, 0.92, 2.10);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Chassis_Collision';
  mesh.position.set(0, 0.50, -0.04);
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}

function beamBox(s) {
  return { w0: s.w0, h0: s.h0, w1: s.w1, h1: s.h1 };
}
