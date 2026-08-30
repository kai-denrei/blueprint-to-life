/**
 * GS-3 — three-axis stabilised gimbal platform. Every dimension in one place, in metres.
 *
 * Axis convention as always: +X right, +Y up, +Z forward. Bolted to y = 0.
 *
 * Three sets of concentric rings, sharing one centre and nested one inside the next: AZIMUTH
 * outermost, BANK inside it, ELEVATION inside that, and the sensor ball at the middle. Each set
 * is four concentric rings — a race, a drive ring, a bearing ring and an encoder ring — so the
 * assembly is twelve rings on three axes about a single point.
 *
 * Design brief, in the order it constrains things:
 *
 *   nested      A gimbal ring does not spin in its own plane; it is carried by the ring outside
 *               it and tilts relative to it. So an inner set sweeps a SPHERE inside the outer
 *               set's bore, and the radii are not free — see `ringStack`, where every radius on
 *               the machine falls out of one number and two tables.
 *   three axes  Azimuth about Y, bank about Z, elevation about X, each perpendicular to the
 *               last and all three through the centre. That is what a gimbal is.
 *   lock        And it is also what a gimbal's famous failure is. At 90 degrees of bank the
 *               elevation axis lies on top of the azimuth axis and the machine loses a degree
 *               of freedom. This one does not solve that — it declares travel that stops short
 *               of it, and says by how much. See `axisIndependence`.
 *
 * Nothing here is a claim about a platform that exists. The proportions are those of a
 * shipboard director: 1.14 m across the outer race, 1.62 m to the crown bearing.
 */
export const GDIM = {
  /** The only radius that is typed. Everything else is derived from it. */
  outerRadius: 0.57,

  /**
   * Radial clearance between one set's bore and the next set's outer race.
   *
   * This is the number that makes the nesting real. An inner set rotating about a diameter
   * sweeps a sphere of its own outer radius, so it fits inside the set outside it if and only
   * if that radius plus this clearance clears the outer set's bore. Every ring radius below is
   * a consequence of that inequality applied three times.
   */
  clearance: 0.022,

  /** The gimbal centre — where all three axes cross. */
  centre: { y: 1.00 },

  /**
   * The three sets, outermost first. `bands` are radial thicknesses, `gaps` the radial spaces
   * between consecutive rings, `widths` the axial extent of each ring. None of them is a
   * radius: `ringStack` turns these into radii, which is the point.
   */
  sets: [
    {
      tag: 'A',
      label: 'AZIMUTH',
      // `pivot` is the axis the stage turns about; `ringAxis` is the normal of the rings
      // themselves. They are perpendicular, and that is not a detail: a gimbal ring pivots
      // about its own DIAMETER, so the axis lies in the ring's plane. Conflating the two is
      // how you end up drawing a slew bearing and calling it a gimbal.
      pivot: 'y',
      ringAxis: 'x',
      names: ['Outer_Race', 'Drive_Ring', 'Bearing_Ring', 'Encoder_Ring'],
      bands: [0.040, 0.026, 0.021, 0.014],
      gaps: [0.013, 0.014, 0.015],
      widths: [0.104, 0.070, 0.086, 0.048],
      emissive: [false, 'secondary', false, 'primary'],
    },
    {
      tag: 'B',
      label: 'BANK',
      pivot: 'z',
      ringAxis: 'y',
      names: ['Outer_Race', 'Drive_Ring', 'Bearing_Ring', 'Encoder_Ring'],
      bands: [0.034, 0.022, 0.019, 0.012],
      gaps: [0.012, 0.013, 0.014],
      widths: [0.090, 0.062, 0.074, 0.042],
      emissive: [false, 'secondary', false, 'primary'],
    },
    {
      tag: 'C',
      label: 'ELEVATION',
      pivot: 'x',
      ringAxis: 'z',
      names: ['Outer_Race', 'Drive_Ring', 'Bearing_Ring', 'Encoder_Ring'],
      bands: [0.028, 0.019, 0.016, 0.011],
      gaps: [0.011, 0.012, 0.013],
      widths: [0.076, 0.052, 0.062, 0.036],
      emissive: [false, 'secondary', false, 'primary'],
    },
  ],

  /** Ring tessellation. Coarse enough to read as machined, fine enough for the sweep test. */
  segments: 56,

  /** The payload at the centre. Its size is derived too — see `payloadRadius`. */
  payload: {
    clearance: 0.026,
    apertureRatio: 0.62,      // of the ball radius
    apertureDepth: 0.03,
    finRatio: 0.86,           // radiator fins, as a fraction of the ball radius
    fin: { width: 0.028, height: 0.13, depth: 0.10 },
  },

  /** The frame: a pedestal to the south pole and an arch over to the north. */
  frame: {
    plate: { width: 1.52, height: 0.06, depth: 0.86 },
    boltPad: { radius: 0.06, height: 0.032, x: 0.60, z: 0.32 },
    postX: 0.68,
    post: { w0: 0.13, h0: 0.17, w1: 0.10, h1: 0.13 },
    capBar: { height: 0.10, depth: 0.15 },
    // Pedestal profile (z, y) extruded along X, from the plate up to the south bearing.
    pedestalWidth: 0.34,
    pedestal: [
      [-0.22, 0.06], [-0.25, 0.18], [-0.14, 0.40], [0.14, 0.40], [0.25, 0.18], [0.22, 0.06],
    ],
    bearingBoss: { radius: 0.072, length: 0.10 },
    // The bosses that carry each stage in the one outside it.
    stageBoss: { radius: 0.045, length: 0.07 },
  },

  /**
   * Declared travel.
   *
   * `bank` is the one that matters: at +/-90 the elevation axis lies on the azimuth axis and
   * the machine is in gimbal lock. 72 stops 18 short of it, which `axisIndependence` turns into
   * a number the drawing can quote.
   */
  limits: { azimuth: 180, bank: 72, elevation: 88 },

  rest: { azimuth: 0, bank: 0, elevation: 0 },
};

const rad = (d) => (d * Math.PI) / 180;

/**
 * Turn the band and gap tables into radii.
 *
 * Every ring on this machine is placed by this function. The alternative — twelve typed radii
 * — would have been twelve chances to write a number that puts one ring through another, and
 * nothing would have caught it until someone rotated a stage and watched the drawing tear.
 *
 * The nesting rule is one line: an inner set rotating about a diameter sweeps a sphere of its
 * own outer radius, so the next set out has to have a bore at least that plus the clearance.
 * Applied three times, that is the whole geometry.
 *
 * @returns {Array<{tag, label, pivot, ringAxis, outerRadius, bore, rings: Array<{name, r, inner, width, emissive}>}>}
 */
export function ringStack() {
  let outer = GDIM.outerRadius;
  return GDIM.sets.map((set, i) => {
    const rings = [];
    let r = outer;
    set.names.forEach((name, i) => {
      rings.push({
        name: `${name}_${set.tag}`,
        r,
        inner: r - set.bands[i],
        width: set.widths[i],
        emissive: set.emissive[i],
      });
      r = r - set.bands[i] - (set.gaps[i] ?? 0);
    });
    const bore = rings[rings.length - 1].inner;
    const stage = { ...set, outerRadius: rings[0].r, bore, rings };

    /**
     * The next set nests inside this bore — but a ring does not sweep a circle of its own
     * radius. It has WIDTH, so its corners sit at `sqrt(r^2 + (w/2)^2)` from the centre, and
     * that is what actually has to clear. Ignoring it cost 2 mm of the declared 22 mm on the
     * first pass: the rings still did not touch, but the drawing's clearance figure was a
     * number nothing in the geometry honoured. Solving for r instead makes the swept corner
     * land exactly on `bore - clearance`.
     */
    const next = GDIM.sets[i + 1];
    if (next) {
      const halfWidth = next.widths[0] / 2;
      const limit = bore - GDIM.clearance;
      outer = Math.sqrt(Math.max(limit * limit - halfWidth * halfWidth, 0));
    }
    return stage;
  });
}

/** The sensor ball's radius: whatever the innermost bore leaves. */
export function payloadRadius() {
  const stack = ringStack();
  return stack[stack.length - 1].bore - GDIM.payload.clearance;
}

/**
 * How far along +Z the aperture disc sits, so that its rim lands exactly on the ball's surface.
 *
 * A disc of radius `a` is inscribed in a sphere of radius `R` at axial offset `sqrt(R^2 - a^2)`;
 * back off half the disc's own thickness and its outer rim touches the sphere and goes no
 * further. Seating it by eye instead put its corner 0.5 mm outside the innermost bore — the
 * payload was, very slightly, inside the elevation ring set.
 *
 * @param {number} radius  disc radius
 * @param {number} depth   disc thickness along Z
 */
export function seatOnBall(radius, depth) {
  const R = payloadRadius();
  return Math.sqrt(Math.max(R * R - radius * radius, 0)) - depth / 2;
}

/**
 * How far the three axes are from being coplanar, at a given bank angle.
 *
 * The azimuth axis is Y. Bank rotates about Z, and elevation about the banked X. Their scalar
 * triple product works out to exactly `cos(bank)` — so this is the classic result, not an
 * approximation: at 90 degrees of bank the elevation axis lies on the azimuth axis, the two
 * become the same control, and the platform can no longer be pointed anywhere it likes.
 *
 * A real director either accepts that, adds a fourth axis, or restricts travel. This one
 * restricts travel and quotes the margin, because a schematic that draws a pose it cannot hold
 * is worse than one that says where it stops.
 */
export function axisIndependence(bankDeg) {
  return Math.abs(Math.cos(rad(bankDeg)));
}

/** The worst-case independence over the declared bank travel — the figure the title block quotes. */
export function lockMargin() {
  return {
    stopsAt: GDIM.limits.bank,
    shortOfLock: 90 - GDIM.limits.bank,
    independence: axisIndependence(GDIM.limits.bank),
  };
}

/**
 * Where the payload is looking, for a given set of stage COMMANDS. Unit vector, world frame.
 *
 * Takes the commanded elevation, not the graph's rotation. A positive `rotation.x` pitches the
 * optical axis DOWN, and a gunner who asks for +30 means up — so the elevation joint declares a
 * negated range and this negates to match. The sign convention is a fact about the machine, so
 * it lives here rather than in whoever is drawing it; same argument as the howitzer's.
 */
export function sightLine({ azimuth, bank, elevation }) {
  const a = rad(azimuth), b = rad(bank), c = rad(-elevation);
  // The optical axis is the payload's local +Z, carried by C (about X), then B (about Z),
  // then A (about Y).
  let v = [0, -Math.sin(c), Math.cos(c)];                                   // Rx(c) . z
  v = [v[0] * Math.cos(b) - v[1] * Math.sin(b), v[0] * Math.sin(b) + v[1] * Math.cos(b), v[2]]; // Rz(b)
  v = [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)]; // Ry(a)
  return v;
}

/** Overall envelope, derived: the crown bearing is the highest thing on the machine. */
export function overallHeight() {
  return GDIM.centre.y + GDIM.outerRadius + GDIM.frame.capBar.height / 2;
}

/** Overall width, derived: the arch posts, which stand clear of the outer race's sweep. */
export function overallWidth() {
  return Math.max(GDIM.frame.plate.width, 2 * (GDIM.frame.postX + GDIM.frame.post.w0 / 2));
}
