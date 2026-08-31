/**
 * FD-4 — additive fabrication drone. Every dimension in one place, in metres.
 *
 * Axis convention as always: +X right, +Y up, +Z forward. The print bed is y = 0 and the
 * machine flies above it.
 *
 * Design brief, in the order it constrains things:
 *
 *   it prints     The deliverable is not just the drone. A fabricator with nothing under its
 *                 nozzle is a drawing of a drone, and the one mechanical claim this subject
 *                 makes — that the material leaving the reservoir is the material on the bed —
 *                 cannot be seen without the work. So the pier below is part of the scene, and
 *                 it is a sibling of the airframe rather than a child of the nozzle: it is
 *                 deposited in world space and must not fly away when the drone does.
 *   conservation  The bead is not decorative. `tankCapacity()` is derived from the job — one
 *                 tankful is exactly `pier.courses` courses of bead — and the reservoir's
 *                 length is then solved from that volume rather than typed. Drain the tank and
 *                 the pier is finished; half a tank is half a pier. There is an invariant.
 *   nothing is    The drone has no position sliders. Where it hovers is a CONSEQUENCE of how
 *   commanded     much material it has used: the nozzle must be over the next segment to be
 *                 laid, so the airframe is solved to put it there. See `solveHover`.
 *   whole folds   The course perimeter divides into a whole number of bead segments and the
 *                 tank divides into a whole number of courses. Both for the same reason the
 *                 container's corrugation snaps its pitch: a run that ends on half a segment is
 *                 a run nobody printed.
 *
 * Nothing here is a claim about a machine that exists. The proportions are those of a large
 * construction-scale multirotor: 1.68 m across the rotors, 27.6 L of feedstock aboard.
 */
export const FDIM = {
  /** The airframe. `hull` is the profile in the ZY plane, extruded along X. */
  body: {
    width: 0.62,
    profile: [
      [-0.45, -0.06], [-0.36, -0.15], [0.34, -0.15], [0.45, -0.04],
      [0.45, 0.08], [0.34, 0.16], [-0.36, 0.16], [-0.45, 0.07],
    ],
    // Dorsal spine, where the art puts a run of service panels.
    spine: { width: 0.30, height: 0.06, length: 0.66, y: 0.18, z: -0.02 },
    panel: { width: 0.19, height: 0.02, length: 0.13, y: 0.215, z: 0.16 },
    // Forward sensor pod. The one part of the machine that looks where it is going.
    sensor: { width: 0.26, height: 0.18, depth: 0.20, y: 0.02, z: 0.50 },
    lens: { radius: 0.055, depth: 0.03, y: 0.03, z: 0.605 },
  },

  /**
   * The power core. It is what the lift emitters are fed from, so it sits on the same accent
   * channel as they do.
   *
   * Slung under the belly rather than buried in it, and that is not styling. The brief calls the
   * core EXPOSED, and a lit barrel inside a solid hull is a claim no view of the machine can
   * check — it rendered as nothing at all in the first pass, from every one of the six views.
   * Dropping it below the underside and forward of the boom's yaw axis makes the word true from
   * the front, the side and the iso, which is the only sense in which a drawing can mean it.
   */
  core: {
    lens: { radius: 0.115, length: 0.20 },
    cage: { radius: 0.155, thickness: 0.022, count: 6 },
    ring: { radius: 0.145, height: 0.025, z: 0.13 },
    y: -0.16,
    z: 0.16,
  },

  /**
   * Rotors. Four masts at the frame corners, each carrying a two-blade prop.
   *
   * Not instanced, and for the reason the two-wheeler set out: each rotor hangs off a different
   * mast and spins on its own pivot, so the four carry four different articulated transforms
   * and an instance matrix cannot inherit a parent's.
   */
  rotor: {
    mast: { radius: 0.045, height: 0.16, x: 0.42, z: 0.36 },
    hub: { radius: 0.062, height: 0.07 },
    blade: { length: 0.30, w0: 0.075, h0: 0.018, w1: 0.045, h1: 0.010 },
    y: 0.14,
  },

  /**
   * Antigravity emitters: lit pads on the frame underside, inboard of the rotors. They carry no
   * mechanism at all — they are the fiction — but they are where the machine's mass is held up,
   * so they sit under the frame and not on it.
   */
  emitter: {
    pad: { radius: 0.10, height: 0.045, x: 0.30, z: 0.26 },
    lens: { radius: 0.082, height: 0.016 },
    y: -0.16,
  },

  /**
   * The feedstock reservoir: a ram-fed cylinder slung on the port flank, its axis along Z.
   *
   * `radius` is chosen; `length` is NOT — it is solved from the job in `tankLength()`, because
   * the tank's whole specification is "one tankful finishes the pier". Typing a length here and
   * a capacity somewhere else is how the two quietly stop agreeing.
   */
  tank: {
    radius: 0.135,
    x: -0.40,
    y: -0.03,
    z: -0.02,
    strap: { width: 0.05, thickness: 0.02, z: 0.16 },
    cap: { radius: 0.142, length: 0.035 },
    // The external level follower rides this rail. It is the piston's position made visible,
    // which is the only reason a sealed ram has anything to look at.
    rail: { radius: 0.014, x: -0.155 },
    collar: { radius: 0.034, length: 0.05 },
    outlet: { radius: 0.032, length: 0.10 },
  },

  /** Pump and metering block on the starboard flank — the tank's counterweight, and its drive. */
  pump: {
    body: { width: 0.16, height: 0.20, depth: 0.34, x: 0.40, y: -0.02, z: -0.02 },
    motor: { radius: 0.062, length: 0.13, x: 0.50, y: 0.06, z: 0.16 },
    manifold: { width: 0.10, height: 0.08, depth: 0.12, x: 0.38, y: -0.13, z: 0.14 },
  },

  /**
   * The print boom: yaw, pitch, a forearm, then a head pitch and the extruder.
   *
   * Three driven axes, and none of them positions the nozzle in the end — the airframe does
   * that. What they do is choose the machine's ATTITUDE relative to the work: swing the boom
   * and the drone slides across to compensate, which is the whole demonstration.
   *
   * `crank` is what makes that demonstration visible, and it was not in the first draft. A boom
   * that hangs straight down sits ON the yaw axis, so BOOM YAW rotates the head about its own
   * centreline and moves nothing at all — a dead control that looks like a working one. Cranking
   * the head forward of the axis gives the yaw a radius to swing through, which is what a real
   * swing-arm machine has for exactly this reason. An invariant now measures that the slider
   * moves the airframe, so a future edit cannot quietly straighten it out again.
   */
  boom: {
    yawY: -0.15,
    upper: 0.34,       // Boom_Pitch -> Head_Pitch, along the boom
    crank: 0.17,       // ...and forward of the yaw axis, so BOOM YAW has a radius
    upperBox: { w0: 0.13, h0: 0.13, w1: 0.10, h1: 0.10 },
    shoulder: { radius: 0.075, width: 0.20 },
    elbow: { radius: 0.058, width: 0.15 },
    collar: { radius: 0.085, height: 0.05 },
  },

  /**
   * The extruder head, stacked along the boom's local +Z (which points down): a gap, the body,
   * the heater band, then the cone. The orifice is wherever that stack ends — `nozzleTipZ()`
   * adds it up rather than a fifth number claiming to be the same total, because the hover
   * solve is written in terms of that figure and a builder that drifted from it would move the
   * whole machine off the work with nothing to notice.
   */
  head: {
    gap: 0.010,                                        // head pitch axis to the body's top face
    body: { width: 0.17, height: 0.16, depth: 0.140 },
    heater: { radius: 0.062, length: 0.045 },
    cone: { radius: 0.055, tip: 0.014, length: 0.040 },
    /** Clearance from the orifice down to the top of the course being laid. */
    standoff: 0.05,
  },

  /**
   * Four bracing limbs. Two driven pivots each, both on one STANCE slider — the limbs are a
   * landing gear, not a manipulator, and a machine whose legs can be posed independently is
   * claiming a capability this one does not have.
   */
  leg: {
    hip: { x: 0.26, y: -0.13, z: 0.30 },
    yoke: { radius: 0.055, width: 0.13 },
    thigh: { length: 0.30, w0: 0.10, h0: 0.11, w1: 0.085, h1: 0.09 },
    shin: { length: 0.36, w0: 0.075, h0: 0.085, w1: 0.06, h1: 0.06 },
    knee: { radius: 0.048, width: 0.11 },
    pad: { radius: 0.072, height: 0.035 },
    /** Splay of each limb away from the hull centreline, degrees about Y. */
    splay: 34,
    /**
     * STOWED at 0, DEPLOYED at 100 — folded up against the hull, or reaching down to land.
     *
     * The deployed pair is not free: `legsClearTheNozzle()` is what says so. A limb shorter
     * than the boom would put the machine's weight on the extruder every time it set down.
     */
    stance: { hip: [96, 14], knee: [-150, -22] },
  },

  /**
   * The work: a hollow square pier, printed one closed course at a time.
   *
   * `outer` and `courses` are the design; everything else about the bead is derived. The wall
   * is exactly one bead thick, so the centreline square is `outer - bead.width` on a side and
   * the volume of a course is its perimeter times the bead's cross-section.
   */
  pier: {
    outer: 0.40,
    courses: 24,
    segsPerCourse: 16,      // four a side; see `segmentLength()`
    /**
     * The bead's cross-section. `width` and `height` are the pitch — they are what the volume
     * arithmetic is done in, and what a course is stacked on.
     *
     * `flat` and `shoulder` are the shape, and they exist because the first draft laid the bead
     * as a plain box and the finished pier looked like a box. Butted boxes share coplanar faces
     * and one part id, so the outline filter found nothing between them and twenty-four courses
     * rendered as one solid wall. A real extruded bead is a squashed round: full width at
     * mid-height, pinched at top and bottom. Give it that section and each course interface is a
     * re-entrant groove, which the normal-discontinuity filter picks up — layer lines, from
     * geometry, with nothing asked of either renderer.
     *
     * The volume is unchanged by this in the only sense that matters: the pitch is still
     * `width x height`, which is what one course of material occupies once it is stacked.
     */
    bead: { width: 0.040, height: 0.020, flat: 0.028, shoulder: 0.006 },
    slab: { size: 0.62, thickness: 0.035 },
  },

  /**
   * The pose the drawing is dimensioned in. `charge` is a FRACTION of a tankful — the litre
   * figure is derived, so a change to the pier's size moves the rest pose with it rather than
   * leaving a number here that used to mean "just over half".
   */
  rest: { charge: 0.55, boomYaw: 0, boomPitch: 0, headPitch: 0, stance: 55, rotors: 0 },

  limits: {
    boomYaw: 42,
    boomPitch: 26,
    headPitch: 18,
  },
};

const P = FDIM.pier;

/** Cross-section of one deposited bead — its pitch, which is what stacks. */
export function beadArea() {
  return P.bead.width * P.bead.height;
}

/**
 * The bead's section as a closed convex profile, in the [z, y] form `extrudeProfile` wants.
 *
 * An octagon: full width across the middle, pinched to `flat` at top and bottom over a
 * `shoulder` of height. See the note on `pier.bead` for why it is not a rectangle.
 */
export function beadProfile() {
  const hw = P.bead.width / 2;
  const hf = P.bead.flat / 2;
  const hh = P.bead.height / 2;
  const sh = hh - P.bead.shoulder;
  return [
    [-hf, -hh], [hf, -hh], [hw, -sh], [hw, sh], [hf, hh], [-hf, hh], [-hw, sh], [-hw, -sh],
  ];
}

/** Side of the bead's CENTRELINE square — the wall is one bead thick, inset half a bead. */
export function courseSide() {
  return P.outer - P.bead.width;
}

/** Length of bead in one closed course. */
export function coursePerimeter() {
  return 4 * courseSide();
}

/**
 * Length of one deposited segment.
 *
 * `segsPerCourse` is a multiple of four and the course is a square, so this divides the side
 * exactly and no course ends on a partial segment. Same argument as `foldPitch` on the
 * container: a run that stops halfway through a segment is a run nobody printed.
 */
export function segmentLength() {
  return coursePerimeter() / P.segsPerCourse;
}

/** Total segments in a finished pier. */
export function totalSegments() {
  return P.courses * P.segsPerCourse;
}

/** Volume of feedstock in one course. */
export function courseVolume() {
  return coursePerimeter() * beadArea();
}

/**
 * Reservoir capacity, in cubic metres.
 *
 * Derived from the job rather than declared: a tankful is exactly `pier.courses` courses. That
 * is the design decision — the machine carries one pier — and every other figure about the
 * reservoir follows from it.
 */
export function tankCapacity() {
  return courseVolume() * P.courses;
}

/** Reservoir capacity in litres, which is the unit anyone loading it would use. */
export function tankLitres() {
  return tankCapacity() * 1000;
}

/** Reservoir barrel length, solved from the capacity and the chosen radius. */
export function tankLength() {
  return tankCapacity() / (Math.PI * FDIM.tank.radius * FDIM.tank.radius);
}

/** Finished pier height. */
export function pierHeight() {
  return P.courses * P.bead.height;
}

/**
 * Segments laid, given the charge remaining in litres.
 *
 * Quantised on purpose. The bead is deposited in discrete segments, so the length reported is
 * the length actually laid rather than the length commanded — the drawing should not claim a
 * precision the geometry does not have.
 */
export function segmentsLaid(chargeLitres) {
  const used = 1 - clamp01(chargeLitres / tankLitres());
  return Math.round(used * totalSegments());
}

/** Metres of bead on the bed at a given charge. */
export function beadLaid(chargeLitres) {
  return segmentsLaid(chargeLitres) * segmentLength();
}

/**
 * Where segment `i` sits, and which way it runs.
 *
 * The path is a closed square per course, walked anticlockwise from the -X/-Z corner, with each
 * course stacked one bead height above the last. Returned in the print bed's frame.
 *
 * @param {number} i  segment index, 0-based
 * @returns {{x:number, y:number, z:number, yaw:number}}  yaw in radians, about Y
 */
export function beadPose(i) {
  const n = P.segsPerCourse;
  const course = Math.floor(i / n);
  const within = i - course * n;
  const perSide = n / 4;
  const side = Math.floor(within / perSide);
  const step = within - side * perSide;

  const h = courseSide() / 2;
  const len = segmentLength();
  // Corner the side starts from, and the direction it runs, per side of the square.
  const starts = [[-h, -h], [-h, h], [h, h], [h, -h]];
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const yaws = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

  const [sx, sz] = starts[side];
  const [dx, dz] = dirs[side];
  const along = (step + 0.5) * len;

  return {
    x: sx + dx * along,
    z: sz + dz * along,
    y: P.slab.thickness + P.bead.height * (course + 0.5),
    yaw: yaws[side],
  };
}

/**
 * Where the nozzle orifice has to be, given the charge remaining.
 *
 * The next segment to be laid is the one the head is over — so the target is the top face of
 * that segment plus the standoff. At an empty tank there is no next segment and the head holds
 * over the last one it laid, which is where a real machine would sit waiting for a refill.
 */
export function nozzleTarget(chargeLitres) {
  const k = Math.min(segmentsLaid(chargeLitres), totalSegments() - 1);
  const p = beadPose(k);
  return { x: p.x, y: p.y + P.bead.height / 2 + FDIM.head.standoff, z: p.z };
}

/** Rotor tip-to-tip span — the figure that decides whether the machine fits through a door. */
export function rotorSpan() {
  const R = FDIM.rotor;
  return 2 * (Math.hypot(R.mast.x, R.mast.z) + R.blade.length);
}

/** Overall length and width of the airframe, rotors excluded. */
export function airframeLength() {
  const zs = FDIM.body.profile.map((p) => p[0]);
  const nose = FDIM.body.sensor.z + FDIM.body.sensor.depth / 2;
  return Math.max(Math.max(...zs), nose) - Math.min(...zs);
}

/**
 * Ground clearance under a deployed limb, measured from the hull datum.
 *
 * Reported rather than used: the machine flies, so this is what it would stand on if it landed,
 * and quoting it is how a reader can tell the legs are long enough to keep the boom off the
 * ground.
 */
export function legReach(stance) {
  const L = FDIM.leg;
  const t = clamp01(stance / 100);
  const hip = L.stance.hip[0] + t * (L.stance.hip[1] - L.stance.hip[0]);
  const knee = L.stance.knee[0] + t * (L.stance.knee[1] - L.stance.knee[0]);
  const rad = (d) => (d * Math.PI) / 180;
  return -L.hip.y + L.thigh.length * Math.cos(rad(hip))
    + L.shin.length * Math.cos(rad(hip + knee));
}

/** Distance from the head pitch axis down to the orifice — the sum of what is bolted on. */
export function nozzleTipZ() {
  const H = FDIM.head;
  return H.gap + H.body.depth + H.heater.length + H.cone.length;
}

/** How far the orifice hangs below the hull datum, with the boom straight down. */
export function boomDrop() {
  return -FDIM.boom.yawY + FDIM.boom.upper + nozzleTipZ();
}

/**
 * The design constraint that keeps a landing from being a repair.
 *
 * A limb fully deployed has to reach further below the hull than the boom does, or the first
 * thing to touch the ground is the nozzle. The pair in `leg.stance` and the boom's link lengths
 * are therefore not independent tastes, in the same way the RA-6's wrist roll and tool pitch
 * are not — and this says so rather than a clamp hiding it.
 */
export function legsClearTheNozzle() {
  return legReach(100) > boomDrop();
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}
