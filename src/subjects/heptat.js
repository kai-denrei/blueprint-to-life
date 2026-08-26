import { buildHeptat, updateHeptatWheels } from '../heptat/buildHeptat.js';
import { HTDIM } from '../heptat/dimensions.js';

const overallLength = HTDIM.frame.length;
const overallWidth = HTDIM.cargo.width + 0.18;
const roofHeight = HTDIM.cargo.y0 + HTDIM.cargo.height;
const wheelbase = HTDIM.wheel.axles[0] - HTDIM.wheel.axles[2];

/**
 * Subject descriptor for the Hepta-T.
 *
 * `afterArticulate` is here for the same reason it is on the howitzer: the wheels are one
 * InstancedMesh and two of them steer, and instance matrices cannot inherit a parent's rotation.
 */
export const HEPTAT_SUBJECT = {
  id: 'heptat',
  title: 'HEPTA-T',
  subtitle: 'HEAVY CARGO TRANSPORT 6×6 · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildHeptat,
  afterArticulate: updateHeptatWheels,
  frame: { target: [0, 1.85, -0.3], radius: 5.9 },

  drawing: {
    'DWG': 'BTL-0004',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Chassis_Mesh', label: 'LADDER FRAME' },
    { n: 2, node: 'Cab_Mesh', label: 'CREW CAB' },
    { n: 3, node: 'CargoBay_Mesh', label: 'CARGO BAY' },
    { n: 4, node: 'Ramp_Mesh', label: 'TAIL RAMP' },
    { n: 5, node: 'Wheels_Instanced', label: 'ROAD WHEEL', qty: 6 },
    { n: 6, node: 'Steer_Wheel_1L', label: 'STEER CARRIER', qty: 2 },
    { n: 7, node: 'Mudguard_Wheel_1L', label: 'MUDGUARD', qty: 6 },
    { n: 8, node: 'Turret_Mesh', label: 'TURRET, LIGHT' },
    { n: 9, node: 'CargoRib_L1', label: 'BAY STIFFENER', qty: 12 },
    { n: 10, node: 'Crate_01', label: 'STOWED CRATE', qty: 6 },
    { n: 11, node: 'FuelCan_1', label: 'FUEL CAN', qty: 3 },
    { n: 12, node: 'SpareWheel', label: 'SPARE WHEEL' },
    { n: 13, node: 'LadderRung_1', label: 'ACCESS LADDER' },
    { n: 14, node: 'Cargo_Glow_1', label: 'ACCENT LIGHTING (CH.2)', qty: 13 },
    { n: 15, node: 'Chassis_Collision', label: 'COLLISION PROXY (NOT RENDERED)' },
  ],

  callouts: [
    { n: 2, node: 'Cab_Mesh', label: 'CREW CAB', offset: [0, 1.10, 0.4], dir: 'ne' },
    { n: 3, node: 'CargoBay_Mesh', label: 'CARGO BAY', offset: [0, 1.30, 0.2], dir: 'nw' },
    { n: 8, node: 'Turret_Mesh', label: 'LIGHT TURRET', offset: [0, 0.50, 0], dir: 'nw' },
    { n: 5, node: 'Wheels_Instanced', label: 'ROAD WHEEL ×6', offset: [-1.5, 0.62, 3.05], dir: 'sw' },
    { n: 4, node: 'Ramp_Mesh', label: 'TAIL RAMP', offset: [0, 0, -0.9], dir: 'sw' },
    { n: 10, node: 'Crate_01', label: 'STOWAGE', offset: [0, 0.35, 0], dir: 'ne' },
  ],

  instrumentation: [
    { label: 'LENGTH', value: `${overallLength.toFixed(2)} m` },
    { label: 'WIDTH', value: `${overallWidth.toFixed(2)} m` },
    { label: 'HEIGHT, BAY', value: `${roofHeight.toFixed(2)} m` },
    { label: 'WHEELBASE', value: `${wheelbase.toFixed(2)} m` },
    { label: 'DRIVE', value: '6×6' },
    { label: 'TYRE', value: `Ø${(HTDIM.wheel.radius * 2).toFixed(2)} m` },
    { label: 'STEER LOCK', value: `±${HTDIM.limits.steer}°` },
    { label: 'AZIMUTH', key: 'azimuth', value: '+000.0°' },
    { label: 'ELEVATION', key: 'elevation', value: '+000.0°' },
    { label: 'STEER', key: 'steer', value: '+000.0°' },
    { label: 'RAMP', key: 'ramp', value: '+000.0°' },
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
