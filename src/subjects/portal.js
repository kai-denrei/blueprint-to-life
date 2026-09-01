import { buildPortal } from '../portal/buildPortal.js';
import {
  PDIM, apertureArea, apertureDepth, apertureRadius, outerRadius, overallHeight, rowGaps,
  segmentCount,
} from '../portal/dimensions.js';

const R = PDIM.rows;
const clear = apertureRadius();

/**
 * Subject descriptor for the GT-9.
 *
 * The instrumentation leads with the aperture, and it leads with it because that block is the
 * handoff. Everything else on this sheet describes what was modelled; the first four rows
 * describe what was deliberately not, and they are the figures the other application needs in
 * order to drop an effect into the hole and have it fit.
 *
 * `Aperture_Volume` appears in the legend as a numbered item with no geometry against it, which
 * looks like a mistake until you read the label. It is the point of the drawing.
 */
export const PORTAL_SUBJECT = {
  id: 'portal',
  title: 'GT-9 TRANSIT GATE',
  subtitle: 'INDUSTRIAL RING · CLEAR APERTURE, NO CENTRE GEOMETRY · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildPortal,
  // Framed on the aperture rather than the machine's half-height: the bore is the subject, and
  // centring on the bounding box drops it into the top of the sheet with the plinth dominating.
  frame: { target: [0, 3.72, 0], radius: 11.9 },

  drawing: {
    'DWG': 'BTL-0013',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Aperture_Volume', label: 'CLEAR APERTURE — NO GEOMETRY' },
    { n: 2, node: 'Liner_Ring', label: 'BORE LINER' },
    { n: 3, node: 'Edge_Ring_Front', label: 'EDGE ACCENT RING', qty: 2 },
    { n: 4, node: 'RotorA_Instanced', label: 'ROTOR A SEGMENT', qty: R.rotorA.count },
    { n: 5, node: 'RotorB_Instanced', label: 'ROTOR B SEGMENT', qty: R.rotorB.count },
    { n: 6, node: 'Shell_Instanced', label: 'STATOR ARMOUR SEGMENT', qty: R.stator.count },
    { n: 7, node: 'Block_Instanced', label: 'RIM ARMOUR BLOCK', qty: PDIM.block.rim.count },
    { n: 17, node: 'Face_Block_Instanced', label: 'FACE SERVICE BOX', qty: PDIM.block.face.count },
    { n: 8, node: 'Pod_1_Body', label: 'CAPACITOR POD', qty: PDIM.pod.count },
    { n: 9, node: 'Pod_1_Core', label: 'POWER CORE', qty: PDIM.pod.count },
    { n: 10, node: 'Pod_1_Fin_L', label: 'RADIATOR VANE', qty: PDIM.pod.count * 2 },
    { n: 11, node: 'Buttress_L', label: 'BUTTRESS', qty: 2 },
    { n: 12, node: 'Conduit_L', label: 'POWER CONDUIT', qty: 2 },
    { n: 13, node: 'Slew_Ring', label: 'TURNTABLE BEARING' },
    { n: 14, node: 'Plinth_Mesh', label: 'PLINTH' },
    { n: 15, node: 'Anchor_L1', label: 'GROUND ANCHOR', qty: 4 },
    { n: 16, node: 'Base_Collision', label: 'COLLISION PROXY (PLINTH ONLY)' },
  ],

  callouts: [
    { n: 1, node: 'Aperture_Volume', label: 'CLEAR APERTURE — KEEP EMPTY', offset: [0, 0, 0.8], dir: 'ne' },
    { n: 9, node: 'Pod_1_Core', label: 'POWER CORE ×8', offset: [0.5, 0.2, 0], dir: 'ne' },
    { n: 3, node: 'Edge_Ring_Front', label: 'EDGE ACCENT', offset: [-1.2, 0.9, 0.3], dir: 'nw' },
    { n: 4, node: 'RotorA_Instanced', label: 'COUNTER-ROTATING ROTORS', offset: [-1.5, -1.1, 0.2], dir: 'sw' },
    { n: 11, node: 'Buttress_R', label: 'BUTTRESS', offset: [0.6, -0.4, 0], dir: 'se' },
    { n: 13, node: 'Slew_Ring', label: 'TURNTABLE', offset: [0, -0.3, 0.9], dir: 'se' },
  ],

  instrumentation: [
    // The handoff. These four are what the other application reads off `Aperture_Volume`.
    { label: 'CLEAR APERTURE', value: `⌀${(clear * 2).toFixed(3)} m` },
    { label: 'CLEAR DEPTH', value: `${apertureDepth().toFixed(3)} m` },
    { label: 'CLEAR AREA', value: `${apertureArea().toFixed(2)} m²` },
    { label: 'CENTRE HEIGHT', value: `${PDIM.centreY.toFixed(2)} m` },
    // The machine.
    { label: 'OUTER ⌀', value: `${(outerRadius() * 2).toFixed(2)} m` },
    { label: 'OVERALL HT', value: `${overallHeight().toFixed(2)} m` },
    { label: 'RING DEPTH', value: `${R.stator.depth.toFixed(2)} m` },
    { label: 'ROWS', value: 'LINER + 2 ROTOR + STATOR' },
    { label: 'SEGMENTS', value: `${segmentCount()} (${R.rotorA.count}/${R.rotorB.count}/${R.stator.count})` },
    { label: 'SEGMENT GAP', value: `${(PDIM.gap * 100).toFixed(0)}% OF PITCH` },
    { label: 'ROW CLEARANCE', value: `${rowGaps().map((g) => (g.gap * 1000).toFixed(0)).join(' / ')} mm` },
    { label: 'POWER PODS', value: `${PDIM.pod.count} · ${PDIM.pod.count * 2} VANES` },
    { label: 'ACCENT', value: 'ONE CHANNEL (BLUE)' },
    { label: 'GATE BEARING', key: 'yaw', value: '+000.0°' },
    { label: 'ROTOR A', key: 'rotorA', value: '+000.0°' },
    { label: 'ROTOR B', key: 'rotorB', value: '+000.0°' },
    { label: 'RADIATOR FAN', key: 'vanes', value: '0.00' },
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
