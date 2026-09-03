/**
 * Scene-graph invariants.
 *
 * These assert the properties the spec calls the deliverable — node names, pivot origins,
 * instancing, a separate collider, UV channels, explode data — not pixels. A screenshot test
 * would assert the display mode, which the spec explicitly says is not the asset.
 *
 * Run: npm test
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTank } from '../src/tank/buildTank.js';
import { DIM, wheelLayout } from '../src/tank/dimensions.js';
import { buildMkcx } from '../src/mkcx/buildMkcx.js';
import { CXDIM } from '../src/mkcx/dimensions.js';
import { buildMkcx2 } from '../src/mkcx2/buildMkcx2.js';
import { buildHeptat } from '../src/heptat/buildHeptat.js';
import { HTDIM, rng } from '../src/heptat/dimensions.js';
import { buildHeptapod, updateHeptapodStance } from '../src/heptapod/buildHeptapod.js';
import { HPDIM, legSolve, legLayout, footSpan } from '../src/heptapod/dimensions.js';
import { buildHeadless, updateHeadlessStance } from '../src/headless/buildHeadless.js';
import { buildMotopod, updateMotopodRide } from '../src/motopod/buildMotopod.js';
import { buildRobotArm, updateRobotArmAim } from '../src/robotarm/buildRobotArm.js';
import { RADIM, aimIsAlwaysReachable, solveAim } from '../src/robotarm/dimensions.js';
import { buildTerraformer } from '../src/terraformer/buildTerraformer.js';
import {
  TDIM, courseLength, footprint, headClearance, liftStroke, nozzleHeight, railLength,
  structureHeight, traverseStroke,
} from '../src/terraformer/dimensions.js';
import { buildPortal } from '../src/portal/buildPortal.js';
import {
  PDIM, apertureDepth, apertureRadius, legFoot, outerRadius, podAngles, rowGaps, rowProfile,
  segmentCount,
} from '../src/portal/dimensions.js';
import { arcSegment, ringLayout } from '../src/lib/geometry.js';
import { buildFabricator, updateFabricatorPose } from '../src/fabricator/buildFabricator.js';
import {
  FDIM, beadArea, beadPose, courseVolume, coursePerimeter, legReach, legsClearTheNozzle,
  nozzleTarget, nozzleTipZ, pierHeight, segmentLength, segmentsLaid, tankCapacity, tankLength,
  tankLitres, totalSegments,
} from '../src/fabricator/dimensions.js';
import { buildContainer } from '../src/container/buildContainer.js';
import {
  CDIM, cargoEnvelope, castingLayout, interiorHeight, interiorLength, interiorWidth, leafWidth,
  loadFits, palletLayout,
} from '../src/container/dimensions.js';
import { foldPitch } from '../src/lib/geometry.js';
import { buildServer } from '../src/server/buildServer.js';
import {
  SDIM, elevationCoverage, fieldHeight, overallHeight as rackHeight, sledSlots, spanCentreY,
} from '../src/server/dimensions.js';
import { EMISSIVE, EMISSIVE_MAX } from '../src/lib/parts.js';
import { buildGimbal } from '../src/gimbal/buildGimbal.js';
import { GDIM, axisIndependence, payloadRadius, ringStack, sightLine } from '../src/gimbal/dimensions.js';
import { MPDIM, overallHeight, overallLength, overallWidth, rideLift, treadRadius } from '../src/motopod/dimensions.js';
import { BHDIM, crownHeight, crownPoint, stand } from '../src/headless/dimensions.js';
import { buildHowitzer } from '../src/howitzer/buildHowitzer.js';
import { HDIM, trailLayout } from '../src/howitzer/dimensions.js';
import { applyExplode, collectExplodable } from '../src/lib/parts.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (err) { failures.push({ name, err }); console.log(`  FAIL ${name}\n       ${err.message}`); }
}

const tank = buildTank();
const mkcx = buildMkcx();
const mkcx2 = buildMkcx2();
const heptat = buildHeptat();
const heptapod = buildHeptapod();
const headless = buildHeadless();
const motopod = buildMotopod();
const robotarm = buildRobotArm();
const gimbal = buildGimbal();
const server = buildServer();
const container = buildContainer();
const fabricator = buildFabricator();
const portal = buildPortal();
const terraformer = buildTerraformer();
const howitzer = buildHowitzer();
const byName = (n) => tank.getObjectByName(n);

/**
 * The shared asset contract: what every subject must have for this viewer to render it and this
 * pipeline to export it. Any invariant a new subject breaks is a real incompatibility rather
 * than a stylistic difference.
 *
 * `instancedGear` is a flag rather than an assumption because the MK-CX broke the original
 * version of this list, which required `Wheels_Instanced` of everything. It hovers; it has no
 * wheels. The choice was to make the contract conditional or to bolt decorative running gear
 * onto a hovering vehicle so a checklist stayed green — and a contract that forces geometry to
 * exist for the test's benefit has stopped describing the thing it tests.
 *
 * It was called `wheels` until the MotoPod, which made the name undeniably wrong: that subject
 * is mostly wheels and instances none of them, because each of its four rotating rings carries
 * a different articulated transform and instance matrices cannot inherit a parent's. The flag
 * had never meant "has wheels" — the walker set it false with eight legs and the exoframe with
 * two — it meant "the running gear is one InstancedMesh". Now it says so.
 *
 * SERVER01 then made it grow a second time. Its repeated part is twenty-eight compute sleds, so
 * the flag holds the NODE NAME rather than `true`: the check had hardcoded `Wheels_Instanced`,
 * which is a tank noun that a rack has no version of. Twice now this flag has had a vehicle
 * assumption filed off it, and both times the fix was to make the subject say what it has
 * instead of the checklist guessing.
 *
 * `armed` is the same shape of flag, added by BP-Headless01 — an unarmed exoframe with hands
 * instead of a gun. Worth noting what it cost, because it was almost nothing: unlike wheels,
 * "vehicles are armed" had never leaked into the shared contract, only into each subject's own
 * `required` list. The flag exists to check the *negative* case, which is the one that rots: a
 * frame that still carries a turret ring or a breech after the weapon was cut looks like the
 * edit was abandoned halfway, exactly as leftover running gear does on the MK-CX.
 */
const MODELS = [
  {
    name: 'tank', root: tank, rootName: 'Tank_Root', collision: 'Hull_Collision', instancedGear: 'Wheels_Instanced', armed: true,
    required: ['Hull_Mesh', 'Hull_Collision', 'Turret_Pivot', 'Turret_Mesh',
               'Barrel_Pivot', 'Barrel_Mesh', 'Wheels_Instanced', 'Details_Group'],
    pivots: ['Turret_Pivot', 'Barrel_Pivot'],
  },
  {
    name: 'mkcx', root: mkcx, rootName: 'MKCX_Root', collision: 'Hull_Collision', instancedGear: false, armed: true,
    required: ['Hull_Mesh', 'Hull_Collision', 'Turret_Pivot', 'Turret_Mesh',
               'Barrel_Pivot', 'Barrel_Mesh', 'Details_Group', 'Hover_Gear',
               'Nacelle_L', 'Nacelle_R', 'Secondary_Turrets',
               'Secondary_L_Pivot', 'Secondary_R_Pivot',
               'Secondary_L_Gun_Pivot', 'Secondary_R_Gun_Pivot'],
    pivots: ['Turret_Pivot', 'Barrel_Pivot',
             'Secondary_L_Pivot', 'Secondary_R_Pivot',
             'Secondary_L_Gun_Pivot', 'Secondary_R_Gun_Pivot'],
  },
  {
    // The MK-CX with the top taken off: same contract, plus the rack it carries for the game.
    name: 'mkcx2', root: mkcx2, rootName: 'MKCX2_Root', collision: 'Hull_Collision', instancedGear: false, armed: true,
    required: ['Hull_Mesh', 'Hull_Collision', 'Turret_Pivot', 'Turret_Mesh',
               'Barrel_Pivot', 'Barrel_Mesh', 'Details_Group', 'Hover_Gear',
               'Nacelle_L', 'Nacelle_R', 'Secondary_Turrets',
               'Secondary_L_Pivot', 'Secondary_R_Pivot',
               'Secondary_L_Gun_Pivot', 'Secondary_R_Gun_Pivot',
               'ShellRack_Mount', 'Shell_Socket_1', 'Shell_Socket_9', 'Deck_Glow_1', 'Deck_Glow_2'],
    pivots: ['Turret_Pivot', 'Barrel_Pivot',
             'Secondary_L_Pivot', 'Secondary_R_Pivot',
             'Secondary_L_Gun_Pivot', 'Secondary_R_Gun_Pivot'],
  },
  {
    name: 'heptat', root: heptat, rootName: 'HeptaT_Root', collision: 'Chassis_Collision', instancedGear: 'Wheels_Instanced', armed: true,
    required: ['Chassis_Mesh', 'Chassis_Collision', 'Cab_Mesh', 'CargoBay_Mesh',
               'Ramp_Pivot', 'Ramp_Mesh', 'Turret_Pivot', 'Turret_Mesh',
               'Barrel_Pivot', 'Barrel_Mesh', 'Wheels_Instanced', 'Details_Group'],
    pivots: ['Turret_Pivot', 'Barrel_Pivot', 'Ramp_Pivot', 'Steer_Wheel_1L', 'Steer_Wheel_1R'],
  },
  {
    // A walker: no wheels, and its ride height is leg state rather than a dimension. The
    // required list therefore names the leg chain, because "the legs exist and are articulated"
    // is this subject's equivalent of "the running gear is instanced".
    name: 'heptapod', root: heptapod, rootName: 'Heptapod_Root', collision: 'Hull_Collision', instancedGear: false, armed: true,
    required: ['Body_Group', 'Hull_Mesh', 'Hull_Collision', 'Turret_Pivot', 'Turret_Mesh',
               'Barrel_Pivot', 'Barrel_Mesh', 'Details_Group', 'Reactor_Mesh',
               'Sensor_Suite_Mesh', 'Lidar_Array', 'Leg_1L_Mount', 'Leg_4R_Tibia',
               'FootPad_1L', 'Arm_Shoulder_Pivot', 'Arm_Elbow_Pivot'],
    pivots: ['Turret_Pivot', 'Barrel_Pivot', 'Leg_1L_Hip', 'Leg_1L_Coxa', 'Leg_3R_Femur',
             'Leg_4L_Tibia', 'Foot_2R_Ankle', 'Arm_Shoulder_Pivot', 'Arm_Elbow_Pivot'],
  },
  {
    // A biped, and the first unarmed subject. Its required list names the leg chain for the same
    // reason the walker's does, and the hands because five driven digits a side are the machine's
    // whole purpose — a frame that lost its fingers in a refactor is not this subject any more.
    name: 'headless', root: headless, rootName: 'Headless_Root', collision: 'Torso_Collision',
    instancedGear: false, armed: false,
    required: ['Body_Group', 'Thorax_Mesh', 'Torso_Collision', 'Pelvis_Mesh', 'Details_Group',
               'Waist_Yaw', 'Waist_Pitch', 'Chest_Hex', 'Core_Lens', 'Sensor_Band',
               'Leg_L_Mount', 'Leg_R_Ankle', 'Foot_L_Sole', 'Foot_R_Sole',
               'Shoulder_L_Pivot', 'Elbow_R_Pivot', 'Palm_L_Mesh', 'Thumb_R_Dist'],
    pivots: ['Waist_Yaw', 'Waist_Pitch', 'Leg_L_Hip', 'Leg_R_Knee', 'Leg_L_Ankle',
             'Shoulder_R_Pivot', 'Elbow_L_Pivot', 'Finger_L1_Prox', 'Thumb_R_Prox'],
  },
  {
    // A two-wheeler. Nothing is instanced (each rotating ring is on a different articulated
    // parent) and nothing is armed, so both flags are false on a vehicle that is mostly wheel.
    // The required list names the ride/lean chain, because "it stands up" is this subject's
    // equivalent of "the running gear is instanced".
    name: 'motopod', root: motopod, rootName: 'MotoPod_Root', collision: 'Chassis_Collision',
    instancedGear: false, armed: false,
    required: ['Ride_Height', 'Lean_Pivot', 'Chassis_Group', 'Fairing_Mesh', 'Chassis_Collision',
               'Details_Group', 'Canopy_Pivot', 'Canopy_Mesh', 'HUD_Panel', 'Steer_Pivot',
               'Wheel_F_Spin', 'Wheel_R_Spin', 'Wheel_F_Fixed', 'Tyre_F', 'Tyre_R',
               'Stator_F', 'Rotor_R', 'Motor_F', 'Thruster_Pivot', 'Thruster_Nozzle'],
    pivots: ['Ride_Height', 'Lean_Pivot', 'Steer_Pivot', 'Canopy_Pivot',
             'Wheel_F_Spin', 'Wheel_R_Spin', 'Thruster_Pivot'],
  },
  {
    // A six-axis arm. Its `required` list names the whole J1..J6 chain, because "the axes exist
    // at their mechanical origins and are individually addressable" is the entire reason to
    // export one — and because two of those axes are written by the aim solve rather than by a
    // slider, so a rename would break the solve silently.
    name: 'robotarm', root: robotarm, rootName: 'RobotArm_Root', collision: 'Base_Collision',
    instancedGear: false, armed: false,
    required: ['Base_Group', 'Base_Plate', 'Base_Collision', 'Details_Group', 'Base_Casting',
               'Slew_Ring', 'Shoulder_Mount', 'J1_Pivot', 'J2_Pivot', 'J3_Pivot', 'J4_Pivot',
               'J5_Pivot', 'J6_Pivot', 'UpperArm_Mesh', 'Forearm_Mesh', 'Flange_Disc',
               'Head_Group', 'Head_Body', 'Jaw_L_Pivot', 'Jaw_R_Pivot'],
    pivots: ['J1_Pivot', 'J2_Pivot', 'J3_Pivot', 'J4_Pivot', 'J5_Pivot', 'J6_Pivot',
             'Shoulder_Mount', 'Jaw_L_Pivot', 'Jaw_R_Pivot'],
  },
  {
    // Twelve rings in three concentric sets on three perpendicular axes. The required list
    // names one ring from each set and the whole stage chain, because "the sets nest and share
    // a centre" is this subject's equivalent of "the running gear is instanced".
    name: 'gimbal', root: gimbal, rootName: 'Gimbal_Root', collision: 'Base_Collision',
    instancedGear: false, armed: false,
    required: ['Frame_Group', 'Base_Plate', 'Base_Collision', 'Details_Group', 'Pedestal_Mesh',
               'Slip_Ring_A', 'Slip_Ring_B', 'Slip_Ring_C', 'Cap_Bar',
               'Bearing_North', 'Bearing_South', 'Stage_A_Pivot', 'Stage_B_Pivot',
               'Stage_C_Pivot', 'Outer_Race_A', 'Encoder_Ring_A', 'Outer_Race_B',
               'Encoder_Ring_B', 'Outer_Race_C', 'Encoder_Ring_C',
               'Payload_Group', 'Sensor_Ball', 'Aperture_Mesh'],
    pivots: ['Stage_A_Pivot', 'Stage_B_Pivot', 'Stage_C_Pivot'],
  },
  {
    // A rack: the first non-vehicle, and the first subject since the tanks whose repeated part
    // is genuinely twenty-eight copies of one static transform. `instancedGear` names the node
    // rather than being a boolean, because "the running gear is one InstancedMesh" was already
    // the flag's real meaning and this subject's repeated part is not running gear.
    name: 'server', root: server, rootName: 'Server_Root', collision: 'Rack_Collision',
    instancedGear: 'Sleds_Instanced', armed: false,
    required: ['Frame_Group', 'Plinth_Mesh', 'Top_Cap', 'Rail_L', 'Rail_R', 'Rack_Collision',
               'Details_Group', 'Sleds_Instanced', 'SledLights_Instanced', 'Service_Slide',
               'Service_Sled_Mesh', 'Board_Mesh', 'IC_Group', 'IC_Die', 'Heatsink_Mesh',
               'Button_EPO', 'Button_Start_1', 'Door_Front_Pivot', 'Door_Rear_Pivot',
               'Fan_1_Spin', 'Fan_1_Rotor'],
    pivots: ['Door_Front_Pivot', 'Door_Rear_Pivot', 'Service_Slide', 'Fan_1_Spin', 'Fan_6_Spin'],
  },
  {
    // A container, doors open: the first subject you look INTO. Its required list names one
    // panel from each wall and the whole door chain, because "it is a hollow box with real
    // sheet for walls" is this subject's equivalent of "the running gear is instanced".
    name: 'container', root: container, rootName: 'Container_Root',
    collision: 'Container_Collision', instancedGear: 'Pallets_Instanced', armed: false,
    required: ['Frame_Group', 'Shell_Group', 'Floor_Group', 'Details_Group', 'Container_Collision',
               'Wall_L', 'Wall_R', 'Wall_Front', 'Roof_Mesh', 'Floor_Deck', 'Underframe_Mesh',
               'Casting_TFL', 'Casting_BRR', 'Post_FL', 'Door_L_Pivot', 'Door_R_Pivot',
               'Door_L_Panel', 'Lock_L1_Rod', 'Lock_R2_Rod', 'Pallets_Instanced'],
    pivots: ['Door_L_Pivot', 'Door_R_Pivot', 'Lock_L1_Rod', 'Lock_R2_Rod'],
  },
  {
    /**
     * A drone, and the first subject that brings its own work with it. `instancedGear` names the
     * deposited bead — which is the third time this flag has had an assumption filed off it, and
     * the most complete one: the repeated part is not running gear, is not a component of the
     * machine, and is not even part of the machine's own hierarchy. What the flag has always
     * meant is "the repeated thing is one InstancedMesh", and a printed pier is the cleanest
     * case of that yet — every segment really is one static transform of one identical box.
     *
     * The required list names the whole boom chain down to `Nozzle_Tip`, because the hover solve
     * reads that node by name and a rename would silently park the machine off the work; and
     * `Piston_Slide`, because the ram's position IS the charge that everything else is derived
     * from.
     */
    name: 'fabricator', root: fabricator, rootName: 'Fab_Root',
    collision: 'Airframe_Collision', instancedGear: 'Bead_Instanced', armed: false,
    required: ['Workpiece_Group', 'Bed_Slab', 'Bead_Instanced', 'Airframe_Platform',
               'Airframe_Collision', 'Body_Group', 'Hull_Mesh', 'Sensor_Pod', 'Details_Group',
               'Core_Group', 'Core_Lens', 'Lift_Group', 'Mast_FL', 'Rotor_RR_Blades',
               'Emitter_FL_Lens', 'Reservoir_Group', 'Tank_Shell', 'Piston_Slide',
               'Level_Collar', 'Pump_Body', 'Legs_Group', 'Leg_FL_Hip', 'Leg_RR_Pad',
               'Boom_Yaw', 'Boom_Pitch', 'Boom_Upper', 'Head_Pitch', 'Extruder_Body',
               'Nozzle_Heater', 'Nozzle_Cone', 'Nozzle_Tip', 'Feed_Line_Body', 'Feed_Line_Boom'],
    pivots: ['Airframe_Platform', 'Piston_Slide', 'Boom_Yaw', 'Boom_Mount', 'Boom_Pitch',
             'Head_Pitch', 'Nozzle_Tip', 'Leg_FL_Splay', 'Leg_FL_Hip', 'Leg_RR_Knee',
             'Rotor_FL_Spin'],
  },
  {
    /**
     * A gate, and the first subject whose contract includes a NEGATIVE space. `armed: false`
     * and no running gear; `instancedGear` names one of three segment rows, each of which is
     * genuinely N copies of one static transform under one articulated parent.
     *
     * The required list names `Aperture_Volume` — an empty whose scale is the clear cylinder —
     * because that node is the entire interface to whatever composites an effect into the bore.
     * Rename it and the drawing still renders perfectly while the handoff silently breaks.
     */
    name: 'portal', root: portal, rootName: 'Portal_Root',
    collision: 'Base_Collision', instancedGear: 'Shell_Instanced', armed: false,
    required: ['Base_Group', 'Plinth_Mesh', 'Base_Collision', 'Slew_Ring', 'Yaw_Turntable',
               'Buttress_Group', 'Buttress_L', 'Buttress_R', 'Conduit_L', 'Ring_Group',
               'Aperture_Volume', 'Liner_Group', 'Liner_Ring', 'Edge_Ring_Front', 'Edge_Ring_Rear',
               'Stator_Group', 'Shell_Instanced', 'Block_Instanced', 'Rotor_A_Spin',
               'Rotor_B_Spin', 'RotorA_Instanced', 'RotorB_Instanced', 'RotorA_Glow_Instanced',
               'Pods_Group', 'Pod_1_Mount', 'Pod_1_Body', 'Pod_1_Core', 'Pod_8_Vane_L',
               'Pod_1_Fin_R'],
    pivots: ['Yaw_Turntable', 'Ring_Group', 'Aperture_Volume', 'Rotor_A_Spin', 'Rotor_B_Spin',
             'Pod_1_Mount', 'Pod_1_Vane_L', 'Pod_8_Vane_R'],
  },
  {
    /**
     * A gantry printer, and the first subject to declare a control that is not a slider. Its
     * required list names the whole prismatic chain and `Structure_Group`, because that group is
     * what the toggle addresses — rename it and the button silently stops finding anything.
     */
    name: 'terraformer', root: terraformer, rootName: 'Terraformer_Root',
    collision: 'Gantry_Collision', instancedGear: 'Layers_Instanced', armed: false,
    required: ['Site_Group', 'Rail_L1', 'Sleepers_Instanced', 'Structure_Group', 'Slab_Mesh',
               'Layers_Instanced', 'Travel_Carriage', 'Gantry_Collision', 'Tower_L_Group',
               'Tower_R_Group', 'Bogie_L', 'Tower_L_Mesh', 'Ladder_R', 'Outrigger_L1',
               'Beam_Group', 'Beam_Mesh', 'Walkway_F', 'Silos_Group', 'Silo_1_Shell',
               'Feed_Line_2', 'Traverse_Carriage', 'Carriage_Group', 'Carriage_Mesh',
               'Mast_Stage_1', 'Mast_Stage_2', 'Mast_1_Mesh', 'Arm_Group', 'Arm_Swing',
               'Arm_Mount', 'Arm_Shoulder', 'Arm_Upper', 'Arm_Elbow', 'Arm_Fore', 'Arm_Wrist',
               'Head_Mesh', 'Nozzle_Heater', 'Nozzle_Cone', 'Nozzle_Tip'],
    pivots: ['Travel_Carriage', 'Traverse_Carriage', 'Mast_Stage_1', 'Mast_Stage_2', 'Arm_Swing',
             'Arm_Mount', 'Arm_Shoulder', 'Arm_Elbow', 'Arm_Wrist', 'Nozzle_Tip'],
  },
  {
    name: 'howitzer', root: howitzer, rootName: 'Howitzer_Root', collision: 'Chassis_Collision', instancedGear: 'Wheels_Instanced', armed: true,
    required: ['Chassis_Mesh', 'Chassis_Collision', 'Traverse_Pivot', 'TopCarriage_Mesh',
               'Elevation_Pivot', 'Barrel_Mesh', 'Wheels_Instanced', 'Details_Group'],
    pivots: ['Traverse_Pivot', 'Elevation_Pivot', 'Trail_Front_L', 'Trail_Rear_R'],
  },
];

console.log('\nscene graph — engine-portable naming');

for (const m of MODELS) {
  test(`[${m.name}] root is ${m.rootName}`, () => {
    assert.equal(m.root.name, m.rootName);
  });

  test(`[${m.name}] every node named in the hierarchy contract exists`, () => {
    for (const n of m.required) assert.ok(m.root.getObjectByName(n), `missing node: ${n}`);
  });

  test(`[${m.name}] no node is unnamed — an unnamed node cannot be rigged after export`, () => {
    const unnamed = [];
    m.root.traverse((o) => { if (!o.name) unnamed.push(o.type); });
    assert.deepEqual(unnamed, [], `unnamed nodes: ${unnamed.join(', ')}`);
  });

  test(`[${m.name}] names are unique — GLTF import collides otherwise`, () => {
    const seen = new Set(), dupes = new Set();
    m.root.traverse((o) => { if (seen.has(o.name)) dupes.add(o.name); seen.add(o.name); });
    assert.deepEqual([...dupes], []);
  });

  test(`[${m.name}] pivots are empty Object3Ds, not meshes`, () => {
    for (const n of m.pivots) {
      const p = m.root.getObjectByName(n);
      assert.ok(p, `missing pivot: ${n}`);
      assert.equal(p.isMesh, undefined, `${n} must carry no geometry of its own`);
    }
  });

  test(`[${m.name}] collision proxy is separate, hidden and carries no partId`, () => {
    const proxy = m.root.getObjectByName(m.collision);
    assert.equal(proxy.visible, false);
    assert.equal(proxy.userData.isCollision, true);
    assert.equal(proxy.geometry.getAttribute('partId'), undefined);
    assert.ok(proxy.geometry.getAttribute('position').count <= 48, 'proxy should be a simple box');
    const renderGeoms = new Set();
    m.root.traverse((o) => { if (o.isMesh && !o.userData.isCollision) renderGeoms.add(o.geometry); });
    assert.ok(!renderGeoms.has(proxy.geometry), 'render geometry must never be reused as a collider');
  });

  test(`[${m.name}] every rendered mesh has uv, uv1, uv2, partId and emissive`, () => {
    const missing = [];
    m.root.traverse((o) => {
      if (!o.isMesh || o.userData.isCollision) return;
      for (const key of ['uv', 'uv1', 'uv2', 'partId', 'emissive']) {
        if (!o.geometry.getAttribute(key)) missing.push(`${o.name}:${key}`);
      }
    });
    assert.deepEqual(missing, []);
  });

  test(`[${m.name}] no two rendered meshes share a part id`, () => {
    // A shared id means the outline filter cannot tell the two apart, so the seam between them
    // vanishes. It happened once already, by cloning a geometry that had already been
    // registered — invisible in that case only because the two parts never touch on screen.
    const seen = new Map();
    const clashes = [];
    m.root.traverse((o) => {
      if (!o.isMesh || o.userData.isCollision) return;
      const id = o.userData.partId;
      if (seen.has(id)) clashes.push(`${seen.get(id)} + ${o.name} both id ${id}`);
      else seen.set(id, o.name);
    });
    assert.deepEqual(clashes, []);
  });

  test(`[${m.name}] part ids fit the 8-bit channel the G-buffer packs them into`, () => {
    let max = 0;
    m.root.traverse((o) => { if (o.userData.partId) max = Math.max(max, o.userData.partId); });
    assert.ok(max > 0 && max < 255, `part id ${max} would wrap the id channel`);
  });

  test(`[${m.name}] no NaN in any position buffer`, () => {
    const bad = [];
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      const arr = o.geometry.getAttribute('position').array;
      for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) { bad.push(o.name); break; }
    });
    assert.deepEqual(bad, []);
  });

  test(`[${m.name}] running gear matches what the subject claims`, () => {
    if (m.instancedGear) {
      const w = m.root.getObjectByName(m.instancedGear);
      assert.ok(w?.isInstancedMesh, `${m.instancedGear} must be an InstancedMesh`);
      assert.ok(w.count > 1, `${m.instancedGear} instances ${w.count} — that is not an array`);
      const loose = [];
      m.root.traverse((o) => {
        if (o.isMesh && !o.isInstancedMesh && /RoadWheel/i.test(o.name)) loose.push(o.name);
      });
      assert.deepEqual(loose, [], 'road wheels must be instanced, not N loose meshes');
    } else {
      // A hovering vehicle carrying leftover running gear is worse than one carrying none:
      // it looks like the change was abandoned halfway.
      const leftovers = [];
      m.root.traverse((o) => {
        if (/RoadWheel|Sprocket|ReturnRoller|^Track_|Wheels_Instanced/i.test(o.name)) leftovers.push(o.name);
      });
      assert.deepEqual(leftovers, [],
        'this subject declares no instanced running gear but still carries some');
    }
  });

  test(`[${m.name}] armament matches what the subject claims`, () => {
    const WEAPON = /Turret|Barrel|Muzzle|Breech|Gun|AmmoDrum|CoilRing|Trunnion/i;
    const found = [];
    m.root.traverse((o) => { if (WEAPON.test(o.name)) found.push(o.name); });
    if (m.armed) {
      assert.ok(found.length > 0, 'an armed subject should carry a weapon');
    } else {
      // The mirror of the wheels check. A frame that kept its turret ring or its breech after
      // the weapon was cut reads as an abandoned edit, and nothing else would notice.
      assert.deepEqual(found, [], 'this subject declares no armament but still carries some');
    }
  });

  test(`[${m.name}] explode is stored data and is exactly reversible`, () => {
    const parts = collectExplodable(m.root);
    assert.ok(parts.length >= 8, `expected many explodable parts, got ${parts.length}`);
    const before = parts.map((p) => p.position.clone());
    applyExplode(m.root, 1);
    const moved = parts.filter((p, i) => p.position.distanceTo(before[i]) > 0.01).length;
    assert.ok(moved >= parts.length * 0.8, 'most explodable parts should actually move');
    applyExplode(m.root, 0);
    parts.forEach((p, i) => assert.equal(p.position.distanceTo(before[i]), 0, `${p.name} did not return`));
  });

  test(`[${m.name}] every declared joint target resolves and is unique`, () => {
    const joints = m.root.userData.joints;
    const pairs = joints.flatMap((j) => j.targets.map((t) => `${t.node}.${t.axis}`));
    assert.equal(new Set(pairs).size, pairs.length,
      'two joints driving the same node axis fight each other every frame');
  });

  test(`[${m.name}] declares joints the viewer can drive without knowing the subject`, () => {
    const joints = m.root.userData.joints;
    assert.ok(Array.isArray(joints) && joints.length >= 2, 'no joints declared');
    for (const j of joints) {
      for (const key of ['key', 'label', 'min', 'max', 'step', 'value', 'targets']) {
        assert.ok(j[key] !== undefined, `joint ${j.key} missing ${key}`);
      }
      assert.ok(j.max > j.min, `joint ${j.key} has an empty range`);
      assert.ok(j.value >= j.min && j.value <= j.max, `joint ${j.key} default is out of range`);
      assert.ok(j.targets.length > 0, `joint ${j.key} drives nothing`);
      for (const t of j.targets) {
        const node = m.root.getObjectByName(t.node);
        assert.ok(node, `joint ${j.key} targets missing node ${t.node}`);
        assert.ok(['x', 'y', 'z'].includes(t.axis), `joint ${j.key} bad axis ${t.axis}`);
        assert.ok(Number.isFinite(t.from) && Number.isFinite(t.to), `joint ${j.key} bad range`);
        assert.ok(t.prop === undefined || t.prop === 'position' || t.prop === 'rotation',
          `joint ${j.key} has an unknown target prop ${t.prop}`);
        // A prismatic target and the explode system both write `position`, and the explode
        // system restores from a stored rest pose — so a node driven by both would snap back to
        // wherever the slider last left it the first time anyone touched EXPLODE.
        if (t.prop === 'position') {
          assert.ok(!node.userData.rest,
            `joint ${j.key} slides ${t.node}, which is also explodable — the two fight over position`);
        }
      }
    }
    const keys = joints.map((j) => j.key);
    assert.equal(new Set(keys).size, keys.length, 'duplicate joint keys');
  });

  test(`[${m.name}] any declared toggle resolves and addresses a real group`, () => {
    /**
     * Toggles are the boolean half of the declared-control contract, added by the TF-3000. Most
     * subjects declare none and this passes vacuously — which is the point of checking it here
     * rather than in that subject's own block: the shape is general, so a second subject that
     * wants one inherits the check.
     */
    for (const t of m.root.userData.toggles || []) {
      for (const key of ['key', 'label', 'node', 'value']) {
        assert.ok(t[key] !== undefined, `toggle ${t.key} missing ${key}`);
      }
      const node = m.root.getObjectByName(t.node);
      assert.ok(node, `toggle ${t.key} targets missing node ${t.node}`);
      assert.equal(typeof t.value, 'boolean', `toggle ${t.key} default must be a boolean`);
      // A toggle hides a node by setting `visible`, so it must not address a node the viewer
      // already owns the visibility of — the collision proxy is hidden by the `c` key and would
      // be fought over.
      assert.ok(!node.userData.isCollision, `toggle ${t.key} addresses the collision proxy`);
      assert.ok(node.parent, `toggle ${t.key} addresses a detached node`);
    }
    const keys = (m.root.userData.toggles || []).map((t) => t.key);
    assert.equal(new Set(keys).size, keys.length, 'duplicate toggle keys');
  });
}

console.log('\narticulation — pivots at true mechanical origins');

test('Turret_Pivot sits at the turret ring centre', () => {
  const p = byName('Turret_Pivot');
  assert.equal(p.position.y, DIM.turret.ringY);
  assert.equal(p.position.z, DIM.turret.ringZ);
  assert.equal(p.position.x, 0);
});

test('Barrel_Pivot is a child of Turret_Pivot, at the trunnion', () => {
  const b = byName('Barrel_Pivot');
  assert.equal(b.parent.name, 'Turret_Pivot');
  assert.equal(b.position.y, DIM.barrel.trunnionY);
  assert.equal(b.position.z, DIM.barrel.trunnionZ);
});

test('azimuth on Turret_Pivot carries the barrel with it', () => {
  const turret = byName('Turret_Pivot');
  const barrel = byName('Barrel_Mesh');
  turret.rotation.y = 0;
  tank.updateMatrixWorld(true);
  const before = barrel.getWorldPosition({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, copy() { return this; }, applyMatrix4(m) { const e = m.elements; this.x = e[12]; this.y = e[13]; this.z = e[14]; return this; }, setFromMatrixPosition(m) { return this.applyMatrix4(m); } });
  turret.rotation.y = Math.PI / 2;
  tank.updateMatrixWorld(true);
  const after = barrel.matrixWorld.elements;
  assert.ok(Math.abs(after[12] - before.x) > 0.5, 'rotating the turret must move the barrel');
  turret.rotation.y = 0;
  tank.updateMatrixWorld(true);
});

console.log('\ninstancing and collision');

test('[mkcx] emissive parts are flagged in the geometry, not just the material', () => {
  // The blueprint pass has no materials — it renders with an overrideMaterial — so a glow
  // expressed only as MeshStandardMaterial.emissive would show in the PBR mode and silently
  // vanish in the schematic. The attribute is what makes both modes agree.
  const lit = [];
  mkcx.traverse((o) => {
    if (o.isMesh && o.userData.emissive) lit.push(o.name);
  });
  assert.ok(lit.length >= 8, `expected several emissive parts, got ${lit.length}`);
  for (const name of lit) {
    const attr = mkcx.getObjectByName(name).geometry.getAttribute('emissive');
    assert.ok(attr, `${name} is flagged emissive but has no emissive attribute`);
    assert.equal(attr.array[0], 1, `${name} emissive attribute is not set`);
  }
});

test('[mkcx] deviates from the MK-VI it projects forward from', () => {
  // It is supposed to be a different vehicle, not a retexture. If these ever converge, the
  // silhouette claim in the README stopped being true.
  assert.ok(CXDIM.hull.length > DIM.hull.length, 'MK-CX should be the longer hull');
  assert.ok(CXDIM.hull.deckY < DIM.hull.deckY, 'MK-CX should be the lower hull');
  assert.equal(CXDIM.roadWheel, undefined, 'MK-CX has no running gear at all');
  assert.ok(CXDIM.hover.gap > 0, 'MK-CX should sit off the ground');
});

test('[mkcx] hovers: the lowest geometry clears the ground', () => {
  mkcx.updateMatrixWorld(true);
  let lowest = Infinity;
  mkcx.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    lowest = Math.min(lowest, bb.min.y);
  });
  assert.ok(lowest > 0.01, `lowest geometry sits at y=${lowest.toFixed(3)} — it is resting, not hovering`);
});

test('[mkcx] the secondary turrets clear the main gun bore line', () => {
  // The design constraint the user set: small enough to sit under the main cannon. If a later
  // tweak grows them past the bore, the silhouette reads as a collision.
  const c = CXDIM.secondary;
  const secTop = c.y + Math.max(...c.profile.map(([, y]) => y)) + 0.10;
  const boreY = CXDIM.turret.ringY + CXDIM.barrel.trunnionY;
  assert.ok(secTop < boreY,
    `secondary tops out at ${secTop.toFixed(2)} but the bore is at ${boreY.toFixed(2)}`);
});

test('[heptat] the tail ramp reaches the ground when fully deployed', () => {
  // Length and hinge height are coupled: L*cos(open) must equal -hingeY or the ramp stops in
  // mid-air. It did, on the first pass. Either number can be nudged later without the other.
  const c = HTDIM.cargo;
  const hinge = c.y0 + 0.02;
  const tip = hinge + c.ramp.height * Math.cos((c.ramp.open * Math.PI) / 180);
  assert.ok(Math.abs(tip) < 0.08, `ramp tip lands at y=${tip.toFixed(3)}, not on the ground`);
});

test('[heptat] stowage is asymmetric and jittered — deterministically', () => {
  // "Lived-in" is structural here: things a crew accumulated, not things a designer mirrored.
  // Both halves of that matter. Perfect mirroring reads as a product render; a non-deterministic
  // jitter would make the scene graph — the actual deliverable — differ between builds.
  const a = rng(HTDIM.stowage.seed);
  const b = rng(HTDIM.stowage.seed);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()], 'the jitter source must be reproducible');

  const named = [];
  heptat.traverse((o) => { if (o.name) named.push(o.name); });
  for (const solo of ['SpareWheel', 'Toolbox', 'CableReel']) {
    assert.ok(named.includes(solo), `missing ${solo}`);
    assert.ok(!named.includes(`${solo}_L`) && !named.includes(`${solo}_R`),
      `${solo} should exist once, not as a mirrored pair`);
  }

  // Crates must not share a rotation — that would mean the jitter never applied.
  const crates = [];
  heptat.traverse((o) => { if (/^Crate_/.test(o.name)) crates.push(o.rotation.y); });
  assert.ok(crates.length >= 4, 'expected several stowed crates');
  assert.ok(new Set(crates.map((r) => r.toFixed(6))).size === crates.length,
    'every crate has the same cant, so the jitter is not being applied');
});

test('[heptat] the steered axle is the only one that turns', () => {
  const layout = heptat.getObjectByName('Wheels_Instanced').userData.layout;
  const steered = layout.filter((l) => l.steers);
  assert.equal(steered.length, 2, 'exactly one axle should steer');
  assert.ok(steered.every((l) => l.axle === HTDIM.wheel.steerAxle));
  for (const l of steered) {
    assert.ok(heptat.getObjectByName(`Steer_${l.name}`), `no carrier for ${l.name}`);
  }
});

console.log('\nthe walker — ride height is leg state, not a dimension');

/** Drive one declared joint to a value, exactly as main.js does, and run the subject fix-up. */
function setJoint(root, key, value, after) {
  const j = root.userData.joints.find((x) => x.key === key);
  const t = (value - j.min) / (j.max - j.min);
  for (const target of j.targets) {
    const node = root.getObjectByName(target.node);
    const v = target.from + t * (target.to - target.from);
    if (target.prop === 'position') node.position[target.axis] = v;
    else node.rotation[target.axis] = (v * Math.PI) / 180;
  }
  after?.(root);
  root.updateMatrixWorld(true);
}

/** Lowest world Y of each foot pad. */
function footContacts(root) {
  const out = [];
  root.traverse((o) => {
    if (!/^FootPad_/.test(o.name)) return;
    o.geometry.computeBoundingBox();
    out.push(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).min.y);
  });
  return out;
}

test('[heptapod] neutral pose is the midpoint of crouch and extend', () => {
  // The STANCE slider maps min..max linearly onto each target, so its default of 50 lands on
  // the rest posture only if neutral IS the midpoint. Author a third pose freehand and the
  // machine silently stops resting at the height every title-block figure was derived from.
  const { crouch, neutral, extend } = HPDIM.leg.pose;
  neutral.forEach((v, i) => {
    assert.equal(Number(((crouch[i] + extend[i]) / 2).toFixed(6)), v,
      `pose limb ${i}: neutral is not halfway between crouch and extend`);
  });
});

test('[heptapod] all eight feet are on the ground at every stance', () => {
  // The one thing a walker must not get wrong. Ride height is written by afterArticulate from
  // the leg angles; if that ever drifts from the geometry the machine either floats or sinks,
  // and neither is visible in a still until someone looks at the shadow.
  for (const v of [0, 25, 50, 75, 100]) {
    setJoint(heptapod, 'stance', v, updateHeptapodStance);
    const contacts = footContacts(heptapod);
    assert.equal(contacts.length, 8, 'expected eight foot pads');
    for (const y of contacts) {
      assert.ok(Math.abs(y) < 0.002,
        `stance ${v}: a foot pad sits at y=${y.toFixed(4)}, not on the ground`);
    }
  }
});

test('[heptapod] folding the legs actually lowers the hull', () => {
  const heights = [];
  for (const v of [0, 50, 100]) {
    setJoint(heptapod, 'stance', v, updateHeptapodStance);
    heights.push(heptapod.getObjectByName('Body_Group').position.y);
  }
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2],
    `ride height should rise with stance, got ${heights.map((h) => h.toFixed(3)).join(' / ')}`);
  assert.ok(heights[2] - heights[0] > 0.5, 'the stance range is too small to be worth a slider');
  setJoint(heptapod, 'stance', 50, updateHeptapodStance);
  assert.equal(
    Number(heptapod.getObjectByName('Body_Group').position.y.toFixed(6)),
    Number(legSolve(HPDIM.leg.pose.neutral).hipHeight.toFixed(6)),
    'the rest height the drawing quotes is not the height the graph produces',
  );
});

test('[heptapod] the stride keeps an alternating tetrapod', () => {
  // Four legs swing while four stand, and the two sets alternate along each flank — that is
  // what keeps a statically stable machine statically stable mid-stride. It is a parity in
  // legLayout(), which is exactly the kind of thing that survives a refactor by accident.
  const legs = legLayout();
  assert.equal(legs.length, 8, 'eight legs');
  const sets = { A: legs.filter((l) => l.tetrad === 'A'), B: legs.filter((l) => l.tetrad === 'B') };
  assert.equal(sets.A.length, 4);
  assert.equal(sets.B.length, 4);
  for (const side of [-1, 1]) {
    const flank = legs.filter((l) => l.side === side).map((l) => l.tetrad).join('');
    assert.ok(flank === 'ABAB' || flank === 'BABA', `flank ${side} is not alternating: ${flank}`);
  }
  for (const l of legs) {
    const opposite = legs.find((o) => o.index === l.index && o.side === -l.side);
    assert.notEqual(l.tetrad, opposite.tetrad, `${l.name} and its pair are in the same set`);
  }

  const stride = heptapod.userData.joints.find((j) => j.key === 'stride');
  assert.equal(stride.targets.length, 8, 'one hip per leg');
  setJoint(heptapod, 'stride', stride.max);
  const yaws = legs.map((l) => heptapod.getObjectByName(`${l.name}_Hip`).rotation.y);
  assert.ok(yaws.some((y) => y > 0) && yaws.some((y) => y < 0),
    'at full stride the two sets should be swung opposite ways');
  setJoint(heptapod, 'stride', 0);
});

test('[heptapod] every leg is its own geometry, not eight clones of one', () => {
  // Cloning a registered geometry across eight legs would give them one shared part id, and the
  // outline pass would stop drawing the seam wherever two legs cross. Cheap to do by accident,
  // invisible until two limbs overlap on screen.
  const geoms = new Set();
  let segments = 0;
  heptapod.traverse((o) => {
    if (!o.isMesh || !/^(Coxa|Femur|Tibia|FootPad)_/.test(o.name)) return;
    segments++;
    geoms.add(o.geometry);
  });
  assert.equal(segments, 32, 'expected four segments on each of eight legs');
  assert.equal(geoms.size, 32, 'leg segments share geometry, so they share a part id');
});

test('[heptapod] the quoted span is the span the graph produces', () => {
  // Width and length are the foot circle, not a hull dimension — so they are derived, and this
  // is what stops the title block drifting from the machine after a limb-length change.
  setJoint(heptapod, 'stance', 50, updateHeptapodStance);
  const feet = [];
  heptapod.traverse((o) => {
    if (/^FootPad_/.test(o.name)) feet.push(o.getWorldPosition(new THREE.Vector3()));
  });
  const [declaredW, declaredL] = footSpan(HPDIM.leg.pose.neutral);
  const xs = feet.map((f) => f.x), zs = feet.map((f) => f.z);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - declaredW) < 0.02,
    `width: solve says ${declaredW.toFixed(3)}, graph says ${(Math.max(...xs) - Math.min(...xs)).toFixed(3)}`);
  assert.ok(Math.abs((Math.max(...zs) - Math.min(...zs)) - declaredL) < 0.02,
    `length: solve says ${declaredL.toFixed(3)}, graph says ${(Math.max(...zs) - Math.min(...zs)).toFixed(3)}`);
});

test('[heptapod] the sentry is lit on both accent channels', () => {
  // The weapon and the reactor are on channel 1, the sensors and the pads on channel 2. A
  // subject that put everything on one channel would render, and would have thrown away the
  // distinction the channel exists to carry.
  const channels = new Set();
  heptapod.traverse((o) => {
    if (o.isMesh && o.userData.emissive) channels.add(o.userData.emissive);
  });
  assert.deepEqual([...channels].sort(), [1, 2], 'expected parts on both accent channels');
});

console.log('\nthe biped — two feet, no head, and a height figure that has to be true');

/** Lowest world Y actually reached by a mesh's vertices — not its transformed AABB. */
function vertexExtremes(root, filter = () => true) {
  const v = new THREE.Vector3();
  let lo = Infinity, hi = -Infinity, name = '';
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision || !filter(o)) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      lo = Math.min(lo, v.y);
      if (v.y > hi) { hi = v.y; name = o.name; }
    }
  });
  return { lo, hi, highest: name };
}

test('[headless] neutral pose is the midpoint of crouch and extend', () => {
  // Same relation the walker needs, and for the same reason: STANCE maps min..max linearly onto
  // every target, so its default of 50 lands on the rest posture only if neutral IS the midpoint.
  const { crouch, neutral, extend } = BHDIM.leg.pose;
  neutral.forEach((v, i) => {
    assert.equal(Number(((crouch[i] + extend[i]) / 2).toFixed(6)), v,
      `pose limb ${i}: neutral is not halfway between crouch and extend`);
  });
  assert.equal((BHDIM.torso.lean.min + BHDIM.torso.lean.max) / 2, BHDIM.torso.lean.rest,
    'the torso lean default is not the midpoint of its range, so the drawing rests off-pose');
});

test('[headless] both soles are flat on the ground at every stance', () => {
  for (const v of [0, 25, 50, 75, 100]) {
    setJoint(headless, 'stance', v, updateHeadlessStance);
    const soles = [];
    headless.traverse((o) => {
      if (!/^Foot_[LR]_Sole$/.test(o.name)) return;
      o.geometry.computeBoundingBox();
      soles.push(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).min.y);
    });
    assert.equal(soles.length, 2, 'expected two soles');
    for (const y of soles) {
      assert.ok(Math.abs(y) < 0.002, `stance ${v}: a sole sits at y=${y.toFixed(4)}, not on the ground`);
    }
  }
  setJoint(headless, 'stance', 50, updateHeadlessStance);
});

test('[headless] the foot frame stays world-aligned through the whole fold', () => {
  // This is the claim `bipedPivots` makes: mount + hip + knee + ankle cancel to identity, which
  // is what keeps the sole flat with no IK. Checking the sole's y-extent rather than its lowest
  // point is what distinguishes "flat" from "one corner happens to touch".
  for (const v of [0, 50, 100]) {
    setJoint(headless, 'stance', v, updateHeadlessStance);
    const sole = headless.getObjectByName('Foot_L_Sole');
    sole.geometry.computeBoundingBox();
    const bb = sole.geometry.boundingBox.clone().applyMatrix4(sole.matrixWorld);
    assert.ok(bb.max.y - bb.min.y < BHDIM.leg.foot.sole.height + 0.002,
      `stance ${v}: the sole is canted — its y-extent is ${(bb.max.y - bb.min.y).toFixed(4)}`);
  }
  setJoint(headless, 'stance', 50, updateHeadlessStance);
});

test('[headless] the hip stays over the ankle at every stance', () => {
  // A walker with eight feet has a stability polygon it can be sloppy inside. Two feet in a row
  // have none: let the ankle drift forward as the knees bend and the drawing shows a machine in
  // the act of falling, which reads as a mistake rather than as a pose.
  const half = BHDIM.leg.foot.sole.depth / 2;
  for (const p of [BHDIM.leg.pose.crouch, BHDIM.leg.pose.neutral, BHDIM.leg.pose.extend]) {
    const { reach } = stand(p);
    assert.ok(Math.abs(reach) < half,
      `pose ${p.join('/')}: the ankle lands ${reach.toFixed(3)} m from under the hip, outside the sole`);
  }
});

test('[headless] folding the legs actually lowers the body', () => {
  const heights = [];
  for (const v of [0, 50, 100]) {
    setJoint(headless, 'stance', v, updateHeadlessStance);
    heights.push(headless.getObjectByName('Body_Group').position.y);
  }
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2],
    `hip height should rise with stance, got ${heights.map((h) => h.toFixed(3)).join(' / ')}`);
  assert.ok(heights[2] - heights[0] > 0.3, 'the stance range is too small to be worth a slider');
  setJoint(headless, 'stance', 50, updateHeadlessStance);
  assert.equal(
    Number(headless.getObjectByName('Body_Group').position.y.toFixed(6)),
    Number(stand(BHDIM.leg.pose.neutral).hipHeight.toFixed(6)),
    'the rest height the drawing quotes is not the height the graph produces',
  );
});

test('[headless] the quoted height is the height the graph actually reaches', () => {
  /**
   * The one that caught a real bug. `extrudeProfile` scales BOTH caps toward the profile
   * centroid, so the full-size profile is never in the mesh — the first version of
   * `crownHeight()` read the raw profile and over-quoted the machine by 9 cm. Nothing else in
   * the project would have noticed: the drawing would simply have printed a number about a
   * different object.
   *
   * Vertices, not bounding boxes. A transformed AABB of a rotated cylinder is inflated by up to
   * its own diagonal, which here is larger than the tolerance being asserted.
   */
  setJoint(headless, 'stance', 50, updateHeadlessStance);
  setJoint(headless, 'lean', BHDIM.torso.lean.rest);
  const { hi, highest } = vertexExtremes(headless);
  const quoted = crownHeight();
  assert.ok(Math.abs(hi - quoted) < 0.01,
    `title block says ${quoted.toFixed(3)} m, the graph reaches ${hi.toFixed(3)} m (at ${highest})`);
  assert.equal(highest, 'Thorax_Mesh',
    `the crown should be the carapace, not ${highest} — the height figure is derived from the shell profile`);
});

test('[headless] the carapace crown accounts for the extrusion taper', () => {
  // Guards the fix directly, so a later "simplification" back to Math.max(profile.y) fails here
  // rather than silently in the title block.
  const [, y] = crownPoint();
  const raw = Math.max(...BHDIM.torso.profile.map(([, py]) => py));
  assert.ok(y < raw, 'crownPoint() is not applying the taper the generator applies');
});

test('[headless] one GRIP slider drives every digit, and the hand rests where the slider does', () => {
  const grip = headless.userData.joints.find((j) => j.key === 'grip');
  assert.equal(grip.targets.length, 20, 'expected two driven segments on each of ten digits');
  assert.equal(grip.value, BHDIM.hand.rest,
    'the slider default must equal the percentage the geometry was authored at');

  // The authored rest pose and the slider default have to agree, or the exported GLB ships a
  // hand the drawing never shows. They agree by construction — this is what holds it.
  const prox = headless.getObjectByName('Finger_L1_Prox');
  assert.equal(
    Number((prox.rotation.x * 180 / Math.PI).toFixed(6)),
    Number((BHDIM.hand.curl.proximal * BHDIM.hand.rest / 100).toFixed(6)),
    'the authored finger curl is not the curl the GRIP default produces',
  );

  // Ten distinct digits, not one geometry cloned ten times — a shared geometry is a shared part
  // id, and the outline pass would stop drawing the gap between two closed fingers.
  const geoms = new Set();
  let segments = 0;
  headless.traverse((o) => {
    if (!o.isMesh || !/^(Finger|Thumb)_[LR].*_Mesh$/.test(o.name)) return;
    segments++; geoms.add(o.geometry);
  });
  assert.equal(segments, 20, 'expected twenty finger segments');
  assert.equal(geoms.size, 20, 'finger segments share geometry, so they share a part id');
});

test('[headless] the waist splits twist and lean across two nodes', () => {
  // One node driven on two axes would compose them in a fixed Euler order, and the declared-joint
  // contract gives each target exactly one node and one axis. Splitting them is what lets the
  // viewer drive both without knowing either.
  const twist = headless.getObjectByName('Waist_Yaw');
  const lean = headless.getObjectByName('Waist_Pitch');
  assert.equal(lean.parent.name, 'Waist_Yaw', 'lean must hang below twist');
  assert.equal(Number(twist.rotation.x.toFixed(6)), 0, 'the twist node must carry no pitch');
  assert.equal(Number(lean.rotation.y.toFixed(6)), 0, 'the lean node must carry no yaw');
});

test('[headless] the sensor band is lit — it is the only thing on the machine that looks at you', () => {
  // With no head there is no cupola, no optics block and no gun sight. The band and the core
  // lens are the entire read of "this is powered and facing you", and both display modes have to
  // agree about it: the blueprint pass renders with an overrideMaterial and never sees a
  // material, so a glow expressed only in MeshStandardMaterial.emissive would vanish there.
  for (const name of ['Sensor_Band', 'Core_Lens']) {
    const node = headless.getObjectByName(name);
    assert.ok(node.userData.emissive, `${name} is not on an accent channel`);
    assert.equal(node.geometry.getAttribute('emissive').array[0], node.userData.emissive,
      `${name} carries no emissive vertex attribute`);
  }
  const channels = new Set();
  headless.traverse((o) => { if (o.isMesh && o.userData.emissive) channels.add(o.userData.emissive); });
  assert.deepEqual([...channels].sort(), [1, 2], 'expected parts on both accent channels');
});

console.log('\nthe two-wheeler — it leans, and the road is the roll axis');

/** Lowest world Y over the actual vertices of the meshes a filter selects. */
function lowestVertex(root, filter = () => true) {
  const v = new THREE.Vector3();
  let lo = Infinity, name = '';
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision || !filter(o)) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y < lo) { lo = v.y; name = o.name; }
    }
  });
  return { lo, name };
}

test('[motopod] both tyres are on the road at every lean angle', () => {
  /**
   * The one a two-wheeler must not get wrong, and the reason it needs `afterArticulate`.
   *
   * Rolling about the ground contact line gets it most of the way, but a crowned tyre's
   * contact point migrates around the crown as it banks, so the axle has to sit
   * `crown*(1 - cos t)` higher than a rigid roll leaves it. That is 20 mm at full lean —
   * invisible in a still, and a wheel sunk 20 mm into the tarmac the moment anything casts a
   * shadow.
   */
  for (const angle of [-MPDIM.lean, -20, -7, 0, 7, 20, MPDIM.lean]) {
    setJoint(motopod, 'lean', angle, updateMotopodRide);
    const { lo } = lowestVertex(motopod, (o) => /^Tyre_/.test(o.name));
    assert.ok(Math.abs(lo) < 0.002,
      `lean ${angle}: the tyres sit at y=${lo.toFixed(4)}, not on the road`);
  }
  setJoint(motopod, 'lean', 0, updateMotopodRide);
});

test('[motopod] nothing but the tyres reaches the road at full lean', () => {
  // The lean limit is a clearance figure, not a styling choice: past it the bodywork touches
  // down before the tyre's shoulder does, and a schematic that lets you scrape the fairing is
  // drawing a crash rather than a corner.
  for (const angle of [-MPDIM.lean, MPDIM.lean]) {
    setJoint(motopod, 'lean', angle, updateMotopodRide);
    const { lo, name } = lowestVertex(motopod, (o) => !/^Tyre_/.test(o.name));
    assert.ok(lo > 0.02,
      `lean ${angle}: ${name} is ${(lo * 1000).toFixed(0)} mm off the road — the lean limit is too generous`);
  }
  setJoint(motopod, 'lean', 0, updateMotopodRide);
});

test('[motopod] the ride lift is zero upright and grows with lean', () => {
  // Guards the direction as well as the magnitude. A sign error here reads as a machine that
  // sinks further the harder it banks, which the contact test above would also catch — but
  // this one says why.
  assert.equal(rideLift(0), 0, 'upright, the machine must sit where it was authored');
  const steps = [0, 10, 20, MPDIM.lean].map(rideLift);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] > steps[i - 1], 'the lift must increase with lean');
  }
  assert.ok(steps.at(-1) < 0.05, 'a lift this large means the crown radius is wrong');
});

test('[motopod] the tread is crowned, which is what makes the lean mean anything', () => {
  // A flat tread leaned over stands on its shoulder edge — further from the axle than the
  // tread is — so the machine would climb as it banked and the contact patch would be a
  // corner. `trackBand` makes flat bands and a track never leans; this is why the tyre is the
  // one ring on the machine that is not one.
  const { width, crown } = MPDIM.wheel.tyre;
  assert.ok(crown >= width / 2, 'the crown arc is too tight to span the tread');
  assert.ok(treadRadius(0) === MPDIM.wheel.radius, 'the crown must be tangent on the centreline');
  assert.ok(treadRadius(width / 2) < MPDIM.wheel.radius - 0.005,
    'the shoulder is level with the centreline — the tread is effectively flat');
});

test('[motopod] the wheels are hubless — there is a clear bore through each', () => {
  // The reference sheet's whole read, and the thing a stray inner ring would silently fill in.
  // Measured off the built vertices rather than off the radius table, because the table is
  // what a mistake would be consistent with.
  motopod.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  for (const tag of ['F', 'R']) {
    const mount = motopod.getObjectByName(`Wheel_${tag}_Mount`);
    const centre = mount.getWorldPosition(new THREE.Vector3());
    let closest = Infinity;
    mount.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).sub(centre);
        // Distance from the axle line, which runs along X.
        closest = Math.min(closest, Math.hypot(v.y, v.z));
      }
    });
    assert.ok(closest > MPDIM.wheel.bore - 0.002,
      `wheel ${tag}: something sits ${closest.toFixed(3)} m from the axle line, inside the bore`);
    assert.ok(closest * 2 > 0.28, `wheel ${tag}: the bore is too small to read as hubless`);
  }
});

test('[motopod] spinning a wheel turns the rim and leaves the stator alone', () => {
  // On a hubless wheel the arms grip the stator, so which rings turn is mechanism, not
  // labelling. Putting all five on the spin pivot renders identically at rest and is wrong the
  // moment anything moves.
  const sample = (name) => {
    const o = motopod.getObjectByName(name);
    return o.matrixWorld.elements.slice(0, 12).map((n) => Number(n.toFixed(6))).join(',');
  };
  const watched = ['Tyre_F', 'Rotor_F', 'Motor_F', 'Stator_F', 'Sensor_F'];
  setJoint(motopod, 'roll', 0);
  const before = Object.fromEntries(watched.map((n) => [n, sample(n)]));
  setJoint(motopod, 'roll', 90);
  for (const name of ['Tyre_F', 'Rotor_F', 'Motor_F']) {
    assert.notEqual(sample(name), before[name], `${name} should turn with the rim`);
  }
  for (const name of ['Stator_F', 'Sensor_F']) {
    assert.equal(sample(name), before[name], `${name} is a fixed ring and must not turn`);
  }
  setJoint(motopod, 'roll', 0);
});

test('[motopod] the graph is the size the reference sheet dimensions', () => {
  // The sheet carries three figures. They are derived here — length off the tyre and the
  // nozzle, height off the canopy profile AFTER the extrusion taper, width off the fairing's
  // caps — and this is what stops the title block drifting from the machine.
  setJoint(motopod, 'lean', 0, updateMotopodRide);
  setJoint(motopod, 'steer', 0);
  setJoint(motopod, 'canopy', 0);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  motopod.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
  const got = { length: box.max.z - box.min.z, height: box.max.y, width: box.max.x - box.min.x };
  for (const [key, derived] of [['length', overallLength()], ['height', overallHeight()], ['width', overallWidth()]]) {
    assert.ok(Math.abs(got[key] - derived) < 0.01,
      `${key}: the helpers say ${derived.toFixed(3)}, the graph is ${got[key].toFixed(3)}`);
    assert.ok(Math.abs(derived - MPDIM.quoted[key]) < 0.01,
      `${key}: the sheet dimensions ${MPDIM.quoted[key]}, the machine is ${derived.toFixed(3)}`);
  }
});

test('[motopod] the roll axis is the road, not the body centreline', () => {
  // Roll a vehicle about its own middle and the tyres go through the tarmac. The lean pivot
  // has to sit on the ground line, which means its own origin carries no height at all — the
  // ride lift lives on the node ABOVE it, so the correction is a lift along world Y rather
  // than along the leaned Y.
  const lean = motopod.getObjectByName('Lean_Pivot');
  const ride = motopod.getObjectByName('Ride_Height');
  assert.equal(lean.parent.name, 'Ride_Height', 'the lift must sit above the lean, not below it');
  assert.equal(lean.position.length(), 0, 'the lean pivot must be on the ground contact line');
  assert.equal(ride.position.x, 0);
  assert.equal(ride.position.z, 0);
});

console.log('\nthe arm — the sliders are the aim, not the axes');

/** Where the head is actually looking, in world terms, read off the built matrices. */
function headAim(root) {
  root.updateMatrixWorld(true);
  const head = root.getObjectByName('Head_Body');
  const m = head.matrixWorld.elements;
  // Third basis column: the head's own +Z, which is the axis it points along.
  const d = new THREE.Vector3(m[8], m[9], m[10]).normalize();
  return {
    elevation: (Math.asin(Math.max(-1, Math.min(1, d.y))) * 180) / Math.PI,
    bearing: (Math.atan2(d.x, d.z) * 180) / Math.PI,
  };
}

/** Drive several joints at once, then run the fix-up — the aim only means anything as a set. */
function setPose(root, values, after) {
  for (const [key, value] of Object.entries(values)) {
    const j = root.userData.joints.find((x) => x.key === key);
    const t = (value - j.min) / (j.max - j.min);
    for (const target of j.targets) {
      const node = root.getObjectByName(target.node);
      const v = target.from + t * (target.to - target.from);
      if (target.prop === 'position') node.position[target.axis] = v;
      else node.rotation[target.axis] = (v * Math.PI) / 180;
    }
  }
  after?.(root);
  root.updateMatrixWorld(true);
}

test('[robotarm] the head holds its aim while the arm moves under it', () => {
  /**
   * The whole subject in one assertion.
   *
   * BEARING and TOOL PITCH are commands, not axes: J1 and J5 are solved from them. So dragging
   * SHOULDER, ELBOW and WRIST ROLL through their travel must not move the head's aim by a
   * measurable amount. Get the solve wrong and this drifts by tens of degrees — which is
   * exactly what a joint-frame arm does, and exactly what this subject exists not to do.
   */
  const L = RADIM.limits;
  for (const bearing of [-140, 0, 55]) {
    for (const pitch of [-L.pitch, -12, 0, 17, L.pitch]) {
      for (const shoulder of L.shoulder) {
        for (const elbow of L.elbow) {
          for (const wristRoll of [-L.wristRoll, 0, L.wristRoll]) {
            setPose(robotarm, { swing: bearing, pitch, shoulder, elbow, wristRoll },
              updateRobotArmAim);
            const aim = headAim(robotarm);
            assert.ok(Math.abs(aim.elevation - pitch) < 0.01,
              `pitch ${pitch} at J2=${shoulder} J3=${elbow} J4=${wristRoll}: head is at ${aim.elevation.toFixed(2)}°`);
            const dBearing = Math.abs(((aim.bearing - bearing + 540) % 360) - 180);
            assert.ok(dBearing < 0.01,
              `bearing ${bearing} at J2=${shoulder} J3=${elbow} J4=${wristRoll}: head is at ${aim.bearing.toFixed(2)}°`);
          }
        }
      }
    }
  }
});

test('[robotarm] the wrist can always reach the commanded aim', () => {
  // The design constraint that makes the promise keepable, checked as the inequality it is
  // rather than as a spot check. Widen J4 without narrowing TOOL PITCH and the head silently
  // stops being able to hold its aim in the corners of the envelope — the sort of thing nobody
  // drags a slider to.
  assert.ok(aimIsAlwaysReachable(),
    `sin(${RADIM.limits.pitch}°) > cos(${RADIM.limits.wristRoll}°): the wrist cannot hold every commanded aim`);
});

test('[robotarm] the solved wrist angle stays inside J5 travel', () => {
  // The solve is exact, but exact is not the same as mechanically possible. This sweeps the
  // declared envelope and asserts the axis it spends never runs out of travel.
  const L = RADIM.limits;
  let worst = 0, at = null;
  for (let sh = L.shoulder[0]; sh <= L.shoulder[1]; sh += 2.5) {
    for (let el = L.elbow[0]; el <= L.elbow[1]; el += 2.5) {
      for (let wr = -L.wristRoll; wr <= L.wristRoll; wr += 7.5) {
        for (let p = -L.pitch; p <= L.pitch; p += 5) {
          const { j5 } = solveAim({ shoulder: sh, elbow: el, wristRoll: wr, pitch: p, swing: 0 });
          if (Math.abs(j5) > worst) { worst = Math.abs(j5); at = { sh, el, wr, p }; }
        }
      }
    }
  }
  assert.ok(worst <= L.wristPitch,
    `J5 needs ${worst.toFixed(1)}° at ${JSON.stringify(at)} but only has ${L.wristPitch}°`);
});

test('[robotarm] the aim solve is closed-form and reproducible', () => {
  // The scene graph is the deliverable, so the same command has to produce the same numbers
  // every build. An iterative IK seeded from the previous frame would not — same argument the
  // Hepta-T's seeded jitter makes about Math.random.
  const cmd = { shoulder: 31, elbow: 52, wristRoll: -18, pitch: 23, swing: 77 };
  const a = solveAim(cmd), b = solveAim(cmd);
  assert.deepEqual(a, b);
  assert.ok(Number.isFinite(a.j1) && Number.isFinite(a.j5), 'the solve produced a non-finite angle');
});

test('[robotarm] the fix-up consumes a command, not its own output', () => {
  // `applyArticulation` rewrites the commands into J1 and J5 every frame before the fix-up
  // reads them, so the fix-up reads a command and writes a solution to the same two nodes. If
  // it ever read its own output instead, the arm would creep a little further every frame and
  // the drawing would drift while nobody touched a control.
  setPose(robotarm, { swing: 40, pitch: 25, shoulder: 30, elbow: 55, wristRoll: 20 },
    updateRobotArmAim);
  const first = headAim(robotarm);
  updateRobotArmAim(robotarm);
  updateRobotArmAim(robotarm);
  robotarm.updateMatrixWorld(true);
  const after = headAim(robotarm);
  // Re-running the fix-up WITHOUT re-applying the commands must be a no-op on the axes it
  // wrote, because the commands it reads are gone. Assert the drift, which is the honest
  // property: the fix-up is only correct in the order main.js calls it.
  assert.ok(Math.abs(after.elevation - first.elevation) > 0.5,
    'the fix-up appears to read its own output rather than the command');
});

test('[robotarm] every axis is a named, empty pivot at a real origin', () => {
  // The reason to export an arm at all is that something else drives the axes. J2 and J3 sit at
  // the ends of their links, J4/J5/J6 stack down the wrist, and none of them carries geometry.
  const A = RADIM.arm;
  const expect = [
    ['J3_Pivot', 'J2_Pivot', A.upper],
    ['J4_Pivot', 'J3_Pivot', A.fore],
    ['J5_Pivot', 'J4_Pivot', A.wrist],
    ['J6_Pivot', 'J5_Pivot', A.flange],
  ];
  for (const [child, parent, z] of expect) {
    const node = robotarm.getObjectByName(child);
    assert.equal(node.parent.name, parent, `${child} must hang off ${parent}`);
    assert.equal(Number(node.position.z.toFixed(6)), Number(z.toFixed(6)),
      `${child} is not at the end of its link`);
    assert.equal(Number(node.position.x.toFixed(6)), 0);
    assert.equal(Number(node.position.y.toFixed(6)), 0);
  }
  assert.equal(robotarm.getObjectByName('J2_Pivot').parent.name, 'Shoulder_Mount');
  assert.equal(robotarm.getObjectByName('J1_Pivot').parent.name, 'RobotArm_Root');
});

test('[robotarm] the head is authored where the GRIP default puts it', () => {
  // Same trap the exoframe's fingers have: the slider default and the geometry in the exported
  // GLB cannot be allowed to disagree about how open the gripper is.
  const t = RADIM.rest.grip / 100;
  const expected = RADIM.head.grip.open + t * (RADIM.head.grip.closed - RADIM.head.grip.open);
  const jaw = robotarm.getObjectByName('Jaw_R_Pivot');
  assert.equal(
    Number(((jaw.rotation.x * 180) / Math.PI).toFixed(6)),
    Number(expected.toFixed(6)),
    'the authored jaw angle is not the angle the GRIP default produces',
  );
});

console.log('\nthe gimbal — three sets of rings, one centre, three axes');

const GIMBAL_CENTRE = new THREE.Vector3(0, GDIM.centre.y, 0);

/**
 * Every world-space vertex distance from the gimbal centre, for one stage's OWN ring set.
 *
 * Selected by the names `ringStack` derives, not by a suffix match. A suffix caught the slip
 * ring — which is on the same stage, is called `Slip_Ring_A`, and sits deep inside the bore —
 * and reported the set as colliding with itself.
 */
function stageRadii(root, tag) {
  const names = new Set(ringStack().find((s) => s.tag === tag).rings.map((r) => r.name));
  const v = new THREE.Vector3();
  let lo = Infinity, hi = 0;
  root.getObjectByName(`Stage_${tag}_Pivot`).traverse((o) => {
    if (!o.isMesh || !names.has(o.name)) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const d = v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).distanceTo(GIMBAL_CENTRE);
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
  });
  return { lo, hi };
}

test('[gimbal] the twelve ring radii are the derived ones, not typed', () => {
  // One radius and two tables produce all twelve. Typing them instead would have been twelve
  // chances to put a ring through another, invisible until someone rotated a stage.
  gimbal.updateMatrixWorld(true);
  for (const stage of ringStack()) {
    for (const ring of stage.rings) {
      const mesh = gimbal.getObjectByName(ring.name);
      assert.ok(mesh, `missing ring ${ring.name}`);
      mesh.geometry.computeBoundingSphere();
      assert.ok(Math.abs(mesh.geometry.boundingSphere.radius - ring.r) < 0.004,
        `${ring.name}: built at ${mesh.geometry.boundingSphere.radius.toFixed(4)}, derived ${ring.r.toFixed(4)}`);
    }
  }
});

test('[gimbal] all twelve rings share one centre at every pose', () => {
  /**
   * What "concentric" actually means on this machine, and the thing a misplaced pivot breaks.
   * Every stage pivot sits at the origin of its parent's frame, so the whole assembly turns
   * about one point — check it at a deliberately skewed pose, where an offset would show.
   */
  for (const pose of [{ azimuth: 0, bank: 0, elevation: 0 },
                      { azimuth: 137, bank: -51, elevation: 62 },
                      { azimuth: -180, bank: GDIM.limits.bank, elevation: -GDIM.limits.elevation }]) {
    setPose(gimbal, pose);
    for (const stage of ringStack()) {
      for (const ring of stage.rings) {
        const p = gimbal.getObjectByName(ring.name).getWorldPosition(new THREE.Vector3());
        assert.ok(p.distanceTo(GIMBAL_CENTRE) < 1e-6,
          `${ring.name} is ${p.distanceTo(GIMBAL_CENTRE).toFixed(5)} m off the gimbal centre`);
      }
    }
  }
});

test('[gimbal] an inner set never touches the set outside it, at any pose', () => {
  /**
   * The nesting rule, measured rather than assumed.
   *
   * A gimbal ring pivots about its own diameter, so an inner set sweeps a SPHERE of its outer
   * radius inside the next set's bore. `ringStack` derives every radius from that inequality;
   * this drives all three stages through their declared travel and measures the real gap on
   * real vertices. A ring band widened anywhere in the table shows up here as a collision.
   */
  const L = GDIM.limits;
  let worst = Infinity, at = null;
  for (const az of [-L.azimuth, 0, L.azimuth]) {
    for (const bank of [-L.bank, -33, 0, 33, L.bank]) {
      for (const el of [-L.elevation, -44, 0, 44, L.elevation]) {
        setPose(gimbal, { azimuth: az, bank, elevation: el });
        const gaps = [
          stageRadii(gimbal, 'A').lo - stageRadii(gimbal, 'B').hi,
          stageRadii(gimbal, 'B').lo - stageRadii(gimbal, 'C').hi,
        ];
        const g = Math.min(...gaps);
        if (g < worst) { worst = g; at = { az, bank, el }; }
      }
    }
  }
  assert.ok(worst > 0, `sets collide at ${JSON.stringify(at)} — overlap ${(-worst).toFixed(4)} m`);
  assert.ok(Math.abs(worst - GDIM.clearance) < 0.002,
    `worst gap is ${worst.toFixed(4)} m but the table declares ${GDIM.clearance} m of clearance`);
  setPose(gimbal, GDIM.rest);
});

test('[gimbal] the payload fits the innermost bore', () => {
  // Last link in the same chain. Grow a ring band anywhere and the ball shrinks to suit; it is
  // never re-typed, so it can never be left inside a ring.
  const bore = ringStack()[2].bore;
  assert.ok(payloadRadius() > 0, 'the ring stack has eaten the payload');
  assert.equal(Number((bore - payloadRadius()).toFixed(6)), Number(GDIM.payload.clearance.toFixed(6)));

  gimbal.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let furthest = 0;
  gimbal.getObjectByName('Payload_Group').traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      furthest = Math.max(furthest,
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).distanceTo(GIMBAL_CENTRE));
    }
  });
  assert.ok(furthest < bore,
    `the payload reaches ${furthest.toFixed(4)} m, past the elevation bore at ${bore.toFixed(4)} m`);
});

test('[gimbal] the declared travel stops short of gimbal lock', () => {
  /**
   * The famous failure, and the one thing a three-ring gimbal cannot be talked out of: at 90°
   * of bank the elevation axis lies on the azimuth axis, the two become one control, and the
   * platform can no longer be pointed where it likes. The axes' scalar triple product is
   * exactly cos(bank), so this is the real condition rather than a proxy for it.
   *
   * A real director accepts lock, adds a fourth axis, or restricts travel. This one restricts
   * travel — and the drawing quotes the margin instead of hiding it.
   */
  assert.ok(GDIM.limits.bank < 90, 'the bank travel reaches gimbal lock');
  assert.equal(Number(axisIndependence(0).toFixed(6)), 1, 'upright, the three axes are orthogonal');
  assert.equal(Number(axisIndependence(90).toFixed(6)), 0, 'the lock condition is not at 90°');
  assert.ok(axisIndependence(GDIM.limits.bank) > 0.30,
    `at the bank stop the axes are only ${axisIndependence(GDIM.limits.bank).toFixed(3)} independent`);
  // Monotone on the way there, so "margin" means something.
  for (const b of [10, 30, 50, GDIM.limits.bank]) {
    assert.ok(axisIndependence(b) < axisIndependence(b - 10), 'independence must fall as bank grows');
  }
});

test('[gimbal] the three stage axes are mutually perpendicular', () => {
  // What makes it a three-axis gimbal rather than three bearings in a row. Read off the built
  // matrices at rest, from the axis each joint actually declares.
  setPose(gimbal, GDIM.rest);
  const axes = gimbal.userData.joints.map((j) => {
    const node = gimbal.getObjectByName(j.targets[0].node);
    const e = node.matrixWorld.elements;
    const col = { x: [e[0], e[1], e[2]], y: [e[4], e[5], e[6]], z: [e[8], e[9], e[10]] }[j.targets[0].axis];
    return new THREE.Vector3(...col).normalize();
  });
  assert.equal(axes.length, 3);
  for (let i = 0; i < 3; i++) {
    const dot = Math.abs(axes[i].dot(axes[(i + 1) % 3]));
    assert.ok(dot < 1e-6, `stage axes ${i} and ${(i + 1) % 3} are not perpendicular (dot ${dot})`);
  }
});

test('[gimbal] the aperture looks where the three angles say it does', () => {
  // The payload's optical axis is its local +Z, carried by all three stages. `sightLine` is the
  // closed form of that chain, including the elevation sign inversion — this holds the built
  // matrices to it so the two cannot drift apart.
  for (const pose of [{ azimuth: 0, bank: 0, elevation: 0 },
                      { azimuth: 35, bank: 0, elevation: 25 },
                      { azimuth: -110, bank: 40, elevation: -60 },
                      { azimuth: 180, bank: -GDIM.limits.bank, elevation: GDIM.limits.elevation }]) {
    setPose(gimbal, pose);
    const e = gimbal.getObjectByName('Payload_Group').matrixWorld.elements;
    const got = new THREE.Vector3(e[8], e[9], e[10]).normalize();
    const want = new THREE.Vector3(...sightLine(pose));
    assert.ok(got.distanceTo(want) < 1e-6,
      `${JSON.stringify(pose)}: aperture at ${got.toArray().map((n) => n.toFixed(3))}, solve says ${want.toArray().map((n) => n.toFixed(3))}`);
  }
  setPose(gimbal, GDIM.rest);
});

console.log('\nthe rack — a pitch, an array, and the first joint that is not a hinge');

test('[server] the elevation covers all 42U exactly once', () => {
  // A rack is a pitch before it is a shape. Two units claiming the same slot is a collision and
  // a gap is a hole in the drawing, and neither is visible in a render of a closed rack.
  const cov = elevationCoverage();
  const dupes = [...cov].filter(([, n]) => n > 1).map(([u]) => u);
  const missing = [];
  for (let u = 1; u <= SDIM.units; u++) if (!cov.has(u)) missing.push(u);
  assert.deepEqual(dupes, [], `units claimed twice: ${dupes.join(', ')}`);
  assert.deepEqual(missing, [], `units unaccounted for: ${missing.join(', ')}`);
});

test('[server] every vertical figure is a whole number of rack units', () => {
  // The one dimension a rack actually has to honour. `unitY` and `spanCentreY` are the only
  // things that place anything vertically, so this checks the derivation rather than the taste:
  // 42U of field, and an overall height that is plinth + field + cap and nothing else.
  assert.equal(Number(fieldHeight().toFixed(6)), Number((SDIM.units * SDIM.U).toFixed(6)));
  assert.equal(
    Number(rackHeight().toFixed(6)),
    Number((SDIM.frame.plinth + fieldHeight() + SDIM.frame.cap).toFixed(6)),
  );
  // Each instanced sled sits on the grid, not near it.
  for (const u of sledSlots()) {
    const offset = (spanCentreY(u, 1) - SDIM.frame.plinth - SDIM.U / 2) / SDIM.U;
    assert.ok(Math.abs(offset - Math.round(offset)) < 1e-9,
      `slot U${u} is ${offset.toFixed(4)} units off the grid`);
  }
});

test('[server] the sleds are instanced and the serviced one is not', () => {
  /**
   * The instancing decision, both ways round.
   *
   * Twenty-eight sleds are twenty-eight copies of one static transform, which is the test the
   * walker's docstring set when it declined to instance its feet. The twenty-ninth carries a
   * different transform — it slides — so it cannot be in the array, and it is its own node.
   * Get this wrong in either direction and the drawing still renders: either a rack with one
   * sled permanently flush, or twenty-eight loose meshes eating the id channel.
   */
  const sleds = server.getObjectByName('Sleds_Instanced');
  const lights = server.getObjectByName('SledLights_Instanced');
  assert.ok(sleds.isInstancedMesh && lights.isInstancedMesh);
  assert.equal(sleds.count, sledSlots().length);
  assert.equal(lights.count, sleds.count, 'the lit slots must cover the same slots as the bodies');
  assert.ok(sleds.count >= 8, 'an array this small is not worth instancing');

  // And nothing loose is duplicating them.
  const loose = [];
  server.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && /^Sled_\d/.test(o.name)) loose.push(o.name);
  });
  assert.deepEqual(loose, [], 'sleds must be instanced, not N loose meshes');

  const service = server.getObjectByName('Service_Sled_Mesh');
  assert.ok(service && !service.isInstancedMesh, 'the serviced sled must be its own mesh');
  assert.equal(service.parent.name, 'Service_Slide');
});

test('[server] the sled slides, and the slide is not explodable', () => {
  /**
   * The project's first prismatic joint, and the collision it introduces.
   *
   * `applyExplode` writes `position` from a stored rest pose; a `prop: 'position'` target writes
   * `position` from a slider. A node driven by both would snap back to wherever the slider left
   * it the first time anyone touched EXPLODE — and the explode invariant's exact-return check
   * would start failing for a reason nothing pointed at.
   */
  const joint = server.userData.joints.find((j) => j.key === 'sled');
  assert.equal(joint.targets[0].prop, 'position', 'the sled joint must declare a position target');
  assert.equal(joint.targets[0].axis, 'z');

  const slide = server.getObjectByName('Service_Slide');
  assert.ok(!slide.userData.rest, 'the slide node must not be explodable');

  // Drive it shut first rather than reading whatever the authored pose is: this subject ships
  // OPEN, so the rest position is not the closed one and assuming it was is how this check
  // measured a 0.20 m travel on a 0.62 m slide.
  setPose(server, { sled: 0 });
  const closed = slide.position.z;
  setPose(server, { sled: SDIM.service.travel });
  assert.ok(Math.abs(slide.position.z - closed - SDIM.service.travel) < 1e-9,
    'the sled did not travel its declared distance');
  // Out far enough to actually expose the board it exists to expose.
  assert.ok(SDIM.service.travel > SDIM.service.board.depth * 0.8,
    'the travel is shorter than the board — nothing useful is revealed');
  setPose(server, { sled: 0 });
  assert.equal(Number(slide.position.z.toFixed(9)), Number(closed.toFixed(9)));
});

test('[server] the light accents and buttons are on the channels they claim', () => {
  // Green accents in the manner of the MK-CX's lift emitters, a red emergency stop, blue port
  // rows and a hot die. Four channels, which is the encoding's ceiling.
  const expect = [
    ['SledLights_Instanced', EMISSIVE.tertiary],
    ['Service_Sled_Lights', EMISSIVE.tertiary],
    ['Start_Ring_1', EMISSIVE.tertiary],
    ['Button_EPO', EMISSIVE.quaternary],
    ['SW_A_Ports', EMISSIVE.secondary],
    ['IC_Die', EMISSIVE.primary],
  ];
  for (const [name, channel] of expect) {
    const node = server.getObjectByName(name);
    assert.ok(node, `missing ${name}`);
    assert.equal(node.userData.emissive, channel, `${name} is on the wrong accent channel`);
    assert.equal(node.geometry.getAttribute('emissive').array[0], channel,
      `${name} carries no emissive vertex attribute`);
  }
  // The white buttons deliberately are NOT emissive: the blueprint's paper is itself near-white,
  // so a white accent is the one colour the schematic cannot show. They read as white in the
  // game view and as a lit green ring in the schematic.
  const white = server.getObjectByName('Button_Start_1');
  assert.equal(white.userData.emissive, EMISSIVE.none,
    'a white glow is invisible on white paper — the start button must not be an accent');
});

test('no subject declares an accent channel the G-buffer cannot carry', () => {
  // The channel travels as `emissive * 0.25` in an 8-bit alpha, so 1..4 come back exactly and a
  // fifth would clamp into the fourth and render as red with no error anywhere.
  assert.equal(Math.max(...Object.values(EMISSIVE)), EMISSIVE_MAX);
  for (const m of MODELS) {
    m.root.traverse((o) => {
      if (!o.isMesh || o.userData.isCollision) return;
      const chan = o.userData.emissive || 0;
      assert.ok(chan <= EMISSIVE_MAX,
        `[${m.name}] ${o.name} is on channel ${chan}, past the encoding's ${EMISSIVE_MAX}`);
    });
  }
});

console.log('\nthe container — a hollow box, and a shape agreed on by everybody');

test('[container] the envelope is ISO 668 1CC', () => {
  /**
   * A container that stopped fitting a spreader is not a container. Measured on the built
   * vertices, so a corrugation bulging past the envelope fails here rather than at a port.
   *
   * In the SHIPPING configuration, which is the only one the envelope is a claim about: doors
   * closed and cam handles stowed. Swinging a handle out to unlock it reaches past the envelope
   * on a real container too, and it is not in a cell guide while you are doing that.
   */
  setPose(container, { doorL: 0, doorR: 0, locks: 0 });
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  container.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
  const got = { width: box.max.x - box.min.x, height: box.max.y, length: box.max.z - box.min.z };
  for (const key of ['width', 'height', 'length']) {
    assert.ok(Math.abs(got[key] - CDIM.iso[key]) < 0.004,
      `${key}: ISO says ${CDIM.iso[key]}, the graph is ${got[key].toFixed(4)}`);
  }
  setPose(container, CDIM.rest);
});

test('[container] eight ISO 1161 castings, one at each corner of that envelope', () => {
  // Their entire specification is where they are: a spreader finds them by geometry.
  const layout = castingLayout();
  assert.equal(layout.length, 8);
  container.updateMatrixWorld(true);
  for (const c of layout) {
    const node = container.getObjectByName(c.name);
    assert.ok(node, `missing ${c.name}`);
    const p = node.getWorldPosition(new THREE.Vector3());
    // The casting's far face is flush with the envelope on all three axes.
    assert.ok(Math.abs(Math.abs(p.x) + CDIM.iso.casting.width / 2 - CDIM.iso.width / 2) < 1e-6);
    assert.ok(Math.abs(Math.abs(p.z) + CDIM.iso.casting.length / 2 - CDIM.iso.length / 2) < 1e-6);
    const y = c.sy < 0 ? CDIM.iso.casting.height / 2 : CDIM.iso.height - CDIM.iso.casting.height / 2;
    assert.ok(Math.abs(p.y - y) < 1e-6, `${c.name} is off the corner vertically`);
  }
});

test('[container] the walls are real sheets, not planes', () => {
  /**
   * The finding that shaped this subject.
   *
   * The blueprint pass renders with `side: THREE.DoubleSide`, so a container built from
   * single-sided planes looks perfect in the schematic — and the game view, whose standard
   * materials cull back faces, shows straight out through the back of it. The two display modes
   * would disagree about whether the box has walls, and only one of them would say so.
   *
   * A sheet with real thickness works in both and asks nothing of either renderer. This checks
   * the geometry rather than the render: every wall's thinnest dimension is at least the
   * declared sheet thickness plus its fold depth, which a plane cannot be.
   */
  const C = CDIM.corrugation;
  for (const [name, minThickness] of [
    ['Wall_L', C.thickness + C.depth], ['Wall_R', C.thickness + C.depth],
    ['Wall_Front', C.thickness + C.depth], ['Roof_Mesh', C.thickness + C.roofDepth],
    ['Door_L_Panel', CDIM.door.thickness + CDIM.door.depth],
  ]) {
    const g = container.getObjectByName(name).geometry;
    g.computeBoundingBox();
    const s = g.boundingBox.getSize(new THREE.Vector3());
    const thinnest = Math.min(s.x, s.y, s.z);
    assert.ok(thinnest >= minThickness - 1e-6,
      `${name} is ${thinnest.toFixed(4)} m thick — a plane, not a sheet`);
  }
});

test('[container] every corrugated panel ends on a whole fold', () => {
  // A wall that ends on a half fold is a wall nobody pressed. The pitch is snapped per panel,
  // which is why the side, end and door pitches are three different numbers.
  const C = CDIM.corrugation;
  const cases = [
    ['side', CDIM.iso.length - 2 * CDIM.frame.postDepth, C.nominal],
    ['end', CDIM.iso.width - 2 * CDIM.frame.post, C.nominal],
    ['roof', CDIM.iso.width - 2 * CDIM.frame.post, C.roofNominal],
    ['door', leafWidth(), CDIM.door.nominal],
  ];
  const pitches = new Set();
  for (const [label, length, nominal] of cases) {
    const pitch = foldPitch(length, nominal);
    const folds = length / pitch;
    assert.ok(Math.abs(folds - Math.round(folds)) < 1e-9,
      `${label}: ${folds.toFixed(4)} folds is not a whole number`);
    assert.ok(Math.round(folds) >= 3, `${label}: ${Math.round(folds)} folds is not a corrugation`);
    pitches.add(pitch.toFixed(6));
  }
  assert.ok(pitches.size > 1, 'every panel got the same pitch — the snap is not being applied');
});

/** Is a world point inside the space the freight occupies? */
function inCargoSpace(v) {
  const e = cargoEnvelope();
  return Math.abs(v.x) < e.halfWidth && v.z > e.zMin && v.z < e.zMax
    && v.y > e.floor + 0.01 && v.y < e.floor + e.height;
}

test('[container] nothing structural reaches into the cargo space', () => {
  /**
   * Tested against the CARGO envelope, not the clear interior.
   *
   * The first version used the full interior prism and flagged the four top corner castings and
   * both open door leaves — all of which are exactly where they belong. A container's usable
   * space has fittings in its corners and stops short of the door opening; the prism drawn
   * right into the corners is a number for a brochure, not a volume anything sits in.
   */
  setPose(container, CDIM.rest);
  const v = new THREE.Vector3();
  const allowed = /^(Pallets_Instanced|Loads_Instanced|Floor_Strip_|Floor_Deck)/;
  const intruders = new Set();
  container.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision || allowed.test(o.name)) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      if (inCargoSpace(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld))) {
        intruders.add(o.name);
        break;
      }
    }
  });
  assert.deepEqual([...intruders], [], `these reach into the cargo space: ${[...intruders].join(', ')}`);
});

test('[container] the unit load fits the clear interior', () => {
  // Eight pallets on a grid, and the grid is the format's whole point — so whether they fit is
  // a property of the derivation, not of how they were placed.
  const f = loadFits();
  assert.equal(palletLayout().length, CDIM.interior.pallet.cols * CDIM.interior.pallet.rows);
  assert.ok(f.width < interiorWidth(), `load is ${f.width.toFixed(3)} wide, interior ${interiorWidth().toFixed(3)}`);
  assert.ok(f.length < interiorLength(), `load is ${f.length.toFixed(3)} long, interior ${interiorLength().toFixed(3)}`);
  assert.ok(f.height < interiorHeight(), `load is ${f.height.toFixed(3)} tall, interior ${interiorHeight().toFixed(3)}`);
});

test('[container] the doors fold back alongside the box, not through it', () => {
  /**
   * 268 degrees, not 90 — a container door folds all the way round so a forklift can reach the
   * opening. Two things have to be true of that and only the second is obvious: the leaf must
   * not pass through the cargo space on its way, and at full open its free edge must actually
   * be BEHIND the opening rather than still standing across it.
   *
   * The hinge end of an open leaf is legitimately inside the box's x-footprint — the hinge is
   * inboard of the corner post — so a test on the footprint alone flags a door that is doing
   * exactly the right thing.
   */
  const v = new THREE.Vector3();
  for (const pose of [{ doorL: 0, doorR: 0 }, { doorL: 90, doorR: 90 },
                      { doorL: CDIM.door.open, doorR: CDIM.door.open }, CDIM.rest]) {
    setPose(container, pose);
    for (const tag of ['L', 'R']) {
      const panel = container.getObjectByName(`Door_${tag}_Panel`);
      const pos = panel.geometry.getAttribute('position');
      let intrudes = 0, tipZ = Infinity;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(panel.matrixWorld);
        if (inCargoSpace(v)) intrudes++;
        tipZ = Math.min(tipZ, v.z);
      }
      assert.equal(intrudes, 0, `door ${tag} at ${JSON.stringify(pose)} sweeps through the cargo`);
      if (pose.doorL === CDIM.door.open) {
        assert.ok(tipZ < CDIM.iso.length / 2 - 1.0,
          `door ${tag} at full open still reaches z=${tipZ.toFixed(2)} — it has not folded back`);
      }
    }
  }
  setPose(container, CDIM.rest);
});

test('[tank] road wheel count matches the declared layout', () => {
  assert.equal(byName('Wheels_Instanced').count, DIM.roadWheel.count * 2);
});

test('[howitzer] trail hinges sit at their declared origins', () => {
  for (const t of trailLayout()) {
    const pivot = howitzer.getObjectByName(t.name);
    assert.ok(pivot, `missing ${t.name}`);
    assert.equal(Number(pivot.position.x.toFixed(4)), Number(t.x.toFixed(4)));
    assert.equal(Number(pivot.position.z.toFixed(4)), Number(t.z.toFixed(4)));
  }
});

test('[howitzer] barrel length matches calibre × calibres', () => {
  assert.equal(Number(HDIM.barrel.length.toFixed(3)), Number((0.155 * 39).toFixed(3)));
});

test('[howitzer] Elevation_Pivot is a child of Traverse_Pivot', () => {
  assert.equal(howitzer.getObjectByName('Elevation_Pivot').parent.name, 'Traverse_Pivot');
});

test('running gear layout is shared, not duplicated', () => {
  const layout = wheelLayout();
  assert.equal(layout.filter((c) => c.kind === 'road').length, DIM.roadWheel.count);
  assert.equal(layout.filter((c) => c.kind !== 'road').length, 2);
});

console.log('\nthe drone — it carries what it is going to build, and spends it');

/** Put the FD-4 in a pose through the same path the viewer takes, solve included. */
function fabPose(values) {
  setPose(fabricator, values, updateFabricatorPose);
}

/** Where the orifice actually is, in the root's frame. */
function nozzleAt() {
  fabricator.updateMatrixWorld(true);
  return fabricator.worldToLocal(
    fabricator.getObjectByName('Nozzle_Tip').getWorldPosition(new THREE.Vector3()));
}

const FAB_REST = { charge: FDIM.rest.charge * tankLitres(), boomYaw: 0, boomPitch: 0, headPitch: 0 };

test('[fabricator] the reservoir is sized by the job, not by taste', () => {
  /**
   * The subject's founding claim: a tankful is exactly the pier. Both halves are derived — the
   * capacity from the bead and the course, the barrel length from the capacity — so this is a
   * check that nothing has been typed twice rather than a check on a number.
   */
  assert.equal(tankCapacity(), courseVolume() * FDIM.pier.courses);
  const barrel = Math.PI * FDIM.tank.radius ** 2 * tankLength();
  assert.ok(Math.abs(barrel - tankCapacity()) < 1e-12,
    `the barrel holds ${(barrel * 1000).toFixed(3)} L but the job wants ${tankLitres().toFixed(3)} L`);
});

test('[fabricator] a course divides into whole segments, and a tankful into whole courses', () => {
  // A run that stops halfway through a segment is a run nobody printed — the same argument the
  // container's fold pitch makes, and the reason `segsPerCourse` is a multiple of four.
  assert.equal(FDIM.pier.segsPerCourse % 4, 0, 'a square course needs the same count on each side');
  assert.ok(Math.abs(segmentLength() * FDIM.pier.segsPerCourse - coursePerimeter()) < 1e-12);
  assert.equal(totalSegments() % FDIM.pier.segsPerCourse, 0);
  assert.equal(segmentsLaid(0), totalSegments(), 'an empty tank should have finished the pier');
  assert.equal(segmentsLaid(tankLitres()), 0, 'a full tank should have laid nothing');
});

test('[fabricator] what is on the bed is what left the tank', () => {
  /**
   * Conservation, measured rather than asserted: at each charge, count the bead segments the
   * graph is actually drawing, multiply by the section, and compare against the volume missing
   * from the reservoir. They agree to within one segment, which is the quantisation the
   * deposition itself has — the bead is laid in discrete chunks and the drawing says so.
   */
  const bead = fabricator.getObjectByName('Bead_Instanced');
  const segVolume = segmentLength() * beadArea();
  for (const f of [0, 0.19, 0.5, 0.72, 1]) {
    const charge = f * tankLitres();
    fabPose({ ...FAB_REST, charge });
    const onBed = bead.count * segVolume;
    const spent = tankCapacity() - charge / 1000;
    assert.ok(Math.abs(onBed - spent) <= segVolume + 1e-12,
      `at ${charge.toFixed(2)} L the bed holds ${(onBed * 1000).toFixed(3)} L `
      + `but ${(spent * 1000).toFixed(3)} L has left the tank`);
  }
  fabPose(FAB_REST);
});

test('[fabricator] the nozzle is on the work, whatever the boom is doing', () => {
  /**
   * The subject.
   *
   * The RA-6 holds a DIRECTION while its arm moves underneath; this holds a POINT while its
   * whole machine moves around it — and it can, because it is not bolted to anything. Swept
   * over the charge range and the full boom envelope, the orifice has to land on the next
   * segment to be laid, plus the standoff, every time. There is no clamp and no unreachable
   * corner to be honest about: the solve spends three free translations, and a free-flying root
   * never runs out of them.
   */
  let worst = 0;
  for (const f of [0, 0.11, 0.37, 0.5, 0.83, 1]) {
    for (const boomYaw of [-FDIM.limits.boomYaw, -7, 0, 21, FDIM.limits.boomYaw]) {
      for (const boomPitch of [-FDIM.limits.boomPitch, 0, FDIM.limits.boomPitch]) {
        for (const headPitch of [-FDIM.limits.headPitch, 0, FDIM.limits.headPitch]) {
          const charge = f * tankLitres();
          fabPose({ charge, boomYaw, boomPitch, headPitch });
          const want = nozzleTarget(charge);
          const got = nozzleAt();
          worst = Math.max(worst,
            Math.abs(got.x - want.x), Math.abs(got.y - want.y), Math.abs(got.z - want.z));
        }
      }
    }
  }
  assert.ok(worst < 1e-9, `the orifice misses the work by up to ${worst.toExponential(2)} m`);
  fabPose(FAB_REST);
});

test('[fabricator] the boom moves the machine, not the tool', () => {
  // The demonstration, stated as the difference it makes: the same slider that would move the
  // nozzle on any other subject moves the airframe here, by a distance you can measure, while
  // the nozzle does not move at all.
  const platform = fabricator.getObjectByName('Airframe_Platform');
  fabPose({ ...FAB_REST, boomYaw: -FDIM.limits.boomYaw });
  const machineA = platform.position.clone();
  const toolA = nozzleAt();
  fabPose({ ...FAB_REST, boomYaw: FDIM.limits.boomYaw });
  assert.ok(platform.position.distanceTo(machineA) > 0.1,
    'swinging the boom should slide the whole drone across the work');
  assert.ok(nozzleAt().distanceTo(toolA) < 1e-9, 'the orifice must not have moved');
  fabPose(FAB_REST);
});

test('[fabricator] the work is in the world frame, not the drone\'s', () => {
  /**
   * The finding that shaped the hierarchy. Material that has left the nozzle belongs to the
   * ground, so `Workpiece_Group` is a SIBLING of the airframe — parent it to the head and the
   * pier flies away with the drone the first time anything moves. Checked structurally (nothing
   * under the platform) and behaviourally (the bead does not move when the machine does).
   */
  const platform = fabricator.getObjectByName('Airframe_Platform');
  const work = fabricator.getObjectByName('Workpiece_Group');
  for (let p = work.parent; p; p = p.parent) {
    assert.notEqual(p, platform, 'the printed work must not hang off the airframe');
  }

  fabPose({ ...FAB_REST, charge: 0.5 * tankLitres() });
  const before = fabricator.getObjectByName('Bead_Instanced').getWorldPosition(new THREE.Vector3());
  const moved = platform.position.clone();
  fabPose({ ...FAB_REST, charge: 0.5 * tankLitres(), boomYaw: FDIM.limits.boomYaw });
  assert.ok(platform.position.distanceTo(moved) > 0.05, 'the drone should have moved at all');
  const after = fabricator.getObjectByName('Bead_Instanced').getWorldPosition(new THREE.Vector3());
  assert.equal(before.distanceTo(after), 0, 'the bead moved with the machine');
  fabPose(FAB_REST);
});

test('[fabricator] the pier is one bead thick and stands inside its declared plan', () => {
  // Measured off the instance matrices rather than the design constants: a segment placed by
  // arithmetic that drifted from `pier.outer` would build a pier no drawing describes.
  const bead = fabricator.getObjectByName('Bead_Instanced');
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  const half = FDIM.pier.bead.width / 2;
  for (let i = 0; i < totalSegments(); i++) {
    bead.getMatrixAt(i, m);
    v.setFromMatrixPosition(m);
    box.expandByPoint(v);
    // Every segment's centreline is exactly half a bead inside the outer face, on one axis or
    // the other — which is what "the wall is one bead thick" means.
    const dx = Math.abs(Math.abs(v.x) - (FDIM.pier.outer / 2 - half));
    const dz = Math.abs(Math.abs(v.z) - (FDIM.pier.outer / 2 - half));
    // Instance matrices live in a Float32Array, so the tolerance here is single precision —
    // tighter than that and this test would be measuring the buffer rather than the pier.
    assert.ok(Math.min(dx, dz) < 1e-6, `segment ${i} is off the wall centreline`);
  }
  assert.ok(box.max.x + half <= FDIM.pier.outer / 2 + 1e-6);
  assert.ok(box.max.z + half <= FDIM.pier.outer / 2 + 1e-6);
  const top = box.max.y + FDIM.pier.bead.height / 2 - FDIM.pier.slab.thickness;
  assert.ok(Math.abs(top - pierHeight()) < 1e-6,
    `the finished pier is ${top.toFixed(4)} m, the drawing says ${pierHeight().toFixed(4)}`);
});

test('[fabricator] the orifice is where the parts stack ends', () => {
  // `Nozzle_Tip` is the one node other code reads by name, and the hover solve is written
  // entirely in terms of it — so a head whose castings grew without the empty following would
  // park the whole machine off the work with nothing to notice.
  const H = FDIM.head;
  assert.equal(nozzleTipZ(), H.gap + H.body.depth + H.heater.length + H.cone.length);
  assert.equal(fabricator.getObjectByName('Nozzle_Tip').position.z, nozzleTipZ());
  const cone = fabricator.getObjectByName('Nozzle_Cone');
  cone.geometry.computeBoundingBox();
  assert.ok(Math.abs(cone.position.z + cone.geometry.boundingBox.max.z - nozzleTipZ()) < 1e-9,
    'the nozzle geometry and the empty at its tip disagree about where the orifice is');
});

test('[fabricator] a landing does not put the machine down on its nozzle', () => {
  // The limb lengths and the boom's are not independent tastes: deployed, a limb has to reach
  // further below the hull than the extruder does. Same shape of paired constraint as the RA-6's
  // wrist roll and tool pitch, and stated rather than clamped.
  assert.ok(legsClearTheNozzle(),
    `limbs reach ${legReach(100).toFixed(3)} m, the boom hangs ${nozzleTipZ().toFixed(3)} m past its axis`);
  assert.ok(legReach(0) < legReach(100), 'STANCE 0 is stowed and must be the shorter of the two');
});

test('[fabricator] the feed line is broken at every joint it crosses', () => {
  /**
   * The one thing on the reference sheet this subject will not build.
   *
   * The art draws a single continuous hose from the reservoir to the nozzle. There is no
   * skinning anywhere in this project — `cableRun` says so in its docstring — so a run authored
   * across a driven pivot tears open the first time the slider moves. The fix is not a renderer
   * feature, it is how a real machine is dressed: break the line at each joint and put a rotary
   * coupling there. This checks the break rather than the hose: consecutive runs must be
   * separated by at least one driven node, or they are one hose pretending to be three.
   */
  const driven = new Set(fabricator.userData.joints.flatMap((j) => j.targets.map((t) => t.node)));
  const chain = (name) => {
    const out = [];
    for (let o = fabricator.getObjectByName(name); o; o = o.parent) out.push(o.name);
    return out;
  };
  const runs = ['Feed_Line_Body', 'Feed_Line_Boom', 'Feed_Line_Head'];
  for (const name of runs) assert.ok(fabricator.getObjectByName(name), `missing ${name}`);
  for (let i = 0; i < runs.length - 1; i++) {
    const outer = new Set(chain(runs[i]));
    const between = chain(runs[i + 1]).filter((n) => !outer.has(n));
    assert.ok(between.some((n) => driven.has(n)),
      `${runs[i]} and ${runs[i + 1]} sit in the same rigid frame — that is one hose, not two`);
  }
});

test('[fabricator] the accent channels say what each lit part is', () => {
  // Blue for everything the power core feeds, and the fourth channel for the one part that is
  // hot rather than powered. The distinction is a fact about the part, which is exactly what the
  // channel is for — what channel 4 looks like is the renderer's business.
  for (const name of ['Core_Lens', 'Emitter_FL_Lens', 'Emitter_RR_Lens', 'Level_Collar',
    'Sensor_Lens', 'Beacon_Aft']) {
    const node = fabricator.getObjectByName(name);
    assert.ok(node, `missing ${name}`);
    assert.equal(node.userData.emissive, EMISSIVE.secondary, `${name} is on the wrong channel`);
  }
  const heater = fabricator.getObjectByName('Nozzle_Heater');
  assert.equal(heater.userData.emissive, EMISSIVE.quaternary,
    'the heater band is hot, not powered — it must not share the core\'s channel');
  assert.equal(fabricator.getObjectByName('Bead_Instanced').userData.emissive, EMISSIVE.none,
    'cured bead is not lit');
});

test('[fabricator] the solve is idempotent — running it twice changes nothing', () => {
  // It runs every frame on top of whatever it wrote last frame, so an accumulating version would
  // drift the machine off the work over minutes rather than fail on the first frame.
  fabPose({ charge: 0.4 * tankLitres(), boomYaw: 15, boomPitch: -8, headPitch: 4 });
  const once = fabricator.getObjectByName('Airframe_Platform').position.clone();
  updateFabricatorPose(fabricator);
  updateFabricatorPose(fabricator);
  assert.equal(once.distanceTo(fabricator.getObjectByName('Airframe_Platform').position), 0);
  fabPose(FAB_REST);
});

test('[fabricator] the bead path walks a closed course and climbs one bead per lap', () => {
  // The path is the machine's whole itinerary — where it hovers is `beadPose` of the next
  // segment — so a path that skipped a corner would fly the drone through the pier.
  const n = FDIM.pier.segsPerCourse;
  for (const course of [0, 7, FDIM.pier.courses - 1]) {
    const first = beadPose(course * n);
    const last = beadPose(course * n + n - 1);
    assert.ok(Math.abs(first.y - last.y) < 1e-12, 'a course is level');
    assert.ok(Math.hypot(first.x - last.x, first.z - last.z) - segmentLength() < 1e-12,
      'the last segment of a course should close back onto the first');
    if (course > 0) {
      assert.ok(Math.abs(first.y - beadPose((course - 1) * n).y - FDIM.pier.bead.height) < 1e-12,
        'each lap should rise exactly one bead');
    }
  }
});

console.log('\nthe gantry — three prismatic axes, and work you can take away');

test('[terraformer] the structure toggle addresses the work and nothing else', () => {
  /**
   * The subject's one new mechanism. A toggle is the boolean half of the declared-control
   * contract, and what makes it safe is that it addresses a GROUP that is nothing but the work:
   * flipping it must not take away any of the machine.
   */
  const toggle = terraformer.userData.toggles.find((t) => t.key === 'structure');
  assert.ok(toggle, 'no structure toggle declared');
  const group = terraformer.getObjectByName(toggle.node);
  assert.equal(group.parent.name, 'Terraformer_Root',
    'the work hangs off the root, not off the gantry — it must not travel when the machine does');

  // Everything under it is work; nothing under it is machine.
  const inside = [];
  group.traverse((o) => { if (o !== group) inside.push(o.name); });
  assert.deepEqual(inside.sort(), ['Layers_Instanced', 'Slab_Mesh']);

  // And the machine's own chain is entirely outside it.
  for (const name of ['Nozzle_Tip', 'Arm_Fore', 'Beam_Mesh', 'Tower_L_Mesh', 'Gantry_Collision']) {
    const node = terraformer.getObjectByName(name);
    let under = false;
    for (let p = node.parent; p; p = p.parent) if (p === group) under = true;
    assert.ok(!under, `${name} would disappear with the structure`);
  }
});

test('[terraformer] hiding the work leaves the machine standing', () => {
  // The behaviour the button promises, checked rather than assumed: with the group hidden, every
  // mesh still visible belongs to the gantry, and the count does not go to zero.
  const group = terraformer.getObjectByName('Structure_Group');
  const visibleMeshes = () => {
    let n = 0;
    terraformer.traverse((o) => {
      if (!o.isMesh || o.userData.isCollision) return;
      let shown = o.visible;
      for (let p = o.parent; p && shown; p = p.parent) shown = p.visible;
      if (shown) n++;
    });
    return n;
  };
  const all = visibleMeshes();
  group.visible = false;
  const machineOnly = visibleMeshes();
  group.visible = true;
  assert.equal(all - machineOnly, 2, 'hiding the work should remove exactly the slab and the courses');
  assert.ok(machineOnly > 40, `only ${machineOnly} meshes left — the toggle took the machine too`);
  assert.equal(visibleMeshes(), all, 'the toggle did not restore');
});

test('[terraformer] the closed-form nozzle height matches the built graph', () => {
  /**
   * `nozzleHeight()` is used to CHOOSE the rest lift as well as to report it, so it has to agree
   * with the chain it describes — and it is the second time this project has authored a rest
   * pose the viewer could not produce. The FD-4 left its ram at zero; this left both mast stages
   * fully retracted while the LIFT slider defaulted to 20%, putting the head 0.88 m above where
   * the title block said it was. Rotational joints are authored from `rest` and get this right
   * by accident; prismatic ones have to be told.
   */
  for (const pose of [
    TDIM.rest,
    { ...TDIM.rest, lift: 0 },
    { ...TDIM.rest, lift: 100 },
    { lift: 55, swing: 0, shoulder: 12, elbow: -30, wrist: 5, travel: 0, traverse: 0 },
    { lift: 80, swing: 40, shoulder: 61, elbow: -88, wrist: 44, travel: 0, traverse: 0 },
  ]) {
    setPose(terraformer, pose);
    const tip = terraformer.getObjectByName('Nozzle_Tip').getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(tip.y - nozzleHeight(pose)) < 1e-9,
      `lift ${pose.lift}: graph says ${tip.y.toFixed(4)}, the formula says ${nozzleHeight(pose).toFixed(4)}`);
  }
  setPose(terraformer, TDIM.rest);
});

test('[terraformer] the drawing is dimensioned with the head over the work, not in it', () => {
  // A printer drawn with its nozzle buried in the wall is a drawing of a crash. This is why the
  // rest lift is 20 and not a rounder number.
  assert.ok(headClearance() > 0,
    `the head is ${(-headClearance() * 1000).toFixed(0)} mm inside the printed wall`);
  assert.ok(headClearance() < 1.0, 'the head is parked so high the drawing shows nothing working');
  // And the lift can actually reach the work: floor to the top course, both inside the stroke.
  assert.ok(nozzleHeight({ ...TDIM.rest, lift: 100 }) < TDIM.structure.slab.thickness + 1.0,
    'at full extension the head cannot reach the first course');
  assert.ok(nozzleHeight({ ...TDIM.rest, lift: 0 }) > structureHeight(),
    'fully retracted, the head is still inside the wall');
});

test('[terraformer] every prismatic axis stays on the rail it rides', () => {
  /**
   * Three prismatic axes is the most this project has carried, and a prismatic joint has a
   * failure the hinges do not: a stroke longer than the thing it slides on is a number rather
   * than a motion, and nothing about the render says so.
   */
  const beamRail = 2 * (TDIM.tower.halfSpan - TDIM.beam.rail.inset);
  assert.ok(traverseStroke() + TDIM.carriage.body.width <= beamRail + 1e-9,
    `traverse stroke ${traverseStroke().toFixed(2)} m overruns a ${beamRail.toFixed(2)} m rail`);
  // The travel stroke has to stay on the modelled rail, bogie length included.
  const travel = terraformer.userData.joints.find((j) => j.key === 'travel');
  const reach = Math.max(Math.abs(travel.min), Math.abs(travel.max)) + TDIM.tower.bogie.length / 2;
  assert.ok(reach <= railLength() / 2 + 1e-9,
    `the bogie runs ${reach.toFixed(2)} m off centre on a ${railLength().toFixed(1)} m rail`);
  // A telescope's total is the sum of its stages, not the longer of them.
  assert.equal(liftStroke(), TDIM.carriage.mast.stage1.stroke + TDIM.carriage.mast.stage2.stroke);
  // Stage 2 must not fall out of stage 1 at full extension.
  assert.ok(TDIM.carriage.mast.stage1.stroke < TDIM.carriage.mast.stage1.length,
    'stage 1 extends further than its own length — the stages separate');
});

test('[terraformer] the printed courses are identical and stack without a gap', () => {
  // One geometry, fifteen instances: the case an InstancedMesh is actually for. The courses must
  // butt exactly, or the wall is a stack of floating slices.
  const layers = terraformer.getObjectByName('Layers_Instanced');
  const S = TDIM.structure;
  assert.equal(layers.count, S.layer.count);
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let prev = null;
  for (let i = 0; i < layers.count; i++) {
    layers.getMatrixAt(i, m);
    v.setFromMatrixPosition(m);
    assert.ok(Math.abs(v.x) < 1e-6 && Math.abs(v.z) < 1e-6, 'a course is offset in plan');
    if (prev !== null) {
      assert.ok(Math.abs((v.y - prev) - S.layer.height) < 1e-6,
        `course ${i} is ${(v.y - prev).toFixed(4)} m above the last, not ${S.layer.height}`);
    }
    prev = v.y;
  }
  assert.ok(Math.abs(prev + S.layer.height / 2 - structureHeight()) < 1e-6,
    'the top course does not land on the declared wall height');
});

test('[terraformer] the footprint closes, and the doorway is the only break in it', () => {
  /**
   * The plan is straight runs plus four quarter arcs, and it has to be a closed loop or the
   * building has a wall missing. Checked as a length identity: the straight runs plus the four
   * corners plus the doorway must add up to the perimeter of the rounded rectangle.
   */
  const f = footprint();
  const S = TDIM.structure;
  const outer = f.runs.filter((r) => !S.partitions.some((p) => p[0] === r.x && r.axis === 'z'));
  const straight = outer.reduce((n, r) => n + r.length, 0);
  const perimeter = 2 * (2 * (S.A - S.radius)) + 2 * (2 * (S.B - S.radius)) + 2 * Math.PI * S.radius;
  assert.ok(Math.abs(straight + S.door.width + 2 * Math.PI * S.radius - perimeter) < 1e-9,
    'the footprint does not close');
  assert.equal(f.corners.length, 4);
  // The internal partitions are extra, and the course length counts them.
  assert.ok(courseLength() > perimeter - S.door.width, 'partitions are missing from the run length');
});

console.log('\nthe gate — the hole is the deliverable');

/**
 * Every rendered vertex in the graph, in the aperture's own frame.
 *
 * Instanced rows are walked instance by instance: a bore intrusion hidden in instance 11 of 18
 * is exactly the kind of thing a spot check on the base geometry would miss.
 */
function apertureFrameVertices(root, pose) {
  if (pose) setPose(root, pose);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.getObjectByName('Aperture_Volume').matrixWorld).invert();
  // The marker carries the clear radius as its scale, so undo it: work in metres, not in bores.
  const scale = new THREE.Vector3();
  root.getObjectByName('Aperture_Volume').matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  const out = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const im = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isCollision) return;
    const pos = o.geometry.getAttribute('position');
    const instances = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < instances; k++) {
      m.copy(inv).multiply(o.matrixWorld);
      if (o.isInstancedMesh) { o.getMatrixAt(k, im); m.multiply(im); }
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        out.push({ name: o.name, r: Math.hypot(v.x * scale.x, v.y * scale.y), z: v.z * scale.z });
      }
    }
  });
  return out;
}

test('[portal] the aperture is a transform, and it is the clear volume', () => {
  /**
   * The interface. `Aperture_Volume` is an empty whose scale IS the clear cylinder — radius in
   * X and Y, half-depth in Z — so the application that composites an effect into the bore reads
   * the volume off the node rather than off a document that can go stale. Checked against the
   * same functions the liner is laid out from, which is what stops the two drifting.
   */
  const node = portal.getObjectByName('Aperture_Volume');
  assert.equal(node.isMesh, undefined, 'the aperture must carry no geometry — that is the point');
  assert.equal(node.children.length, 0, 'a scaled node with children would scale geometry');
  assert.equal(node.scale.x, apertureRadius());
  assert.equal(node.scale.y, apertureRadius());
  assert.equal(node.scale.z, apertureDepth() / 2);
  // It sits on the gate's axis, at the ring centre.
  assert.deepEqual(node.position.toArray(), [0, 0, 0]);
  assert.equal(node.parent.name, 'Ring_Group');
});

test('[portal] nothing intrudes on the clear aperture, in any pose', () => {
  /**
   * The subject.
   *
   * The brief is a heavy ring with an empty centre, because what appears in that centre is
   * composited downstream in another application. That makes the hole a deliverable, and a
   * deliverable gets an assertion: no vertex anywhere in the graph may lie inside the clear
   * cylinder, swept over the whole articulation envelope.
   *
   * Swept, because two of the four joints spin rows of segments through the bore's neighbourhood
   * and one turns the entire gate. A single-pose check would pass on a rotor whose segments dip
   * inboard once every eighteenth of a turn.
   */
  const clear = apertureRadius();
  const halfDepth = apertureDepth() / 2;
  const offenders = [];
  let closest = Infinity;
  let closestOn = '';

  for (const yaw of [-180, -47, 0, 90, 180]) {
    for (const rotorA of [0, 7, 103, 259, 360]) {
      for (const rotorB of [0, 13, 197, 360]) {
        for (const vanes of [0, 100]) {
          for (const p of apertureFrameVertices(portal, { yaw, rotorA, rotorB, vanes })) {
            if (Math.abs(p.z) > halfDepth) continue;
            if (p.r < closest) { closest = p.r; closestOn = p.name; }
            if (p.r < clear - 1e-6) offenders.push(`${p.name} at r=${p.r.toFixed(4)}`);
          }
        }
      }
    }
  }
  assert.deepEqual([...new Set(offenders)], [],
    `geometry inside the clear aperture (r < ${clear}):\n${[...new Set(offenders)].join('\n')}`);
  // And the bore is not merely clear but exactly bounded — a liner that had drifted outboard
  // would pass the check above while quietly making the aperture bigger than the drawing says.
  assert.ok(Math.abs(closest - clear) < 1e-5,
    `the closest geometry is at ${closest.toFixed(5)} on ${closestOn}, not at the declared ${clear}`);
  setPose(portal, PDIM.rest);
});

test('[portal] the rows have running clearance and cannot touch', () => {
  // Two of the three rows counter-rotate, so these gaps are dimensions rather than styling.
  // An overlap of a millimetre is two rows welded together, and it is invisible: it happens
  // inside the armour where no view of the drawing reaches.
  for (const { name, gap } of rowGaps()) {
    assert.ok(Math.abs(gap - PDIM.clearance) < 1e-9,
      `${name}: ${(gap * 1000).toFixed(1)} mm, declared ${(PDIM.clearance * 1000).toFixed(1)} mm`);
    assert.ok(gap > 0, `${name} overlaps`);
  }
});

test('[portal] segments in a row do not touch, so the shared part id shows no seam', () => {
  /**
   * A row is one InstancedMesh and therefore one part id, so two segments that met would show
   * no boundary at all — the failure the FD-4's bead ran into and solved with a section. Here
   * the answer is that a segmented ring has gaps in it anyway; this checks the gap is real.
   */
  for (const row of [PDIM.rows.rotorA, PDIM.rows.rotorB, PDIM.rows.stator]) {
    const layout = ringLayout(row.count, PDIM.gap);
    const pitch = (Math.PI * 2) / row.count;
    assert.ok(layout[0].span < pitch, 'a span equal to the pitch is a continuous ring');
    // Arc length of the gap at the row's outer radius — the widest the seam ever is.
    const gapArc = (pitch - layout[0].span) * row.r1;
    assert.ok(gapArc > 0.02, `gap of ${(gapArc * 1000).toFixed(1)} mm will not read as a seam`);
  }
});

test('[portal] the collision proxy does not claim the bore', () => {
  /**
   * Every other subject's proxy is a box around the whole machine. A box around a ring contains
   * the hole, so it would mark as solid the one volume this subject exists to keep empty, and
   * anything pathing against it would refuse to walk through the gate. The proxy is the plinth.
   */
  const proxy = portal.getObjectByName('Base_Collision');
  portal.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(proxy);
  const aperture = portal.getObjectByName('Aperture_Volume').getWorldPosition(new THREE.Vector3());
  assert.ok(!box.containsPoint(aperture), 'the collision proxy contains the aperture centre');
  assert.ok(box.max.y < aperture.y - apertureRadius(),
    'the proxy reaches into the ring; it should stop at the plinth');
});

test('[portal] buttresses land on the armour they are drawn against', () => {
  // Both ends derived rather than typed: a leg whose head was a literal would hang in the air
  // the first time the ring moved up, which is exactly how the MK-CX's fenders failed.
  for (const side of [-1, 1]) {
    const head = legFoot(side);
    const r = Math.hypot(head.x, head.y - PDIM.centreY);
    assert.ok(Math.abs(r - outerRadius()) < 1e-9,
      `buttress head is at r=${r.toFixed(4)}, the armour is at ${outerRadius()}`);
    assert.ok(head.y < PDIM.centreY, 'a buttress meets the ring below its centre');
  }
});

test('[portal] every lit part is on the one accent channel the brief asked for', () => {
  /**
   * The accent arc runs the other way on this subject. Channels grew from a boolean to four
   * because successive vehicles wanted different hues; here the brief specifies blue, and a
   * second hue would be the drawing inventing a distinction the machine does not have. So this
   * checks a NEGATIVE: nothing lit is on any channel but the second.
   */
  const lit = [];
  portal.traverse((o) => {
    if (o.isMesh && !o.userData.isCollision && o.userData.emissive) {
      lit.push([o.name, o.userData.emissive]);
    }
  });
  assert.ok(lit.length >= 6, `expected the ring to be lit, found ${lit.length} accents`);
  const wrong = lit.filter(([, c]) => c !== EMISSIVE.secondary);
  assert.deepEqual(wrong, [], 'this subject declares one accent channel and must use only it');
  for (const name of ['Edge_Ring_Front', 'Edge_Ring_Rear', 'Pod_1_Core', 'Slew_Glow']) {
    assert.ok(lit.some(([n]) => n === name), `${name} should be lit`);
  }
});

console.log('\nthe arc generator');

/**
 * Signed volume of a closed triangle soup, by the divergence theorem.
 *
 * Positive means the faces wind outward. This is the check that made writing `arcSegment`
 * tractable: the sweep's caps face opposite ways and its side band is a cone frustum, so "does
 * this look right" in one view is not evidence, and an inward-wound solid renders black in the
 * game path while looking perfect in the blueprint one — the same two-modes-disagree trap the
 * container's walls fell into.
 */
function signedVolume(geom) {
  const p = geom.getAttribute('position').array;
  let v = 0;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i], ay = p[i + 1], az = p[i + 2];
    const bx = p[i + 3], by = p[i + 4], bz = p[i + 5];
    const cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];
    v += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

test('arcSegment winds outward, and encloses the volume Pappus says it should', () => {
  // Pappus: a swept solid's volume is the profile's area times the distance its centroid
  // travels. Checking against that rather than against a recorded number means the test knows
  // what the answer should be, not merely what it was last time.
  const profile = [[0, -0.4], [0.5, -0.4], [0.5, 0.4], [0, 0.4]];
  const radius = 2.0, angle = Math.PI / 6;
  const geom = arcSegment({ profile, radius, angle, segments: 96 });
  const area = 0.5 * 0.8;
  const expected = area * ((radius + 0.25) * angle);
  const got = signedVolume(geom);
  assert.ok(got > 0, 'inward winding: the solid would render black in the game path');
  assert.ok(Math.abs(got / expected - 1) < 1e-3,
    `volume ${got.toFixed(6)}, Pappus says ${expected.toFixed(6)}`);
});

test('every ring segment the gate is built from winds outward', () => {
  // The generator being right in isolation is not the same as every profile the subject feeds
  // it being right. A concave profile would fan its caps through the solid and flip the sign.
  for (const [name, row] of Object.entries(PDIM.rows)) {
    if (!row.count) continue;
    const geom = arcSegment({
      profile: rowProfile(row), radius: row.r0, angle: ringLayout(row.count, PDIM.gap)[0].span,
      segments: row.arcSteps,
    });
    assert.ok(signedVolume(geom) > 0, `${name} segment is wound inward`);
  }
});

test('ringLayout spaces a row evenly and leaves the declared gap', () => {
  const layout = ringLayout(PDIM.rows.stator.count, PDIM.gap);
  assert.equal(layout.length, PDIM.rows.stator.count);
  const pitch = (Math.PI * 2) / PDIM.rows.stator.count;
  layout.forEach((s, i) => {
    assert.ok(Math.abs(s.angle - i * pitch) < 1e-12, 'segments are not evenly pitched');
    assert.ok(Math.abs(s.span - pitch * (1 - PDIM.gap)) < 1e-12);
  });
  assert.equal(podAngles().length, PDIM.pod.count);
  assert.equal(segmentCount(), PDIM.rows.rotorA.count + PDIM.rows.rotorB.count + PDIM.rows.stator.count);
});

console.log('\nUVs and part data');

console.log('\nexplode');

test('anchor parts do not move — the hull stays put', () => {
  const hull = byName('Hull_Mesh');
  applyExplode(tank, 1);
  assert.equal(hull.position.length(), 0);
  applyExplode(tank, 0);
});

console.log('\nasset / display boundary');

test('asset code never imports from display code', () => {
  const offenders = [];
  const assetDirs = ['lib', 'tank', 'mkcx', 'heptat', 'heptapod', 'headless', 'motopod', 'robotarm', 'gimbal', 'server', 'container', 'howitzer'].map((d) => join(ROOT, 'src', d));
  for (const file of assetDirs.flatMap(walk)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (/(^|\/)(render|chrome|camera|subjects)\//.test(m[1])) {
        offenders.push(`${file.replace(ROOT + '/', '')} -> ${m[1]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `the asset must not depend on how it is drawn:\n${offenders.join('\n')}`);
});

test('display code never imports from a specific asset — it renders any scene', () => {
  const offenders = [];
  for (const dir of ['render', 'camera', 'chrome']) {
    for (const file of walk(join(ROOT, 'src', dir))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        if (/(^|\/)(tank|howitzer|subjects)\//.test(m[1])) {
          offenders.push(`${file.replace(ROOT + '/', '')} -> ${m[1]}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [],
    `the viewer must not know what it is drawing:\n${offenders.join('\n')}`);
});

test('cache-bust token is present in index.html and stamped on every local asset URL', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  // The pattern is assembled rather than written as a literal on purpose: scripts/bust.sh
  // rewrites `<meta name="cb" content="76eed12e">` in EVERY source file it walks, not just HTML,
  // so a literal here gets clobbered by the next bust and the suite stops parsing.
  const metaPattern = new RegExp('<meta name=' + '"cb" content="([^"]+)"');
  const token = html.match(metaPattern)?.[1];
  assert.ok(token, 'no cache-bust meta tag — the build has no identity');
  const unstamped = [...html.matchAll(/(?:src|href)="(\.\/[^"?]+)"/g)].map((m) => m[1]);
  assert.deepEqual(unstamped, [], `asset URLs missing ?v=: ${unstamped.join(', ')}`);
});

console.log('\nPWA');

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
const offlineHtml = readFileSync(join(ROOT, 'offline.html'), 'utf8');

test('service worker cache key matches the build token in index.html', () => {
  // This is the load-bearing one. scripts/bust.sh stamps the SW token, but that step is a
  // project addition to a file the cache-busting installer owns — re-running the installer
  // silently drops it. A drifted SW token means every installed user is pinned to whatever
  // build they first cached, forever, and nothing else in the system notices.
  const metaPattern = new RegExp('<meta name=' + '"cb" content="([^"]+)"');
  const htmlToken = html.match(metaPattern)?.[1];
  const swToken = readFileSync(join(ROOT, 'sw.js'), 'utf8').match(/const CB_TOKEN = '([^']+)'/)?.[1];
  assert.ok(swToken, 'sw.js has no CB_TOKEN constant');
  assert.notEqual(swToken, '__CB_TOKEN__', 'sw.js still holds the unstamped placeholder');
  assert.equal(swToken, htmlToken, 'service worker and HTML disagree about which build this is');
});

test('service worker never calls skipWaiting outside a message handler', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  assert.ok(!/self\.skipWaiting\(\)/.test(install),
    'unconditional skipWaiting() in install reloads the app out from under a live session');
  assert.ok(/type === 'SKIP_WAITING'/.test(sw), 'no consent-gated skipWaiting path');
});

test('manifest has the fields installability actually requires', () => {
  for (const key of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) {
    assert.ok(manifest[key], `manifest missing ${key}`);
  }
  assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display));
  assert.ok(manifest.start_url.includes('src=pwa'), 'start_url needs an analytics marker');
});

test('manifest has 192, 512 and a maskable icon, and every file exists', () => {
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'), 'no 192 icon');
  assert.ok(sizes.includes('512x512'), 'no 512 icon');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'),
    'no maskable icon — Android will letterbox the mark inside its mask');
  for (const icon of manifest.icons) {
    assert.ok(statSync(join(ROOT, icon.src)).size > 0, `missing icon file: ${icon.src}`);
  }
});

test('iOS head tags are present — iOS ignores the manifest for most of this', () => {
  for (const needle of [
    'rel="manifest"',
    'name="theme-color"',
    'name="apple-mobile-web-app-capable"',
    'name="apple-mobile-web-app-status-bar-style"',
    'name="apple-mobile-web-app-title"',
    'rel="apple-touch-icon"',
    'viewport-fit=cover',
  ]) {
    assert.ok(html.includes(needle), `index.html missing ${needle}`);
  }
  assert.ok(statSync(join(ROOT, 'icons', 'apple-touch-icon-180.png')).size > 0);
});

test('every precached URL in the service worker resolves to a real file', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const list = sw.slice(sw.indexOf('const PRECACHE'), sw.indexOf('self.addEventListener'));
  const urls = [...list.matchAll(/'(\/[^']*)'|`(\/[^`]*)`/g)]
    .map((m) => (m[1] || m[2]).split('?')[0])
    .filter((u) => u !== '/' && !u.endsWith('/'));
  // vendor/ is gitignored and produced by `npm run vendor`, so on a fresh clone those paths
  // legitimately do not exist yet. Skipping them keeps `npm install && npm test` green without
  // weakening the check that matters: that OUR files have not moved out from under the list.
  const hasVendor = (() => {
    try { return statSync(join(ROOT, 'vendor')).isDirectory(); } catch { return false; }
  })();
  if (!hasVendor) console.log('       (vendor/ absent — run `npm run vendor`; skipping those entries)');

  const missing = urls.filter((u) => {
    if (!hasVendor && u.startsWith('/vendor/')) return false;
    for (const base of [ROOT, join(ROOT, 'public')]) {
      try { if (statSync(join(base, u)).isFile()) return false; } catch { /* next */ }
    }
    return true;
  });
  // A missing precache entry does not throw at install time (they are added individually on
  // purpose) — it just quietly leaves a hole in the offline app. This is the only thing that
  // catches it.
  assert.deepEqual(missing, [], `precache references files that do not exist: ${missing.join(', ')}`);
});

test('no root-absolute URLs anywhere the site is addressed from', () => {
  // The site is served from a project path on GitHub Pages (/blueprint-to-life/), so every
  // root-absolute reference 404s there while working perfectly on localhost — the worst kind
  // of bug, invisible until deploy. Import-map values, the SW registration and its scope, and
  // the manifest's start_url/scope/icons all resolve against a base URL, so relative is
  // correct in every one of them.
  const offenders = [];

  // Both pages the site serves, not just the one anyone looks at during development. This
  // check listed index.html, the SW's precache and registration, and the manifest — and missed
  // `offline.html`, which is itself a page served from the same subpath. It had carried a
  // root-absolute favicon since it was written; the fallback page's icon 404'd on Pages and
  // nowhere else, and nothing said so. A file-by-file allowlist grows exactly this kind of hole.
  for (const [name, source] of [['index.html', html], ['offline.html', offlineHtml]]) {
    for (const m of source.matchAll(/(?:src|href)="(\/[^\/][^"]*)"/g)) offenders.push(`${name}: ${m[1]}`);
  }
  for (const m of html.matchAll(/"three(?:\/addons\/)?":\s*"(\/[^"]*)"/g)) offenders.push(`importmap: ${m[1]}`);

  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const list = sw.slice(sw.indexOf('<precache:begin>'), sw.indexOf('<precache:end>'));
  for (const m of list.matchAll(/['`](\/[^'`]*)['`]/g)) offenders.push(`sw precache: ${m[1]}`);

  const life = readFileSync(join(ROOT, 'src', 'pwa', 'lifecycle.js'), 'utf8');
  for (const m of life.matchAll(/register\(\s*'(\/[^']*)'/g)) offenders.push(`sw register: ${m[1]}`);
  for (const m of life.matchAll(/scope:\s*'(\/[^']*)'/g)) offenders.push(`sw scope: ${m[1]}`);

  for (const key of ['start_url', 'scope', 'id']) {
    if (typeof manifest[key] === 'string' && manifest[key].startsWith('/')) {
      offenders.push(`manifest.${key}: ${manifest[key]}`);
    }
  }
  for (const icon of manifest.icons) {
    if (icon.src.startsWith('/')) offenders.push(`manifest icon: ${icon.src}`);
  }

  assert.deepEqual(offenders, [],
    `root-absolute URLs break a subpath deploy:\n${offenders.join('\n')}`);
});

test('offline fallback exists and is precached', () => {
  assert.ok(statSync(join(ROOT, 'offline.html')).size > 0);
  assert.ok(readFileSync(join(ROOT, 'sw.js'), 'utf8').includes('OFFLINE_URL'));
});

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

console.log(`\n${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
