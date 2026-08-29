/**
 * RA-6 — six-axis articulated robot arm. Every dimension in one place, in metres.
 *
 * Axis convention as always: +X right, +Y up, +Z forward. The arm is bolted to y = 0 and
 * everything above it swings.
 *
 * Design brief, in the order it constrains things:
 *
 *   six axes    J1 swing, J2 shoulder, J3 elbow, J4 forearm roll, J5 wrist pitch, J6 flange
 *               roll. All six are real nodes at real mechanical origins, because the point of
 *               exporting this is that something else can drive them.
 *   aim the     The brief for this subject was to make the head easy to point. So the sliders
 *   head        are NOT the axes. SWING and TOOL PITCH are the head's compass bearing and its
 *               elevation, in world terms, and they hold while the arm moves underneath them:
 *               drag SHOULDER or ELBOW through their whole travel and the head keeps aiming
 *               exactly where it was told to. J1 and J5 are solved from that command rather
 *               than typed into it. See `solveAim`.
 *   honest      An arm has poses it cannot reach, and a schematic that silently fudges one is
 *   envelope    worse than one that cannot make the promise. The declared ranges here are
 *               chosen so the wrist can ALWAYS hold the commanded aim — `sin(pitch) <=
 *               cos(roll)` falls straight out of the solve — and there is an invariant that
 *               says so rather than a clamp that hides it.
 *
 * Nothing here is a claim about a robot that exists. The proportions are those of a mid-size
 * industrial arm: 1.82 m reach, 2.34 m to the flange at full extension.
 */
export const RADIM = {
  /** Bolted footprint. The one part of the machine that never moves. */
  base: {
    plate: { width: 0.68, height: 0.05, depth: 0.60 },
    // Bolt pads at the plate corners, inset so the plate reads as a casting rather than a slab.
    boltPad: { radius: 0.055, height: 0.03, x: 0.26, z: 0.22 },
    // The J1 slew bearing. Its teeth are not modelled; the ring is.
    ring: { radius: 0.24, height: 0.07, y: 0.085 },
    // The turret casting that carries the shoulder, as a side profile (z, y) extruded along X.
    width: 0.36,
    profile: [
      [-0.20, 0.12], [-0.23, 0.30], [-0.15, 0.50], [0.15, 0.50], [0.23, 0.28], [0.20, 0.12],
    ],
    statusRing: { radius: 0.245, height: 0.022, y: 0.125 },
  },

  /**
   * The arm proper. Lengths are between axis centres, which is what a reach figure means and
   * what anyone rigging this on the other side will measure.
   */
  arm: {
    shoulderY: 0.52,          // J2 axis height above the mounting face
    shoulderZ: 0.0,           // J2 sits on the J1 axis: no shoulder offset on this pattern
    upper: 0.78,              // J2 -> J3
    fore: 0.74,               // J3 -> J4
    wrist: 0.18,              // J4 -> J5
    flange: 0.12,             // J5 -> J6 face

    shoulderBoss: { radius: 0.16, width: 0.44 },
    cheek: { width: 0.09, height: 0.34, depth: 0.30, x: 0.175, y: 0.46 },
    upperBox: { w0: 0.24, h0: 0.30, w1: 0.20, h1: 0.24 },
    upperRib: { width: 0.05, height: 0.07, length: 0.56, y: 0.17, z: 0.12 },
    elbowHousing: { radius: 0.155, width: 0.38 },
    elbowMotor: { radius: 0.095, length: 0.20, x: 0.25 },
    foreBox: { w0: 0.22, h0: 0.26, w1: 0.14, h1: 0.16 },
    foreDrive: { radius: 0.105, length: 0.22, z: 0.14 },
    wristHousing: { radius: 0.10, length: 0.17 },
    wristYoke: { radius: 0.092, width: 0.20 },
    flangeDisc: { radius: 0.078, thickness: 0.045 },
  },

  /**
   * The head. A two-jaw gripper on the flange, because the whole subject is about pointing it.
   * Its axis is the flange axis, so "where the head aims" and "where J6 points" are the same
   * line — which is what makes the aim solve mean anything.
   */
  head: {
    body: { w0: 0.13, h0: 0.13, w1: 0.11, h1: 0.11, length: 0.14 },
    jaw: { w0: 0.035, h0: 0.075, w1: 0.028, h1: 0.05, length: 0.13, spread: 0.045 },
    grip: { open: 26, closed: -4 },   // degrees, jaw splay about X
    lamp: { radius: 0.028, length: 0.02, x: 0.055 },
  },

  /**
   * Declared travel.
   *
   * `pitch` and `swing` are COMMANDS — the head's elevation and bearing — not axis angles.
   * `shoulder`, `elbow` and `wristRoll` are axes. The relationship between the two groups is
   * `solveAim`, and the ranges below are not free: see `aimIsAlwaysReachable`.
   */
  limits: {
    swing: 180,               // +/-, the head's compass bearing
    pitch: 40,                // +/-, the head's elevation above horizontal
    shoulder: [10, 70],       // J2
    elbow: [0, 70],           // J3
    wristRoll: 45,            // +/-, J4
    flangeRoll: 180,          // +/-, J6
    wristPitch: 130,          // +/-, J5 — solved, never commanded directly
  },

  /** The pose the drawing is dimensioned in. */
  rest: { shoulder: 45, elbow: 40, wristRoll: 0, pitch: 0, swing: 0, flangeRoll: 0, grip: 60 },
};

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Turn an aim command into the two axis angles that achieve it.
 *
 * This is the subject. Everything else is castings.
 *
 * The tool axis in the J1 frame is the +Z of the chain
 * `Rx(-90) Rx(j2) Rx(j3) Rz(j4) Rx(j5)`, which works out to
 *
 *     d = ( sin j5 sin j4,
 *          -sin j5 cos j4 sin s + cos j5 cos s,
 *           sin j5 cos j4 cos s + cos j5 sin s )      where s = j2 + j3
 *
 * The head's elevation is `asin(d.y)`, and d.y is `P cos j5 + Q sin j5` with `P = cos s` and
 * `Q = -cos j4 sin s`. That is a single sinusoid in j5, so it inverts in closed form: write it
 * as `R cos(j5 - delta)` and read j5 straight off. No iteration, no solver library, and the
 * same answer every build — which matters, because the scene graph is the deliverable and it
 * has to be byte-identical between builds.
 *
 * The bearing falls out of the same vector. `d`'s azimuth in the J1 frame is `atan2(d.x, d.z)`,
 * and J1 is a pure rotation about Y applied on top of it, so J1 = command - that azimuth makes
 * the head's world bearing exactly the command. With the wrist rolled, the aim is no longer
 * along the arm's own plane, and this is what absorbs the difference — without it, SWING would
 * be "where the arm is pointing" rather than "where the head is looking", which are not the
 * same thing and only one of them is useful.
 *
 * @param {object} cmd  { shoulder, elbow, wristRoll, pitch, swing } in degrees
 * @returns {{ j1:number, j5:number, reach:number, bearing:number }} degrees
 */
export function solveAim(cmd) {
  const s = rad(cmd.shoulder + cmd.elbow);
  const j4 = rad(cmd.wristRoll);
  const e = rad(cmd.pitch);

  const P = Math.cos(s);
  const Q = -Math.cos(j4) * Math.sin(s);
  const R = Math.hypot(P, Q);
  const delta = Math.atan2(Q, P);

  // R is never 0 inside the declared envelope — `aimIsAlwaysReachable` is what says so — but
  // clamping keeps a bad edit producing a wrong drawing rather than a NaN one.
  const j5 = delta + Math.acos(clamp(R === 0 ? 0 : Math.sin(e) / R, -1, 1));

  const dx = Math.sin(j5) * Math.sin(j4);
  const dz = Math.sin(j5) * Math.cos(j4) * Math.cos(s) + Math.cos(j5) * Math.sin(s);
  const bearing = Math.atan2(dx, dz);

  return {
    j1: cmd.swing - deg(bearing),
    j5: deg(j5),
    // Horizontal distance from the J1 axis out to the wrist centre — the figure a reach
    // envelope actually means.
    reach: RADIM.arm.upper * Math.sin(rad(cmd.shoulder))
      + RADIM.arm.fore * Math.sin(rad(cmd.shoulder + cmd.elbow)),
    bearing: deg(bearing),
  };
}

/**
 * The design constraint that makes the promise keepable.
 *
 * The elevation the wrist can reach is bounded by `R = sqrt(1 - sin^2(s) sin^2(j4))`, whose
 * worst case over the arm's travel is `cos(j4max)` — a fully rolled wrist with the forearm
 * horizontal can only sweep the tool through a cone tilted out of the vertical plane. So the
 * commanded pitch is reachable everywhere if and only if
 *
 *     sin(pitchMax) <= cos(wristRollMax)
 *
 * which is why those two numbers in `limits` are a pair rather than two independent tastes.
 * Widen the wrist roll without narrowing the pitch and the head stops being able to hold its
 * aim in some poses — silently, in the corners of the envelope nobody drags a slider to.
 */
export function aimIsAlwaysReachable() {
  return Math.sin(rad(RADIM.limits.pitch)) <= Math.cos(rad(RADIM.limits.wristRoll));
}

/** Maximum horizontal reach from the J1 axis, over the declared shoulder/elbow travel. */
export function maxReach() {
  const [s0, s1] = RADIM.limits.shoulder;
  const [e0, e1] = RADIM.limits.elbow;
  let best = 0;
  for (let s = s0; s <= s1; s += 0.5) {
    for (let e = e0; e <= e1; e += 0.5) {
      best = Math.max(best, solveAim({ shoulder: s, elbow: e, wristRoll: 0, pitch: 0, swing: 0 }).reach);
    }
  }
  return best;
}

/** Height of the wrist centre at a pose — the other half of the envelope. */
export function wristHeight(shoulder, elbow) {
  return RADIM.arm.shoulderY
    + RADIM.arm.upper * Math.cos(rad(shoulder))
    + RADIM.arm.fore * Math.cos(rad(shoulder + elbow));
}

/** The six axes, in order, for anything that wants to walk the chain by name. */
export function axisChain() {
  return ['J1_Pivot', 'J2_Pivot', 'J3_Pivot', 'J4_Pivot', 'J5_Pivot', 'J6_Pivot'];
}
