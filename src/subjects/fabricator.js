import { buildFabricator, updateFabricatorPose } from '../fabricator/buildFabricator.js';
import {
  FDIM, airframeLength, beadArea, beadLaid, coursePerimeter, legReach, pierHeight, rotorSpan,
  segmentLength, segmentsLaid, tankLength, tankLitres, totalSegments,
} from '../fabricator/dimensions.js';

const L = FDIM.limits;
const restCharge = FDIM.rest.charge * tankLitres();

/**
 * Subject descriptor for the FD-4.
 *
 * The instrumentation splits three ways rather than the usual two, and the split is the point.
 *
 * The top block is the AIRFRAME — span, length, capacity — and it is measured off the built
 * geometry or derived from it. The middle block is the JOB: the bead's section, the length of
 * one course, how many courses a tankful buys and how tall that makes the pier. Every figure in
 * it comes out of the same arithmetic the builder lays the bead with, so a change to the pier's
 * plan moves the drawing with it.
 *
 * The third block is the joints, and only one of them is a command. BOOM YAW, BOOM PITCH, HEAD
 * PITCH and STANCE are things you set. CHARGE is the machine's entire state: where it hovers,
 * how much bead is on the bed and how tall the pier has got are all read off it, and none of
 * them has a slider. There is deliberately no readout of the drone's position — quoting a
 * coordinate the operator cannot set would suggest it was an input.
 */
export const FABRICATOR_SUBJECT = {
  id: 'fabricator',
  title: 'FD-4 FABRICATION DRONE',
  subtitle: 'ADDITIVE CONSTRUCTION UAV · CHARGE-DERIVED HOVER · PROCEDURAL SCENE GRAPH · NO IMPORTED ASSETS',
  build: buildFabricator,
  afterArticulate: updateFabricatorPose,
  /**
   * The two figures that describe the print, neither of which is a slider.
   *
   * Both are pure functions of CHARGE — which is the subject's whole claim — so they belong in
   * a readout hook rather than as joints with controls nobody should be able to drag.
   */
  derived: ({ charge }) => ({
    laid: `${beadLaid(charge).toFixed(2)} m`,
    courses: `${Math.floor(segmentsLaid(charge) / FDIM.pier.segsPerCourse)} / ${FDIM.pier.courses}`,
  }),
  // Framed between the work and the machine: the pier is 0.48 m tall and the drone sits about a
  // metre above it, so centring on either one alone puts the other off the sheet.
  frame: { target: [0, 0.66, 0], radius: 2.55 },

  drawing: {
    'DWG': 'BTL-0012',
    'REV': 'A',
    'PROJ': 'FIRST ANGLE',
    'UNITS': 'METRES',
    'SHEET': '1 OF 1',
  },

  legend: [
    { n: 1, node: 'Hull_Mesh', label: 'AIRFRAME HULL' },
    { n: 2, node: 'Core_Lens', label: 'POWER CORE' },
    { n: 3, node: 'Core_Rib_1', label: 'CORE CAGE RIB', qty: FDIM.core.cage.count },
    { n: 4, node: 'Rotor_FL_Blades', label: 'STABILISING ROTOR', qty: 4 },
    { n: 5, node: 'Emitter_FL_Lens', label: 'ANTIGRAVITY EMITTER', qty: 4 },
    { n: 6, node: 'Tank_Shell', label: 'FEEDSTOCK RESERVOIR' },
    { n: 7, node: 'Piston_Slide', label: 'RAM (CHARGE AXIS)' },
    { n: 8, node: 'Level_Collar', label: 'LEVEL FOLLOWER' },
    { n: 9, node: 'Pump_Body', label: 'METERING PUMP' },
    { n: 10, node: 'Feed_Line_Body', label: 'FEED LINE, 3 RUNS' },
    { n: 11, node: 'Coupling_Boom', label: 'ROTARY COUPLING', qty: 2 },
    { n: 12, node: 'Boom_Upper', label: 'PRINT BOOM' },
    { n: 13, node: 'Extruder_Body', label: 'EXTRUDER HEAD' },
    { n: 14, node: 'Nozzle_Heater', label: 'HEATER BAND' },
    { n: 15, node: 'Nozzle_Cone', label: 'PRECISION NOZZLE' },
    { n: 16, node: 'Leg_FL_Shin', label: 'BRACING LIMB', qty: 4 },
    { n: 17, node: 'Bead_Instanced', label: 'DEPOSITED BEAD SEGMENT', qty: totalSegments() },
    { n: 18, node: 'Bed_Slab', label: 'PRINT BED SLAB' },
    { n: 19, node: 'Airframe_Collision', label: 'COLLISION PROXY (AIRFRAME ONLY)' },
  ],

  callouts: [
    { n: 15, node: 'Nozzle_Cone', label: 'NOZZLE — SOLVED TO THE WORK', offset: [0.16, -0.02, 0.12], dir: 'ne' },
    { n: 17, node: 'Bead_Instanced', label: 'BEAD = WHAT LEFT THE TANK', offset: [0, 0.18, 0.30], dir: 'se' },
    { n: 6, node: 'Tank_Shell', label: 'RESERVOIR', offset: [-0.16, 0.16, 0], dir: 'nw' },
    { n: 8, node: 'Level_Collar', label: 'LEVEL FOLLOWER', offset: [-0.20, -0.10, 0], dir: 'sw' },
    { n: 2, node: 'Core_Lens', label: 'POWER CORE', offset: [0, 0.22, 0.10], dir: 'ne' },
    { n: 5, node: 'Emitter_RR_Lens', label: 'LIFT EMITTER ×4', offset: [0.20, 0.02, -0.10], dir: 'se' },
  ],

  instrumentation: [
    { label: 'ROTOR SPAN', value: `${rotorSpan().toFixed(2)} m` },
    { label: 'AIRFRAME LEN', value: `${airframeLength().toFixed(2)} m` },
    { label: 'RESERVOIR', value: `${tankLitres().toFixed(1)} L` },
    { label: 'BARREL LEN', value: `${(tankLength() * 1000).toFixed(0)} mm` },
    { label: 'LIMB REACH', value: `${legReach(100).toFixed(2)} m` },
    // The job. Everything here comes out of the same arithmetic the bead is laid with.
    { label: 'BEAD SECTION', value: `${(FDIM.pier.bead.width * 1000).toFixed(0)} × ${(FDIM.pier.bead.height * 1000).toFixed(0)} mm` },
    { label: 'BEAD AREA', value: `${(beadArea() * 1e6).toFixed(0)} mm²` },
    { label: 'SEGMENT', value: `${(segmentLength() * 1000).toFixed(0)} mm` },
    { label: 'COURSE', value: `${coursePerimeter().toFixed(3)} m · ${FDIM.pier.segsPerCourse} SEG` },
    { label: 'COURSES/TANK', value: `${FDIM.pier.courses}` },
    { label: 'PIER, FINISHED', value: `${FDIM.pier.outer.toFixed(2)} m □ × ${pierHeight().toFixed(2)} m` },
    { label: 'BEAD, TOTAL', value: `${(totalSegments() * segmentLength()).toFixed(1)} m` },
    { label: 'STANDOFF', value: `${(FDIM.head.standoff * 1000).toFixed(0)} mm` },
    { label: 'BOOM TRAVEL', value: `±${L.boomYaw}° / ±${L.boomPitch}°` },
    // The one command, and the four settings.
    { label: 'CHARGE, L', key: 'charge', value: restCharge.toFixed(2) },
    { label: 'BEAD LAID', key: 'laid', value: `${beadLaid(restCharge).toFixed(2)} m` },
    { label: 'COURSES DONE', key: 'courses', value: `— / ${FDIM.pier.courses}` },
    { label: 'BOOM YAW', key: 'boomYaw', value: '+000.0°' },
    { label: 'BOOM PITCH', key: 'boomPitch', value: '+000.0°' },
    { label: 'HEAD PITCH', key: 'headPitch', value: '+000.0°' },
    { label: 'STANCE', key: 'stance', value: '0.00' },
    { label: 'ROTOR PHASE', key: 'rotors', value: '+000.0°' },
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
