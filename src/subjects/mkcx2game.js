import { loadGameGlb } from '../lib/gltfImport.js';
import { mkcx2Joints } from '../mkcx2/buildMkcx2.js';
import { MKCX2_SUBJECT } from './mkcx2.js';

/**
 * Where the export lives. Relative to this module, so it resolves under a project path on
 * Pages the same as at the site root — the same argument as every other URL in the tree.
 */
export const MKCX2_GAME_TOKEN = '03fdc11d';
export const MKCX2_GAME_FILE = `design/game-exports/mkcx2_game_${MKCX2_GAME_TOKEN}.glb`;
const url = new URL(`../../${MKCX2_GAME_FILE}`, import.meta.url);

export const MKCX2_GAME_ROOT = 'MKCX2_Game_Bench';

/** The bench root once built; `derived()` reads what the import recorded on it. */
let bench = null;

/** How the bench adopts the file. Exported so the test loads the bytes through the same path. */
export const MKCX2_GAME_ADOPT = { rootName: MKCX2_GAME_ROOT, joints: mkcx2Joints() };

/**
 * Subject descriptor for the MKCX-2 — the MK-CX/2 as the game dresses it.
 *
 * This is the first subject that is not built here. It is `mkcx2` after a round trip: exported
 * from this viewer, cast by spherical-stalberg-grid into its own model, dressed with the
 * nine shells in the rear deck, three heat sleeves, health-tinted materials and edge outlines,
 * and exported back with the game's EXPORT button. The file is the deliverable being looked
 * at; the authored subject next to it in the SUBJECT row is what it was made from.
 *
 * The legend addresses the game's casts by the names the import gives them (see
 * src/lib/gltfImport.js): the pivot the mesh hangs from and the material it was cast with. The
 * joints are the MK-CX/2's own, because the game kept every pivot where the builder put it.
 */
export const MKCX2_GAME_SUBJECT = {
  id: 'mkcx2game',
  title: 'MKCX-2',
  subtitle: 'MK-CX/2 AS THE GAME DRESSES IT · REVERSE EXPORT FROM SPHERICAL-STALBERG-GRID · IMPORTED .GLB',
  imported: MKCX2_GAME_FILE,
  build: async () => (bench = await loadGameGlb(url, MKCX2_GAME_ADOPT)),
  /**
   * What the import found, quoted rather than typed: the scale the game had the unit at and
   * the heading it was exported on are facts about the file, and a constant here would be
   * wrong the moment the game re-exported it at a different one.
   */
  derived: () => {
    const pose = bench?.userData.gamePose, got = bench?.userData.imported;
    return pose ? {
      gameScale: `×${pose.scale.toFixed(4)}`,
      gameHeading: `${pose.headingDeg >= 0 ? '+' : '-'}${Math.abs(pose.headingDeg).toFixed(2)}°`,
      casts: String(got.meshes),
      outlines: String(got.lines),
    } : {};
  },
  frame: MKCX2_SUBJECT.frame,
  drawing: {
    'DWG': 'BTL-0003/2-G', 'REV': MKCX2_GAME_TOKEN, 'PROJ': 'FIRST ANGLE', 'UNITS': 'METRES', 'SHEET': '1 OF 1',
  },
  legend: [
    { n: 1, node: 'HullVib_M_Armour', label: 'HULL CAST, ARMOUR' },
    { n: 2, node: 'HullVib_M_Glow', label: 'HULL CAST, DECK INDICATORS' },
    { n: 3, node: 'Turret_Pivot_M_Turret', label: 'TURRET CAST' },
    { n: 4, node: 'Turret_Pivot_M_Steel', label: 'MAIN GUN CAST' },
    { n: 5, node: 'Barrel_Pivot_Dressing', label: 'HEAT SLEEVE, MAIN', },
    { n: 6, node: 'Secondary_L_Gun_Pivot_Dressing', label: 'HEAT SLEEVE, SECONDARY', qty: 2 },
    { n: 7, node: 'Secondary_L_Gun_Pivot_M_Steel', label: 'SECONDARY GUN CAST', qty: 2 },
    { n: 8, node: 'ShellRack_Mount_Dressing', label: 'SHELL, REAR DECK', qty: 9 },
    { n: 9, node: 'ShellRack_Mount_M_Detail', label: 'SHELL RACK CAST' },
    { n: 10, node: 'Hover_Gear_M_Armour', label: 'NACELLE CAST', },
    { n: 11, node: 'LiftEmitter_L1', label: 'LIFT EMITTER (KEPT ITS NAME)', qty: 6 },
    { n: 12, node: 'HullVib_M_Armour_Outline', label: 'EDGE OUTLINE, glTF LINES (GAME VIEW ONLY)' },
  ],
  callouts: [
    { n: 5, node: 'Barrel_Pivot', label: 'HEAT SLEEVE', offset: [0, 0.3, 3.2], dir: 'ne' },
    { n: 3, node: 'Turret_Pivot', label: 'TURRET CAST', offset: [0, 0.4, -0.5], dir: 'nw' },
    { n: 8, node: 'ShellRack_Mount', label: 'SHELLS ×9', offset: [0, 0.3, 0], dir: 'nw' },
    { n: 6, node: 'Secondary_R_Gun_Pivot', label: 'SLEEVE ×2', offset: [0.3, 0.2, 0.6], dir: 'se' },
    { n: 11, node: 'LiftEmitter_R2', label: 'EMITTER ×6', offset: [0.4, -0.2, 0], dir: 'se' },
  ],
  instrumentation: [
    { label: 'SOURCE', value: 'GAME EXPORT' },
    { label: 'FILE TOKEN', value: MKCX2_GAME_TOKEN },
    { label: 'AUTHORED AS', value: 'MK-CX/2 (mkcx2)' },
    { label: 'GAME SCALE', key: 'gameScale', value: '—' },
    { label: 'GAME HEADING', key: 'gameHeading', value: '—' },
    { label: 'MESH CASTS', key: 'casts', value: '—' },
    { label: 'OUTLINE SETS', key: 'outlines', value: '—' },
    { label: 'AZIMUTH', key: 'azimuth', value: '+000.0°' },
    { label: 'ELEVATION', key: 'elevation', value: '+000.0°' },
    { label: 'SEC TRAV', key: 'secAzimuth', value: '+000.0°' },
    { label: 'SEC ELEV', key: 'secElevation', value: '+000.0°' },
    { label: 'EXPLODE', key: 'explode', value: '0.00' },
    { label: 'VIEW', key: 'view', value: 'ISO' },
    { label: 'DISPLAY', key: 'mode', value: 'BLUEPRINT' },
    { label: 'NODES', key: 'nodes', value: '—' },
    { label: 'TRIANGLES', key: 'tris', value: '—' },
    { label: 'DRAW CALLS', key: 'calls', value: '—' },
    { label: 'FRAME', key: 'fps', value: '— fps' },
    { label: 'BUILD', key: 'build', value: '—' },
  ],
};
