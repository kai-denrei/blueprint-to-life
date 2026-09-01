import { buildTerraformer } from '../terraformer/buildTerraformer.js';
import {
  TDIM, beadLength, beamTopY, buildVolume, courseLength, headClearance, liftStroke,
  nozzleHeight, overallHeight, span, structureHeight, traverseStroke,
} from '../terraformer/dimensions.js';

const V = buildVolume();
const L = TDIM.arm.limits;

/**
 * Subject descriptor for the TF-3000.
 *
 * The build-volume block is worth reading against the reference sheet, which claims
 * 120 × 80 × 20 m. Two of those three are reproducible and quoted as given: 120 m is the rail
 * travel and 20 m is the height to the beam. The 80 m is not — a carriage cannot traverse
 * further than the beam it rides, and the gantry the sheet draws is a 36 m span. The figure here
 * is what the geometry gives, which is the same choice the CX-20 made about ISO 668: quoting a
 * number the drawing does not produce is drawing a machine nobody built.
 */
export const TERRAFORMER_SUBJECT = {
  id: 'terraformer',
  title: 'TF-3000 TERRAFORMER',
  subtitle: 'PLANETARY CONSTRUCTION GANTRY · TOGGLEABLE WORK · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildTerraformer,
  // Framed on the print, not on the machine's half-height: the gantry is mostly empty air and
  // centring on the bounding box puts the head and the work in the bottom eighth of the sheet.
  frame: { target: [0, 9.2, 0], radius: 44 },

  drawing: {
    'DWG': 'BTL-0014',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Tower_L_Mesh', label: 'GANTRY TOWER', qty: 2 },
    { n: 2, node: 'Bogie_L', label: 'TRACKED BOGIE', qty: 2 },
    { n: 3, node: 'Outrigger_L1', label: 'STABILISING OUTRIGGER', qty: 4 },
    { n: 4, node: 'Ladder_L', label: 'ACCESS LADDER', qty: 2 },
    { n: 5, node: 'Beam_Mesh', label: 'BRIDGE GIRDER' },
    { n: 6, node: 'Walkway_F', label: 'WALKWAY + HANDRAIL', qty: 2 },
    { n: 7, node: 'Silo_1_Shell', label: 'MATERIAL RESERVOIR', qty: 2 },
    { n: 8, node: 'Feed_Line_1', label: 'MATERIAL FEED LINE', qty: 2 },
    { n: 9, node: 'Carriage_Mesh', label: 'TRAVERSE CARRIAGE' },
    { n: 10, node: 'Mast_1_Mesh', label: 'LIFT MAST, STAGE 1' },
    { n: 11, node: 'Mast_2_Mesh', label: 'LIFT MAST, STAGE 2' },
    { n: 12, node: 'Arm_Upper', label: 'EXTRUSION ARM, UPPER' },
    { n: 13, node: 'Arm_Fore', label: 'EXTRUSION ARM, FORE' },
    { n: 14, node: 'Nozzle_Heater', label: 'HEATER BAND' },
    { n: 15, node: 'Nozzle_Cone', label: 'EXTRUSION NOZZLE' },
    { n: 16, node: 'Layers_Instanced', label: 'PRINTED COURSE', qty: TDIM.structure.layer.count },
    { n: 17, node: 'Slab_Mesh', label: 'FOUNDATION SLAB' },
    { n: 18, node: 'Rail_L1', label: 'TRAVEL RAIL', qty: 4 },
    { n: 19, node: 'Gantry_Collision', label: 'COLLISION PROXY (GANTRY ONLY)' },
  ],

  callouts: [
    { n: 7, node: 'Silo_1_Shell', label: 'MATERIAL RESERVOIRS', offset: [-2.0, 2.6, 0], dir: 'nw' },
    { n: 15, node: 'Nozzle_Cone', label: 'EXTRUSION NOZZLE', offset: [1.6, -0.6, 0], dir: 'se' },
    { n: 12, node: 'Arm_Upper', label: 'EXTRUSION ARM', offset: [2.2, 1.0, 0], dir: 'ne' },
    { n: 16, node: 'Layers_Instanced', label: 'PRINTED STRUCTURE — TOGGLEABLE', offset: [0, 1.4, 6.0], dir: 'se' },
    { n: 3, node: 'Outrigger_R1', label: 'STABILISING SUPPORTS', offset: [2.4, -1.0, 0], dir: 'se' },
    { n: 9, node: 'Carriage_Mesh', label: 'Y TRAVERSE', offset: [-2.4, 1.4, 0], dir: 'nw' },
  ],

  instrumentation: [
    { label: 'GANTRY SPAN', value: `${span().toFixed(1)} m` },
    { label: 'BEAM HEIGHT', value: `${TDIM.tower.height.toFixed(1)} m` },
    { label: 'OVERALL HT', value: `${overallHeight().toFixed(2)} m` },
    { label: 'CROWN', value: `${beamTopY().toFixed(2)} m` },
    // The build volume, in the MACHINE's axis names — see dimensions.js on why they differ.
    { label: 'BUILD X', value: `${V.x.toFixed(0)} m (RAIL)` },
    { label: 'BUILD Y', value: `${V.y.toFixed(2)} m (TRAVERSE)` },
    { label: 'BUILD Z', value: `${V.z.toFixed(2)} m (LIFT)` },
    { label: 'AXES', value: '3 GANTRY + 4 ARM' },
    { label: 'RESERVOIRS', value: `2 × ⌀${(TDIM.silo.radius * 2).toFixed(2)} m` },
    // The work.
    { label: 'FOOTPRINT', value: `${(TDIM.structure.A * 2).toFixed(1)} × ${(TDIM.structure.B * 2).toFixed(1)} m` },
    { label: 'WALL', value: `${(TDIM.structure.thickness * 1000).toFixed(0)} mm × ${structureHeight().toFixed(2)} m` },
    { label: 'COURSES', value: `${TDIM.structure.layer.count} × ${(TDIM.structure.layer.height * 1000).toFixed(0)} mm` },
    { label: 'COURSE RUN', value: `${courseLength().toFixed(1)} m` },
    { label: 'BEAD LAID', value: `${beadLength().toFixed(0)} m` },
    { label: 'HEAD CLEAR', value: `${(headClearance() * 1000).toFixed(0)} mm` },
    { label: 'X TRAVEL', key: 'travel', value: '0.00' },
    { label: 'Y TRAVERSE', key: 'traverse', value: '0.00' },
    { label: 'Z LIFT', key: 'lift', value: '0.00' },
    { label: 'ARM SWING', key: 'swing', value: '+000.0°' },
    { label: 'ARM SHOULDER', key: 'shoulder', value: '+000.0°' },
    { label: 'ARM ELBOW', key: 'elbow', value: '+000.0°' },
    { label: 'NOZZLE PITCH', key: 'wrist', value: '+000.0°' },
    { label: 'NOZZLE HT', key: 'nozzleY', value: `${nozzleHeight(TDIM.rest).toFixed(2)} m` },
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

  /**
   * The head's height above the pad, which is the figure an operator of a printer actually
   * watches and which no slider shows: it falls out of the lift and three arm angles together.
   * The FD-4 added this hook for exactly this shape of fact.
   */
  derived: ({ lift, shoulder, elbow, wrist }) => ({
    nozzleY: `${nozzleHeight({ lift, shoulder, elbow, wrist }).toFixed(2)} m`,
  }),
};
