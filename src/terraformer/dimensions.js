/**
 * TF-3000 — planetary construction gantry. Every dimension in one place, in metres.
 *
 * **Axis warning, and it is the first thing to read.** This machine has its own axis names and
 * they are NOT the scene's. A gantry printer calls its long travel X, its cross-traverse Y and
 * its lift Z, which is the convention every CNC control on the reference sheet is labelled in.
 * This project's convention is +X right, +Y up, +Z forward. So:
 *
 *     machine X (travel)    ->  scene Z     rails run fore/aft
 *     machine Y (traverse)  ->  scene X     the beam spans left/right
 *     machine Z (lift)      ->  scene -Y    the mast comes down
 *
 * The joint LABELS are the machine's names, because that is what an operator reads; the graph is
 * in the scene's. That indirection is the same one the howitzer's elevation joint already makes,
 * where `rotation.x` positive pitches a gun down and the gunner's number has the opposite sign.
 * Keeping both and stating the mapping is the honest option; silently picking one is how a
 * drawing ends up describing a machine nobody can drive.
 *
 * Design brief, in the order it constrains things:
 *
 *   the work is    The printed structure is a separate group with a declared TOGGLE, because the
 *   optional      operator has to be able to take it away. That is the one new mechanism here,
 *                 and it is a boolean rather than a slider — see `buildTerraformer`.
 *   three         Travel, traverse, lift: all three prismatic, which the rack's service slide
 *   prismatic     made possible and nothing has used in quantity since. Two of them drive more
 *   axes          than one node, because a telescoping mast is one command and two stages.
 *   the sheet     The reference sheet claims a 120 x 80 x 20 m build volume. 120 and 20 are
 *   disagrees     reproducible — they are the rail travel and the lift stroke. 80 is not: the
 *   with itself   gantry it draws is a ~36 m span, and a carriage cannot traverse more than the
 *                 beam it rides. This file quotes what the geometry gives and says so.
 *
 * Nothing here is a claim about a machine that exists.
 */
export const TDIM = {
  /**
   * The rails. `travel` is the machine's X axis and the one figure taken from the sheet as
   * written; the modelled rail is longer than the stroke so the bogies never run off the end.
   */
  site: {
    travel: 120,
    /** Modelled travel either side of centre. The rail is derived from it — see `railLength()`. */
    travelRange: 11,
    railRunoff: 2.4,          // spare rail beyond the bogie at full travel
    railGauge: 5.2,          // between the two rails under one tower
    rail: { width: 0.55, height: 0.42 },
    sleeper: { width: 0.75, height: 0.28, length: 7.2, count: 24 },
  },

  /**
   * The towers. Two of them, one at each end of the beam, each on a tracked bogie with a pair
   * of splayed stabilising outriggers.
   */
  tower: {
    /** Half the gantry span: tower centres sit at x = ±this. */
    halfSpan: 18.0,
    section: { width: 5.2, depth: 6.0 },
    height: 20.0,            // pad to the beam's underside — the machine's Z stroke envelope
    taper: 0.78,             // section at the top, as a fraction of the base
    bogie: { width: 6.2, height: 2.1, length: 12.6 },
    track: { radius: 1.05, width: 1.5, length: 11.4, offset: 2.4 },
    /**
     * Outriggers. Both ends are DERIVED — `head` is the height up the tower they spring from and
     * `pad` is where they land — because the first cut set an angle instead, and an angle
     * mirrored across the fore/aft pair sent one leg of each pair pointing at the sky. Two
     * points and a `taperedBeam` cannot do that; an angle and a sign can.
     */
    outrigger: { head: 6.6, foot: 9.2, w0: 1.25, h0: 1.0, w1: 0.7, h1: 0.62 },
    pad: { width: 2.8, height: 0.6, depth: 3.4 },
    /** Mid-height service platform, where the reference sheet puts one on each tower. */
    platform: { y: 11.5, width: 6.4, depth: 7.2, thickness: 0.22, rail: 1.1 },
    ladder: { width: 0.72, rungs: 30, rail: 0.07 },
  },

  /** The bridge beam, its walkways, and the rail the carriage rides. */
  beam: {
    depth: 3.4,              // top to bottom of the box girder
    width: 4.2,              // fore/aft
    walkway: { width: 1.5, thickness: 0.16, rail: 1.05 },
    truss: { count: 14, thickness: 0.28, depth: 0.5 },
    /** Carriage rail on the beam's underside; the traverse stroke is derived from it. */
    rail: { width: 0.42, height: 0.30, inset: 2.6 },
  },

  /**
   * Material reservoirs: two silos on the beam's crown, feeding the head through hose runs.
   *
   * The hoses are the reference sheet's "material feed lines", and they are broken at the
   * traverse axis for the reason `cableRun` states in its own docstring — there is no skinning
   * here, so a hose authored across a driven axis tears. The FD-4 met this first.
   */
  silo: {
    radius: 2.15,
    barrel: 5.4,
    cone: 2.2,
    cap: { radius: 1.05, height: 0.9 },
    spacing: 5.6,
    band: { thickness: 0.09, count: 3 },
  },

  /** The traverse carriage and the telescoping mast hanging under it. */
  carriage: {
    body: { width: 3.4, height: 2.2, depth: 4.0 },
    roller: { radius: 0.42, width: 0.5, x: 1.35 },
    mast: {
      /** Two stages. Each stroke is declared; `liftStroke()` adds them up. */
      stage1: { width: 2.3, depth: 2.6, length: 3.4, stroke: 2.4, overlap: 0.5 },
      stage2: { width: 1.7, depth: 1.9, length: 2.9, stroke: 2.0 },
      collar: { width: 2.8, depth: 3.1, height: 0.55 },
    },
  },

  /**
   * The extrusion arm: four driven axes — swing about the mast, then shoulder, elbow and nozzle
   * pitch.
   *
   * The reference sheet calls it 6DoF. Four is what is modelled, and the two it does not have
   * are a forearm roll and a wrist yaw — which is a decision rather than an omission. This head
   * lays a bead on a horizontal plane; roll about the tool axis changes nothing it can do, and
   * with the gantry supplying three more axes underneath, the machine has seven in total.
   * Quoting "6DoF" over geometry that has four would be describing a different arm.
   */
  arm: {
    shoulder: { radius: 0.72, width: 1.7 },
    upper: { length: 3.0, w0: 1.05, h0: 1.15, w1: 0.80, h1: 0.88 },
    elbowHousing: { radius: 0.56, width: 1.35 },
    fore: { length: 2.3, w0: 0.84, h0: 0.90, w1: 0.58, h1: 0.62 },
    wristHousing: { radius: 0.40, width: 0.95 },
    head: { width: 0.82, height: 0.92, depth: 0.62 },
    heater: { radius: 0.30, height: 0.28 },
    nozzle: { radius: 0.26, tip: 0.07, length: 0.42 },
    limits: { swing: 180, shoulder: [0, 68], elbow: [-95, 10], wrist: [-40, 60] },
  },

  /**
   * The printed structure — the toggled group.
   *
   * A rounded-rectangle footprint printed in identical courses, which is why it is one
   * InstancedMesh: every layer is the same plan at a different height. `A` and `B` are the
   * centreline half-extents and `radius` the corner radius, all on the wall centreline.
   */
  structure: {
    A: 10.8,
    B: 8.0,
    radius: 3.4,
    thickness: 0.62,
    layer: { height: 0.28, count: 11, flat: 0.46, shoulder: 0.08 },
    /** Doorway left in the near wall. Runs the full printed height — the print is unfinished. */
    door: { width: 2.2 },
    slab: { margin: 1.2, thickness: 0.26 },
    /** Internal partitions, as [x, z0, z1] runs on the plan. */
    partitions: [[2.4, -6.4, 2.2], [-3.6, -0.6, 6.8]],
  },

  /**
   * The pose the drawing is dimensioned in.
   *
   * `lift` is not a round number. It is the setting that puts the orifice at working height over
   * the wall the machine is printing, which is the only pose in which a drawing of a printer
   * means anything — and `headClearance()` is what checks it rather than a comment claiming it.
   */
  rest: { travel: 0, traverse: -3.2, lift: 38, swing: 8, shoulder: 34, elbow: -55, wrist: 21 },
};

const T = TDIM;

/** Total lift stroke: both mast stages together. This is the machine's Z axis. */
export function liftStroke() {
  return T.carriage.mast.stage1.stroke + T.carriage.mast.stage2.stroke;
}

const rad = (d) => (d * Math.PI) / 180;

/**
 * Length of rail to model.
 *
 * Derived from the stroke and the bogie, not typed. At ±18 m of travel a 12 m bogie needs 24 m
 * of rail either side of centre plus a run-off; the first pass declared 46 m and the bogie
 * overhung the end by a metre at full travel. An invariant reads this back.
 */
export function railLength() {
  return 2 * (T.site.travelRange + T.tower.bogie.length / 2 + T.site.railRunoff);
}

/**
 * Where each mast stage sits at a given lift, as an ABSOLUTE local Y.
 *
 * Absolute, and that is the whole point of these existing. `applyArticulation` ASSIGNS a
 * prismatic target's position rather than offsetting it, so a joint declaring `from: 0, to:
 * -stroke` does not slide the node — it teleports it to the origin of its parent and then
 * slides from there, wiping the structural offset the builder set. The first cut of this subject
 * did exactly that: the mast snapped 2.75 m upward the instant the LIFT slider was touched, and
 * only a test comparing the graph against `nozzleHeight()` caught it, because the rest pose
 * looked perfect.
 *
 * Both the joint's endpoints and the builder's rest seating come from here, so they cannot
 * disagree about where the mast is.
 */
export function mastStageY(stage, lift) {
  const C = T.carriage;
  const t = Math.min(1, Math.max(0, lift / 100));
  return stage === 1
    ? -C.body.height - C.mast.collar.height - t * C.mast.stage1.stroke
    : -(C.mast.stage1.length - C.mast.stage1.overlap) - t * C.mast.stage2.stroke;
}

/**
 * Height of the nozzle orifice above the pad, at a given pose.
 *
 * Closed form rather than read off the graph, because it is used to CHOOSE the rest lift as well
 * as to check it — and a figure that came from the built scene could not be consulted before the
 * scene exists. The chain is a stack of vertical drops plus two hinges, and the arm's own
 * segments all lie in one plane, so it is a sum of cosines and nothing more.
 *
 * @param {object} pose  { lift (0-100), shoulder, elbow, wrist } in percent and degrees
 */
export function nozzleHeight(pose) {
  const C = T.carriage;
  const A = T.arm;
  // Both stage origins come from `mastStageY`, so this cannot drift from what the joint drives.
  let y = T.tower.height + mastStageY(1, pose.lift) + mastStageY(2, pose.lift) - C.mast.stage2.length;

  // The mount holds a fixed +90 about X, so every arm angle below is measured from straight down.
  const s = rad(pose.shoulder);
  const e = s + rad(pose.elbow);
  const w = e + rad(pose.wrist);
  y -= A.upper.length * Math.cos(s);
  y -= A.fore.length * Math.cos(e);
  y -= (A.head.depth + 0.2 + A.heater.height + A.nozzle.length) * Math.cos(w);
  return y;
}

/**
 * Clearance from the orifice down to the top of the printed wall, in the rest pose.
 *
 * Positive, and it has to be: a drawing dimensioned with the head buried in the work is a
 * drawing of a crash. There is an invariant, and it is the reason `rest.lift` is 38 rather than
 * whatever looked right in one view.
 */
export function headClearance() {
  return nozzleHeight(T.rest) - structureHeight();
}

/**
 * Traverse stroke — how far the carriage can run along the beam.
 *
 * Derived from the span and the carriage's own width rather than declared, because a stroke
 * longer than the rail is a number, not a motion. This is the axis the reference sheet calls
 * 80 m; the gantry it draws cannot give that, and the drawing quotes this instead.
 */
export function traverseStroke() {
  return 2 * (T.tower.halfSpan - T.beam.rail.inset) - T.carriage.body.width;
}

/** Half the traverse stroke — the carriage's travel either side of centre. */
export function traverseHalf() {
  return traverseStroke() / 2;
}

/** The build envelope the geometry actually produces, as [x, y, z] in machine axes. */
export function buildVolume() {
  return { x: T.site.travel, y: traverseStroke(), z: liftStroke() };
}

/** Beam crown height — where the silos stand. */
export function beamTopY() {
  return T.tower.height + T.beam.depth;
}

/** Overall height, pad to the top of a silo cap. */
export function overallHeight() {
  return beamTopY() + T.silo.barrel + T.silo.cap.height;
}

/** Gantry span, tower centre to tower centre. */
export function span() {
  return T.tower.halfSpan * 2;
}

/**
 * One printed course's section, as `[across, up]` — the profile form both `extrudeProfile` and
 * `arcSegment` take, which is what lets one function feed the straight runs and the corners.
 *
 * Pinched top and bottom, for the reason the FD-4's bead is: butted rectangular courses share
 * coplanar faces, and every course here is one instance of one geometry and therefore one part
 * id, so a rectangular section would render fifteen courses as one blank wall.
 */
export function courseSection() {
  const S = T.structure;
  const hw = S.thickness / 2;
  const hf = S.layer.flat / 2;
  const hh = S.layer.height / 2;
  const sh = hh - S.layer.shoulder;
  return [
    [-hf, -hh], [hf, -hh], [hw, -sh], [hw, sh], [hf, hh], [-hf, hh], [-hw, sh], [-hw, -sh],
  ];
}

/**
 * The footprint, as straight runs and corner arcs on the wall centreline.
 *
 * Straight runs are `{ x, z, length, axis }`; corners are `{ x, z, sx, sz }` quarter arcs about
 * the corner centre. The doorway splits the near run in two — an opening that goes all the way
 * up, because the print is unfinished and there is no lintel yet.
 */
export function footprint() {
  const S = T.structure;
  const r = S.radius;
  const sx = S.A - r;      // half-length of the runs along X
  const sz = S.B - r;      // half-length of the runs along Z
  const runs = [];

  // Far wall, unbroken.
  runs.push({ x: 0, z: S.B, length: 2 * sx, axis: 'x' });
  // Near wall, split by the doorway.
  const piece = (2 * sx - S.door.width) / 2;
  for (const side of [-1, 1]) {
    runs.push({ x: side * (S.door.width / 2 + piece / 2), z: -S.B, length: piece, axis: 'x' });
  }
  // Side walls.
  for (const side of [-1, 1]) {
    runs.push({ x: side * S.A, z: 0, length: 2 * sz, axis: 'z' });
  }
  // Internal partitions.
  for (const [px, z0, z1] of S.partitions) {
    runs.push({ x: px, z: (z0 + z1) / 2, length: z1 - z0, axis: 'z' });
  }

  const corners = [];
  for (const cx of [-1, 1]) {
    for (const cz of [-1, 1]) corners.push({ x: cx * sx, z: cz * sz, sx: cx, sz: cz });
  }
  return { runs, corners, radius: r };
}

/** Height of the printed wall as built. */
export function structureHeight() {
  const S = T.structure;
  return S.slab.thickness + S.layer.count * S.layer.height;
}

/** Metres of bead in one course — the figure a print time would be computed from. */
export function courseLength() {
  const f = footprint();
  const straight = f.runs.reduce((n, r) => n + r.length, 0);
  return straight + 2 * Math.PI * f.radius;   // four quarter arcs = one full circle
}

/** Total bead laid in the structure as printed. */
export function beadLength() {
  return courseLength() * T.structure.layer.count;
}
