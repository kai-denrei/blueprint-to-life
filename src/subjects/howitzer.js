import { buildHowitzer, updateHowitzerWheels } from '../howitzer/buildHowitzer.js';
import { HDIM } from '../howitzer/dimensions.js';

const barrelLength = HDIM.barrel.length;
const travellingLength = 10.7;

/**
 * Subject descriptor for the howitzer.
 *
 * This file plus src/howitzer/ is the entire cost of a second vehicle. The chrome, the
 * blueprint pass, the camera and the export path were not touched — which was the claim the
 * tank's architecture made and this is the first time anything has tested it.
 */
export const HOWITZER_SUBJECT = {
  id: 'howitzer',
  title: 'M777-PATTERN 155 mm',
  subtitle: 'TOWED HOWITZER · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildHowitzer,
  afterArticulate: updateHowitzerWheels,
  // Framed for the whole elevation arc, not just the 0-degree pose: at +45 the muzzle is
  // ~4 m up and a frame fitted to the resting silhouette cuts it off the top of the sheet.
  frame: { target: [0, 1.55, 1.15], radius: 6.5 },

  drawing: {
    'DWG': 'BTL-0002',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Barrel_Mesh', label: 'BARREL, 155 mm L/39' },
    { n: 2, node: 'MuzzleBrake_Mesh', label: 'MUZZLE BRAKE, DOUBLE BAFFLE' },
    { n: 3, node: 'Breech_Mesh', label: 'BREECH RING' },
    { n: 4, node: 'Cradle_Mesh', label: 'CRADLE' },
    { n: 5, node: 'RecoilCylinders_Instanced', label: 'RECUPERATOR CYLINDER', qty: 2 },
    { n: 6, node: 'TopCarriage_Mesh', label: 'TOP CARRIAGE' },
    { n: 7, node: 'Chassis_Mesh', label: 'SADDLE + FIRING PLATFORM' },
    { n: 8, node: 'Trail_Front_L', label: 'FRONT TRAIL', qty: 2 },
    { n: 9, node: 'Trail_Rear_L', label: 'REAR TRAIL', qty: 2 },
    { n: 10, node: 'Trail_Rear_L_Spade', label: 'SPADE', qty: 2 },
    { n: 11, node: 'Wheels_Instanced', label: 'ROAD WHEEL', qty: 2 },
    { n: 12, node: 'Handwheel_Elevation', label: 'ELEVATION HANDWHEEL' },
    { n: 13, node: 'Tow_Lunette', label: 'TOW LUNETTE' },
    { n: 14, node: 'Chassis_Collision', label: 'COLLISION PROXY (NOT RENDERED)' },
  ],

  callouts: [
    { n: 1, node: 'Barrel_Mesh', label: 'BARREL L/39', offset: [0, 0.24, 3.0], dir: 'ne' },
    { n: 2, node: 'MuzzleBrake_Mesh', label: 'MUZZLE BRAKE', offset: [0, 0.24, 6.05], dir: 'ne' },
    { n: 6, node: 'TopCarriage_Mesh', label: 'TOP CARRIAGE', offset: [-0.5, 0.5, -0.5], dir: 'nw' },
    { n: 8, node: 'Trail_Front_R', label: 'FRONT TRAIL', offset: [0, 0, -2.6], dir: 'se' },
    { n: 9, node: 'Trail_Rear_L', label: 'REAR TRAIL + SPADE', offset: [0, 0, -3.3], dir: 'sw' },
    { n: 11, node: 'Wheels_Instanced', label: 'ROAD WHEEL ×2', offset: [1.7, 0.46, 1.2], dir: 'se' },
  ],

  instrumentation: [
    { label: 'CALIBRE', value: `${(HDIM.barrel.calibre * 1000).toFixed(0)} mm` },
    { label: 'BARREL', value: `L/${HDIM.barrel.calibres} — ${barrelLength.toFixed(2)} m` },
    { label: 'LENGTH, TOWED', value: `${travellingLength.toFixed(2)} m` },
    { label: 'WIDTH, TOWED', value: '2.77 m' },
    { label: 'ELEV RANGE', value: `0° / +${HDIM.limits.elevation[1]}°` },
    { label: 'TRAVERSE', value: '±22.5°' },
    { label: 'TRAVERSE', key: 'azimuth', value: '+000.0°' },
    { label: 'ELEVATION', key: 'elevation', value: '+000.0°' },
    { label: 'TRAILS', key: 'trails', value: '1.00' },
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
