/**
 * M777-pattern 155 mm towed howitzer — every dimension in one place, in metres.
 *
 * Axis convention matches the tank: +X right, +Y up, +Z forward (muzzle direction at zero
 * elevation and zero traverse). Ground plane is y = 0.
 *
 * Proportions are derived from published M777A2 specifications, not traced from any drawing:
 *
 *   calibre                 155 mm, L/39  ->  barrel 39 x 0.155 = 6.045 m
 *   length, travelling      10.7 m
 *   width, travelling       2.77 m
 *   height, travelling      2.26 m
 *   elevation               0 deg to +71.7 deg
 *   on-carriage traverse    +/- 22.5 deg (45 deg total)
 *   combat weight           ~4200 kg
 *
 * Those are facts about the object. The reference images supplied for this build are a
 * watermarked stock illustration and a copyrighted technical diagram, so neither was traced —
 * the spec's own guidance treats blueprints as a proportion sanity-check, and published
 * figures serve that purpose without copying anyone's line art.
 */
const CAL = 0.155;

export const HDIM = {
  barrel: {
    calibre: CAL,
    calibres: 39,
    get length() { return CAL * this.calibres; },   // 6.045 m
    // Lathe profile as [radius, z] forward from the trunnion. Real barrels taper from a thick
    // chamber to a thin muzzle; the steps are the chase, the sleeve and the muzzle-brake collar.
    profile: [
      [0.000, -0.62], [0.235, -0.62], [0.235, -0.10], [0.190, -0.02],
      [0.190, 1.30], [0.150, 1.42], [0.150, 3.90], [0.125, 4.02],
      [0.125, 5.30], [0.140, 5.36], [0.140, 5.42], [0.000, 5.42],
    ],
    muzzleBrake: {
      // Double-baffle brake: two collars with a slot between them, then the towing-eye ring.
      profile: [
        [0.000, 5.42], [0.128, 5.42], [0.128, 5.52], [0.215, 5.56], [0.215, 5.70],
        [0.128, 5.74], [0.128, 5.86], [0.215, 5.90], [0.215, 6.02], [0.128, 6.06],
        [0.128, 6.20], [0.000, 6.20],
      ],
    },
    breech: { width: 0.56, height: 0.62, depth: 0.72, z: -0.92 },
  },

  cradle: {
    // The trough the barrel recoils in, plus the two recuperator cylinders slung under it.
    // Slung *below* the bore rather than wrapped around it: sized as a box centred on the
    // barrel it read as a crate with a stick through it and swallowed the breech entirely.
    length: 2.60,
    width: 0.60,
    height: 0.40,
    z: 0.62,
    y: -0.17,
    recoilCylinder: { radius: 0.105, length: 2.05, dx: 0.245, dy: -0.30, z: 0.55 },
  },

  topCarriage: {
    pintleY: 1.30,       // Traverse_Pivot origin: the pintle the top carriage rotates about
    pintleZ: -0.15,
    trunnionY: 0.42,     // Elevation_Pivot origin, relative to the pintle
    trunnionZ: 0.10,
    // Side profile in carriage-local (z, y) — a squat A-frame carrying the trunnion bearings.
    profile: [
      [-0.72, -0.52], [-0.52, 0.10], [-0.22, 0.56], [0.34, 0.56], [0.62, 0.06], [0.70, -0.52],
    ],
    width: 1.16,
  },

  baseplate: { radius: 0.62, height: 0.20, y: 0.10 },

  // Drawbar from the saddle to the tow lunette. Without it the lunette was a ring floating
  // 1.4 m in front of the nearest geometry.
  drawbar: { length: 1.62, width: 0.16, height: 0.14, y: 0.50, z0: 0.78 },

  /**
   * Four trails on a cruciform. Each hinges about its own vertical pivot at the base, which is
   * the mechanism that makes this vehicle interesting to model: travelling closed, deployed to
   * a cross. Angles are measured from the centreline.
   */
  trails: {
    front: {
      length: 3.05, width: 0.36, height: 0.30,
      hingeZ: 0.42, hingeY: 0.46, hingeX: 0.34,
      // Angles are about +Y with the arm extending along its own local -Z, so 180 points
      // forward and 0 points aft. Front trails therefore live near 180 and swing *in* toward
      // the centreline to stow — getting this backwards put the trails behind the gun and the
      // spades in front of the muzzle.
      stowed: 168, deployed: 130,
      wheel: { radius: 0.44, width: 0.28, along: 1.45 },
    },
    rear: {
      length: 3.55, width: 0.34, height: 0.28,
      hingeZ: -0.42, hingeY: 0.42, hingeX: 0.32,
      stowed: 12, deployed: 50,
      spade: { width: 0.44, height: 0.52, depth: 0.34 },
    },
  },

  limits: {
    traverse: [-22.5, 22.5],
    elevation: [0, 71.7],
  },
};

/**
 * Trail layout, shared by the trail meshes, the road wheels and the collision proxy — the same
 * single-source-of-truth rule the tank's wheelLayout() follows.
 */
export function trailLayout() {
  const { front, rear } = HDIM.trails;
  const out = [];
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    out.push({
      name: `Trail_Front_${tag}`, kind: 'front', side,
      x: side * front.hingeX, y: front.hingeY, z: front.hingeZ,
      stowed: -side * front.stowed, deployed: -side * front.deployed,
      length: front.length, width: front.width, height: front.height,
    });
    out.push({
      name: `Trail_Rear_${tag}`, kind: 'rear', side,
      x: side * rear.hingeX, y: rear.hingeY, z: rear.hingeZ,
      stowed: -side * rear.stowed, deployed: -side * rear.deployed,
      length: rear.length, width: rear.width, height: rear.height,
    });
  }
  return out;
}
