/**
 * MOTO // POD (R-POD) — two-wheel monocycle pod. Every dimension in one place, in metres.
 *
 * Axis convention as always: +X right, +Y up, +Z forward. Ground plane y = 0, and this one
 * stands on two contact patches the width of a hand.
 *
 * Design brief, in the order it constrains things:
 *
 *   hubless     Both wheels are open rings — a 0.30 m hole straight through each. That is the
 *               reference sheet's whole read, and it settles the structure: there is no axle,
 *               so the machine has to hold each wheel by its rim. The arms reach the STATOR
 *               ring, which is why the stator is the one layer that does not turn.
 *   layered     The wheel/motor detail calls out five concentric rings — tyre, mag-lev stator,
 *               hubless motor, gyro sensor, mag-lev rotor. They are five real parts here, at
 *               five real radii, and which of them spin is a fact about the machine.
 *   it leans    A two-wheeler is the first subject with no static stability at all. Leaning is
 *               a joint, and the roll axis is the ground contact line — not the centreline of
 *               the body. That, plus a crowned tread, is what keeps both tyres on the ground
 *               through the lean. See `rideLift()`.
 *   gyro        STABILITY: DYNAMIC GYRO + AI ASSIST, which is what lets the steering axis be
 *               vertical through the axle with no rake and no trail. A conventional raked fork
 *               would drag the front contact patch off the ground every time it turned; this
 *               machine has no fork to rake, and nothing here relies on caster stability.
 *
 * The headline figures — 2.45 m long, 1.12 m tall, 0.86 m wide — are the reference sheet's own
 * dimensions, and they are checked against the built graph rather than quoted at it. The
 * performance figures (220 km/h, 320 km, 210 kg) are the sheet's declarations about a
 * fictional vehicle; they are carried as text and nothing is derived from them.
 */
export const MPDIM = {
  /** What the sheet dimensions. An invariant holds the graph to these three. */
  quoted: { length: 2.45, height: 1.12, width: 0.86 },

  /** What the sheet declares. Text, not geometry — nothing below reads these. */
  spec: {
    'CLASS': 'LIGHT PERSONAL MOBILITY',
    'ROLE': 'URBAN / INTERCEPT / COURIER',
    'CREW': '1',
    'DRIVE': 'ELECTRIC HUB MOTORS',
    'STABILITY': 'DYNAMIC GYRO + AI ASSIST',
    'SUSPENSION': 'ACTIVE MAG-LEV',
    'ENERGY CELL': 'SOLID STATE',
    'TOP SPEED': '220 km/h',
    'RANGE': '320 km (CITY)',
    'MASS, EMPTY': '210 kg',
  },

  /**
   * The wheels. Five concentric rings and a hole where the hub would be.
   *
   * Four of the five are flat square-section bands, which is exactly what `trackBand` makes:
   * given a set of ONE circle its support function degenerates to that circle, and the taut
   * band around a single disk is a ring. The tank's track generator turned out to be "a band
   * around a set of disks" all along.
   *
   * The tyre is the exception and it is not decoration — see `crownedTyre` and `rideLift`.
   */
  wheel: {
    frontZ: 0.855,
    rearZ: -0.795,
    radius: 0.335,            // tyre outer radius, on the centreline
    bore: 0.152,              // the hole; 2x this is what makes it read as hubless

    tyre: { thickness: 0.072, width: 0.175, crown: 0.118 },

    /**
     * Outermost inward, exactly the detail panel's stack. `spins` is a fact about the machine:
     * the arms grip the stator, so the stator and the gyro sensor ring stay put while the
     * motor and the mag-lev rotor turn with the tyre.
     */
    rings: [
      { tag: 'Stator', r: 0.258, thickness: 0.026, width: 0.150, spins: false, emissive: 'secondary' },
      { tag: 'Motor', r: 0.230, thickness: 0.034, width: 0.196, spins: true, emissive: false },
      { tag: 'Sensor', r: 0.192, thickness: 0.013, width: 0.098, spins: false, emissive: 'primary' },
      { tag: 'Rotor', r: 0.176, thickness: 0.024, width: 0.142, spins: true, emissive: 'secondary' },
    ],

    segments: 72,             // tyre; fine enough that the lean invariant is not measuring facets
    ringSegments: 48,
    crownSteps: 16,
    steer: 32,                // degrees either side
  },

  /**
   * The bodywork, authored in the lean frame — origin on the ground, between the wheels.
   *
   * Four extrusions, not one, and no cap scaling on any of them. `extrudeProfile`'s
   * frontScale/backScale shrink the whole ZY profile about its centroid, so equal scales do
   * not slope the flanks at all — they uniformly shorten the silhouette, which is the trap the
   * howitzer's trail arms already hit and documented. Every profile below is therefore the
   * silhouette as drawn, and the shaping comes from stacking narrow volumes at different
   * heights rather than from a scale factor.
   *
   * That stack is also where the 0.86 m width comes from: the SPONSONS are the widest thing on
   * the machine, and the front elevation's dimension is theirs.
   */
  body: {
    // Main fairing: long, low and narrow, running the whole length between the wheels.
    fairing: {
      width: 0.52,
      // Stops short of both wheels on purpose. The reference sheet leaves the rings proud —
      // a hubless wheel that is half-swallowed by bodywork just reads as a wheel.
      profile: [
        [-0.98, 0.44], [-0.92, 0.66], [-0.48, 0.78], [0.20, 0.78],
        [0.52, 0.64], [0.62, 0.44], [0.44, 0.24], [-0.56, 0.20],
      ],
    },
    // Side pods. The widest part of the machine, and deliberately clear of the road at full
    // lean — their lower edge is what sets the lean limit.
    sponson: {
      width: 0.20,
      x: 0.33,
      profile: [
        [-0.56, 0.40], [-0.48, 0.60], [-0.06, 0.66], [0.34, 0.62],
        [0.50, 0.48], [0.38, 0.36], [-0.18, 0.34],
      ],
    },
    // Cowls over each wheel, which is what stops the wheels reading as bolted-on discs.
    // A slim guard over the front wheel rather than a block around it.
    cowlF: {
      width: 0.30,
      profile: [[0.56, 0.62], [0.62, 0.80], [0.92, 0.78], [1.02, 0.60], [0.94, 0.54], [0.66, 0.56]],
    },
    cowlR: {
      width: 0.38,
      profile: [[-1.06, 0.60], [-1.00, 0.82], [-0.66, 0.86], [-0.46, 0.74], [-0.52, 0.58], [-0.90, 0.54]],
    },
    spine: { width: 0.24, height: 0.10, length: 1.50, y: 0.70, z: -0.04 },
    underTray: { width: 0.40, height: 0.11, length: 1.30, y: 0.21, z: -0.10 },
  },

  /**
   * Canopy / nano-glass, hinged at its leading edge.
   *
   * Its crown is the quoted overall height, so the height figure is read off this profile
   * AFTER the extrusion taper — the same trap the exoframe's carapace fell into, where the
   * full-size profile never appears in the mesh and a raw `Math.max` over-quotes the machine.
   */
  canopy: {
    width: 0.46,
    profile: [
      [-0.70, 0.80], [-0.46, 1.02], [0.04, 1.12], [0.44, 1.06],
      [0.66, 0.88], [0.50, 0.78], [-0.16, 0.76],
    ],
    hinge: { y: 0.80, z: 0.62 },
    open: -58,                // degrees about X at full open; negative lifts the tail of it
    frame: { width: 0.48, height: 0.05, depth: 0.05 },
  },

  /** Cockpit. One seat, a control yoke and the holographic HUD plane above it. */
  cockpit: {
    tub: { width: 0.40, height: 0.24, length: 0.72, y: 0.46, z: -0.14 },
    seat: { width: 0.34, height: 0.09, length: 0.44, y: 0.60, z: -0.30 },
    yoke: { width: 0.44, height: 0.06, depth: 0.10, y: 0.70, z: 0.24 },
    hud: { width: 0.36, height: 0.20, depth: 0.012, y: 0.86, z: 0.30, tilt: -22 },
  },

  /** Nose and tail furniture. */
  shell: {
    lightArray: { width: 0.26, height: 0.06, depth: 0.05, y: 0.66, z: 0.98 },
    tailLight: { width: 0.26, height: 0.05, depth: 0.04, y: 0.62, z: -1.04 },
    // The long light lines that are most of what the reference sheet actually draws.
    // On the sponson flanks, just inside their outer face, so they read as light lines cut
    // into the bodywork rather than as strips floating beside it. Kept inside the sponson's
    // 0.43 half-width, which is the figure the front elevation dimensions.
    strips: [
      { width: 0.030, height: 0.032, length: 0.96, x: 0.415, y: 0.55, z: -0.04 },
      { width: 0.030, height: 0.024, length: 0.58, x: 0.415, y: 0.41, z: 0.06 },
      { width: 0.026, height: 0.024, length: 0.74, x: 0.255, y: 0.75, z: -0.16 },
    ],
    hatch: { width: 0.05, height: 0.20, depth: 0.36, x: 0.405, y: 0.52, z: -0.36 },
    energyCell: { width: 0.30, height: 0.20, length: 0.46, y: 0.36, z: -0.62 },
    gyro: { radius: 0.15, width: 0.22, y: 0.34, z: 0.16 },
    // Aerodynamic fins. They are the reference's rear-view silhouette, and they are the
    // second-widest thing on the machine — deliberately inside the fairing's 0.86.
    fin: { x: 0.22, y: 0.62, z: -0.86, length: 0.42, w0: 0.05, h0: 0.26, w1: 0.03, h1: 0.10, cant: 18 },
  },

  /** Rear thruster, on a vectoring pivot. */
  thruster: {
    housing: { radius: 0.13, length: 0.20, y: 0.42, z: -1.00 },
    nozzle: { r0: 0.115, r1: 0.145, length: 0.16 },
    core: { radius: 0.085, length: 0.05 },
    vector: 25,               // degrees either side
  },

  /** The arms that hold each rim. They grip the stator, which is why it does not turn. */
  arm: {
    front: { length: 0.44, w0: 0.13, h0: 0.17, w1: 0.10, h1: 0.12 },
    rear: { length: 0.52, w0: 0.15, h0: 0.19, w1: 0.11, h1: 0.13 },
    yokeWidth: 0.30,
  },

  /**
   * Maximum lean. Not a styling choice: past this the fairing's lower edge reaches the road
   * before the tyre's shoulder does, and a schematic that lets you scrape the bodywork is
   * drawing a crash. There is an invariant for the clearance.
   */
  lean: 34,
};

const rad = (d) => (d * Math.PI) / 180;

/**
 * How far the machine has to rise as it leans, so both tyres stay on the ground.
 *
 * This is the whole reason a leaning vehicle needs `afterArticulate`, and it is worth being
 * precise about, because "roll it about the contact line" is the obvious answer and it is
 * wrong by exactly this much.
 *
 * A tyre is a solid of revolution with a CROWNED tread: at lateral offset u the outer radius
 * follows an arc of radius `crown`, tangent to the nominal radius on the centreline. Lean the
 * wheel by t and the contact point migrates around that crown to u = -crown*sin(t), where the
 * local radius is `radius - crown + crown*cos(t)`. Working the lowest point out from there,
 * the axle must sit at
 *
 *     radius*cos(t) + crown*(1 - cos(t))
 *
 * above the ground. A rigid roll about the contact line puts it at `radius*cos(t)`, so the
 * machine sinks into the road by `crown*(1 - cos(t))` and the difference is what this returns.
 *
 * A flat-treaded tyre — which is what `trackBand` makes, and what a tank track wants — has no
 * crown to migrate around: leaned over it stands on its shoulder edge, further from the axle
 * than the tread is, and the geometry stops meaning anything. That is why the tyre is the one
 * ring on this machine that is not a track band.
 */
export function rideLift(leanDeg) {
  return MPDIM.wheel.tyre.crown * (1 - Math.cos(rad(leanDeg)));
}

/** Outer radius of the crowned tread at lateral offset u. Shared by the builder and the tests. */
export function treadRadius(u) {
  const { crown } = MPDIM.wheel.tyre;
  return MPDIM.wheel.radius - (crown - Math.sqrt(Math.max(crown * crown - u * u, 0)));
}

/** The two wheels, front first. The one place the fore/aft convention is written down. */
export function wheelLayout() {
  return [
    { tag: 'F', name: 'Wheel_F', z: MPDIM.wheel.frontZ, steers: true },
    { tag: 'R', name: 'Wheel_R', z: MPDIM.wheel.rearZ, steers: false },
  ];
}

export function wheelbase() {
  return MPDIM.wheel.frontZ - MPDIM.wheel.rearZ;
}

/**
 * Overall height, derived: the crown of the canopy, closed, upright.
 *
 * Read straight off the profile, which is only safe because nothing here uses cap scaling —
 * see the note on `body`. The exoframe's carapace does scale its caps, and reading its height
 * off the raw profile over-quoted that machine by 9 cm; the fix there was to apply the same
 * transform the generator applies, and the fix here is not to need one.
 */
export function overallHeight() {
  return Math.max(...MPDIM.canopy.profile.map(([, y]) => y));
}

/**
 * Overall length, derived: the nose of the front tyre to the tip of the thruster nozzle.
 *
 * Both ends are things that move — the front tyre steers and the nozzle vectors — so this is
 * the length with both at zero, which is the pose every elevation on the sheet is drawn in.
 */
export function overallLength() {
  const t = MPDIM.thruster;
  const nose = MPDIM.wheel.frontZ + MPDIM.wheel.radius;
  const tail = Math.min(
    MPDIM.wheel.rearZ - MPDIM.wheel.radius,
    t.housing.z - t.housing.length / 2 - t.nozzle.length,
  );
  return nose - tail;
}

/** Overall width, derived: the sponsons, which are the widest thing on the machine. */
export function overallWidth() {
  const s = MPDIM.body.sponson;
  return 2 * (s.x + s.width / 2);
}
