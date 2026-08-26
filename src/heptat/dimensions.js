/**
 * Hepta-T — heavy 6x6 cargo transport. Every dimension in one place, in metres.
 *
 * Axis convention as always: +X right, +Y up, +Z forward. Ground plane y = 0, and unlike the
 * MK-CX this one rests on it.
 *
 * Design brief, in the order it constrains things:
 *
 *   industrial   Nothing is styled. Every volume is a box doing a job — frame rails, a cab, a
 *                cargo bay, guards over the wheels — and where two jobs meet there is a joint
 *                line rather than a blend. The turret is small because it is an afterthought
 *                bolted to a truck, not the reason the truck exists.
 *   6x6          One steered front axle and a rear tandem. Wheels are big and the same size
 *                throughout, because a fleet vehicle carries one spare, not three.
 *   lived-in     See STOWAGE below. This is the part that needed a technique rather than a
 *                number.
 *
 * There is no real-world referent to sanity-check against, so nothing here is a claim about a
 * vehicle that exists. The numbers are internally consistent and plausible for a truck of this
 * class: ~8.6 m long, 2.9 m wide, ~3.3 m to the cab roof, 1.24 m tyres.
 */
export const HTDIM = {
  /** Ladder frame. The chassis is a visible structure here, not a hidden one. */
  frame: {
    length: 8.60,
    railWidth: 0.16,
    railHeight: 0.34,
    railSpacing: 0.92,     // centre to centre
    y: 1.02,
    crossMembers: [-3.55, -2.10, -0.55, 1.05, 2.45, 3.60],
  },

  wheel: {
    radius: 0.62,
    width: 0.42,
    hubRadius: 0.24,
    // Axle Z positions, front to back. One steered axle, then a rear tandem.
    axles: [3.05, -1.55, -2.95],
    // Track pushed out from 1.24: at that width the tyres sat inside the cargo bay's own
    // half-width and were swallowed by the body. A truck reads as a truck because you can see
    // its wheels.
    trackX: 1.42,          // wheel centre from the centreline
    steerAxle: 0,          // index into axles[] that turns
    steerLimit: 32,        // degrees
  },

  cab: {
    z0: 1.15, z1: 3.55,
    y0: 1.19, y1: 2.86,
    width: 2.34,
    // Side profile (z, y) relative to the cab's own origin at (0, y0, midpoint of z0..z1).
    // Cab roof dropped to 1.67 above its floor while the bay went up to 2.11, so the two stop
    // being one continuous box. On a hauler the load space is the tall part; a cab flush with
    // the bay roof reads as a van.
    profile: [
      [-1.20, 0.00], [1.20, 0.00], [1.20, 0.58],
      [0.88, 1.30], [0.88, 1.67], [-1.20, 1.67],
    ],
    windscreen: { width: 1.72, height: 0.74, inset: 0.06 },
    bumper: { width: 2.56, height: 0.44, depth: 0.30 },
  },

  cargo: {
    z0: -4.10, z1: 1.05,
    y0: 1.19,
    height: 2.11,
    width: 2.62,
    wallThickness: 0.10,
    ribs: [-3.40, -2.55, -1.70, -0.85, 0.00, 0.75],   // external stiffeners
    // Length and angle are solved together: the hinge is 1.21 m up, and the tip only reaches
    // the ground when L*cos(open) = -1.21. At the first pass's 1.72 m and -96 deg the ramp
    // stopped horizontal, 1.2 m in the air — a loading ramp that loads nothing.
    ramp: { height: 2.00, width: 2.46, open: -127 },  // degrees at fully open
  },

  turret: {
    // Small, and set at the front of the cargo roof so it can fire over the cab.
    ringX: -0.42,
    ringZ: 0.34,
    width: 0.86,
    profile: [
      [-0.58, 0.00], [-0.62, 0.20], [-0.42, 0.46], [0.30, 0.48], [0.56, 0.28], [0.50, 0.00],
    ],
    trunnionY: 0.26,
    trunnionZ: 0.22,
    barrelProfile: [
      [0.00, 0.00], [0.062, 0.00], [0.062, 0.70], [0.046, 0.75],
      [0.046, 1.58], [0.066, 1.63], [0.066, 1.78], [0.00, 1.78],
    ],
    limits: { azimuth: [-180, 180], elevation: [-8, 52] },
  },

  /** Blue accent channel. [x, y, z, w, h, d] in the parent's space. */
  /**
   * Blue accent channel. [x, y, z, w, h, d] in the parent's space.
   *
   * More of them and thicker than the first pass, because "accents everywhere" is the brief and
   * 3 cm strips read as scratches at iso distance. They are placed where a fleet operator would
   * actually put lights: marker strips along the load line, a roof bar, step lighting under the
   * doors, and a band round the tail so the thing is visible when the ramp is down at night.
   */
  glow: {
    cab: [
      [0, 1.62, 1.16, 1.50, 0.07, 0.04],          // roof marker bar
      [-1.18, 0.52, 0.05, 0.045, 0.10, 1.60],     // waistline, left
      [1.18, 0.52, 0.05, 0.045, 0.10, 1.60],      // waistline, right
      [-1.18, -0.34, -0.55, 0.30, 0.05, 0.44],    // step light, left
      [1.18, -0.34, -0.55, 0.30, 0.05, 0.44],     // step light, right
    ],
    cargo: [
      [-1.35, 2.62, -1.40, 0.045, 0.11, 2.30],
      [1.35, 2.62, -1.40, 0.045, 0.11, 2.30],
      [-1.35, 2.62, 0.42, 0.045, 0.11, 1.00],
      [1.35, 2.62, 0.42, 0.045, 0.11, 1.00],
      [-1.35, 1.62, -1.40, 0.045, 0.08, 2.30],
      [1.35, 1.62, -1.40, 0.045, 0.08, 2.30],
      [0, 3.34, -1.90, 1.30, 0.05, 0.06],         // roof bar
      [0, 2.10, -4.14, 1.90, 0.09, 0.04],         // tail band
    ],
    // Sill lights, not underglow. The first pass put two 1.9 x 0.6 m panels on the centreline
    // just below the floor; from any angle that saw under the front overhang they read as slabs
    // hovering in front of the truck. Small downward lights at the sills do the same job and
    // look like something a fleet would actually fit.
    sills: [
      [-1.32, 1.12, -2.20, 0.20, 0.05, 0.34], [1.32, 1.12, -2.20, 0.20, 0.05, 0.34],
      [-1.32, 1.12, -0.30, 0.20, 0.05, 0.34], [1.32, 1.12, -0.30, 0.20, 0.05, 0.34],
    ],
  },

  /**
   * Lived-in.
   *
   * Wear cannot be modelled here — there are no textures, and the blueprint pass renders flat
   * ink — so "lived-in" has to be structural: things that accumulated rather than things that
   * were designed. Two techniques do the work.
   *
   * The first is asymmetry. A vehicle whose every part is mirrored reads as a product render.
   * The ladder is on one side only, the spare wheel on the other, the fuel cans on one flank.
   *
   * The second is a seeded jitter (see `rng()` below) nudging each stowage item's placement and
   * angle. Crates stacked by hand do not line up, and a grid of perfectly aligned boxes reads
   * as cargo the modeller placed rather than cargo a crew threw on. The seed is fixed, so the
   * geometry is still deterministic and the invariants still hold.
   */
  stowage: {
    seed: 0x5eed17,
    jitter: { pos: 0.05, rot: 0.09 },
    // [x, y, z, w, h, d] on the cargo roof; sizes deliberately unequal.
    roofCrates: [
      [-0.72, 3.52, -1.05, 0.78, 0.44, 0.62],
      [0.10, 3.50, -1.28, 0.54, 0.40, 0.54],
      [0.66, 3.48, -0.98, 0.66, 0.36, 0.72],
      [-0.30, 3.88, -1.16, 0.62, 0.34, 0.50],
      [0.30, 3.47, -2.55, 0.90, 0.34, 0.66],
      [-0.62, 3.49, -3.05, 0.72, 0.38, 0.58],
    ],
    // Fuel/water cans on the left flank only.
    cans: { x: -1.40, y: 1.92, zs: [-2.60, -2.24, -1.88], size: [0.16, 0.44, 0.30] },
    toolbox: { x: 1.40, y: 1.80, z: -0.30, size: [0.22, 0.42, 1.05] },
    spareWheel: { x: 1.44, y: 2.02, z: -3.30 },
    ladder: { x: -1.40, y: 2.30, z: -3.90, rungs: 5 },
    cableReel: { x: 0.86, y: 3.52, z: 0.42, radius: 0.30, width: 0.26 },
    antennae: [[-0.96, 3.32, 0.10, 1.35, 0.10], [0.92, 3.32, -3.50, 1.05, -0.07]],
  },

  limits: { steer: 32, ramp: 127 },
};

/**
 * Deterministic pseudo-random source for the lived-in jitter.
 *
 * A tiny LCG rather than Math.random(): the scene graph is the deliverable and it has to be
 * byte-identical every build, or the invariants become flaky and an exported GLB stops
 * matching the one before it. "Random-looking" and "random" are different requirements and
 * only the first one is wanted here.
 */
export function rng(seed = HTDIM.stowage.seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Wheel positions for one build, front axle first. */
export function wheelLayout() {
  const w = HTDIM.wheel;
  const out = [];
  w.axles.forEach((z, axle) => {
    for (const side of [-1, 1]) {
      out.push({
        name: `Wheel_${axle + 1}${side < 0 ? 'L' : 'R'}`,
        axle, side, x: side * w.trackX, y: w.radius, z,
        steers: axle === w.steerAxle,
      });
    }
  });
  return out;
}
