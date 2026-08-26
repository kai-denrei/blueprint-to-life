/**
 * MK-CX — every dimension in one place, in metres.
 *
 * A forward projection of the MK-VI, not a different class of vehicle: same axis convention
 * (+X right, +Y up, +Z forward), same ground plane at y = 0, same articulation contract. The
 * MK-VI's proportions are the baseline it deviates from, deliberately:
 *
 *   hull length      7.00 -> 7.90   longer, lower, more wedge in plan
 *   deck height      1.66 -> 1.52   the silhouette drops; armour goes outboard instead of up
 *   road wheels      7    -> 6      fewer, larger — a different running-gear read at a glance
 *   gun              4.98 -> 5.85   plus a four-slot brake
 *
 * Design language is taken from the supplied concept art as *cues*, not geometry: faceted slab
 * armour with hard chamfers, applique blocks standing off the hull sides, a roof-mounted remote
 * weapon station, launcher pods, and emissive strips marking powered elements. None of it is
 * traced — the references are other people's renders, and a silhouette is the part worth
 * borrowing anyway.
 */
export const CXDIM = {
  hull: {
    length: 7.90,
    tubWidth: 2.52,
    sponsonWidth: 3.30,
    bellyY: 0.62,
    sponsonY: 1.02,
    deckY: 1.52,
    noseZ: 3.78,
  },
  /**
   * No running gear. The MK-CX is held up by lift nacelles, not by wheels — which is why every
   * road wheel, sprocket and return roller is gone rather than hidden. A track band with
   * nothing inside it would have been the worse answer: a vehicle that visibly hovers while
   * still carrying the mechanism it no longer needs.
   */
  hover: {
    gap: 0.26,          // nacelle underside to ground; the whole vehicle sits on this
    nacelle: {
      width: 0.70,
      centreX: 1.62,
      // Side profile (z, y): a slim pod, raked hard at both ends. The first pass was 0.78 wide
      // and 1.04 tall, which read as a landing skid rather than something doing the lifting —
      // and at that height it fouled both the hull tub and the old side skirts.
      profile: [
        [-3.28, 0.06], [-3.58, 0.30], [-3.44, 0.62], [-2.90, 0.74],
        [2.90, 0.74], [3.50, 0.62], [3.64, 0.30], [3.30, 0.06],
      ],
    },
    // Lift emitters on the nacelle underside — [z, length] pairs, mirrored per side.
    emitters: [[-2.35, 1.15], [-0.40, 1.30], [1.70, 1.20]],
  },

  turret: {
    // Moved forward from -0.55 and the roof raised: set that far back behind a long glacis,
    // the low turret read as a self-propelled gun rather than a tank. Low profile was the
    // intent; "the gun is mounted on the hull" was not.
    // Shrunk: shorter, narrower and lower than the first pass. With the running gear gone the
    // hull reads as the whole vehicle, and a compact turret sitting on it looks like a weapon
    // system rather than a crew compartment.
    ringZ: -0.45,
    ringY: 1.52,
    width: 2.06,
    // Arrow-head in side view: a long low wedge with a knife nose and a raked bustle.
    profile: [
      [-1.44, 0.00], [-1.50, 0.28], [-1.24, 0.72], [0.26, 0.78],
      [1.06, 0.54], [1.40, 0.20], [1.18, 0.00],
    ],
  },

  barrel: {
    trunnionZ: 1.05,
    // Raised from 0.30: at deck+0.30 the gun lay along the hull roof instead of standing clear
    // of it, which on a deliberately low-profile hull reads as a mistake rather than as a choice.
    trunnionY: 0.54,
    // Slimmer and longer than the MK-VI's, stepped where the thermal sleeve ends.
    profile: [
      [0.00, 0.05], [0.185, 0.05], [0.185, 0.72], [0.150, 0.78], [0.150, 2.55],
      [0.122, 2.62], [0.122, 4.90], [0.108, 4.96], [0.108, 5.42], [0.00, 5.42],
    ],
    // Four-slot muzzle brake: alternating collars, the loudest single silhouette cue in both
    // references and cheap to build as a lathe.
    brakeProfile: [
      [0.00, 5.42], [0.112, 5.42],
      [0.112, 5.48], [0.196, 5.52], [0.196, 5.60], [0.112, 5.64],
      [0.112, 5.70], [0.196, 5.74], [0.196, 5.82], [0.112, 5.86],
      [0.196, 5.90], [0.196, 5.98], [0.112, 6.02],
      [0.112, 6.16], [0.176, 6.16], [0.176, 6.30], [0.00, 6.30],
    ],
    mantlet: { width: 1.06, height: 0.66, depth: 0.58 },
  },

  /**
   * Two secondary turrets on the forward deck, flanking the glacis.
   *
   * Deliberately sized to pass under the main gun: at zero elevation the bore sits at
   * y = 2.06, and these top out below 1.90, so the main armament can traverse across them
   * without the silhouette reading as a collision.
   */
  secondary: {
    x: 0.86,
    z: 2.30,
    y: 1.40,            // hull-local; sits on the glacis
    ring: { radius: 0.30, height: 0.09 },
    // Squat faceted shell, roughly a fifth of the main turret's footprint.
    profile: [
      [-0.42, 0.00], [-0.46, 0.14], [-0.30, 0.34], [0.22, 0.36], [0.44, 0.20], [0.38, 0.00],
    ],
    width: 0.62,
    gunTrunnionY: 0.20,
    gunTrunnionZ: 0.18,
    gunProfile: [
      [0.00, 0.00], [0.048, 0.00], [0.048, 0.52], [0.036, 0.56],
      [0.036, 1.18], [0.052, 1.22], [0.052, 1.34], [0.00, 1.34],
    ],
    limits: { azimuth: [-120, 120], elevation: [-10, 48] },
  },

  /**
   * Applique armour: slabs standing off the hull and turret rather than blended into them.
   * Each is [x, y, z, w, h, d, rotZ] in its parent's space.
   */
  applique: {
    // x is measured so the slab stands OUTBOARD of the sponson (half-width 1.65) and its
    // underside clears the side skirt. Overlapping the two made the applique invisible: two
    // intersecting solids read as one lump, and the whole point of applique is that it reads
    // as bolted-on.
    hull: [
      // x pulled in to 1.72 (sponson half-width is 1.65) and the cant reduced: at 1.78 with a
      // 0.16 rad tilt the slabs swung clear of the hull side and read as floating panels in
      // the front elevation. A tilt about Z lifts the inboard edge away from what it bolts to.
      [1.72, 1.30, 1.85, 0.22, 0.40, 2.10, -0.07],
      [1.73, 1.30, -0.55, 0.22, 0.42, 2.00, -0.06],
      [1.71, 1.28, -2.55, 0.22, 0.38, 1.60, -0.05],
    ],
    turret: [
      [0.92, 0.40, 0.30, 0.20, 0.38, 1.05, -0.20],
      [0.95, 0.38, -0.72, 0.20, 0.40, 1.05, -0.15],
    ],
  },

  /** Emissive strips: [x, y, z, w, h, d] in their parent's space. Powered elements only. */
  glow: {
    barrel: [[0, 0.20, 1.55, 0.045, 0.030, 0.70], [0, 0.20, 2.95, 0.045, 0.030, 0.70]],
    turret: [[1.04, 0.48, 0.60, 0.03, 0.065, 0.50], [-1.04, 0.48, 0.60, 0.03, 0.065, 0.50]],
    hull: [[1.84, 1.30, 1.85, 0.03, 0.070, 1.05], [-1.84, 1.30, 1.85, 0.03, 0.070, 1.05],
           [1.83, 1.28, -2.55, 0.03, 0.070, 0.80], [-1.83, 1.28, -2.55, 0.03, 0.070, 0.80]],
  },

  limits: {
    azimuth: [-180, 180],
    elevation: [-12, 22],
  },
};
