/**
 * Heptapod Walker — autonomous sentry platform. Every dimension in one place, in metres.
 *
 * Axis convention as always: +X right, +Y up, +Z forward. Ground plane y = 0, and this one
 * stands on it — on eight feet.
 *
 * On the name: HEPTAPOD is the programme designation, not a leg count. The reference sheet the
 * brief came from labels the machine "Heptapod", annotates its leg callout "(7x)", and then
 * draws eight legs. The brief resolves it in favour of the drawing — eight legs, arachnid
 * layout — so the designation is carried as a name and the leg count is stated on its own line
 * in the title block. Splitting the difference at seven and a half was not available.
 *
 * Design brief, in the order it constrains things:
 *
 *   arachnid    Four legs a side, hips fanned fore-and-aft rather than in a straight rank, so
 *               the plan view is a splay and not a millipede. Knees rise above the hull; the
 *               lower limb is long and close to vertical. That silhouette is the whole read.
 *   sentry      It is a gun that walks, not a vehicle with a gun on it. The hull exists to hold
 *               the turret ring, the reactor and the sensor head off the ground, and it is
 *               small — most of the machine's volume is legs.
 *   static and  Hence two body joints and no wheels: STANCE folds the legs from a hull-down
 *   mobile      crouch to a full climb extension, and STRIDE swings the two tetrapod sets in
 *               opposition. See the pose table below.
 *
 * Nothing here is a claim about a machine that exists. The figures are internally consistent
 * and land on the reference sheet's own headline numbers — 3.90 m across the feet, 3.92 m fore
 * and aft, 2.85 m to the top of the sensor head — because those came out of the leg solve, not
 * because they were typed in. See `legSolve()`.
 */
export const HPDIM = {
  /**
   * The hull. Small on purpose: a faceted core carrying the ring, the reactor and the AI case.
   * Its ride height is NOT authored — see `legSolve()`; it is whatever the current leg pose
   * puts it at, which is the point of a walker.
   */
  body: {
    width: 1.30,
    taper: 0.66,          // cap scale, so the flanks slope in top and bottom
    // Side profile (z, y) about the hull's own centre, which sits `hullY` above the hip line.
    profile: [
      [-0.98, -0.08], [-0.76, -0.30], [0.74, -0.30], [0.98, -0.06],
      [0.98, 0.14], [0.72, 0.36], [-0.74, 0.36], [-0.98, 0.16],
    ],
    hullY: 0.10,
    deck: { width: 0.92, height: 0.10, length: 1.34, y: 0.40, z: -0.12 },
    aiCore: { width: 0.62, height: 0.26, length: 0.54, y: 0.50, z: -0.62 },
    reactor: { radius: 0.30, height: 0.34, y: -0.32 },
    // Active cloaking emitters, [x, y, z] around the hull rim. Eight, alternating flanks and
    // ends, because the emitters are the one thing on the machine that has to be everywhere.
    cloakEmitters: [
      [-0.60, 0.20, 0.86], [0.60, 0.20, 0.86], [-0.70, 0.04, 0.10], [0.70, 0.04, 0.10],
      [-0.70, 0.04, -0.52], [0.70, 0.04, -0.52], [-0.52, 0.24, -0.92], [0.52, 0.24, -0.92],
    ],
    emitterSize: [0.13, 0.07, 0.13],
  },

  /**
   * Legs. Three driven pivots each — coxa, femur, tibia — hanging off a fixed mount that
   * carries the hip's fan angle, plus a yaw pivot between them for the stride.
   *
   * The mount's frame is the one everything below is authored in: after its yaw, +Z points
   * outboard along the leg and a positive rotation about X swings the limb DOWN. So a pose is
   * three absolute angles from that frame and the scene graph stores their differences.
   */
  leg: {
    hipX: 0.56,
    // Hip stations front to back: [z, fan]. Fan is degrees forward of straight-outboard, so
    // the outer pairs rake fore and aft and the plan view splays.
    hips: [[1.05, 40], [0.44, 14], [-0.36, -14], [-1.03, -40]],
    coxa: 0.34,
    femur: 0.96,
    tibia: 2.20,

    /**
     * The pose table. Absolute limb angles in the mount frame, positive = down.
     *
     * `neutral` is not a third authored pose — it is the midpoint of the other two, which is
     * what makes a single STANCE slider land on the machine's rest posture at half travel
     * without the viewer knowing anything about legs. `legSolve` is the only thing that turns
     * these into a ride height, and an invariant holds the midpoint relation.
     */
    pose: {
      crouch: [0, -64, 64],       // hull-down, feet splayed wide — static mode
      neutral: [-12, -30, 83],
      extend: [-24, 4, 102],      // tall, feet tucked under — climb mode
    },

    strideSwing: 14,              // degrees of hip yaw either side of centre

    // Segment cross-sections, near end then far end. The femur is cranked upward at the knee
    // so the joint reads as a joint rather than as a bend in one long stick.
    coxaBox: { w0: 0.30, h0: 0.30, w1: 0.24, h1: 0.26 },
    femurBox: { w0: 0.24, h0: 0.30, w1: 0.17, h1: 0.22, dy: 0.03 },
    tibiaBox: { w0: 0.17, h0: 0.22, w1: 0.11, h1: 0.13 },
    strut: { radius: 0.045, length: 0.62 },      // shock absorber, coxa to femur
    knee: { radius: 0.13, width: 0.30 },

    foot: {
      padRadius: 0.19,
      padHeight: 0.12,           // hangs below the ankle; this is what sets the ride height
      glow: { radius: 0.13, height: 0.035 },
      terrainSensor: [0.10, 0.09, 0.14],
      sensorY: 0.30,             // up the tibia from the ankle
    },
  },

  /** Gyro-stabilised ring, and the turret it carries. Continuous traverse, so no stops. */
  turret: {
    ringY: 0.44,                 // above the hip line, i.e. on top of the hull
    ringRadius: 0.42,
    ringHeight: 0.09,
    width: 0.78,
    profile: [
      [-0.52, 0.00], [-0.56, 0.16], [-0.30, 0.42], [0.34, 0.44], [0.56, 0.24], [0.50, 0.00],
    ],
    trunnionY: 0.22,
    trunnionZ: 0.16,
    limits: { azimuth: [-180, 180], elevation: [-35, 90] },
    // Sensor head sits BEHIND the trunnion on purpose: at +90 the gun stands straight up and
    // anything mounted over the trunnion would be inside the barrel.
    // Head heights are not free: the lidar's crown is the highest point on the machine and the
    // title block quotes it, so these two lines are what "2.85 m tall" actually means.
    sensorHead: { width: 1.02, height: 0.28, length: 0.58, y: 0.36, z: -0.35 },
    sensorFace: { width: 0.74, height: 0.12, depth: 0.04, y: 0.38, z: -0.66 },
    lidar: { radius: 0.15, height: 0.16, y: 0.577, z: -0.35 },
    ammoDrum: { radius: 0.21, width: 0.24, x: -0.44, y: 0.20, z: -0.16 },
  },

  /**
   * 30 mm electromagnetic rail gun with coil assist. A rail gun is a square-section pair of
   * rails, not a tube, so it is authored as beams rather than as a lathe — the one place this
   * subject deliberately does not look like the tanks.
   */
  weapon: {
    length: 2.60,
    body: { w0: 0.26, h0: 0.24, w1: 0.19, h1: 0.17 },
    rail: { width: 0.05, height: 0.06, offset: 0.105 },   // two of them, either side of the bore
    railGlow: { width: 0.035, height: 0.035 },
    coilRings: [0.42, 0.86, 1.30, 1.74, 2.18],
    coil: { width: 0.30, height: 0.26, depth: 0.07 },
    muzzle: { length: 0.22, w0: 0.22, h0: 0.20, w1: 0.26, h1: 0.22 },
    breech: { width: 0.34, height: 0.30, length: 0.42 },
  },

  /**
   * Auxiliary manipulator arm — one, on the right flank.
   *
   * Deliberately not mirrored. A sentry with a matched pair of arms reads as a product render;
   * one arm reads as a machine that was given a tool. Same argument the Hepta-T's stowage makes,
   * applied to a fitted part rather than to cargo.
   */
  arm: {
    base: { x: 0.66, y: -0.02, z: 0.30, yaw: 22 },
    upper: { length: 0.60, w0: 0.16, h0: 0.16, w1: 0.13, h1: 0.13 },
    fore: { length: 0.52, w0: 0.13, h0: 0.13, w1: 0.09, h1: 0.10 },
    jaw: { length: 0.20, w0: 0.05, h0: 0.09, w1: 0.04, h1: 0.05, spread: 0.06 },
    stowed: { shoulder: -110, elbow: 150 },
    deployed: { shoulder: 15, elbow: 40 },
  },

  limits: { stance: 100, stride: 100, arm: 100 },
};

/**
 * Turn a pose into the two numbers everything else is derived from.
 *
 * `drop` is how far the ankle falls below the hip, `reach` how far outboard it lands. Ride
 * height is `drop + padHeight` and is therefore a consequence of the leg pose, not a figure
 * anyone typed — which is exactly the difference between a walker and a hull on wheels. It is
 * also why the walker needs `afterArticulate`: fold the legs and the hull has to come down with
 * them, and no parent transform in the graph expresses that.
 *
 * @param {[number,number,number]} pose  absolute limb angles, degrees, positive = down
 */
export function legSolve(pose = HPDIM.leg.pose.neutral) {
  const L = [HPDIM.leg.coxa, HPDIM.leg.femur, HPDIM.leg.tibia];
  const rad = (d) => (d * Math.PI) / 180;
  let drop = 0, reach = 0, kneeRise = 0;
  pose.forEach((angle, i) => {
    drop += L[i] * Math.sin(rad(angle));
    reach += L[i] * Math.cos(rad(angle));
    if (i < 2) kneeRise -= L[i] * Math.sin(rad(angle));
  });
  return {
    drop,
    reach,
    kneeRise,                                     // knee height above the hip line
    hipHeight: drop + HPDIM.leg.foot.padHeight,   // = ride height
  };
}

/** Relative pivot angles for a pose — what the scene graph actually stores. */
export function poseToPivots(pose) {
  return [pose[0], pose[1] - pose[0], pose[2] - pose[1]];
}

/**
 * The eight legs, front to back, left then right.
 *
 * `tetrad` is the gait set: alternating tetrapod, so the four legs of one set swing while the
 * four of the other stand. Diagonal opposition on each side is what keeps a static-stable
 * machine static-stable mid-stride, and it is one line here rather than a table because the
 * pattern is just a parity.
 */
export function legLayout() {
  const out = [];
  HPDIM.leg.hips.forEach(([z, fan], index) => {
    for (const side of [-1, 1]) {
      const tag = `${index + 1}${side < 0 ? 'L' : 'R'}`;
      out.push({
        name: `Leg_${tag}`,
        tag, index, side, fan,
        x: side * HPDIM.leg.hipX,
        z,
        // Mount yaw: +Z has to point outboard, which is ±90° off forward, minus the fan.
        yaw: side * (90 - fan),
        tetrad: (index + (side < 0 ? 0 : 1)) % 2 === 0 ? 'A' : 'B',
      });
    }
  });
  return out;
}

/** Foot centres at a given pose — used for the span figures and by the stance invariant. */
export function footPositions(pose = HPDIM.leg.pose.neutral) {
  const { reach } = legSolve(pose);
  return legLayout().map((l) => {
    const yaw = (l.yaw * Math.PI) / 180;
    return { ...l, footX: l.x + reach * Math.sin(yaw), footZ: l.z + reach * Math.cos(yaw) };
  });
}

/** Overall span across the feet: [width, length]. */
export function footSpan(pose = HPDIM.leg.pose.neutral) {
  const feet = footPositions(pose);
  const xs = feet.map((f) => f.footX), zs = feet.map((f) => f.footZ);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)];
}
