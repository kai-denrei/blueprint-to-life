import * as THREE from 'three';
import { GDIM, payloadRadius, ringStack, seatOnBall } from './dimensions.js';
import { cableRun, extrudeProfile, finish, taperedBeam, trackBand } from '../lib/geometry.js';
import { createMaterials } from '../lib/materials.js';
import { registerPart, resetPartIds } from '../lib/parts.js';

/**
 * GS-3 — three-axis stabilised gimbal platform.
 *
 * Twelve rings in three concentric sets about one point, on three perpendicular axes, with a
 * sensor ball at the centre.
 *
 * The thing that makes it a gimbal rather than three slew bearings stacked up: **each ring
 * pivots about its own diameter**, so its axis lies in its own plane and the ring outside it
 * has to be large enough to let it swing through. That single fact drives the whole geometry —
 * an inner set sweeps a sphere of its own outer radius, so every radius on the machine falls
 * out of `ringStack` rather than being typed, and there is an invariant that drives all three
 * stages through their travel and measures the clearance on real vertices.
 *
 * What it cost the pipeline: nothing. Every one of the twelve rings is `trackBand` with a
 * single circle in the list — the tank's track generator, for the third subject running. The
 * only orientation trick is that a ring's plane is perpendicular to its own pivot axis, which
 * is a fixed rotation on the mesh and a fact about the machine rather than a rendering concern.
 */
export function buildGimbal() {
  resetPartIds();
  const M = createMaterials();
  const stack = ringStack();
  const L = GDIM.limits;

  const root = new THREE.Object3D();
  root.name = 'Gimbal_Root';

  root.add(buildFrame(M, stack[0]));
  root.add(buildCollision());

  /**
   * The three stages, nested. Every pivot sits at the origin of its parent's frame, which is
   * what "concentric" actually means here — all twelve rings share one centre at every pose,
   * and a pivot placed anywhere else would be a gimbal that wobbles.
   */
  const stagePivots = [];
  let host = root;
  stack.forEach((stage, i) => {
    const pivot = new THREE.Object3D();
    pivot.name = `Stage_${stage.tag}_Pivot`;
    if (i === 0) pivot.position.y = GDIM.centre.y;
    registerPart(pivot, { explodable: false });
    host.add(pivot);
    stagePivots.push(pivot);

    for (const ring of stage.rings) {
      const mesh = new THREE.Mesh(
        trackBand([{ z: 0, y: 0, r: ring.inner }], {
          thickness: ring.r - ring.inner, width: ring.width, segments: GDIM.segments,
        }),
        ring.emissive ? (ring.emissive === 'primary' ? M.glow : M.glow2) : M.steel,
      );
      mesh.name = ring.name;
      // trackBand builds about X. Turn it so the ring's plane contains this stage's pivot axis.
      if (stage.ringAxis === 'y') mesh.rotation.z = Math.PI / 2;
      if (stage.ringAxis === 'z') mesh.rotation.y = Math.PI / 2;
      mesh.castShadow = true;
      pivot.add(registerPart(mesh, {
        // Explode outward along the ring's own axis, so the three sets pull apart into three
        // stacks rather than into one pile.
        explode: axisVector(stage.ringAxis, 0.9 + ring.r),
        emissive: ring.emissive,
      }));
    }

    /**
     * The slip ring for this axis.
     *
     * A gimbal cannot be dressed with a cable loom: nothing can cross three axes that each turn
     * continuously without either winding up or tearing. Every stage therefore passes its power
     * and data through a rotary contact on its own axis, which is why there is no loom anywhere
     * on this machine and why the only dress-out is on the fixed frame. The exoframe's rule —
     * a cable run stays inside one rigid frame — has no solution here at all, so the machine
     * uses different hardware rather than a hose drawn hopefully across a joint.
     */
    const collar = new THREE.Mesh(
      trackBand([{ z: 0, y: 0, r: stage.bore * 0.42 }], {
        thickness: 0.016, width: 0.030, segments: 20,
      }),
      M.glow2,
    );
    collar.name = `Slip_Ring_${stage.tag}`;
    if (stage.pivot === 'y') collar.rotation.z = Math.PI / 2;
    if (stage.pivot === 'z') collar.rotation.y = Math.PI / 2;
    pivot.add(registerPart(collar, {
      explode: axisVector(stage.pivot, 1.4), emissive: 'secondary',
    }));

    // The bosses that carry the NEXT stage, on this stage's bore, along that stage's pivot.
    const next = stack[i + 1];
    if (next) {
      for (const side of [-1, 1]) {
        const boss = new THREE.Mesh(
          finish(new THREE.CylinderGeometry(
            GDIM.frame.stageBoss.radius, GDIM.frame.stageBoss.radius,
            GDIM.frame.stageBoss.length, 12,
          ).toNonIndexed()),
          M.detail,
        );
        boss.name = `Boss_${stage.tag}_${side < 0 ? 'N' : 'P'}`;
        orientAlong(boss, next.pivot);
        boss.position.copy(new THREE.Vector3(...axisVector(next.pivot, side * stage.bore)));
        pivot.add(registerPart(boss, { explode: axisVector(next.pivot, side * 1.6) }));
      }
    }
    host = pivot;
  });

  stagePivots[2].add(buildPayload(M));

  root.userData.joints = [
    {
      key: 'azimuth', label: 'AZIMUTH', unit: '°', min: -L.azimuth, max: L.azimuth, step: 1, value: 0,
      targets: [{ node: 'Stage_A_Pivot', axis: 'y', from: -L.azimuth, to: L.azimuth }],
    },
    {
      /**
       * The axis that decides whether this machine works. At +/-90 the elevation axis lies on
       * the azimuth axis and the platform loses a degree of freedom; the declared travel stops
       * 18 short of that. See `axisIndependence`.
       */
      key: 'bank', label: 'BANK', unit: '°', min: -L.bank, max: L.bank, step: 0.5, value: 0,
      targets: [{ node: 'Stage_B_Pivot', axis: 'z', from: -L.bank, to: L.bank }],
    },
    {
      // Negated: a positive rotation about X pitches the optical axis DOWN, and a gunner who
      // asks for +30 means up. Same inversion the howitzer carries, for the same reason.
      key: 'elevation', label: 'ELEVATION', unit: '°',
      min: -L.elevation, max: L.elevation, step: 0.5, value: 0,
      targets: [{ node: 'Stage_C_Pivot', axis: 'x', from: L.elevation, to: -L.elevation }],
    },
  ];
  return root;
}

/** A three-component vector with `v` on the named axis and zero elsewhere. */
function axisVector(axis, v) {
  return [axis === 'x' ? v : 0, axis === 'y' ? v : 0, axis === 'z' ? v : 0];
}

/** Point a Y-axis primitive (cylinder) along the named world axis. */
function orientAlong(mesh, axis) {
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
}

// --- frame -----------------------------------------------------------------

/**
 * Pedestal up to the south pole, arch over to the north.
 *
 * The outer stage pivots about a vertical diameter, so its bearings are at the top and bottom
 * of its own ring — which is why this frame has to reach over the whole assembly instead of
 * just holding it up. A gimbal you can support from underneath alone is one whose outer ring
 * does not pivot about a diameter, and then it is not this machine.
 */
function buildFrame(M, outerStage) {
  const F = GDIM.frame;
  const group = new THREE.Object3D();
  group.name = 'Frame_Group';

  const plate = new THREE.Mesh(
    finish(new THREE.BoxGeometry(F.plate.width, F.plate.height, F.plate.depth).toNonIndexed()),
    M.armour,
  );
  plate.name = 'Base_Plate';
  plate.position.y = F.plate.height / 2;
  plate.receiveShadow = true;
  group.add(registerPart(plate, { explodable: false }));

  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    const pad = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(F.boltPad.radius, F.boltPad.radius, F.boltPad.height, 10).toNonIndexed()),
      M.steel,
    );
    pad.name = `Bolt_Pad_${i + 1}`;
    pad.position.set(sx * F.boltPad.x, F.plate.height + F.boltPad.height / 2, sz * F.boltPad.z);
    group.add(registerPart(pad, { explode: [sx * 1.4, -0.5, sz * 1.4] }));
  });

  const pedestal = new THREE.Mesh(extrudeProfile(F.pedestal, F.pedestalWidth), M.armour);
  pedestal.name = 'Pedestal_Mesh';
  pedestal.castShadow = true;
  group.add(registerPart(pedestal, { explode: [0, -0.8, 0] }));

  const poleY = outerStage.outerRadius;
  const capY = GDIM.centre.y + poleY;

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      taperedBeam({ length: capY - F.plate.height, ...F.post }), M.steel,
    );
    post.name = `Post_${side < 0 ? 'L' : 'R'}`;
    post.position.set(side * F.postX, F.plate.height, 0);
    post.rotation.x = -Math.PI / 2;      // the beam runs along +Z; stand it up
    post.castShadow = true;
    group.add(registerPart(post, { explode: [side * 1.5, 0, 0] }));
  }

  const cap = new THREE.Mesh(
    finish(new THREE.BoxGeometry(2 * F.postX + F.post.w1, F.capBar.height, F.capBar.depth).toNonIndexed()),
    M.armour,
  );
  cap.name = 'Cap_Bar';
  cap.position.y = capY;
  cap.castShadow = true;
  group.add(registerPart(cap, { explode: [0, 1.4, 0] }));

  // The two bearings the azimuth stage turns in, on its own poles.
  for (const [tag, y] of [['South', GDIM.centre.y - poleY], ['North', capY]]) {
    const boss = new THREE.Mesh(
      finish(new THREE.CylinderGeometry(F.bearingBoss.radius, F.bearingBoss.radius, F.bearingBoss.length, 14).toNonIndexed()),
      M.detail,
    );
    boss.name = `Bearing_${tag}`;
    boss.position.y = y;
    group.add(registerPart(boss, { explode: [0, tag === 'North' ? 1.7 : -1.7, 0] }));
  }

  group.add(buildDetails(M));
  return group;
}

/**
 * Dress-out, all of it on the fixed frame.
 *
 * There is nothing on the moving assembly to dress: see the slip rings in `buildGimbal`. What
 * is left is what any bolted-down machine carries — a junction box where the cable arrives, a
 * conduit up the pedestal to the south bearing, and a data plate.
 */
function buildDetails(M) {
  const F = GDIM.frame;
  const group = new THREE.Object3D();
  group.name = 'Details_Group';

  const box = new THREE.Mesh(
    finish(new THREE.BoxGeometry(0.20, 0.16, 0.11).toNonIndexed()), M.detail,
  );
  box.name = 'Junction_Box';
  box.position.set(-0.34, 0.20, 0.30);
  group.add(registerPart(box, { explode: [-1.6, 0.2, 1.0] }));

  const conduit = new THREE.Mesh(
    cableRun([
      [-0.34, 0.24, 0.26], [-0.22, 0.30, 0.14], [-0.06, 0.36, 0.06], [0.0, 0.40, 0.0],
    ], { radius: 0.024 }),
    M.rubber,
  );
  conduit.name = 'Pedestal_Conduit';
  group.add(registerPart(conduit, { explode: [-1.2, 0.6, 0.6] }));

  const plate = new THREE.Mesh(
    finish(new THREE.BoxGeometry(0.16, 0.012, 0.09).toNonIndexed()), M.steel,
  );
  plate.name = 'Data_Plate';
  plate.position.set(0.34, F.plate.height + 0.006, 0.30);
  group.add(registerPart(plate, { explode: [1.5, 0.3, 1.0] }));

  return group;
}

// --- payload ---------------------------------------------------------------

/**
 * The sensor ball, at the centre.
 *
 * Its radius is not authored — it is whatever the innermost bore leaves after clearance, which
 * is the last link in the same chain that placed the twelve rings. Grow a ring band anywhere in
 * the table and the ball shrinks to suit; nothing has to be re-typed and nothing silently ends
 * up inside a ring.
 *
 * It is deliberately kept inside that bore rather than poking an aperture snout out through the
 * rings. A real director does exactly that, but a snout sweeps its own sphere against two sets
 * of rings and would make the clearance rule a special case instead of one line.
 */
function buildPayload(M) {
  const P = GDIM.payload;
  const r = payloadRadius();

  const group = new THREE.Object3D();
  group.name = 'Payload_Group';

  const ball = new THREE.Mesh(
    finish(new THREE.SphereGeometry(r, 20, 14).toNonIndexed()), M.turret,
  );
  ball.name = 'Sensor_Ball';
  ball.castShadow = true;
  group.add(registerPart(ball, { explodable: false }));

  // The optical aperture, on the ball's +Z face — the axis every angle on the drawing is
  // measured against.
  const apertureR = r * P.apertureRatio;
  const aperture = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(apertureR, apertureR * 0.92, P.apertureDepth, 18).toNonIndexed()),
    M.glow,
  );
  aperture.name = 'Aperture_Mesh';
  aperture.rotation.x = Math.PI / 2;
  // Seated so its rim lands on the ball rather than proud of it — see `seatOnBall`.
  aperture.position.z = seatOnBall(apertureR, P.apertureDepth);
  group.add(registerPart(aperture, { explode: [0, 0, 2.2], emissive: 'primary' }));

  const bezelR = apertureR * 1.08;
  const ring = new THREE.Mesh(
    finish(new THREE.CylinderGeometry(bezelR, bezelR, 0.014, 18).toNonIndexed()), M.steel,
  );
  ring.name = 'Aperture_Ring';
  ring.rotation.x = Math.PI / 2;
  ring.position.z = seatOnBall(bezelR, 0.014);
  group.add(registerPart(ring, { explode: [0, 0, 1.8] }));

  // Radiator fins on the flanks. Sized off the ball so they cannot outgrow the bore.
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(
      finish(new THREE.BoxGeometry(P.fin.width, P.fin.height, P.fin.depth).toNonIndexed()),
      M.detail,
    );
    fin.name = `Radiator_${side < 0 ? 'L' : 'R'}`;
    fin.position.x = side * r * P.finRatio;
    group.add(registerPart(fin, { explode: [side * 1.9, 0, 0] }));
  }

  return group;
}

/**
 * Collision proxy: the frame's footprint.
 *
 * Like the arm's, this bounds the static structure and not the articulation. A box around the
 * gimbal sphere would be mostly the air the rings swing through, which is the one volume
 * nothing is allowed to occupy.
 */
function buildCollision() {
  const F = GDIM.frame;
  const geom = new THREE.BoxGeometry(F.plate.width, 0.44, F.plate.depth);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true }));
  mesh.name = 'Base_Collision';
  mesh.position.y = 0.22;
  mesh.visible = false;
  mesh.userData.isCollision = true;
  return mesh;
}
