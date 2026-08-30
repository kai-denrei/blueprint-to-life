import { buildContainer } from '../container/buildContainer.js';
import {
  CDIM, interiorHeight, interiorLength, interiorVolume, interiorWidth, loadFits, palletLayout,
} from '../container/dimensions.js';
import { foldPitch } from '../lib/geometry.js';

const I = CDIM.iso;
const sideLen = I.length - 2 * CDIM.frame.postDepth;

/**
 * Subject descriptor for the CX-20.
 *
 * The top block is ISO 668 and ISO 1161 — the envelope, the casting, the clear interior and the
 * volume — and every figure below the envelope is derived from it. A container's dimensions are
 * not a design decision; they are the reason the format works, and quoting anything the geometry
 * does not produce would be drawing a box no crane can lift.
 */
export const CONTAINER_SUBJECT = {
  id: 'container',
  title: 'CX-20 CONTAINER',
  subtitle: '20 FT INTERMODAL · ISO 668 1CC · POWERED · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildContainer,
  // Off the doors' corner, so the open leaves and the lit interior are both in frame.
  frame: { target: [0, 1.28, 0.55], radius: 8.4 },

  drawing: {
    'DWG': 'BTL-0011',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Wall_L', label: 'CORRUGATED SIDE WALL', qty: 2 },
    { n: 2, node: 'Wall_Front', label: 'CORRUGATED END WALL' },
    { n: 3, node: 'Roof_Mesh', label: 'CORRUGATED ROOF' },
    { n: 4, node: 'Casting_TFL', label: 'ISO 1161 CORNER CASTING', qty: 8 },
    { n: 5, node: 'Post_FL', label: 'CORNER POST', qty: 4 },
    { n: 6, node: 'Rail_Top_L', label: 'TOP / BOTTOM SIDE RAIL', qty: 4 },
    { n: 7, node: 'Door_L_Panel', label: 'DOOR LEAF', qty: 2 },
    { n: 8, node: 'Lock_L1_Bar', label: 'CAM-LOCK ROD', qty: 4 },
    { n: 9, node: 'Lock_L1_Handle', label: 'LOCK HANDLE', qty: 4 },
    { n: 10, node: 'Door_L_Seal', label: 'LIT DOOR SEAL', qty: 2 },
    { n: 11, node: 'Floor_Deck', label: 'FLOOR DECK' },
    { n: 12, node: 'Underframe_Mesh', label: 'UNDERFRAME CROSS MEMBERS' },
    { n: 13, node: 'Floor_Strip_L', label: 'LIT FLOOR STRIP', qty: 2 },
    { n: 14, node: 'Pallets_Instanced', label: 'UNIT LOAD PALLET', qty: palletLayout().length },
    { n: 15, node: 'Telemetry_Readout', label: 'TELEMETRY READOUT' },
    { n: 16, node: 'Climate_Vent', label: 'CLIMATE VENT' },
    { n: 17, node: 'Lock_Lamp_FL', label: 'CASTING LOCK LAMP', qty: 4 },
    { n: 18, node: 'Container_Collision', label: 'COLLISION PROXY (NOT RENDERED)' },
  ],

  callouts: [
    { n: 7, node: 'Door_R_Panel', label: 'DOOR LEAF ×2', offset: [0, 0.5, 0.2], dir: 'ne' },
    { n: 8, node: 'Lock_L1_Bar', label: 'CAM-LOCK ROD ×4', offset: [-0.2, 0.4, 0], dir: 'nw' },
    { n: 4, node: 'Casting_TRL', label: 'ISO 1161 CASTING ×8', offset: [-0.2, 0.2, 0], dir: 'nw' },
    { n: 1, node: 'Wall_L', label: 'CORRUGATED WALL', offset: [-0.3, 0.6, 0], dir: 'sw' },
    { n: 14, node: 'Pallets_Instanced', label: `UNIT LOAD ×${palletLayout().length}`, offset: [0, 0.5, 0], dir: 'se' },
    { n: 13, node: 'Floor_Strip_R', label: 'LIT DECK STRIP', offset: [0.3, 0.1, 0.8], dir: 'se' },
  ],

  instrumentation: [
    { label: 'ISO TYPE', value: '668 · 1CC (20 ft)' },
    { label: 'LENGTH', value: `${I.length.toFixed(3)} m` },
    { label: 'WIDTH', value: `${I.width.toFixed(3)} m` },
    { label: 'HEIGHT', value: `${I.height.toFixed(3)} m` },
    { label: 'INT. LENGTH', value: `${interiorLength().toFixed(3)} m` },
    { label: 'INT. WIDTH', value: `${interiorWidth().toFixed(3)} m` },
    { label: 'INT. HEIGHT', value: `${interiorHeight().toFixed(3)} m` },
    { label: 'INT. VOLUME', value: `${interiorVolume().toFixed(1)} m³` },
    { label: 'CORNER CAST', value: 'ISO 1161 · 8' },
    // The corrugation is derived per panel, so the three pitches differ — and each divides its
    // own wall exactly, which is the whole reason they are not one number.
    { label: 'FOLD, SIDE', value: `${(foldPitch(sideLen, CDIM.corrugation.nominal) * 1000).toFixed(1)} mm` },
    { label: 'FOLD, END', value: `${(foldPitch(I.width - 2 * CDIM.frame.post, CDIM.corrugation.nominal) * 1000).toFixed(1)} mm` },
    { label: 'FOLD DEPTH', value: `${(CDIM.corrugation.depth * 1000).toFixed(0)} mm` },
    { label: 'SHEET', value: `${(CDIM.corrugation.thickness * 1000).toFixed(0)} mm` },
    { label: 'DOOR SWING', value: `${CDIM.door.open}°` },
    { label: 'UNIT LOAD', value: `${palletLayout().length} × ${loadFits().width >= 0 ? '1.0 × 1.2 m' : ''}` },
    { label: 'DOOR, LEFT', key: 'doorL', value: '+000.0°' },
    { label: 'DOOR, RIGHT', key: 'doorR', value: '+000.0°' },
    { label: 'CAM LOCKS', key: 'locks', value: '+000.0°' },
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
