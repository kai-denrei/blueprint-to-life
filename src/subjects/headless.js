import { buildHeadless, updateHeadlessStance } from '../headless/buildHeadless.js';
import { BHDIM, crownHeight, shoulderSpan, stand } from '../headless/dimensions.js';

const rest = stand(BHDIM.leg.pose.neutral);
const crouch = stand(BHDIM.leg.pose.crouch);
const extend = stand(BHDIM.leg.pose.extend);
const height = crownHeight();
const width = shoulderSpan();
const reachSpread = [crouch.reach, rest.reach, extend.reach];

/**
 * Subject descriptor for BP-Headless01.
 *
 * Every figure in the title block is computed: height from the leg solve plus the carapace's
 * *built* crown — the profile after `extrudeProfile` tapers it, not the profile as authored —
 * and hip height straight out of the solve. On a legged machine those are not conveniences.
 * Type them in and the first change to a limb length or the shell taper makes the drawing lie,
 * and nobody finds out until someone measures the render.
 *
 * `afterArticulate` carries the ride height, which no parent transform can express: the legs are
 * children of the thing that has to move when they fold. Same hook the walker uses, unchanged.
 */
export const HEADLESS_SUBJECT = {
  id: 'headless',
  title: 'BP-HEADLESS01',
  subtitle: 'POWERED EXOFRAME · BIPEDAL · UNARMED · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildHeadless,
  afterArticulate: updateHeadlessStance,
  // Framed a little below mid-height and slightly back: the mass is in the carapace and the
  // legs are mostly air, so centring on the true midpoint puts the shell against the top edge.
  frame: { target: [0, 1.28, -0.04], radius: 3.55 },

  drawing: {
    'DWG': 'BTL-0006',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Thorax_Mesh', label: 'DORSAL CARAPACE, PRIMARY SHELL' },
    { n: 2, node: 'Chest_Hex', label: 'HEXAGONAL CORE PLATE' },
    { n: 3, node: 'Core_Lens', label: 'REACTOR CORE APERTURE' },
    { n: 4, node: 'Sensor_Band', label: 'SENSOR BAND — NO CRANIAL MOUNT' },
    { n: 5, node: 'Spine_Cover', label: 'SPINE COVER / CONDUIT HOUSING' },
    { n: 6, node: 'Ram_L_Body', label: 'FLANK ACTUATOR RAM', qty: 2 },
    { n: 7, node: 'Loom_L', label: 'SHOULDER CABLE LOOM', qty: 2 },
    { n: 8, node: 'Back_Conduit_1', label: 'DORSAL HOSE CONDUIT', qty: 3 },
    { n: 9, node: 'Pauldron_L', label: 'SHOULDER PAULDRON', qty: 2 },
    { n: 10, node: 'UpperArm_L_Mesh', label: 'MANIPULATOR ARM', qty: 2 },
    { n: 11, node: 'Palm_L_Mesh', label: 'FIVE-DIGIT END EFFECTOR', qty: 2 },
    { n: 12, node: 'Thigh_L_Mesh', label: 'FEMORAL ACTUATOR', qty: 2 },
    { n: 13, node: 'KneeHub_L', label: 'KNEE HUB', qty: 2 },
    { n: 14, node: 'Bearing_L_1', label: 'ANKLE BEARING STACK', qty: 6 },
    { n: 15, node: 'Foot_L_Sole', label: 'CONTACT SOLE, SPLAYED TOE', qty: 2 },
    { n: 16, node: 'Torso_Collision', label: 'COLLISION PROXY (NOT RENDERED)' },
  ],

  callouts: [
    { n: 4, node: 'Sensor_Band', label: 'SENSOR BAND — NO HEAD', offset: [0, 0.22, 0.16], dir: 'ne' },
    { n: 3, node: 'Core_Lens', label: 'CORE APERTURE', offset: [0, -0.18, 0.22], dir: 'se' },
    { n: 6, node: 'Ram_R_Body', label: 'FLANK RAM', offset: [0.20, 0.10, -0.10], dir: 'ne' },
    { n: 11, node: 'Palm_R_Mesh', label: 'END EFFECTOR ×2', offset: [0.18, -0.10, 0], dir: 'se' },
    { n: 14, node: 'Bearing_L_1', label: 'ANKLE BEARING', offset: [-0.20, 0.06, 0], dir: 'sw' },
    { n: 7, node: 'Loom_L', label: 'SHOULDER LOOM', offset: [-0.18, 0.16, 0], dir: 'nw' },
  ],

  instrumentation: [
    { label: 'HEIGHT, OVERALL', value: `${height.toFixed(2)} m` },
    { label: 'WIDTH, SHOULDER', value: `${width.toFixed(2)} m` },
    { label: 'HIP HEIGHT', value: `${rest.hipHeight.toFixed(2)} m` },
    { label: 'HIP RANGE', value: `${crouch.hipHeight.toFixed(2)}–${extend.hipHeight.toFixed(2)} m` },
    // The number that says the machine is standing rather than toppling: how far the ankle sits
    // forward of the hip across the whole stance range. On two feet there is no margin to spend.
    { label: 'HIP/ANKLE OFFSET', value: `${Math.min(...reachSpread).toFixed(3)}–${Math.max(...reachSpread).toFixed(3)} m` },
    { label: 'CONFIGURATION', value: 'BIPED · HEADLESS' },
    { label: 'ARMAMENT', value: 'NONE — UNARMED FRAME' },
    { label: 'END EFFECTOR', value: '5 DIGIT · 20 DRIVEN' },
    { label: 'LEAN ARC', value: `${BHDIM.torso.lean.min}° / +${BHDIM.torso.lean.max}°` },
    { label: 'TWIST ARC', value: `±${BHDIM.torso.twist}°` },
    { label: 'STANCE', key: 'stance', value: '50.00' },
    { label: 'TORSO LEAN', key: 'lean', value: '+000.0°' },
    { label: 'TORSO TWIST', key: 'twist', value: '+000.0°' },
    { label: 'SHOULDER', key: 'arms', value: '+000.0°' },
    { label: 'ELBOW', key: 'elbow', value: '+000.0°' },
    { label: 'GRIP', key: 'grip', value: '0.00' },
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
