/**
 * GT-9 — transit gate. Every dimension in one place, in metres.
 *
 * Axis convention as always: +X right, +Y up, +Z forward. The gate stands on y = 0 and its
 * aperture faces +Z, so the default iso view looks through it.
 *
 * Design brief, in the order it constrains things:
 *
 *   the hole is    The aperture is EMPTY and stays empty. Whatever goes through it is composited
 *   the product    downstream in another application, so this subject's job is to hand that
 *                  application a volume it can rely on: a named node whose transform IS the
 *                  clear cylinder, a figure in the title block, and an invariant that no vertex
 *                  in the graph intrudes on it in any pose. Every subject before this one was
 *                  defined by what it has. This one is also defined by what it must not have.
 *   built of arcs  Three concentric rows of segments and nothing that is not a ring. That is
 *                  what `arcSegment` was added for; a portal made of straight extrusions
 *                  rotated into place would carry its curvature in transforms rather than in
 *                  its geometry, and would show facets at every seam.
 *   clearance is   The rows counter-rotate, so the gaps between them are running clearances and
 *   a dimension    not styling. They are declared once here and checked, because two rows that
 *                  overlap by a millimetre are welded together and the drawing would not say so.
 *   one accent     Everything lit is on one channel. The brief asks for blue, and a second hue
 *                  would be the drawing inventing a distinction the machine does not have.
 *
 * Nothing here is a claim about a machine that exists. The proportions are those of a
 * vehicle-scale gate: 6.48 m across the outer armour, 3.60 m of clear aperture.
 */
export const PDIM = {
  /**
   * The clear bore radius. This is the deliverable's hole, and it is the ONE number the rest of
   * the ring is laid out from — the liner's inner face is this radius, every row is stacked
   * outward from it, and `apertureRadius()` reads it back. A second number claiming to be the
   * same radius is how a bore ends up 20 mm narrower than the drawing says.
   */
  bore: 1.80,

  /** Height of the aperture axis above the pad. */
  centreY: 4.05,

  /**
   * The three concentric rows, inboard to outboard.
   *
   * `r0`/`r1` are radii, `depth` is the extent along Z, `count` is segments in the row. Each row
   * starts `clearance` outboard of the one inside it — see `rowGaps()`.
   */
  rows: {
    liner: { r0: 1.80, r1: 1.98, depth: 1.10 },
    rotorA: { r0: 2.02, r1: 2.40, depth: 0.88, count: 18, arcSteps: 6 },
    rotorB: { r0: 2.44, r1: 2.78, depth: 1.00, count: 12, arcSteps: 8 },
    stator: { r0: 2.82, r1: 3.24, depth: 1.16, count: 8, arcSteps: 12 },
  },

  /** Running clearance between rows. Declared, then asserted — not measured off the drawing. */
  clearance: 0.04,

  /**
   * Angular gap between neighbours in a row, as a fraction of the pitch.
   *
   * Every row is one InstancedMesh and therefore one part id, so two segments that touched would
   * show no seam whatever — the failure the FD-4's bead ran into. Here the segments simply do
   * not touch, which is also what a segmented ring looks like.
   */
  gap: 0.09,

  /**
   * Armour blocks. Two rows, and two rows because one was not enough: a ring carrying a single
   * band of identical boxes reads as a cog. `rim` sits on the outer face, one per armour
   * segment; `face` is a finer row of service boxes lying on the ring's front face at a
   * different count, so the two never line up and the silhouette breaks at a different pitch
   * from the segmentation.
   */
  block: {
    rim: { radial: 0.38, tangential: 0.62, axial: 0.56, count: 8 },
    face: { radial: 0.30, tangential: 0.30, axial: 0.20, count: 20, radius: 2.99 },
  },

  /**
   * Power pods on the rim: eight capacitor banks, each with a lit core that reads from the
   * front, the back and the edge. These are the brief's "power sources with blue accent".
   *
   * Set at half a stator pitch so they straddle the gaps between armour segments rather than
   * sitting on top of them.
   */
  pod: {
    count: 8,
    body: { radial: 0.62, tangential: 0.94, axial: 0.98 },
    core: { radius: 0.19, length: 1.14 },
    collar: { radius: 0.245, length: 0.12 },
    vane: { length: 0.62, w0: 0.09, h0: 0.30, w1: 0.05, h1: 0.20, offset: 0.30 },
    /** Vane travel: folded back along the rim at 0, fanned out at 100. */
    fan: { stowed: 104, deployed: 28 },
  },

  /** Thin lit rings on the liner's two faces — the accent the brief puts "on the edges". */
  edge: { radius: 1.99, thickness: 0.05, inset: 0.03 },

  /**
   * The base. A turntable in the plinth carries the whole gate, and two buttresses splay from
   * the ring's lower flanks down to it.
   */
  base: {
    plinth: { width: 6.90, height: 0.42, depth: 3.20 },
    slew: { radius: 1.62, height: 0.26 },
    pad: { width: 1.44, height: 0.18, depth: 2.10, x: 2.86 },
    anchor: { radius: 0.17, height: 0.24, x: 3.06, z: 1.30 },
    /**
     * Where each buttress meets the ring, in degrees from +X counter-clockwise.
     *
     * Low on the ring and inboard of the pads, so the legs splay OUTWARD on the way down. The
     * first pass put this at 217°, which is outboard of the pads — the legs narrowed as they
     * descended and the base read as one solid wedge rather than two struts. A buttress that
     * does not widen its stance is not bracing anything.
     */
    legAngle: 242,
    leg: { w0: 0.92, h0: 0.58, w1: 0.56, h1: 0.42 },
    conduit: { radius: 0.09 },
  },

  /** Declared travel. */
  limits: { yaw: 180, rotor: 360 },

  /** The pose the drawing is dimensioned in. */
  rest: { yaw: 0, rotorA: 0, rotorB: 0, vanes: 40 },
};

const R = PDIM.rows;

/** The clear bore radius — the aperture's whole specification, read from where it is defined. */
export function apertureRadius() {
  return PDIM.bore;
}

/**
 * Depth of the clear volume: the deepest row, so the bore is clear all the way through rather
 * than only across the narrowest part of it.
 */
export function apertureDepth() {
  return Math.max(R.liner.depth, R.rotorA.depth, R.rotorB.depth, R.stator.depth);
}

/** Clear area of the aperture — the figure anyone sizing an effect to fit it would want. */
export function apertureArea() {
  return Math.PI * apertureRadius() ** 2;
}

/** Overall outer radius of the armour. */
export function outerRadius() {
  return R.stator.r1;
}

/** Overall height, pad to the crown of the ring. */
export function overallHeight() {
  return PDIM.centreY + outerRadius();
}

/**
 * The gap between each pair of adjacent rows.
 *
 * Returned rather than asserted here so the invariant can print what it found. Two rows that
 * counter-rotate through each other is not a thing a drawing can show and not a thing a viewer
 * would catch: the overlap is inside the armour.
 */
export function rowGaps() {
  return [
    { name: 'liner → rotor A', gap: R.rotorA.r0 - R.liner.r1 },
    { name: 'rotor A → rotor B', gap: R.rotorB.r0 - R.rotorA.r1 },
    { name: 'rotor B → stator', gap: R.stator.r0 - R.rotorB.r1 },
  ];
}

/** Total segments across the three segmented rows. */
export function segmentCount() {
  return R.rotorA.count + R.rotorB.count + R.stator.count;
}

/**
 * A row's profile, as `[radial offset, z]` for `arcSegment`.
 *
 * Chamfered on all four corners, which is what makes a row of these read as pressed armour
 * rather than as a stack of tubes — and what gives the outline filter a normal break at every
 * face transition.
 */
export function rowProfile(row, chamfer = 0.10) {
  const t = row.r1 - row.r0;
  const h = row.depth / 2;
  const c = Math.min(chamfer, t * 0.34, h * 0.34);
  return [
    [c, -h], [t - c, -h], [t, -h + c],
    [t, h - c], [t - c, h], [c, h], [0, h - c], [0, -h + c],
  ];
}

/** Where the pods sit: half a stator pitch off the armour segments, so they straddle the gaps. */
export function podAngles() {
  const pitch = (Math.PI * 2) / PDIM.pod.count;
  const offset = Math.PI / R.stator.count;
  return Array.from({ length: PDIM.pod.count }, (_, i) => i * pitch + offset);
}

/** Vane angle at a given fan setting, 0 stowed to 100 deployed. */
export function vaneAngle(fan) {
  const F = PDIM.pod.fan;
  const t = Math.min(1, Math.max(0, fan / 100));
  return F.stowed + t * (F.deployed - F.stowed);
}

/**
 * Where a buttress meets the ring, in the gate's own frame.
 *
 * Derived from the leg angle and the armour's outer radius rather than typed, so moving the ring
 * up or widening the armour carries the legs with it instead of leaving them in the air. The
 * same argument the MK-CX's fenders lost the first time.
 */
export function legFoot(side) {
  const a = (PDIM.base.legAngle * Math.PI) / 180;
  const x = Math.cos(a) * outerRadius();
  const y = Math.sin(a) * outerRadius() + PDIM.centreY;
  return { x: side < 0 ? x : -x, y };
}
