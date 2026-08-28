/**
 * BP-Headless01 — headless powered exoframe. Every dimension in one place, in metres.
 *
 * Axis convention as always: +X right, +Y up, +Z forward. Ground plane y = 0, and this one
 * stands on it — on two feet, which is the whole difficulty.
 *
 * Design brief, in the order it constrains things:
 *
 *   headless    There is no head, no neck and no cupola. The carapace closes over the shoulder
 *               line and stops. Everything a head would have carried moves onto the chest: the
 *               sensor band and the core lens are the machine's only aperture, and they sit on
 *               the thorax where a sternum would be. Consequences, in order: no turret ring, no
 *               weapon, no bore line, and a silhouette whose read is the back — a hunched shell
 *               of layered plates with the loom running over it.
 *   biped       Two feet is not six wheels with the count changed. A walker with eight legs has
 *               a stability polygon it can be sloppy inside; two feet in a line have none, so
 *               the leg pose is authored to keep the ankle under the hip through the entire
 *               fold rather than merely to keep it on the ground. See `stand()` and the
 *               invariant that holds it.
 *   hands       Five fingers a side, and they are the reason this thing exists — an unarmed
 *               frame whose working end is a hand. Twenty driven finger pivots behind one GRIP
 *               slider.
 *   loomed      The reference sheet's signature is hose: bundles over both shoulders, three
 *               conduits down the spine, a run down each calf. Hoses are why `cableRun` was
 *               added to the shared generators — nothing here could sweep a tube along a curve.
 *
 * Nothing here is a claim about a machine that exists. The figures are internally consistent
 * and every one the title block quotes is derived — height from the leg solve and the carapace
 * profile, not typed. See `stand()` and `crownHeight()`.
 */
export const BHDIM = {
  /**
   * The thorax, authored in the waist frame — origin at the waist pivot, y up.
   *
   * The profile IS the silhouette: back-heavy, hunched forward, and closed over the top with
   * no head sitting on it. Its highest point is the number the drawing quotes as overall
   * height, which is why nothing else on the machine is allowed to rise above it.
   */
  torso: {
    width: 1.06,
    taper: 0.82,            // cap scale, so the flanks slope in toward the centreline
    // Side profile (z, y). Convex, either winding — extrudeProfile fixes the winding.
    profile: [
      [-0.60, -0.02], [-0.66, 0.30], [-0.54, 0.70], [-0.18, 0.92],
      [0.26, 0.88], [0.50, 0.60], [0.48, 0.18], [0.26, -0.04],
    ],
    waistY: 0.24,           // waist pivot above the hip line
    lean: { min: -12, max: 40, rest: 14 },   // rest is the midpoint, by construction
    twist: 62,              // waist yaw either side of centre

    // Back furniture. The spine cover is on the back face rather than on top: putting it above
    // the shell would make the crown a sum of two numbers instead of a point on the profile,
    // and the height in the title block is read straight off the profile.
    spineCover: { width: 0.62, height: 0.64, depth: 0.10, y: 0.36, z: -0.62 },
    backPlates: [
      { width: 0.88, height: 0.11, depth: 0.10, y: 0.06, z: -0.54 },
      { width: 0.86, height: 0.10, depth: 0.10, y: 0.19, z: -0.60 },
      { width: 0.82, height: 0.10, depth: 0.10, y: 0.32, z: -0.64 },
      { width: 0.76, height: 0.09, depth: 0.10, y: 0.45, z: -0.63 },
      { width: 0.68, height: 0.09, depth: 0.10, y: 0.58, z: -0.58 },
    ],

    // Chest. A hexagonal core plate with a lit centre — the front elevation's whole read, and
    // on a headless machine the only thing on it that looks back at you.
    chestHex: { radius: 0.34, depth: 0.07, y: 0.44, z: 0.44 },
    coreLens: { radius: 0.105, depth: 0.055, y: 0.44, z: 0.50 },
    sensorBand: { width: 0.60, height: 0.075, depth: 0.05, y: 0.76, z: 0.32 },
    vent: { width: 0.13, height: 0.30, depth: 0.05, x: 0.40, y: 0.30, z: 0.36 },
    coreStrip: { width: 0.045, height: 0.42, depth: 0.035, x: 0.30, y: 0.44, z: 0.44 },

    /**
     * The flank rams — the reference sheet's brightest single feature, a chromed cylinder lying
     * diagonally against each side of the carapace.
     *
     * Mounted entirely on the thorax rather than bridging the waist. A ram that spanned a driven
     * joint would have to change length as the torso pitched, and there is no skinning anywhere
     * in this project — same reason the walker's shock struts swing with the upper limb instead
     * of crossing the knee. Here it also settles where it goes: on the flank, where it is
     * visible in the side elevation, rather than down the spine where the shell would hide it.
     */
    ram: { length: 0.72, radius: 0.07, rodRadius: 0.036, x: 0.50, y: 0.66, z: -0.30, tilt: 58 },

    /**
     * Cable runs, as control points in the thorax frame. Each one lives inside a single rigid
     * frame on purpose: a hose crossing a driven pivot would have to stretch, so the ones that
     * visually cross a joint stop at that joint's shroud instead.
     *
     * The loom apex is held below the crown (0.92) — see `crownHeight()`.
     */
    loom: [
      [-0.38, 0.60, -0.46], [-0.52, 0.68, -0.20], [-0.62, 0.66, 0.04], [-0.66, 0.54, 0.16],
    ],
    loomRadius: 0.055,
    conduits: [
      { x: -0.16, radius: 0.036 }, { x: 0.0, radius: 0.042 }, { x: 0.16, radius: 0.036 },
    ],
    conduitPath: [[0, 0.62, -0.56], [0, 0.44, -0.72], [0, 0.22, -0.72], [0, 0.02, -0.58]],

    // Hull furniture, in the thorax frame. Latches and a data port — the small fittings that
    // make a shell read as a shell that opens rather than as a solid.
    latch: { width: 0.12, height: 0.08, depth: 0.06, x: 0.44, y: 0.70, z: -0.18 },
    hatch: { width: 0.30, height: 0.22, depth: 0.05, y: 0.20, z: -0.66 },
    dataPort: { width: 0.10, height: 0.12, depth: 0.05, x: 0.34, y: 0.14, z: 0.36 },
  },

  /** Pelvis and hip line. Origin y = 0 is the hip axis; the legs hang off it. */
  pelvis: {
    box: { width: 0.62, height: 0.34, depth: 0.44, y: 0.05 },
    plate: { radius: 0.20, depth: 0.06, y: 0.05, z: 0.24 },
    column: { radius: 0.16, height: 0.22, y: 0.17 },
    yoke: { radius: 0.17, width: 0.20 },
  },

  /**
   * Legs. Hip → knee → ankle, and the foot frame comes out world-aligned so the sole is flat
   * at every stance without an IK solver — see `bipedPivots()`.
   */
  leg: {
    hipX: 0.30,
    thigh: 0.72,
    shin: 0.74,
    ankleY: 0.20,           // ankle pivot above the ground; this is what sets ride height

    /**
     * The pose table. Absolute limb angles from straight down, degrees, positive = forward.
     *
     * `neutral` is not authored — it is the midpoint of the other two, so the STANCE slider's
     * default of 50 lands on the rest posture without the viewer knowing anything about legs.
     * The walker established that; an invariant holds it here too.
     *
     * The pairs are chosen so `stand().reach` stays near zero at every stance: on two feet the
     * hip has to stay over the ankle or the machine is falling forward in the drawing.
     */
    pose: {
      crouch: [52, -46],
      neutral: [30, -24],
      extend: [8, -2],
    },

    thighBox: { w0: 0.30, h0: 0.32, w1: 0.24, h1: 0.26 },
    shinBox: { w0: 0.24, h0: 0.26, w1: 0.17, h1: 0.19 },
    // Armour shells, as profiles in the segment's own ZY plane (z runs down the limb).
    thighPlate: {
      width: 0.36, taper: 0.78,
      profile: [[0.05, -0.20], [0.09, 0.21], [0.34, 0.24], [0.60, 0.13], [0.62, -0.14], [0.32, -0.23]],
    },
    shinPlate: {
      width: 0.29, taper: 0.76,
      profile: [[0.06, -0.17], [0.08, 0.18], [0.36, 0.16], [0.62, 0.08], [0.60, -0.13], [0.30, -0.19]],
    },
    knee: { radius: 0.155, width: 0.33 },
    actuator: { radius: 0.05, length: 0.46 },
    // Stacked bearing discs at the ankle — the reference sheet's most recognisable joint.
    bearings: [
      { radius: 0.155, width: 0.10, x: 0.0 },
      { radius: 0.115, width: 0.07, x: 0.13 },
      { radius: 0.115, width: 0.07, x: -0.13 },
    ],
    calfHose: [[0.09, -0.14, 0.10], [0.11, -0.17, 0.34], [0.09, -0.15, 0.58]],
    calfHoseRadius: 0.028,

    /** Foot, authored in the world-aligned ankle frame. Ground is at y = -ankleY. */
    foot: {
      sole: { width: 0.36, height: 0.055, depth: 0.34, z: 0.02 },
      heel: { width: 0.28, height: 0.15, depth: 0.16, z: -0.16 },
      shroud: { width: 0.28, height: 0.20, depth: 0.28, z: 0.0, y: 0.06 },
      // Splayed, not parallel: the outer two toes are yawed outward, which is most of what
      // separates a foot from a plank in plan view.
      toes: [
        { x: 0.0, yaw: 0, length: 0.17, w0: 0.15, h0: 0.055, w1: 0.12, h1: 0.04 },
        { x: 0.12, yaw: -17, length: 0.15, w0: 0.11, h0: 0.05, w1: 0.09, h1: 0.035 },
        { x: -0.12, yaw: 17, length: 0.15, w0: 0.11, h0: 0.05, w1: 0.09, h1: 0.035 },
      ],
      toeZ: 0.16,
      lamp: { width: 0.11, height: 0.03, depth: 0.035, y: 0.06, z: -0.245 },
    },
  },

  /**
   * Arms. Socket splay is on its own node above the limb chain so the shoulder pivot stays a
   * clean fore-and-aft swing — Euler order would otherwise fold the splay into the swing and
   * the arm would scribe a cone instead of an arc.
   */
  arm: {
    socket: { x: 0.54, y: 0.62, z: 0.05, splay: 13 },
    pauldron: {
      width: 0.34, taper: 0.72,
      profile: [[-0.24, -0.10], [-0.26, 0.14], [-0.06, 0.24], [0.20, 0.20], [0.26, 0.02], [0.16, -0.16]],
      x: 0.66, y: 0.60,
    },
    upper: { length: 0.58, w0: 0.24, h0: 0.26, w1: 0.20, h1: 0.21 },
    elbow: { radius: 0.13, width: 0.27 },
    fore: { length: 0.52, w0: 0.21, h0: 0.22, w1: 0.17, h1: 0.17 },
    forePlate: {
      width: 0.25, taper: 0.80,
      profile: [[0.06, -0.13], [0.08, 0.14], [0.30, 0.13], [0.44, 0.06], [0.42, -0.11], [0.26, -0.15]],
    },
    // Slider ends: stowed is arms hanging, deployed is reaching forward.
    stowed: { shoulder: 4, elbow: 26 },
    deployed: { shoulder: 84, elbow: 74 },
  },

  /**
   * The hand. Five fingers, two driven segments each.
   *
   * Curl is positive about X in the wrist frame, which folds the fingers toward the palm side.
   * The rest pose is not authored as a third set of angles — it is `rest` percent of the closed
   * angles, so the slider's default and the geometry in the exported GLB cannot disagree.
   */
  hand: {
    palm: { width: 0.21, height: 0.11, depth: 0.17 },
    knuckle: { width: 0.21, height: 0.09, depth: 0.07 },
    wristZ: 0.06,
    rest: 22,               // the GRIP slider's default, in percent of full curl
    fingers: [
      { tag: 1, x: -0.072, prox: 0.100, dist: 0.078, w: 0.044 },
      { tag: 2, x: -0.024, prox: 0.110, dist: 0.084, w: 0.046 },
      { tag: 3, x: 0.024, prox: 0.104, dist: 0.080, w: 0.045 },
      { tag: 4, x: 0.072, prox: 0.088, dist: 0.066, w: 0.041 },
    ],
    curl: { proximal: 62, distal: 78 },
    thumb: { x: 0.115, y: -0.02, z: 0.05, yaw: 42, prox: 0.098, dist: 0.078, w: 0.052 },
    thumbCurl: { proximal: 46, distal: 54 },
  },

  limits: { stance: 100, grip: 100, arms: 100 },
};

const rad = (d) => (d * Math.PI) / 180;

/**
 * Turn a leg pose into the two numbers everything else is derived from.
 *
 * `drop` is how far the ankle falls below the hip and `reach` how far forward it lands. Ride
 * height is `drop + ankleY` and is therefore a consequence of the leg pose, not a figure anyone
 * typed — the same thing that makes a walker a walker, and the reason this subject needs
 * `afterArticulate`.
 *
 * `reach` matters more here than it did on eight legs. A biped standing still has a support
 * polygon the size of its two soles; if the ankle wanders forward of the hip as the knees bend,
 * the drawing shows a machine in the act of falling over.
 *
 * @param {[number,number]} pose  absolute thigh and shin angles, degrees, positive = forward
 */
export function stand(pose = BHDIM.leg.pose.neutral) {
  const L = [BHDIM.leg.thigh, BHDIM.leg.shin];
  let drop = 0, reach = 0;
  pose.forEach((angle, i) => {
    drop += L[i] * Math.cos(rad(angle));
    reach += L[i] * Math.sin(rad(angle));
  });
  return { drop, reach, hipHeight: drop + BHDIM.leg.ankleY };
}

/**
 * The rotations the scene graph actually stores, for one pose.
 *
 * The leg chain hangs off a mount rotated +90° about X, so its local +Z points at the ground
 * and `taperedBeam` can author every segment along its own axis. That mount rotation is also
 * why the signs invert: a positive pose angle is forward, and after the mount a positive
 * rotation.x swings the limb backward. Keeping that one fact here rather than in the builder is
 * the same argument the howitzer's elevation sign makes — the convention belongs with the
 * machine, not with whoever is drawing it.
 *
 * The ankle carries `p1 - 90`, which cancels the whole chain and leaves the foot frame
 * world-aligned. That is what keeps the sole flat through the entire fold with no IK and no
 * second slider.
 *
 * @param {[number,number]} pose
 * @returns {{hip:number, knee:number, ankle:number}} degrees, ready for rotation.x
 */
export function bipedPivots([p0, p1]) {
  return { hip: -p0, knee: -(p1 - p0), ankle: p1 - 90 };
}

/** The two legs. Trivial, but it is the one place the side convention is written down. */
export function legLayout() {
  return [-1, 1].map((side) => ({
    side,
    tag: side < 0 ? 'L' : 'R',
    name: `Leg_${side < 0 ? 'L' : 'R'}`,
    x: side * BHDIM.leg.hipX,
  }));
}

/** The two arms, same shape as `legLayout` and for the same reason. */
export function armLayout() {
  return [-1, 1].map((side) => ({
    side,
    tag: side < 0 ? 'L' : 'R',
    name: `Arm_${side < 0 ? 'L' : 'R'}`,
    x: side * BHDIM.arm.socket.x,
  }));
}

/**
 * The highest point on the carapace as it is actually built, in the thorax frame. Returns [z, y].
 *
 * `extrudeProfile` scales BOTH caps toward the profile centroid, so the full-size profile never
 * appears in the mesh at all — the shell is the *tapered* profile swept between two tapered
 * caps. Reading a height straight off `torso.profile` therefore over-quotes the machine by the
 * taper, and nothing would have caught it: the drawing would simply have said 2.68 m about a
 * 2.59 m object. Applying the same transform the generator applies is the fix, and the invariant
 * that measures the built vertices against this is what keeps it honest.
 */
export function crownPoint() {
  const P = BHDIM.torso.profile;
  const t = BHDIM.torso.taper;
  const cz = P.reduce((s, [z]) => s + z, 0) / P.length;
  const cy = P.reduce((s, [, y]) => s + y, 0) / P.length;
  return P
    .map(([z, y]) => [cz + (z - cz) * t, cy + (y - cy) * t])
    .reduce((best, p) => (p[1] > best[1] ? p : best));
}

/**
 * Overall height, derived rather than typed.
 *
 * The crown is a point on the carapace profile, so leaning the torso rotates it about the waist
 * pivot and the machine gets shorter. Quoting a figure measured at zero lean would describe a
 * pose the drawing never shows.
 *
 * @param {[number,number]} pose  leg pose
 * @param {number} lean           torso pitch in degrees, positive = forward
 */
export function crownHeight(pose = BHDIM.leg.pose.neutral, lean = BHDIM.torso.lean.rest) {
  const [z, y] = crownPoint();
  const a = rad(lean);
  return stand(pose).hipHeight + BHDIM.torso.waistY + (y * Math.cos(a) - z * Math.sin(a));
}

/** Shoulder width across the pauldrons — the front elevation's headline figure. */
export function shoulderSpan() {
  const p = BHDIM.arm.pauldron;
  return 2 * (p.x + p.width / 2);
}
