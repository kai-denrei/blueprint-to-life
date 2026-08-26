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
    bellyY: 0.46,
    sponsonY: 1.02,
    deckY: 1.52,
    noseZ: 3.78,
  },
  track: { width: 0.68, thickness: 0.11, centreX: 1.60 },
  roadWheel: { count: 6, radius: 0.44, thickness: 0.46, y: 0.55, firstZ: -2.55, lastZ: 2.55 },
  sprocket: { radius: 0.50, thickness: 0.44, y: 1.00, z: -3.42 },
  idler:    { radius: 0.46, thickness: 0.44, y: 0.94, z: 3.44 },
  returnRoller: { radius: 0.14, thickness: 0.24, y: 1.34, zs: [-1.6, 0.4, 2.3] },

  turret: {
    // Moved forward from -0.55 and the roof raised: set that far back behind a long glacis,
    // the low turret read as a self-propelled gun rather than a tank. Low profile was the
    // intent; "the gun is mounted on the hull" was not.
    ringZ: -0.15,
    ringY: 1.52,
    width: 2.46,
    // Arrow-head in side view: a long low wedge with a knife nose and a raked bustle.
    profile: [
      [-1.86, 0.00], [-1.94, 0.34], [-1.60, 0.86], [0.34, 0.92],
      [1.34, 0.62], [1.76, 0.24], [1.48, 0.00],
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

  /** Remote weapon station: its own azimuth and elevation, a third and fourth joint. */
  rws: {
    baseY: 0.92,        // turret-local, on the roof
    baseZ: -0.95,
    baseX: 0.42,
    body: { width: 0.52, height: 0.34, depth: 0.60 },
    gunTrunnionY: 0.10,
    gunTrunnionZ: 0.14,
    gunProfile: [
      [0.00, 0.00], [0.055, 0.00], [0.055, 0.62], [0.040, 0.66],
      [0.040, 1.42], [0.058, 1.46], [0.058, 1.58], [0.00, 1.58],
    ],
    limits: { azimuth: [-180, 180], elevation: [-12, 55] },
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
      [1.78, 1.34, 1.85, 0.22, 0.44, 2.10, -0.16],
      [1.80, 1.34, -0.55, 0.22, 0.46, 2.00, -0.13],
      [1.76, 1.32, -2.55, 0.22, 0.42, 1.60, -0.10],
    ],
    turret: [
      [1.10, 0.44, 0.55, 0.24, 0.46, 1.30, -0.20],
      [1.14, 0.42, -0.85, 0.24, 0.50, 1.40, -0.15],
    ],
  },

  /** Emissive strips: [x, y, z, w, h, d] in their parent's space. Powered elements only. */
  glow: {
    barrel: [[0, 0.20, 1.55, 0.045, 0.030, 0.70], [0, 0.20, 2.95, 0.045, 0.030, 0.70]],
    turret: [[1.24, 0.54, 0.95, 0.03, 0.075, 0.62], [-1.24, 0.54, 0.95, 0.03, 0.075, 0.62]],
    hull: [[1.90, 1.34, 1.85, 0.03, 0.075, 1.05], [-1.90, 1.34, 1.85, 0.03, 0.075, 1.05],
           [1.88, 1.32, -2.55, 0.03, 0.075, 0.80], [-1.88, 1.32, -2.55, 0.03, 0.075, 0.80]],
  },

  limits: {
    azimuth: [-180, 180],
    elevation: [-12, 22],
  },
};

/** Running gear for one side, shared by the wheels, the track band and the collision proxy. */
export function wheelLayout() {
  const { roadWheel: rw, sprocket, idler } = CXDIM;
  const out = [];
  const step = (rw.lastZ - rw.firstZ) / (rw.count - 1);
  for (let i = 0; i < rw.count; i++) {
    out.push({
      name: `RoadWheel_${String(i + 1).padStart(2, '0')}`,
      z: rw.firstZ + i * step, y: rw.y, r: rw.radius, thickness: rw.thickness, kind: 'road',
    });
  }
  out.push({ name: 'DriveSprocket', z: sprocket.z, y: sprocket.y, r: sprocket.radius, thickness: sprocket.thickness, kind: 'sprocket' });
  out.push({ name: 'Idler', z: idler.z, y: idler.y, r: idler.radius, thickness: idler.thickness, kind: 'idler' });
  return out;
}
