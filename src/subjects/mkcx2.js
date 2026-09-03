import { buildMkcx2 } from '../mkcx2/buildMkcx2.js';
import { CX2DIM } from '../mkcx2/dimensions.js';

const overallWidth = (CX2DIM.hover.nacelle.centreX + CX2DIM.hover.nacelle.width / 2) * 2;
const roofHeight = CX2DIM.hover.gap + CX2DIM.turret.ringY + 0.34;

/** Subject descriptor for the MK-CX/2 — the MK-CX with the top taken off. */
export const MKCX2_SUBJECT = {
  id: 'mkcx2',
  title: 'MK-CX/2',
  subtitle: 'HOVER MAIN BATTLE TANK · FLAT-DECK VARIANT OF THE MK-CX · PROCEDURAL SCENE GRAPH',
  build: buildMkcx2,
  frame: { target: [0, 1.20, 0.75], radius: 6.3 },
  drawing: { 'DWG': 'BTL-0003/2', 'REV': 'A', 'PROJ': 'FIRST ANGLE', 'UNITS': 'METRES', 'SHEET': '1 OF 1' },
  legend: [
    { n: 1, node: 'Hull_Mesh', label: 'HULL, FLAT-DECK WELDMENT' },
    { n: 2, node: 'Turret_Mesh', label: 'BLADE TURRET' },
    { n: 3, node: 'Barrel_Mesh', label: 'MAIN GUN' },
    { n: 4, node: 'MuzzleBrake_Mesh', label: 'MUZZLE BRAKE, 4-SLOT' },
    { n: 5, node: 'Secondary_L_Mesh', label: 'SECONDARY TURRET', qty: 2 },
    { n: 6, node: 'Nacelle_L', label: 'LIFT NACELLE', qty: 2 },
    { n: 7, node: 'LiftEmitter_L1', label: 'LIFT EMITTER', qty: 6 },
    { n: 8, node: 'Deck_Glow_1', label: 'DECK INDICATOR', qty: 2 },
    { n: 9, node: 'Shell_Socket_1', label: 'SHELL SOCKET', qty: 9 },
    { n: 10, node: 'Hull_Applique_R1', label: 'APPLIQUE ARMOUR', qty: 6 },
    { n: 11, node: 'Hull_Collision', label: 'COLLISION PROXY (NOT RENDERED)' },
  ],
  callouts: [
    { n: 4, node: 'MuzzleBrake_Mesh', label: '4-SLOT BRAKE', offset: [0, 0.22, 6.10], dir: 'ne' },
    { n: 2, node: 'Turret_Mesh', label: 'BLADE TURRET', offset: [0, 0.34, -0.5], dir: 'nw' },
    { n: 8, node: 'Deck_Glow_1', label: 'DECK INDICATOR', offset: [0, 0.1, 0], dir: 'ne' },
    { n: 9, node: 'Shell_Socket_5', label: 'SHELL RACK ×9', offset: [0, 0.1, 0], dir: 'nw' },
    { n: 6, node: 'Nacelle_R', label: 'LIFT NACELLE', offset: [0, 0.6, -2.6], dir: 'se' },
  ],
  instrumentation: [
    { label: 'HULL LENGTH', value: `${CX2DIM.hull.length.toFixed(2)} m` },
    { label: 'OVERALL WIDTH', value: `${overallWidth.toFixed(2)} m` },
    { label: 'HEIGHT, ROOF', value: `${roofHeight.toFixed(2)} m` },
    { label: 'ARMAMENT', value: 'MAIN + 2 SEC' },
  ],
};
