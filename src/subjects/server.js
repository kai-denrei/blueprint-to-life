import { buildServer } from '../server/buildServer.js';
import {
  SDIM, fieldHeight, overallHeight, serviceSlot, sledSlots,
} from '../server/dimensions.js';

const sleds = sledSlots().length;

/**
 * Subject descriptor for SERVER01.
 *
 * Every vertical figure is a multiple of the rack unit, because that is what a rack IS — the
 * elevation table is a list of U spans and the height falls out of it. Type a height in here
 * and the first change to the layout makes the drawing disagree with the machine.
 */
export const SERVER_SUBJECT = {
  id: 'server',
  title: 'SERVER01',
  subtitle: '42U COMPUTE RACK · 28 INSTANCED SLEDS · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildServer,
  // Tall and narrow, so the frame is fitted to the height and the camera sits back from it.
  frame: { target: [0, 1.02, 0], radius: 3.2 },

  drawing: {
    'DWG': 'BTL-0010',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Sleds_Instanced', label: 'COMPUTE SLED, 1U', qty: sleds },
    { n: 2, node: 'SledLights_Instanced', label: 'SLED LIGHT ACCENT', qty: sleds },
    { n: 3, node: 'Service_Sled_Mesh', label: 'SLED IN SERVICE POSITION' },
    { n: 4, node: 'IC_Substrate', label: 'IC PACKAGE / SUBSTRATE' },
    { n: 5, node: 'IC_Die', label: 'EXPOSED DIE' },
    { n: 6, node: 'Heatsink_Mesh', label: 'HEATSINK' },
    { n: 7, node: 'DIMM_1', label: 'MEMORY MODULE', qty: SDIM.service.dimm.count },
    { n: 8, node: 'Board_Mesh', label: 'SYSTEM BOARD' },
    { n: 9, node: 'Button_EPO', label: 'EMERGENCY STOP (RED)' },
    { n: 10, node: 'Button_Start_1', label: 'START, ILLUMINATED (WHITE)', qty: 2 },
    { n: 11, node: 'Breaker_1', label: 'BREAKER', qty: SDIM.power.breaker.count },
    { n: 12, node: 'SW_A_Ports', label: 'SWITCH PORT ROW', qty: 2 },
    { n: 13, node: 'Fan_1_Rotor', label: 'FAN ROTOR', qty: SDIM.fans.rows * SDIM.fans.cols },
    { n: 14, node: 'Fan_Wall_Mesh', label: 'REAR FAN DOOR' },
    { n: 15, node: 'Door_Front_Mesh', label: 'FRONT DOOR' },
    { n: 16, node: 'Rail_L', label: 'EIA MOUNTING RAIL', qty: 2 },
    { n: 17, node: 'Vent_Grid_L', label: 'SIDE PANEL VENT GRID', qty: 2 },
    { n: 18, node: 'Rack_Collision', label: 'COLLISION PROXY (NOT RENDERED)' },
  ],

  callouts: [
    { n: 1, node: 'Sleds_Instanced', label: `COMPUTE SLED ×${sleds}`, offset: [0, 0.9, 0.30], dir: 'ne' },
    { n: 5, node: 'IC_Die', label: 'EXPOSED DIE', offset: [0, 0.10, 0.10], dir: 'nw' },
    { n: 9, node: 'Button_EPO', label: 'EMERGENCY STOP', offset: [-0.12, 0.06, 0.10], dir: 'sw' },
    { n: 10, node: 'Button_Start_1', label: 'START ×2', offset: [0.14, -0.04, 0.10], dir: 'se' },
    { n: 13, node: 'Fan_3_Rotor', label: 'FAN ×6', offset: [-0.14, 0.10, -0.10], dir: 'nw' },
    { n: 12, node: 'SW_A_Ports', label: 'PORT ROW', offset: [0, 0.10, 0.12], dir: 'ne' },
  ],

  instrumentation: [
    { label: 'HEIGHT', value: `${overallHeight().toFixed(3)} m` },
    { label: 'WIDTH', value: `${SDIM.frame.width.toFixed(3)} m` },
    { label: 'DEPTH', value: `${SDIM.frame.depth.toFixed(3)} m` },
    { label: 'RACK UNITS', value: `${SDIM.units} U` },
    { label: 'UNIT PITCH', value: `${(SDIM.U * 1000).toFixed(2)} mm` },
    { label: 'FIELD HEIGHT', value: `${fieldHeight().toFixed(3)} m` },
    { label: 'MOUNT WIDTH', value: `${(SDIM.mountWidth * 1000).toFixed(1)} mm` },
    { label: 'COMPUTE SLEDS', value: `${sleds} (INSTANCED)` },
    { label: 'IN SERVICE', value: `1 @ U${serviceSlot()}` },
    { label: 'SLED TRAVEL', value: `${SDIM.service.travel.toFixed(2)} m` },
    { label: 'FANS', value: `${SDIM.fans.rows * SDIM.fans.cols} × ${(SDIM.fans.radius * 2 * 1000).toFixed(0)} mm` },
    { label: 'MEMORY', value: `${SDIM.service.dimm.count} DIMM / SLED` },
    { label: 'DOOR SWING', value: `${SDIM.door.open}°` },
    { label: 'FRONT DOOR', key: 'frontDoor', value: '+000.0°' },
    { label: 'REAR DOOR', key: 'rearDoor', value: '+000.0°' },
    { label: 'SLED OUT', key: 'sled', value: '0.00' },
    { label: 'FANS', key: 'fans', value: '+000.0°' },
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
