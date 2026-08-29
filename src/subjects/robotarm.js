import { buildRobotArm, updateRobotArmAim } from '../robotarm/buildRobotArm.js';
import { RADIM, maxReach, wristHeight } from '../robotarm/dimensions.js';

const A = RADIM.arm;
const L = RADIM.limits;
const reach = maxReach() + A.wrist + A.flange + RADIM.head.body.length;
const topHeight = A.shoulderY + A.upper + A.fore + A.wrist + A.flange + RADIM.head.body.length;

/**
 * Subject descriptor for the RA-6.
 *
 * The instrumentation is worth reading as a pair. The top block is the machine — reach, axis
 * travel, envelope — and it is derived from the link lengths rather than typed. The joint block
 * underneath is deliberately split: BEARING and TOOL PITCH are what the head is *told*, and
 * SHOULDER, ELBOW, WRIST and FLANGE are what the arm is *doing*. Two of the six axes never
 * appear as a readout at all, because on this machine they are consequences and not commands.
 */
export const ROBOTARM_SUBJECT = {
  id: 'robotarm',
  title: 'RA-6 ARTICULATED ARM',
  subtitle: 'SIX-AXIS INDUSTRIAL ROBOT · AIM-COMMANDED HEAD · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildRobotArm,
  afterArticulate: updateRobotArmAim,
  // Framed on the shoulder rather than on the machine's half-height: the arm is mostly empty
  // air above the base, and centring on the bounding box puts the interesting end in a corner.
  frame: { target: [0, 0.98, 0.18], radius: 3.05 },

  drawing: {
    'DWG': 'BTL-0008',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Base_Plate', label: 'MOUNTING PLATE' },
    { n: 2, node: 'Slew_Ring', label: 'J1 SLEW BEARING' },
    { n: 3, node: 'Base_Casting', label: 'J1 BASE CASTING' },
    { n: 4, node: 'Shoulder_Boss', label: 'J2 SHOULDER BEARING' },
    { n: 5, node: 'UpperArm_Mesh', label: 'UPPER ARM' },
    { n: 6, node: 'Elbow_Housing', label: 'J3 ELBOW HOUSING' },
    { n: 7, node: 'Elbow_Motor', label: 'J3 DRIVE UNIT' },
    { n: 8, node: 'Forearm_Mesh', label: 'FOREARM' },
    { n: 9, node: 'Wrist_Housing', label: 'J4 FOREARM ROLL' },
    { n: 10, node: 'Wrist_Yoke', label: 'J5 WRIST PITCH' },
    { n: 11, node: 'Flange_Disc', label: 'J6 TOOL FLANGE' },
    { n: 12, node: 'Head_Body', label: 'HEAD / TWO-JAW GRIPPER' },
    { n: 13, node: 'Jaw_L_Mesh', label: 'GRIPPER JAW', qty: 2 },
    { n: 14, node: 'Forearm_Loom', label: 'DRESS-OUT CABLE LOOM' },
    { n: 15, node: 'Status_Ring', label: 'LIVE-CELL INDICATOR' },
    { n: 16, node: 'Base_Collision', label: 'COLLISION PROXY (BASE ONLY)' },
  ],

  callouts: [
    { n: 12, node: 'Head_Body', label: 'HEAD — AIM COMMANDED', offset: [0, 0.14, 0.10], dir: 'ne' },
    { n: 10, node: 'Wrist_Yoke', label: 'J5 SOLVED, NOT SET', offset: [0, 0.12, -0.06], dir: 'nw' },
    { n: 6, node: 'Elbow_Housing', label: 'J3 ELBOW', offset: [0, 0.18, 0], dir: 'ne' },
    { n: 4, node: 'Shoulder_Boss', label: 'J2 SHOULDER', offset: [0, -0.18, 0.10], dir: 'sw' },
    { n: 2, node: 'Slew_Ring', label: 'J1 SLEW', offset: [0, -0.06, 0.26], dir: 'se' },
    { n: 14, node: 'Forearm_Loom', label: 'DRESS-OUT', offset: [0.10, 0.10, 0], dir: 'nw' },
  ],

  instrumentation: [
    { label: 'REACH, TOOL', value: `${reach.toFixed(2)} m` },
    { label: 'HEIGHT, MAX', value: `${topHeight.toFixed(2)} m` },
    { label: 'SHOULDER HT', value: `${A.shoulderY.toFixed(2)} m` },
    { label: 'LINK J2-J3', value: `${A.upper.toFixed(2)} m` },
    { label: 'LINK J3-J4', value: `${A.fore.toFixed(2)} m` },
    { label: 'WRIST CENTRE', value: `${wristHeight(RADIM.rest.shoulder, RADIM.rest.elbow).toFixed(2)} m` },
    { label: 'AXES', value: '6 + GRIPPER' },
    { label: 'J1 TRAVEL', value: `±${L.swing}°` },
    { label: 'J2 TRAVEL', value: `${L.shoulder[0]}° / +${L.shoulder[1]}°` },
    { label: 'J3 TRAVEL', value: `${L.elbow[0]}° / +${L.elbow[1]}°` },
    { label: 'J4 TRAVEL', value: `±${L.wristRoll}°` },
    { label: 'J5 TRAVEL', value: `±${L.wristPitch}°` },
    { label: 'J6 TRAVEL', value: `±${L.flangeRoll}°` },
    // The two that are commands rather than axes, flagged as such in the readout itself.
    { label: 'BEARING', key: 'swing', value: '+000.0°' },
    { label: 'TOOL PITCH', key: 'pitch', value: '+000.0°' },
    { label: 'SHOULDER J2', key: 'shoulder', value: '+000.0°' },
    { label: 'ELBOW J3', key: 'elbow', value: '+000.0°' },
    { label: 'WRIST J4', key: 'wristRoll', value: '+000.0°' },
    { label: 'FLANGE J6', key: 'flangeRoll', value: '+000.0°' },
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
