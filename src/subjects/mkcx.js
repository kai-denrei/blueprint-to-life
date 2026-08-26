import { buildMkcx } from '../mkcx/buildMkcx.js';
import { CXDIM } from '../mkcx/dimensions.js';

const overallWidth = (CXDIM.track.centreX + CXDIM.track.width / 2) * 2;
const roofHeight = CXDIM.turret.ringY + 0.92;

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
  subtitle: 'MAIN BATTLE TANK · FORWARD PROJECTION OF THE MK-VI · PROCEDURAL SCENE GRAPH',
  build: buildMkcx,
  // Framed for the muzzle, which reaches z = 6.8 — a frame fitted to the hull put the brake,
  // the single loudest silhouette cue, off the bottom of the sheet.
  frame: { target: [0, 1.30, 0.75], radius: 6.3 },

  drawing: {
    'DWG': 'BTL-0003',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Hull_Mesh', label: 'HULL, FACETED WELDMENT' },
    { n: 2, node: 'Turret_Mesh', label: 'TURRET SHELL' },
    { n: 3, node: 'Barrel_Mesh', label: 'MAIN GUN' },
    { n: 4, node: 'MuzzleBrake_Mesh', label: 'MUZZLE BRAKE, 4-SLOT' },
    { n: 5, node: 'RWS_Mesh', label: 'REMOTE WEAPON STATION' },
    { n: 6, node: 'RWS_Gun_Mesh', label: 'RWS AUTOCANNON' },
    { n: 7, node: 'LauncherTubes_L', label: 'LAUNCHER POD', qty: 2 },
    { n: 8, node: 'Hull_Applique_R1', label: 'APPLIQUE ARMOUR', qty: 6 },
    { n: 9, node: 'Turret_Applique_R1', label: 'TURRET APPLIQUE', qty: 4 },
    { n: 10, node: 'Wheels_Instanced', label: 'ROAD WHEEL', qty: CXDIM.roadWheel.count * 2 },
    { n: 11, node: 'Track_L', label: 'TRACK ASSEMBLY', qty: 2 },
    { n: 12, node: 'SideSkirt_L', label: 'SIDE SKIRT', qty: 2 },
    { n: 13, node: 'Hull_Glow_1', label: 'POWERED ELEMENT (EMISSIVE)', qty: 11 },
    { n: 14, node: 'Hull_Collision', label: 'COLLISION PROXY (NOT RENDERED)' },
  ],

  callouts: [
    { n: 4, node: 'MuzzleBrake_Mesh', label: '4-SLOT BRAKE', offset: [0, 0.22, 6.10], dir: 'ne' },
    { n: 5, node: 'RWS_Mesh', label: 'RWS', offset: [0, 0.34, 0], dir: 'nw' },
    { n: 7, node: 'LauncherPod_L', label: 'LAUNCHER POD', offset: [0, 0.30, 0], dir: 'nw' },
    { n: 2, node: 'Turret_Mesh', label: 'TURRET', offset: [0, 0.86, 0.4], dir: 'ne' },
    { n: 8, node: 'Hull_Applique_R1', label: 'APPLIQUE', offset: [0.3, 0, 0], dir: 'se' },
    { n: 10, node: 'Wheels_Instanced', label: `ROAD WHEELS ×${CXDIM.roadWheel.count * 2}`, offset: [-1.9, 0.55, -1.4], dir: 'sw' },
  ],

  instrumentation: [
    { label: 'HULL LENGTH', value: `${CXDIM.hull.length.toFixed(2)} m` },
    { label: 'OVERALL WIDTH', value: `${overallWidth.toFixed(2)} m` },
    { label: 'HEIGHT, ROOF', value: `${roofHeight.toFixed(2)} m` },
    { label: 'GROUND CLR', value: `${CXDIM.hull.bellyY.toFixed(2)} m` },
    { label: 'ROAD WHEELS', value: `${CXDIM.roadWheel.count} / SIDE` },
    { label: 'GUN LENGTH', value: '6.30 m' },
    { label: 'AZIMUTH', key: 'azimuth', value: '+000.0°' },
    { label: 'ELEVATION', key: 'elevation', value: '+000.0°' },
    { label: 'RWS TRAVERSE', key: 'rwsAzimuth', value: '+000.0°' },
    { label: 'RWS ELEVATION', key: 'rwsElevation', value: '+000.0°' },
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
