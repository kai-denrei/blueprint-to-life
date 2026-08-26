/**
 * Every number that defines the vehicle, in metres, in one place.
 *
 * Axis convention: +X right, +Y up, +Z forward (nose of the vehicle).
 * Ground plane is y = 0; the track's lower run rests on it.
 *
 * Proportions are sanity-checked against MBT ratios (hull ~7m, overall width ~3.7m,
 * 7 road wheels per side, turret ring aft of hull centre) but deliberately not traced —
 * see .deban/roles/pm.md, the real-vs-fictional question is still open.
 */
export const DIM = {
  hull: {
    length: 7.0,
    tubWidth: 2.40,
    sponsonWidth: 3.42,
    bellyY: 0.52,
    sponsonY: 1.16,   // where the tub stops and the overhanging upper hull starts
    deckY: 1.66,
  },
  track: {
    width: 0.62,
    thickness: 0.10,
    centreX: 1.52,
  },
  roadWheel: { count: 7, radius: 0.36, thickness: 0.42, y: 0.46, firstZ: -2.72, lastZ: 2.72 },
  sprocket:  { radius: 0.44, thickness: 0.40, y: 0.88, z: -3.34 },  // drive, rear
  idler:     { radius: 0.40, thickness: 0.40, y: 0.82, z: 3.36 },   // front
  returnRoller: { radius: 0.13, thickness: 0.22, y: 1.30, zs: [-2.0, -0.2, 1.7] },
  turret: {
    ringZ: -0.35,      // turret ring centre, hull-local Z
    ringY: 1.66,       // sits on the deck
    width: 2.62,
    // side profile in turret-local (z, y), origin at the ring centre
    profile: [
      [-1.62, 0.00], [-1.52, 0.70], [0.42, 0.76], [1.38, 0.44], [1.60, 0.12], [1.30, 0.00],
    ],
  },
  barrel: {
    trunnionZ: 0.95,   // turret-local; this is Barrel_Pivot's origin
    trunnionY: 0.32,
    // lathe profile as [radius, z] measured forward from the trunnion
    profile: [
      [0.00, 0.10], [0.175, 0.10], [0.175, 0.62], [0.140, 0.66], [0.140, 2.40],
      [0.118, 2.46], [0.118, 4.10], [0.150, 4.16], [0.150, 4.62], [0.118, 4.68],
      [0.118, 4.98], [0.00, 4.98],
    ],
    mantlet: { width: 0.92, height: 0.62, depth: 0.52 },
  },
  limits: {
    azimuth: [-Math.PI, Math.PI],
    elevation: [-0.17, 0.35],   // -10deg to +20deg
  },
};

/**
 * Running-gear layout, shared by the wheel InstancedMesh, the track band and the
 * collision proxy. One source of truth: adding suspension travel later means rewriting
 * matrices here, not re-modelling anything.
 *
 * @returns {Array<{name:string, z:number, y:number, r:number, thickness:number, kind:string}>}
 *          circles in the ZY plane, for one side of the vehicle
 */
export function wheelLayout() {
  const { roadWheel: rw, sprocket, idler } = DIM;
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
