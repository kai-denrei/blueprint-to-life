import { buildMotopod, updateMotopodRide } from '../motopod/buildMotopod.js';
import { MPDIM, overallHeight, overallLength, overallWidth, rideLift, wheelbase } from '../motopod/dimensions.js';

const length = overallLength();
const height = overallHeight();
const width = overallWidth();

/**
 * Subject descriptor for the MOTO // POD.
 *
 * The reference sheet dimensions three figures — 2.45 / 1.12 / 0.86 — and this quotes the ones
 * the graph produces rather than the ones the sheet printed. They agree, which is the point:
 * an invariant holds the built geometry to the sheet, so a later change to a wheel radius or a
 * canopy profile fails the build instead of quietly making the drawing wrong.
 *
 * The performance block underneath is different in kind and is treated differently: 220 km/h
 * and 210 kg are declarations about a fictional vehicle, carried as text, with nothing derived
 * from them and nothing checking them.
 *
 * `afterArticulate` carries the ride lift, which no parent transform can express — the wheels
 * are children of the thing that has to rise when the machine banks.
 */
export const MOTOPOD_SUBJECT = {
  id: 'motopod',
  title: 'MOTO // POD',
  subtitle: 'TWO-WHEEL MONOCYCLE POD · HUBLESS · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildMotopod,
  afterArticulate: updateMotopodRide,
  // Low and close: the machine is long, flat and only 1.12 m tall, so a frame centred on its
  // half-height puts the drawing in a letterbox with empty sky above it.
  frame: { target: [0, 0.52, -0.02], radius: 2.55 },

  drawing: {
    'DWG': 'BTL-0007',
    'REV': '1.0',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'HUD_Panel', label: 'HOLOGRAPHIC HUD' },
    { n: 2, node: 'Canopy_Mesh', label: 'CANOPY / NANO-GLASS' },
    { n: 3, node: 'Access_Hatch', label: 'MAGNETIC ACCESS HATCH' },
    { n: 4, node: 'EnergyCell_Mesh', label: 'ENERGY CELL MODULE' },
    { n: 5, node: 'Gyro_Unit_Mesh', label: 'GYRO STABILISATION UNIT' },
    { n: 6, node: 'Motor_F', label: 'HUBLESS WHEEL MOTOR', qty: 2 },
    { n: 7, node: 'Rotor_F', label: 'ACTIVE MAG-LEV RING', qty: 4 },
    { n: 8, node: 'Light_Array_F', label: 'ADAPTIVE LIGHT ARRAY', qty: 2 },
    { n: 9, node: 'Fin_L', label: 'AERODYNAMIC FIN', qty: 2 },
    { n: 10, node: 'Thruster_Nozzle', label: 'REAR THRUSTER (VECTOR)' },
    { n: 11, node: 'Tyre_F', label: 'TYRE, CROWNED SMART COMPOUND', qty: 2 },
    { n: 12, node: 'Sensor_F', label: 'GYRO SENSOR RING', qty: 2 },
    { n: 13, node: 'Arm_F_Yoke', label: 'MAG-LEV RIM ARM', qty: 2 },
    { n: 14, node: 'Light_Strip_1L', label: 'BODY LIGHT LINE', qty: 6 },
    { n: 15, node: 'Chassis_Collision', label: 'COLLISION PROXY (NOT RENDERED)' },
  ],

  callouts: [
    { n: 2, node: 'Canopy_Mesh', label: 'NANO-GLASS CANOPY', offset: [0, 0.16, 0.08], dir: 'ne' },
    { n: 1, node: 'HUD_Panel', label: 'HOLOGRAPHIC HUD', offset: [0, 0.10, 0.16], dir: 'nw' },
    { n: 6, node: 'Motor_F', label: 'HUBLESS MOTOR', offset: [0, -0.16, 0.20], dir: 'se' },
    { n: 7, node: 'Rotor_R', label: 'MAG-LEV RING', offset: [0, -0.12, -0.20], dir: 'sw' },
    { n: 10, node: 'Thruster_Nozzle', label: 'VECTOR THRUSTER', offset: [0, 0.10, -0.14], dir: 'nw' },
    { n: 9, node: 'Fin_R', label: 'AERO FIN ×2', offset: [0.14, 0.12, 0], dir: 'ne' },
  ],

  instrumentation: [
    { label: 'LENGTH', value: `${length.toFixed(2)} m` },
    { label: 'HEIGHT', value: `${height.toFixed(2)} m` },
    { label: 'WIDTH', value: `${width.toFixed(2)} m` },
    { label: 'WHEELBASE', value: `${wheelbase().toFixed(2)} m` },
    { label: 'WHEEL DIA', value: `${(MPDIM.wheel.radius * 2).toFixed(3)} m` },
    // The figure that says "hubless" better than the word does: a 0.30 m hole through a
    // 0.67 m wheel.
    { label: 'BORE DIA', value: `${(MPDIM.wheel.bore * 2).toFixed(3)} m` },
    { label: 'LEAN LIMIT', value: `±${MPDIM.lean}°` },
    { label: 'RIDE LIFT', value: `${(rideLift(MPDIM.lean) * 1000).toFixed(0)} mm @ LIMIT` },
    { label: 'STEER LOCK', value: `±${MPDIM.wheel.steer}°` },
    ...Object.entries(MPDIM.spec).map(([label, value]) => ({ label, value })),
    { label: 'LEAN', key: 'lean', value: '+000.0°' },
    { label: 'STEER', key: 'steer', value: '+000.0°' },
    { label: 'WHEEL', key: 'roll', value: '+000.0°' },
    { label: 'CANOPY', key: 'canopy', value: '0.00' },
    { label: 'THRUST VEC', key: 'vector', value: '+000.0°' },
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
