import { buildTank } from '../tank/buildTank.js';
import { DIM } from '../tank/dimensions.js';

const overallWidth = (DIM.track.centreX + DIM.track.width / 2) * 2;
const roofHeight = DIM.turret.ringY + 0.76;            // deck + turret shell
const sightHeight = roofHeight + 0.39;                 // over the commander's sight

/**
 * Subject descriptor for the tank.
 *
 * This is the file that makes the chrome reusable: the schematic layer reads only this shape,
 * so pointing it at a different subject is a different file, not a different layout.
 */
export const TANK_SUBJECT = {
  id: 'tank',
  title: 'MK VI — DOOMFORGE',
  subtitle: 'MAIN BATTLE TANK · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildTank,
  frame: { target: [0, 1.15, 0], radius: 4.6 },

  drawing: {
    'DWG': 'BTL-0001',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Hull_Mesh', label: 'HULL, WELDED ASSEMBLY' },
    { n: 2, node: 'Turret_Mesh', label: 'TURRET SHELL' },
    { n: 3, node: 'Barrel_Mesh', label: 'MAIN GUN, SMOOTHBORE' },
    { n: 4, node: 'Mantlet_Mesh', label: 'MANTLET' },
    { n: 5, node: 'Wheels_Instanced', label: 'ROAD WHEEL', qty: DIM.roadWheel.count * 2 },
    { n: 6, node: 'Sprockets_Instanced', label: 'DRIVE SPROCKET / IDLER', qty: 4 },
    { n: 7, node: 'Track_L', label: 'TRACK ASSEMBLY', qty: 2 },
    { n: 8, node: 'Hatch_Commander', label: 'COMMANDER HATCH' },
    { n: 9, node: 'Dischargers_L', label: 'SMOKE DISCHARGER BANK', qty: 2 },
    { n: 10, node: 'Stowage_Bin', label: 'STOWAGE BIN' },
    { n: 11, node: 'SideSkirt_L', label: 'SIDE SKIRT', qty: 2 },
    { n: 12, node: 'Hull_Collision', label: 'COLLISION PROXY (NOT RENDERED)' },
  ],

  callouts: [
    { n: 3, node: 'Barrel_Mesh', label: 'MAIN GUN', offset: [0, 0.22, 3.4], dir: 'ne' },
    { n: 2, node: 'Turret_Mesh', label: 'TURRET SHELL', offset: [0, 0.80, -0.9], dir: 'nw' },
    { n: 8, node: 'Hatch_Commander', label: 'CMDR HATCH', offset: [0, 0.10, 0], dir: 'ne' },
    { n: 1, node: 'Hull_Mesh', label: 'HULL', offset: [0, 1.66, 2.9], dir: 'se' },
    { n: 5, node: 'Wheels_Instanced', label: 'ROAD WHEELS ×14', offset: [-1.85, 0.46, -1.4], dir: 'sw' },
    { n: 7, node: 'Track_L', label: 'TRACK', offset: [0, 0.10, -3.4], dir: 'se' },
  ],

  instrumentation: [
    { label: 'HULL LENGTH', value: `${DIM.hull.length.toFixed(2)} m` },
    { label: 'OVERALL WIDTH', value: `${overallWidth.toFixed(2)} m` },
    { label: 'HEIGHT, ROOF', value: `${roofHeight.toFixed(2)} m` },
    { label: 'HEIGHT, SIGHT', value: `${sightHeight.toFixed(2)} m` },
    { label: 'GROUND CLR', value: `${DIM.hull.bellyY.toFixed(2)} m` },
    { label: 'ROAD WHEELS', value: `${DIM.roadWheel.count} / SIDE` },
    { label: 'GUN LENGTH', value: '4.98 m' },
    { label: 'AZIMUTH', key: 'azimuth', value: '+000.0°' },
    { label: 'ELEVATION', key: 'elevation', value: '+00.0°' },
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
