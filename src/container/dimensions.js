/**
 * CX-20 — 20 ft intermodal container, powered variant. Every dimension in one place, in metres.
 *
 * Axis convention as always: +X right, +Y up, +Z forward. It sits on y = 0 and the doors are at
 * the +Z end.
 *
 * Design brief, in the order it constrains things:
 *
 *   the box is  ISO 668 fixes a 1CC at 6.058 x 2.438 x 2.591 m and ISO 1161 fixes the corner
 *   not free    castings that make it stackable. Those are the whole reason a container is
 *               interesting: it is a shape agreed on by everybody, and a futuristic one that
 *               stopped fitting a spreader would not be a container. The envelope is derived
 *               and checked, not styled.
 *   corrugated  A container's walls are folded sheet, which nothing in the shared generators
 *               could make — `extrudeProfile` fans its caps on an assumption of convexity and a
 *               corrugation is about as non-convex as a profile gets. Hence `corrugatedPanel`.
 *   it is       Doors open, so this is the first subject you look INTO. That is not a framing
 *   hollow      choice, it is a modelling constraint: the blueprint pass renders DoubleSide and
 *               would have been perfectly happy with walls made of planes, while the game view
 *               would have shown straight out through the back. The walls are real sheets with
 *               thickness, which costs nothing at either renderer.
 *   powered     The futuristic part, and it is deliberately restrained: lit door seals, a
 *               telemetry panel, lit floor strips and a lock indicator per casting. A container
 *               that stopped looking like a container would have thrown away the brief.
 */
export const CDIM = {
  /** ISO 668, series 1 freight container, size code 1CC. Facts about the format. */
  iso: {
    length: 6.058,
    width: 2.438,
    height: 2.591,
    // ISO 1161: the corner fitting, which is what a crane and a twistlock actually grip.
    casting: { length: 0.178, width: 0.162, height: 0.118 },
  },

  /** Structural frame: corner posts, rails and sills. */
  frame: {
    post: 0.160,              // corner post section, square-ish
    postDepth: 0.120,
    rail: { height: 0.122, depth: 0.104 },     // top and bottom side rails
    header: { height: 0.130, depth: 0.108 },   // front header and door header
    sill: { height: 0.126, depth: 0.112 },
    floorThickness: 0.028,
    crossMember: { height: 0.092, depth: 0.048, count: 11 },
  },

  /** The folded sheet. `nominal` is a target pitch; the real one is snapped to divide the panel. */
  corrugation: {
    thickness: 0.006,
    depth: 0.036,
    nominal: 0.290,
    crest: 0.32,
    trough: 0.32,
    roofDepth: 0.024,
    roofNominal: 0.240,
  },

  /**
   * Doors. Two leaves on the rear header and sill, opening flat back against the side walls —
   * the 270 degrees a container actually swings, not the 90 a cupboard does.
   */
  door: {
    open: 268,
    thickness: 0.006,
    depth: 0.030,
    recess: 0.078,        // how far the leaf sits behind the corner posts
    hingeInset: 0.020,    // hinge line, in from the envelope's side face
    nominal: 0.265,
    frameSection: 0.062,
    // Vertical cam-lock rods: two per leaf, which is what holds a door against a sea.
    rod: { radius: 0.019, x: [0.30, 0.86], turn: 118 },
    handle: { length: 0.28, width: 0.034, height: 0.044, y: 0.02 },
    keeper: { width: 0.05, height: 0.07, depth: 0.05 },
    // The powered part: a lit seal down each leading edge.
    seal: { width: 0.014, depth: 0.010 },
  },

  /** Interior fit-out. Lit, and carrying a standardised unit load. */
  interior: {
    lining: 0.010,
    floorStrip: { width: 0.040, height: 0.006, inset: 0.22 },
    // Unit loads: identical pallets on a grid, which is the entire point of the format.
    pallet: {
      width: 1.000, depth: 1.200, height: 0.144,
      load: { height: 0.86, inset: 0.03 },
      cols: 2, rows: 4, gap: 0.02,
      // Loaded from the front, as freight is, leaving working room at the doors. Centring the
      // grid instead put the last row under the folded-back door hardware.
      zOffset: -0.26,
    },
  },

  /** The powered fittings, on the front end and around the door frame. */
  tech: {
    panel: { width: 0.46, height: 0.30, depth: 0.05, y: 1.86 },
    readout: { width: 0.36, height: 0.11, depth: 0.02 },
    vent: { width: 0.52, height: 0.20, depth: 0.06, y: 1.24 },
    lockLamp: { radius: 0.026, height: 0.016 },
    idPlate: { width: 0.52, height: 0.14, depth: 0.012, y: 0.62 },
  },

  /** The pose the drawing ships in: open, because the brief is a container with its doors open. */
  rest: { doorL: 262, doorR: 238, locks: 100 },
};

/**
 * Clear internal length: the inner face of the corrugated front wall to the inner face of a
 * closed door leaf.
 *
 * Measured off the sheet, not the posts. The first version subtracted the corner posts as well
 * and came out 5.75 m against a real 1CC's 5.90 — the corrugation bulges OUTWARD, so the
 * interior boundary is the trough, and the post is behind the wall rather than inside it.
 */
/**
 * One door leaf's width.
 *
 * Hinged near the OUTER face of the corner post, not its inner edge, and wide enough that the
 * two leaves meet on the centreline — which is what lets a container door close OVER its frame
 * and, folded back, lie outside the side wall rather than across the opening. Hung off the
 * inner edge instead, a leaf folded to 262 degrees ends up inside the box's own footprint,
 * which is what the cargo-space invariant caught.
 */
export function leafWidth() {
  return CDIM.iso.width / 2 - CDIM.door.hingeInset;
}

export function interiorLength() {
  const C = CDIM.corrugation;
  return CDIM.iso.length - (C.depth + C.thickness) - (CDIM.door.depth + CDIM.door.thickness);
}

/** Clear internal width, between the corrugated side walls at their troughs. */
export function interiorWidth() {
  return CDIM.iso.width - 2 * (CDIM.corrugation.depth + CDIM.corrugation.thickness);
}

/** Clear internal height, floor to roof. */
export function interiorHeight() {
  return CDIM.iso.height - CDIM.frame.sill.height - CDIM.frame.floorThickness
    - CDIM.corrugation.roofDepth - CDIM.corrugation.thickness;
}

/** Internal volume — the figure a container is actually sold on. */
export function interiorVolume() {
  return interiorLength() * interiorWidth() * interiorHeight();
}

/**
 * The eight ISO 1161 corner fittings, as [x, y, z] centres.
 *
 * Derived from the envelope rather than listed, because their whole job is to be at the corners
 * of it — a casting anywhere else is a container no spreader can lift.
 */
export function castingLayout() {
  const { length, width, height, casting } = CDIM.iso;
  const out = [];
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        out.push({
          name: `Casting_${sy < 0 ? 'B' : 'T'}${sz > 0 ? 'F' : 'R'}${sx < 0 ? 'L' : 'R'}`,
          x: sx * (width / 2 - casting.width / 2),
          y: sy < 0 ? casting.height / 2 : height - casting.height / 2,
          z: sz * (length / 2 - casting.length / 2),
          sx, sy, sz,
        });
      }
    }
  }
  return out;
}

/** Unit loads on the floor, as [x, z] centres. Identical, on a grid — hence instanced. */
export function palletLayout() {
  const p = CDIM.interior.pallet;
  const out = [];
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      out.push({
        x: (c - (p.cols - 1) / 2) * (p.width + p.gap),
        z: (r - (p.rows - 1) / 2) * (p.depth + p.gap) + p.zOffset,
      });
    }
  }
  return out;
}

/**
 * The box the cargo actually occupies, as half-extents about the deck.
 *
 * NOT the clear interior. The clear interior is a rectangular prism drawn right into the
 * corners, and the corner castings and posts legitimately live there — a container's usable
 * space has bevelled corners and stops short of the door opening. Testing structure against the
 * full prism flags the fittings that make the box a box; testing it against the space freight
 * sits in is the question actually worth asking.
 */
export function cargoEnvelope() {
  const p = CDIM.interior.pallet;
  const spots = palletLayout();
  const margin = 0.10;
  const zs = spots.map((s) => s.z);
  return {
    halfWidth: loadFits().width / 2 + margin,
    // Derived from where the load actually sits, not from its size about the origin — the grid
    // is loaded toward the front and the space behind it is working room, not cargo.
    zMin: Math.min(...zs) - p.depth / 2 - margin,
    zMax: Math.max(...zs) + p.depth / 2 + margin,
    floor: CDIM.iso.casting.height + CDIM.frame.sill.height + CDIM.frame.floorThickness,
    height: p.height + p.load.height + margin,
  };
}

/** Does the stowed load actually fit the clear interior? Checked, not assumed. */
export function loadFits() {
  const p = CDIM.interior.pallet;
  return {
    width: p.cols * p.width + (p.cols - 1) * p.gap,
    length: p.rows * p.depth + (p.rows - 1) * p.gap,
    height: p.height + p.load.height,
  };
}
