import { buildMkcx } from '../mkcx/buildMkcx.js';
import { CXDIM } from '../mkcx/dimensions.js';

const overallWidth = (CXDIM.hover.nacelle.centreX + CXDIM.hover.nacelle.width / 2) * 2;
const roofHeight = CXDIM.hover.gap + CXDIM.turret.ringY + 0.78;

/**
 * Subject descriptor for the MK-CX.
 *
 * Same shape as every other subject. The only new thing in it is that some of its parts are
 * flagged emissive at build time, which the renderer picks up out of the G-buffer — the
 * descriptor itself says nothing about glow.
 */
export const MKCX_SUBJECT = {
  id: 'mkcx',
  title: 'MK-CX',
  subtitle: 'HOVER MAIN BATTLE TANK · FORWARD PROJECTION OF THE MK-VI · PROCEDURAL SCENE GRAPH',
  build: buildMkcx,
  // Framed for the muzzle, which reaches z = 6.8 — a frame fitted to the hull put the brake,
  // the single loudest silhouette cue, off the bottom of the sheet.
  frame: { target: [0, 1.35, 0.75], radius: 6.3 },

  drawing: {
    'DWG': 'BTL-0003',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Hull_Mesh', label: 'HULL, FACETED WELDMENT' },
    { n: 2, node: 'Turret_Mesh', label: 'MAIN TURRET SHELL' },
    { n: 3, node: 'Barrel_Mesh', label: 'MAIN GUN' },
    { n: 4, node: 'MuzzleBrake_Mesh', label: 'MUZZLE BRAKE, 4-SLOT' },
    { n: 5, node: 'Secondary_L_Mesh', label: 'SECONDARY TURRET', qty: 2 },
    { n: 6, node: 'Secondary_L_Gun_Mesh', label: 'SECONDARY AUTOCANNON', qty: 2 },
    { n: 7, node: 'LauncherTubes_L', label: 'LAUNCHER POD', qty: 2 },
    { n: 8, node: 'Nacelle_L', label: 'LIFT NACELLE', qty: 2 },
    { n: 9, node: 'LiftEmitter_L1', label: 'LIFT EMITTER', qty: 6 },
    { n: 10, node: 'Pylon_LB', label: 'NACELLE PYLON', qty: 6 },
    { n: 11, node: 'Hull_Applique_R1', label: 'APPLIQUE ARMOUR', qty: 6 },
    { n: 12, node: 'Turret_Applique_R1', label: 'TURRET APPLIQUE', qty: 4 },
    { n: 13, node: 'Hull_Collision', label: 'COLLISION PROXY (NOT RENDERED)' },
  ],

  callouts: [
    { n: 4, node: 'MuzzleBrake_Mesh', label: '4-SLOT BRAKE', offset: [0, 0.22, 6.10], dir: 'ne' },
    { n: 2, node: 'Turret_Mesh', label: 'MAIN TURRET', offset: [0, 0.78, -0.5], dir: 'nw' },
    { n: 5, node: 'Secondary_R_Mesh', label: 'SECONDARY ×2', offset: [0, 0.36, 0], dir: 'ne' },
    { n: 7, node: 'LauncherPod_L', label: 'LAUNCHER POD', offset: [0, 0.26, 0], dir: 'nw' },
    { n: 8, node: 'Nacelle_R', label: 'LIFT NACELLE', offset: [0, 0.6, -2.6], dir: 'se' },
    { n: 9, node: 'LiftEmitter_R2', label: 'LIFT EMITTERS', offset: [0, -0.15, 0], dir: 'sw' },
  ],

  instrumentation: [
    { label: 'HULL LENGTH', value: `${CXDIM.hull.length.toFixed(2)} m` },
    { label: 'OVERALL WIDTH', value: `${overallWidth.toFixed(2)} m` },
    { label: 'HEIGHT, ROOF', value: `${roofHeight.toFixed(2)} m` },
    { label: 'ARMAMENT', value: 'MAIN + 2 SEC' },
    { label: 'PROPULSION', value: 'LIFT NACELLE ×2' },
    { label: 'HOVER GAP', value: `${CXDIM.hover.gap.toFixed(2)} m` },
    { label: 'GUN LENGTH', value: '6.30 m' },
    { label: 'AZIMUTH', key: 'azimuth', value: '+000.0°' },
    { label: 'ELEVATION', key: 'elevation', value: '+000.0°' },
    { label: 'SEC TRAVERSE', key: 'secAzimuth', value: '+000.0°' },
    { label: 'SEC ELEVATION', key: 'secElevation', value: '+000.0°' },
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
