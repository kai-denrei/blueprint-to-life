import { buildHeptapod, updateHeptapodStance } from '../heptapod/buildHeptapod.js';
import { HPDIM, legSolve, footSpan } from '../heptapod/dimensions.js';

const rest = legSolve(HPDIM.leg.pose.neutral);
const [width, length] = footSpan(HPDIM.leg.pose.neutral);
const height = rest.hipHeight + HPDIM.turret.ringY + HPDIM.turret.lidar.y + HPDIM.turret.lidar.height / 2;
const crouch = legSolve(HPDIM.leg.pose.crouch).hipHeight;
const extend = legSolve(HPDIM.leg.pose.extend).hipHeight;

/**
 * Subject descriptor for the Heptapod Walker.
 *
 * Every figure in the title block is computed from the leg solve rather than typed. On a walker
 * that is not a nicety: width IS where the feet land, and height IS ride height plus the mast.
 * Type them in and the first change to a limb length makes the drawing lie.
 *
 * `afterArticulate` carries the ride height, which no parent transform can express — the legs
 * are children of the thing that has to move when they fold.
 */
export const HEPTAPOD_SUBJECT = {
  id: 'heptapod',
  title: 'HEPTAPOD WALKER',
  subtitle: 'AUTONOMOUS SENTRY PLATFORM · OCTOPEDAL · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildHeptapod,
  afterArticulate: updateHeptapodStance,
  // Framed on the hull, not on the foot circle: the machine is mostly empty air between its
  // legs, and a frame fitted to the span puts the thing you are looking at in the middle third.
  frame: { target: [0, 1.45, 0.15], radius: 5.60 },

  drawing: {
    'DWG': 'BTL-0005',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Barrel_Mesh', label: 'MAIN WEAPON, 30 MM RAIL GUN' },
    { n: 2, node: 'CoilRing_1', label: 'COIL-ASSIST RING', qty: 5 },
    { n: 3, node: 'Sensor_Suite_Mesh', label: 'MULTISPECTRUM SENSOR SUITE' },
    { n: 4, node: 'Lidar_Array', label: 'TARGETING LIDAR ARRAY' },
    { n: 5, node: 'AICore_Mesh', label: 'AI CORE / PROCESSING UNIT' },
    { n: 6, node: 'Reactor_Mesh', label: 'FUSION CORE REACTOR' },
    { n: 7, node: 'Turret_Ring', label: 'GYRO-STABILISED TURRET RING' },
    { n: 8, node: 'AmmoDrum_Mesh', label: 'ELECTROMAG DRUM FEED' },
    { n: 9, node: 'Femur_1L', label: 'TRIPLE-ARTICULATION LEG', qty: 8 },
    { n: 10, node: 'Strut_1L', label: 'SHOCK ABSORBER STRUT', qty: 8 },
    { n: 11, node: 'FootPad_1L', label: 'MAG-LEV FOOT PAD', qty: 8 },
    { n: 12, node: 'TerrainSensor_1L', label: 'TERRAIN SENSOR CLUSTER', qty: 8 },
    { n: 13, node: 'Arm_Upper_Mesh', label: 'AUXILIARY MANIPULATOR ARM' },
    { n: 14, node: 'Cloak_Emitter_1', label: 'ACTIVE CLOAKING EMITTER', qty: 8 },
    { n: 15, node: 'Hull_Collision', label: 'COLLISION PROXY (NOT RENDERED)' },
  ],

  callouts: [
    { n: 1, node: 'Muzzle_Mesh', label: '30 MM RAIL GUN', offset: [0, 0.22, 0.10], dir: 'ne' },
    { n: 3, node: 'Sensor_Suite_Mesh', label: 'SENSOR SUITE', offset: [0, 0.26, -0.2], dir: 'nw' },
    { n: 6, node: 'Reactor_Mesh', label: 'FUSION CORE', offset: [0, -0.28, 0], dir: 'sw' },
    { n: 9, node: 'Femur_1R', label: 'LEG ×8', offset: [0, 0.22, 0.4], dir: 'ne' },
    { n: 11, node: 'FootPad_4L', label: 'MAG-LEV PAD', offset: [0, 0.05, 0], dir: 'sw' },
    { n: 13, node: 'Arm_Upper_Mesh', label: 'MANIPULATOR', offset: [0.2, 0.10, 0.2], dir: 'se' },
  ],

  instrumentation: [
    { label: 'HEIGHT, MAST', value: `${height.toFixed(2)} m` },
    { label: 'WIDTH, FEET', value: `${width.toFixed(2)} m` },
    { label: 'LENGTH, FEET', value: `${length.toFixed(2)} m` },
    { label: 'RIDE HEIGHT', value: `${rest.hipHeight.toFixed(2)} m` },
    { label: 'RIDE RANGE', value: `${crouch.toFixed(2)}–${extend.toFixed(2)} m` },
    { label: 'LOCOMOTION', value: '8 LEG · 3 DOF EA' },
    { label: 'GAIT', value: 'ALT. TETRAPOD' },
    { label: 'ARMAMENT', value: '30 mm RAIL GUN' },
    { label: 'GUN LENGTH', value: `${HPDIM.weapon.length.toFixed(2)} m` },
    { label: 'TRAVERSE', value: '360° CONTINUOUS' },
    { label: 'ELEVATION ARC', value: `${HPDIM.turret.limits.elevation[0]}° / +${HPDIM.turret.limits.elevation[1]}°` },
    { label: 'AZIMUTH', key: 'azimuth', value: '+000.0°' },
    { label: 'ELEVATION', key: 'elevation', value: '+000.0°' },
    { label: 'STANCE', key: 'stance', value: '50.00' },
    { label: 'STRIDE', key: 'stride', value: '+000.0°' },
    { label: 'MANIP ARM', key: 'arm', value: '0.00' },
    { label: 'EXPLODE', key: 'explode', value: '0.00' },
    { label: 'VIEW', key: 'view', value: 'ISO' },
    { label: 'DISPLAY', key: 'mode', value: 'BLUEPRINT' },
    { label: 'NODES', key: 'nodes', value: '—' },
    { label: 'TRIANGLES', key: 'tris', value: '—' },
    { label: 'DRAW CALLS', key: 'calls', value: '—' },
    { label: 'FRAME', key: 'fps', value: '— fps' },
    { label: 'BUILD', key: 'build', value: '—' },
    { label: 'LINK', key: 'link', value: '—' },
  ],
};
