/**
 * SERVER01 — 42U liquid-assisted compute rack. Every dimension in one place, in metres.
 *
 * Axis convention as always: +X right, +Y up, +Z forward. The front of the rack faces +Z.
 *
 * Design brief, in the order it constrains things:
 *
 *   it is an   A rack is not a shape, it is a PITCH. EIA-310 fixes the rack unit at 44.45 mm
 *   array      and everything bolts to that grid, so the layout below is a list of U spans and
 *              every Y on the machine is `u * U`. Nothing here is eyeballed vertically.
 *   identical  Twenty-eight of the sleds are the same part at the same pitch — twenty-eight
 *              copies of one static transform, which is precisely the criterion the walker's
 *              docstring gives for when to instance and when not to. So they are an
 *              InstancedMesh, and this is the first subject since the tanks to earn one.
 *   one is out The twenty-ninth is not, because it is being serviced: it rides a slide and
 *              carries a different transform, so it is its own node. That is the same criterion
 *              read backwards, and it is why the rack needed the project's first PRISMATIC
 *              joint — every articulation before this one was a hinge.
 *   lit        Green light accents, in the manner of the MK-CX's lift emitters, plus a red
 *              emergency stop. Those are accent channels 3 and 4; see `EMISSIVE` in
 *              src/lib/parts.js for why four is the ceiling.
 *
 * Dimensions are the published EIA-310 rack standard — 44.45 mm per U, 482.6 mm mounting width
 * — which are facts about the format rather than about any particular product. Nothing here is
 * modelled on a specific vendor's machine and it carries no maker's marks.
 */
export const SDIM = {
  /** The rack unit. Everything vertical is a multiple of this. */
  U: 0.04445,
  units: 42,

  /** EIA-310: the mounting flanges are 482.6 mm apart. The frame is wider. */
  mountWidth: 0.4826,

  frame: {
    width: 0.600,
    depth: 1.200,
    plinth: 0.075,
    cap: 0.058,
    post: 0.052,              // square section of the four corner posts
    railWidth: 0.048,         // the EIA mounting rails
    railHoleR: 0.006,
    panelThickness: 0.014,
    foot: { radius: 0.030, height: 0.052, inset: 0.09 },
    // Perforation on the side panels, as a coarse grid of slots — a rack breathes.
    vent: { width: 0.012, height: 0.052, cols: 3, rows: 9, margin: 0.10 },
  },

  /**
   * The rack elevation, bottom to top. `u` is the starting unit (1-based, as a rack is
   * labelled) and `h` the height in U. This list IS the machine's layout: change a span and
   * everything above it moves, because nothing below reads a hard-coded Y.
   */
  elevation: [
    { u: 1, h: 2, kind: 'blank', name: 'Vent_Blank_Lower' },
    { u: 3, h: 3, kind: 'power', name: 'Power_Shelf' },
    { u: 6, h: 14, kind: 'sled' },
    { u: 20, h: 1, kind: 'service', name: 'Service_Sled' },
    { u: 21, h: 3, kind: 'interconnect', name: 'Interconnect' },
    { u: 24, h: 14, kind: 'sled' },
    { u: 38, h: 3, kind: 'switch', name: 'Switch_Unit' },
    { u: 41, h: 2, kind: 'cable', name: 'Cable_Manager' },
  ],

  /** One compute sled: the part that repeats 28 times. */
  sled: {
    depth: 0.86,
    inset: 0.010,             // clearance each side inside the mounting width
    faceThickness: 0.016,
    bezel: { width: 0.010, depth: 0.008 },
    handle: { width: 0.030, height: 0.020, depth: 0.026, x: 0.196 },
    // The light accent, in the manner of the MK-CX's lift emitters: a slot down the face
    // rather than a dot, so the block of sleds reads as one lit column.
    light: { width: 0.150, height: 0.008, depth: 0.006, x: 0.052 },
    statusLed: { size: 0.010, x: 0.222 },
  },

  /** The one sled that is pulled out, and what it reveals. */
  service: {
    travel: 0.62,             // metres of slide, the prismatic joint's range
    board: { width: 0.42, height: 0.006, depth: 0.66 },
    // The IC package: a substrate carrier, a lidded die, and a heatsink over it.
    ic: {
      substrate: { width: 0.115, height: 0.006, depth: 0.115 },
      lid: { width: 0.082, height: 0.008, depth: 0.082 },
      die: { width: 0.052, height: 0.002, depth: 0.052 },
      z: -0.06,
    },
    heatsink: { width: 0.130, depth: 0.130, finHeight: 0.042, fins: 11, finThickness: 0.004 },
    dimm: { width: 0.008, height: 0.034, depth: 0.128, count: 8, pitch: 0.019, x: 0.135, z: 0.10 },
    vrm: { width: 0.030, height: 0.014, depth: 0.030, count: 5, pitch: 0.038, z: 0.24 },
    rails: { width: 0.014, height: 0.012, x: 0.212 },
  },

  /** Power shelf: breakers, an illuminated start pair and the emergency stop. */
  power: {
    depth: 0.30,
    epo: { radius: 0.026, height: 0.020, x: -0.170 },      // red mushroom, channel 4
    epoCollar: { radius: 0.036, height: 0.008 },
    start: { radius: 0.017, height: 0.012, x: [0.120, 0.170] },  // white, with a green ring
    startRing: { radius: 0.023, height: 0.005 },
    breaker: { width: 0.018, height: 0.034, depth: 0.014, count: 6, pitch: 0.026, x: -0.075 },
  },

  /** Interconnect trays and the top-of-rack switch: port rows on channel 2. */
  ports: {
    size: 0.010,
    pitch: 0.017,
    count: 20,
    rowY: 0.012,
  },

  /**
   * The rear door is a fan wall. Six rotors on one spin joint — they are identical and would
   * instance, but each one turns, so each carries a different animated transform and instance
   * matrices cannot inherit a parent's. Same call the walker made about its feet.
   */
  fans: {
    rows: 3,
    cols: 2,
    radius: 0.118,
    hubRadius: 0.034,
    blades: 7,
    bladeLength: 0.078,
    bladeWidth: 0.030,
    bladeThickness: 0.004,
    ringThickness: 0.014,
    ringWidth: 0.026,
  },

  door: { thickness: 0.020, open: 132, handle: { width: 0.024, height: 0.11, depth: 0.030 } },

  /**
   * The pose the drawing ships in.
   *
   * Open, and deliberately. Every other subject rests closed because a vehicle's silhouette IS
   * the drawing; a rack's silhouette is a box, and everything worth dimensioning — the sled
   * array, the package on the serviced board, the buttons, the fan wall — is inside it. A
   * service schematic that opens on a shut cabinet has drawn the one view that says nothing.
   */
  rest: { frontDoor: 118, rearDoor: 96, sled: 0.42, fans: 0 },
};

/** Height of the mounting field: 42U of usable rack. */
export function fieldHeight() {
  return SDIM.units * SDIM.U;
}

/** Overall height, derived: plinth + 42U + cap. Nothing about this is typed. */
export function overallHeight() {
  return SDIM.frame.plinth + fieldHeight() + SDIM.frame.cap;
}

/** The Y of the BOTTOM of rack unit `u` (1-based, counted from the bottom as racks are). */
export function unitY(u) {
  return SDIM.frame.plinth + (u - 1) * SDIM.U;
}

/**
 * The Z of the mounting face — where every sled, tray and panel front sits.
 *
 * Exported rather than recomputed at each call site because the sliding sled's joint needs it
 * too: a `prop: 'position'` target sets an ABSOLUTE coordinate, exactly as a rotation target
 * sets an absolute angle, so its `from` is the node's rest Z and not zero.
 */
export function faceZ() {
  return SDIM.frame.depth / 2 - 0.07;
}

/** The Y of the centre of a span starting at `u` and `h` units tall. */
export function spanCentreY(u, h) {
  return unitY(u) + (h * SDIM.U) / 2;
}

/**
 * Every 1U slot occupied by an instanced compute sled, bottom to top.
 *
 * Derived from the elevation table rather than listed, so moving the switch or growing the
 * interconnect block re-lays the sleds instead of leaving a hole nobody notices.
 */
export function sledSlots() {
  const out = [];
  for (const row of SDIM.elevation) {
    if (row.kind !== 'sled') continue;
    for (let i = 0; i < row.h; i++) out.push(row.u + i);
  }
  return out;
}

/** The single serviced slot — the sled that is NOT in the instanced array. */
export function serviceSlot() {
  return SDIM.elevation.find((r) => r.kind === 'service').u;
}

/** Fan centres on the rear door, as [x, y] about the door's own middle. */
export function fanLayout() {
  const f = SDIM.fans;
  const pitchX = (SDIM.frame.width - 0.09) / f.cols;
  const pitchY = (fieldHeight() * 0.94) / f.rows;
  const out = [];
  for (let r = 0; r < f.rows; r++) {
    for (let c = 0; c < f.cols; c++) {
      out.push({
        name: `Fan_${r * f.cols + c + 1}`,
        x: (c - (f.cols - 1) / 2) * pitchX,
        y: (r - (f.rows - 1) / 2) * pitchY,
      });
    }
  }
  return out;
}

/** Every U in the elevation is accounted for exactly once — checked by an invariant. */
export function elevationCoverage() {
  const seen = new Map();
  for (const row of SDIM.elevation) {
    for (let i = 0; i < row.h; i++) {
      const u = row.u + i;
      seen.set(u, (seen.get(u) || 0) + 1);
    }
  }
  return seen;
}
