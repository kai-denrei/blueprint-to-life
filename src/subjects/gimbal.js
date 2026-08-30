import { buildGimbal } from '../gimbal/buildGimbal.js';
import {
  GDIM, lockMargin, overallHeight, overallWidth, payloadRadius, ringStack,
} from '../gimbal/dimensions.js';

const stack = ringStack();
const lock = lockMargin();

/**
 * Subject descriptor for the GS-3.
 *
 * Every figure in the top block is derived from one radius and two tables — the twelve ring
 * radii, the three bores, the payload diameter and the envelope all fall out of `ringStack`.
 * The block underneath it is the gimbal's own limitation, quoted rather than hidden: where the
 * bank travel stops, how far short of lock that is, and what the axes' independence is worth at
 * the stop.
 */
export const GIMBAL_SUBJECT = {
  id: 'gimbal',
  title: 'GS-3 GIMBAL PLATFORM',
  subtitle: 'THREE-AXIS STABILISED DIRECTOR · 3 × 4 CONCENTRIC RINGS · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildGimbal,
  // Centred on the gimbal itself. The frame is tall but the machine is the sphere.
  frame: { target: [0, 0.98, 0], radius: 2.35 },

  drawing: {
    'DWG': 'BTL-0009',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Outer_Race_A', label: 'AZIMUTH OUTER RACE' },
    { n: 2, node: 'Drive_Ring_A', label: 'AZIMUTH DRIVE RING' },
    { n: 3, node: 'Bearing_Ring_A', label: 'AZIMUTH BEARING RING' },
    { n: 4, node: 'Encoder_Ring_A', label: 'AZIMUTH ENCODER RING' },
    { n: 5, node: 'Outer_Race_B', label: 'BANK RING SET', qty: 4 },
    { n: 6, node: 'Outer_Race_C', label: 'ELEVATION RING SET', qty: 4 },
    { n: 7, node: 'Sensor_Ball', label: 'SENSOR BALL / PAYLOAD' },
    { n: 8, node: 'Aperture_Mesh', label: 'OPTICAL APERTURE' },
    { n: 9, node: 'Radiator_L', label: 'RADIATOR FIN', qty: 2 },
    { n: 10, node: 'Boss_A_N', label: 'STAGE BEARING BOSS', qty: 4 },
    { n: 11, node: 'Bearing_North', label: 'POLE BEARING', qty: 2 },
    { n: 12, node: 'Post_L', label: 'ARCH POST', qty: 2 },
    { n: 13, node: 'Cap_Bar', label: 'CROWN CROSS BAR' },
    { n: 14, node: 'Pedestal_Mesh', label: 'PEDESTAL' },
    { n: 15, node: 'Base_Plate', label: 'MOUNTING PLATE' },
    { n: 16, node: 'Slip_Ring_A', label: 'AXIS SLIP RING', qty: 3 },
    { n: 17, node: 'Junction_Box', label: 'JUNCTION BOX' },
    { n: 18, node: 'Base_Collision', label: 'COLLISION PROXY (BASE ONLY)' },
  ],

  callouts: [
    { n: 1, node: 'Outer_Race_A', label: 'AZIMUTH SET ×4', offset: [0, 0.16, 0.14], dir: 'ne' },
    { n: 5, node: 'Outer_Race_B', label: 'BANK SET ×4', offset: [-0.16, 0.10, 0], dir: 'nw' },
    { n: 6, node: 'Outer_Race_C', label: 'ELEVATION SET ×4', offset: [0.14, -0.10, 0], dir: 'se' },
    { n: 7, node: 'Sensor_Ball', label: 'PAYLOAD', offset: [0, -0.14, 0.10], dir: 'sw' },
    { n: 11, node: 'Bearing_North', label: 'POLE BEARING', offset: [0, 0.10, 0.10], dir: 'ne' },
    { n: 14, node: 'Pedestal_Mesh', label: 'PEDESTAL', offset: [0, -0.06, 0.22], dir: 'se' },
  ],

  instrumentation: [
    { label: 'OUTER RACE DIA', value: `${(GDIM.outerRadius * 2).toFixed(3)} m` },
    { label: 'HEIGHT, CROWN', value: `${overallHeight().toFixed(2)} m` },
    { label: 'WIDTH, PLATE', value: `${overallWidth().toFixed(2)} m` },
    { label: 'GIMBAL CENTRE', value: `${GDIM.centre.y.toFixed(2)} m` },
    { label: 'RING SETS', value: `3 × ${GDIM.sets[0].names.length}` },
    ...stack.map((s) => ({ label: `SET ${s.tag} BORE`, value: `${s.bore.toFixed(3)} m` })),
    { label: 'NEST CLEARANCE', value: `${(GDIM.clearance * 1000).toFixed(0)} mm` },
    { label: 'PAYLOAD DIA', value: `${(payloadRadius() * 2).toFixed(3)} m` },
    { label: 'AZ TRAVEL', value: `±${GDIM.limits.azimuth}°` },
    { label: 'BANK TRAVEL', value: `±${GDIM.limits.bank}°` },
    { label: 'EL TRAVEL', value: `±${GDIM.limits.elevation}°` },
    // The gimbal's own limitation, on the drawing rather than in a footnote.
    { label: 'LOCK AT BANK', value: '±90°' },
    { label: 'LOCK MARGIN', value: `${lock.shortOfLock}°` },
    { label: 'AXIS INDEP.', value: lock.independence.toFixed(3) },
    { label: 'AZIMUTH', key: 'azimuth', value: '+000.0°' },
    { label: 'BANK', key: 'bank', value: '+000.0°' },
    { label: 'ELEVATION', key: 'elevation', value: '+000.0°' },
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
